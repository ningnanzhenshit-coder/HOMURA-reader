use base64::{engine::general_purpose::STANDARD, Engine as _};
use encoding_rs::{Encoding, UTF_8, WINDOWS_1252};
use serde::Serialize;

const MAX_MOBI_BYTES: usize = 32 * 1024 * 1024;
const MAX_BASE64_CHARS: usize = ((MAX_MOBI_BYTES + 2) / 3) * 4 + 4;
const MAX_PDB_RECORDS: usize = 100_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobiImageRecord {
    pub recindex: u32,
    pub start: usize,
    pub end: usize,
    pub mime: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobiContainer {
    pub title: String,
    pub raw_text: String,
    pub compression: u16,
    pub encoding: String,
    pub cde_type: String,
    pub writing_mode: String,
    pub page_progression: String,
    pub image_records: Vec<MobiImageRecord>,
    pub cover: Option<MobiImageRecord>,
}

#[derive(Default)]
struct Exth {
    cover_offset: Option<u32>,
    cde_type: String,
    writing_mode: String,
    page_progression: String,
    title: String,
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    let end = offset.checked_add(2)?;
    let slice = bytes.get(offset..end)?;
    Some(u16::from_be_bytes([slice[0], slice[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let end = offset.checked_add(4)?;
    let slice = bytes.get(offset..end)?;
    Some(u32::from_be_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn decode_text(bytes: &[u8], encoding: &'static Encoding) -> String {
    let (text, _) = encoding.decode_with_bom_removal(bytes);
    text.trim_end_matches('\0').trim().to_string()
}

fn read_pdb_records(bytes: &[u8]) -> Result<Vec<usize>, String> {
    let count = read_u16(bytes, 76)
        .ok_or_else(|| "MOBI_BAD_FILE: 文件记录表为空".to_string())?
        as usize;
    if count == 0 || count > MAX_PDB_RECORDS {
        return Err("MOBI_BAD_FILE: 文件记录表无效".to_string());
    }
    let table_end = 78usize
        .checked_add(
            count
                .checked_mul(8)
                .ok_or_else(|| "MOBI_BAD_FILE: 文件记录表过大".to_string())?,
        )
        .ok_or_else(|| "MOBI_BAD_FILE: 文件记录表过大".to_string())?;
    if table_end > bytes.len() {
        return Err("MOBI_BAD_FILE: 文件记录表越界".to_string());
    }

    let mut starts = Vec::with_capacity(count + 1);
    for index in 0..count {
        let start = read_u32(bytes, 78 + index * 8)
            .ok_or_else(|| "MOBI_BAD_FILE: 文件记录偏移损坏".to_string())?
            as usize;
        if start < table_end || start >= bytes.len() {
            return Err("MOBI_BAD_FILE: 文件记录偏移越界".to_string());
        }
        starts.push(start);
    }
    starts.push(bytes.len());
    for pair in starts.windows(2) {
        if pair[1] < pair[0] {
            return Err("MOBI_BAD_FILE: 文件记录顺序损坏".to_string());
        }
    }
    Ok(starts)
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47]) {
        Some("image/png")
    } else if bytes.starts_with(b"GIF") {
        Some("image/gif")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else {
        None
    }
}

fn image_record_at(
    bytes: &[u8],
    starts: &[usize],
    record_index: usize,
) -> Option<(usize, usize, &'static str)> {
    let from = *starts.get(record_index)?;
    let to = starts
        .get(record_index + 1)
        .copied()
        .unwrap_or(bytes.len())
        .min(bytes.len());
    if from >= to || from >= bytes.len() {
        return None;
    }
    let mime = image_mime(bytes.get(from..to)?)?;
    Some((from, to, mime))
}

fn read_exth(bytes: &[u8], rec0: usize, mobi_length: u32) -> Exth {
    let mut result = Exth::default();
    let base = rec0
        .checked_add(16)
        .and_then(|value| value.checked_add(mobi_length as usize));
    let Some(base) = base else {
        return result;
    };
    if !bytes
        .get(base..base.saturating_add(4))
        .is_some_and(|value| value == b"EXTH")
    {
        return result;
    }

    let Some(length) = read_u32(bytes, base + 4).map(|value| value as usize) else {
        return result;
    };
    let Some(count) = read_u32(bytes, base + 8).map(|value| value as usize) else {
        return result;
    };
    let limit = base.saturating_add(length).min(bytes.len());
    let mut offset = base + 12;
    for _ in 0..count {
        let Some(end) = offset.checked_add(8) else {
            break;
        };
        if end > limit {
            break;
        }
        let Some(id) = read_u32(bytes, offset) else {
            break;
        };
        let Some(length) = read_u32(bytes, offset + 4).map(|value| value as usize) else {
            break;
        };
        let Some(record_end) = offset.checked_add(length) else {
            break;
        };
        if length < 8 || record_end > limit {
            break;
        }
        let value = &bytes[offset + 8..record_end];
        match id {
            201 => result.cover_offset = read_u32(bytes, offset + 8),
            123 => result.cde_type = decode_text(value, UTF_8).to_lowercase(),
            525 => result.writing_mode = decode_text(value, UTF_8).to_lowercase(),
            527 => result.page_progression = decode_text(value, UTF_8).to_lowercase(),
            503 => result.title = decode_text(value, UTF_8),
            _ => {}
        }
        offset = record_end;
    }
    result
}

fn decompress_palm_doc(src: &[u8], limit: usize) -> Vec<u8> {
    let mut output = vec![0u8; limit];
    let mut input_offset = 0usize;
    let mut output_offset = 0usize;

    while input_offset < src.len() && output_offset < limit {
        let byte = src[input_offset];
        input_offset += 1;
        if (1..=8).contains(&byte) {
            for _ in 0..byte {
                if input_offset >= src.len() || output_offset >= limit {
                    break;
                }
                output[output_offset] = src[input_offset];
                input_offset += 1;
                output_offset += 1;
            }
        } else if byte <= 0x7f {
            output[output_offset] = byte;
            output_offset += 1;
        } else if byte <= 0xbf {
            let Some(&next) = src.get(input_offset) else {
                break;
            };
            input_offset += 1;
            let packed = ((byte as u16) << 8) | next as u16;
            let distance = ((packed >> 3) & 0x07ff) as usize;
            let length = ((packed & 0x0007) + 3) as usize;
            if distance == 0 || distance > output_offset {
                continue;
            }
            for _ in 0..length {
                if output_offset >= limit {
                    break;
                }
                output[output_offset] = output[output_offset - distance];
                output_offset += 1;
            }
        } else {
            if output_offset < limit {
                output[output_offset] = 0x20;
                output_offset += 1;
            }
            if output_offset < limit {
                output[output_offset] = byte ^ 0x80;
                output_offset += 1;
            }
        }
    }

    output.truncate(output_offset);
    output
}

fn parse_mobi_container_bytes(bytes: &[u8], fallback_title: &str) -> Result<MobiContainer, String> {
    if bytes.len() < 90 {
        return Err("MOBI_BAD_FILE: 文件过小，不是有效的 MOBI".to_string());
    }

    let starts = read_pdb_records(bytes)?;
    let rec0 = starts[0];
    let compression = read_u16(bytes, rec0)
        .ok_or_else(|| "MOBI_BAD_FILE: 缺少压缩信息".to_string())?;
    let text_length = read_u32(bytes, rec0 + 4)
        .ok_or_else(|| "MOBI_BAD_FILE: 缺少正文长度".to_string())?
        as usize;
    let text_record_count = read_u16(bytes, rec0 + 8)
        .ok_or_else(|| "MOBI_BAD_FILE: 缺少正文记录数".to_string())?
        as usize;
    // 与 JS 兜底保持一致：记录大小为 0 时按 PalmDOC 默认的 4096 字节处理。
    let record_size = read_u16(bytes, rec0 + 10)
        .filter(|value| *value > 0)
        .unwrap_or(4096) as usize;
    let encryption = read_u16(bytes, rec0 + 12)
        .ok_or_else(|| "MOBI_BAD_FILE: 缺少加密信息".to_string())?;

    let header_end = rec0
        .checked_add(20)
        .ok_or_else(|| "MOBI_BAD_FILE: MOBI 头越界".to_string())?;
    if bytes.get(rec0 + 16..header_end) != Some(b"MOBI") {
        return Err("MOBI_BAD_FILE: 不是 MOBI 格式（可能为 AZW3/KF8 或 EPUB）".to_string());
    }
    if encryption != 0 {
        return Err("MOBI_DRM: 该 MOBI 带有 DRM 加密，暂不支持打开".to_string());
    }
    if compression != 1 && compression != 2 {
        return Err("MOBI_COMPRESSION: 该 MOBI 使用 Huffman 压缩，暂不支持".to_string());
    }

    let mobi_length = read_u32(bytes, rec0 + 20).unwrap_or(0);
    let text_encoding_raw = read_u32(bytes, rec0 + 28).unwrap_or(0);
    let encoding = if text_encoding_raw == 65001 {
        UTF_8
    } else {
        WINDOWS_1252
    };
    let encoding_name = if text_encoding_raw == 65001 {
        "utf-8"
    } else {
        "windows-1252"
    };
    let first_image = read_u32(bytes, rec0 + 0x6c).unwrap_or(0) as usize;
    let full_name_offset = read_u32(bytes, rec0 + 0x54).unwrap_or(0) as usize;
    let full_name_length = read_u32(bytes, rec0 + 0x58).unwrap_or(0) as usize;
    let exth = read_exth(bytes, rec0, mobi_length);
    let header_title = if full_name_length > 0 && full_name_offset > 0 {
        rec0
            .checked_add(full_name_offset)
            .and_then(|start| start.checked_add(full_name_length).map(|end| (start, end)))
            .and_then(|(start, end)| bytes.get(start..end))
            .map(|value| decode_text(value, encoding))
            .unwrap_or_default()
    } else {
        String::new()
    };

    let mut chunks = Vec::new();
    let mut produced = 0usize;
    for index in 0..text_record_count {
        let from = *starts
            .get(index + 1)
            .ok_or_else(|| "MOBI_BAD_FILE: 正文记录索引越界".to_string())?;
        let to = starts
            .get(index + 2)
            .copied()
            .unwrap_or(bytes.len())
            .min(bytes.len());
        if from >= bytes.len() {
            break;
        }
        if text_length <= produced {
            break;
        }
        let want = record_size.min(text_length - produced);
        if want == 0 {
            break;
        }
        if from > to {
            return Err("MOBI_BAD_FILE: 正文记录范围损坏".to_string());
        }
        let chunk = if compression == 1 {
            bytes
                .get(from..to.min(from.saturating_add(want)))
                .ok_or_else(|| "MOBI_BAD_FILE: 正文记录越界".to_string())?
                .to_vec()
        } else {
            decompress_palm_doc(
                bytes
                    .get(from..to)
                    .ok_or_else(|| "MOBI_BAD_FILE: 正文记录越界".to_string())?,
                want,
            )
        };
        produced += chunk.len();
        chunks.extend_from_slice(&chunk);
    }
    if produced == 0 {
        return Err("MOBI_BAD_FILE: MOBI 正文为空".to_string());
    }
    let raw_text = decode_text(&chunks, encoding);
    if raw_text.is_empty() {
        return Err("MOBI_BAD_FILE: MOBI 正文解码失败".to_string());
    }

    let record_count = starts.len().saturating_sub(1);
    let mut image_records = Vec::new();
    if first_image < record_count {
        for record_index in first_image..record_count {
            if let Some((start, end, mime)) = image_record_at(bytes, &starts, record_index) {
                image_records.push(MobiImageRecord {
                    recindex: (record_index - first_image + 1) as u32,
                    start,
                    end,
                    mime: mime.to_string(),
                });
            }
        }
    }

    let cover_index = exth
        .cover_offset
        .map(|offset| first_image.saturating_add(offset as usize))
        .unwrap_or(first_image);
    let cover = image_record_at(bytes, &starts, cover_index)
        .or_else(|| image_record_at(bytes, &starts, first_image))
        .map(|(start, end, mime)| MobiImageRecord {
            recindex: cover_index.saturating_sub(first_image) as u32 + 1,
            start,
            end,
            mime: mime.to_string(),
        });

    let title = if !exth.title.trim().is_empty() {
        exth.title.trim().to_string()
    } else if !header_title.is_empty() {
        header_title
    } else {
        fallback_title.to_string()
    };

    Ok(MobiContainer {
        title,
        raw_text,
        compression,
        encoding: encoding_name.to_string(),
        cde_type: exth.cde_type,
        writing_mode: exth.writing_mode,
        page_progression: exth.page_progression,
        image_records,
        cover,
    })
}

#[tauri::command(async)]
pub fn parse_mobi_container(
    bytes_base64: String,
    fallback_title: String,
) -> Result<MobiContainer, String> {
    if bytes_base64.len() > MAX_BASE64_CHARS {
        return Err("MOBI_TOO_LARGE: MOBI 文件过大".to_string());
    }
    let bytes = STANDARD
        .decode(bytes_base64.as_bytes())
        .map_err(|_| "MOBI_BAD_FILE: MOBI 字节数据无效".to_string())?;
    if bytes.len() > MAX_MOBI_BYTES {
        return Err("MOBI_TOO_LARGE: MOBI 文件过大".to_string());
    }
    let fallback_title = if fallback_title.trim().is_empty() {
        "MOBI"
    } else {
        fallback_title.as_str()
    };
    parse_mobi_container_bytes(&bytes, fallback_title)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_u16(bytes: &mut [u8], offset: usize, value: u16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
    }

    fn write_u32(bytes: &mut [u8], offset: usize, value: u32) {
        bytes[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
    }

    fn write_exth(bytes: &mut [u8], base: usize, entries: &[(u32, &[u8])]) {
        let length = 12 + entries.iter().map(|(_, value)| 8 + value.len()).sum::<usize>();
        bytes[base..base + 4].copy_from_slice(b"EXTH");
        write_u32(bytes, base + 4, length as u32);
        write_u32(bytes, base + 8, entries.len() as u32);
        let mut offset = base + 12;
        for (id, value) in entries {
            write_u32(bytes, offset, *id);
            write_u32(bytes, offset + 4, (8 + value.len()) as u32);
            bytes[offset + 8..offset + 8 + value.len()].copy_from_slice(value);
            offset += 8 + value.len();
        }
    }

    fn build_mobi(text: &str, title: &str, image: Option<&[u8]>) -> Vec<u8> {
        let text = text.as_bytes();
        let title = title.as_bytes();
        let image = image.unwrap_or(&[]);
        let record_count = if image.is_empty() { 2 } else { 3 };
        let header_size = 78 + record_count * 8 + 2;
        let text_start = header_size + 1024;
        let image_start = text_start + text.len();
        let total = image_start + image.len();
        let mut bytes = vec![0u8; total];

        write_u16(&mut bytes, 76, record_count as u16);
        write_u32(&mut bytes, 78, header_size as u32);
        write_u32(&mut bytes, 86, text_start as u32);
        if !image.is_empty() {
            write_u32(&mut bytes, 94, image_start as u32);
        }

        let rec0 = header_size;
        write_u16(&mut bytes, rec0, 1);
        write_u32(&mut bytes, rec0 + 4, text.len() as u32);
        write_u16(&mut bytes, rec0 + 8, 1);
        write_u16(&mut bytes, rec0 + 10, 4096);
        write_u16(&mut bytes, rec0 + 12, 0);
        bytes[rec0 + 16..rec0 + 20].copy_from_slice(b"MOBI");
        write_u32(&mut bytes, rec0 + 20, 232);
        write_u32(&mut bytes, rec0 + 28, 65001);
        write_u32(&mut bytes, rec0 + 0x54, 700);
        write_u32(&mut bytes, rec0 + 0x58, title.len() as u32);
        write_u32(&mut bytes, rec0 + 0x6c, 2);
        bytes[rec0 + 700..rec0 + 700 + title.len()].copy_from_slice(title);
        bytes[text_start..text_start + text.len()].copy_from_slice(text);
        if !image.is_empty() {
            bytes[image_start..image_start + image.len()].copy_from_slice(image);
        }
        bytes
    }

    #[test]
    fn parses_text_and_title() {
        let text = "<html><body><h1>第一章</h1><p>正文</p></body></html>";
        let bytes = build_mobi(text, "测试 MOBI", None);
        let container = parse_mobi_container_bytes(&bytes, "fallback").unwrap();

        assert_eq!(container.title, "测试 MOBI");
        assert_eq!(container.raw_text, text);
        assert_eq!(container.compression, 1);
        assert_eq!(container.encoding, "utf-8");
        assert!(container.image_records.is_empty());
        assert!(container.cover.is_none());
    }

    #[test]
    fn parses_image_record_and_cover() {
        let image = [0xff, 0xd8, 0xff, 0xd9];
        let bytes = build_mobi(
            "<html><body><img recindex=\"1\"></body></html>",
            "图片 MOBI",
            Some(&image),
        );
        let container = parse_mobi_container_bytes(&bytes, "fallback").unwrap();

        assert_eq!(container.image_records.len(), 1);
        assert_eq!(container.image_records[0].recindex, 1);
        assert_eq!(container.image_records[0].mime, "image/jpeg");
        assert_eq!(container.image_records[0].start, container.cover.as_ref().unwrap().start);
        assert!(container.cover.is_some());
    }

    #[test]
    fn decompresses_palm_doc_literals() {
        let output = decompress_palm_doc(&[3, b'A', b'B', b'C'], 3);
        assert_eq!(output, b"ABC");
    }

    #[test]
    fn parses_compressed_ascii_text_record() {
        let text = "<p>Hello</p>";
        let mut bytes = build_mobi(text, "压缩", None);
        let rec0 = read_u32(&bytes, 78).unwrap() as usize;
        write_u16(&mut bytes, rec0, 2);
        let container = parse_mobi_container_bytes(&bytes, "fallback").unwrap();

        assert_eq!(container.compression, 2);
        assert_eq!(container.raw_text, text);
    }

    #[test]
    fn parses_exth_title_and_comic_metadata() {
        let image = [0xff, 0xd8, 0xff, 0xd9];
        let mut bytes = build_mobi("<p>正文</p>", "头书名", Some(&image));
        let rec0 = read_u32(&bytes, 78).unwrap() as usize;
        write_exth(
            &mut bytes,
            rec0 + 248,
            &[
                (123, b"comic"),
                (525, b"vertical-rl"),
                (527, b"rtl"),
                (503, "EXTH 书名".as_bytes()),
            ],
        );
        let container = parse_mobi_container_bytes(&bytes, "fallback").unwrap();

        assert_eq!(container.title, "EXTH 书名");
        assert_eq!(container.cde_type, "comic");
        assert_eq!(container.writing_mode, "vertical-rl");
        assert_eq!(container.page_progression, "rtl");
        assert_eq!(container.cover.unwrap().mime, "image/jpeg");
    }

    #[test]
    fn rejects_drm_and_unsupported_compression() {
        let mut drm = build_mobi("正文", "书", None);
        let rec0 = read_u32(&drm, 78).unwrap() as usize;
        write_u16(&mut drm, rec0 + 12, 2);
        assert!(parse_mobi_container_bytes(&drm, "fallback")
            .unwrap_err()
            .contains("MOBI_DRM"));

        let mut huffman = build_mobi("正文", "书", None);
        let rec0 = read_u32(&huffman, 78).unwrap() as usize;
        write_u16(&mut huffman, rec0, 17480);
        assert!(parse_mobi_container_bytes(&huffman, "fallback")
            .unwrap_err()
            .contains("MOBI_COMPRESSION"));
    }

    #[test]
    fn command_decodes_base64_payload() {
        let bytes = build_mobi("<p>正文</p>", "命令测试", None);
        let container = parse_mobi_container(STANDARD.encode(bytes), "fallback".to_string()).unwrap();
        assert_eq!(container.title, "命令测试");
        assert_eq!(container.raw_text, "<p>正文</p>");
    }
}
