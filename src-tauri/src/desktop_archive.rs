/* ============================================================================
HOMURA · 桌面原生压缩包通道
----------------------------------------------------------------------------
只从 AppData/homura-native-sources 随机读取 ZIP 中央目录，图片按需解到
AppCache。EPUB 的 OPF / spine / XHTML 仍由前端解析，Rust 只提供条目与
文本、图片字节；协议故意与 Android 插件保持一致。
========================================================================== */

use crc32fast::Hasher;
use flate2::read::DeflateDecoder;
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const SOURCE_ROOT: &str = "homura-native-sources";
const CACHE_ROOT: &str = "homura-native-pages";
const MAX_ENTRIES: usize = 20_000;
const MAX_ARCHIVE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_BYTES: u64 = 64 * 1024 * 1024;
const MAX_EOCD_SEARCH_BYTES: u64 = 22 + u16::MAX as u64;
const MAX_PAGE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_CACHE_FILES: usize = 24;
const MAX_CACHE_BYTES: u64 = 192 * 1024 * 1024;
const MAX_TEXT_PATHS: usize = 5_000;
const MAX_TEXT_ENTRY_BYTES: u64 = 8 * 1024 * 1024;
const MAX_TEXT_TOTAL_BYTES: u64 = 32 * 1024 * 1024;
const COPY_BUFFER_BYTES: usize = 64 * 1024;

const SIG_EOCD: u32 = 0x0605_4b50;
const SIG_ZIP64_EOCD: u32 = 0x0606_4b50;
const SIG_ZIP64_LOCATOR: u32 = 0x0706_4b50;
const SIG_CENTRAL_HEADER: u32 = 0x0201_4b50;
const SIG_LOCAL_HEADER: u32 = 0x0403_4b50;

#[derive(Debug, Clone)]
struct ZipEntry {
    name: String,
    flags: u16,
    method: u16,
    crc32: u32,
    compressed_size: u64,
    uncompressed_size: u64,
    local_header_offset: u64,
}

#[derive(Debug)]
struct ZipArchive {
    entries: Vec<ZipEntry>,
}

struct ArchiveSession {
    path: PathBuf,
    entries: Vec<ZipEntry>,
    entry_index_by_name: HashMap<String, usize>,
    extract_lock: Mutex<()>,
    closed: AtomicBool,
}

#[derive(Default)]
pub struct DesktopArchiveState {
    sessions: Mutex<HashMap<String, Arc<ArchiveSession>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EntryInfo {
    index: usize,
    name: String,
    path: String,
    size: u64,
    mime: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResponse {
    archive_id: String,
    entries: Vec<EntryInfo>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    images: Vec<EntryInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPage {
    path: String,
    mime: String,
    size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextEntry {
    path: String,
    text: String,
    size: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextBatchResponse {
    texts: Vec<TextEntry>,
    total_bytes: u64,
}

#[derive(Debug, PartialEq)]
enum CopyOutcome {
    Copied(u64),
    TooLarge,
}

fn native_error(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

fn invalid_data(message: impl AsRef<str>) -> String {
    native_error("NATIVE_INVALID_DATA", message)
}

fn limit_exceeded(message: impl AsRef<str>) -> String {
    native_error("NATIVE_LIMIT_EXCEEDED", message)
}

fn unsupported(message: impl AsRef<str>) -> String {
    native_error("NATIVE_UNSUPPORTED", message)
}

fn command_failed(message: impl AsRef<str>) -> String {
    native_error("NATIVE_COMMAND_FAILED", message)
}

fn security_limit(message: impl AsRef<str>) -> String {
    native_error("NATIVE_SECURITY_LIMIT", message)
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    let slice = bytes.get(offset..offset.checked_add(2)?)?;
    Some(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let slice = bytes.get(offset..offset.checked_add(4)?)?;
    Some(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn read_u64(bytes: &[u8], offset: usize) -> Option<u64> {
    let slice = bytes.get(offset..offset.checked_add(8)?)?;
    Some(u64::from_le_bytes([
        slice[0], slice[1], slice[2], slice[3], slice[4], slice[5], slice[6], slice[7],
    ]))
}

fn mime_for(name: &str) -> &'static str {
    match name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("xhtml" | "html" | "htm") => "application/xhtml+xml",
        Some("xml" | "opf" | "ncx") => "application/xml",
        Some("css") => "text/css",
        _ => "application/octet-stream",
    }
}

fn is_image(name: &str) -> bool {
    matches!(
        name.rsplit_once('.')
            .map(|(_, extension)| extension.to_ascii_lowercase())
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "gif" | "avif" | "bmp")
    )
}

fn natural_order(left: &str, right: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;

    let left_chars: Vec<char> = left.chars().collect();
    let right_chars: Vec<char> = right.chars().collect();
    let mut left_index = 0usize;
    let mut right_index = 0usize;

    while left_index < left_chars.len() && right_index < right_chars.len() {
        let left_char = left_chars[left_index];
        let right_char = right_chars[right_index];
        if left_char.is_ascii_digit() && right_char.is_ascii_digit() {
            let left_start = left_index;
            let right_start = right_index;
            while left_index < left_chars.len() && left_chars[left_index].is_ascii_digit() {
                left_index += 1;
            }
            while right_index < right_chars.len() && right_chars[right_index].is_ascii_digit() {
                right_index += 1;
            }
            let left_number = &left_chars[left_start..left_index];
            let right_number = &right_chars[right_start..right_index];
            let left_trimmed = match left_number.iter().position(|character| *character != '0') {
                Some(offset) => &left_number[offset..],
                None => &left_number[left_number.len().saturating_sub(1)..],
            };
            let right_trimmed = match right_number.iter().position(|character| *character != '0') {
                Some(offset) => &right_number[offset..],
                None => &right_number[right_number.len().saturating_sub(1)..],
            };
            match left_trimmed.len().cmp(&right_trimmed.len()) {
                Ordering::Equal => {}
                other => return other,
            }
            match left_trimmed.cmp(right_trimmed) {
                Ordering::Equal => {}
                other => return other,
            }
        } else {
            let left_lower = left_char.to_lowercase().collect::<String>();
            let right_lower = right_char.to_lowercase().collect::<String>();
            match left_lower.cmp(&right_lower) {
                Ordering::Equal => {}
                other => return other,
            }
            left_index += 1;
            right_index += 1;
        }
    }

    (left_chars.len() - left_index).cmp(&(right_chars.len() - right_index))
}

fn decode_zip_name(raw: &[u8], flags: u16) -> String {
    if flags & 0x0800 != 0 || std::str::from_utf8(raw).is_ok() {
        return String::from_utf8_lossy(raw).into_owned();
    }
    let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(raw);
    decoded.into_owned()
}

fn extra_fields(extra: &[u8]) -> Vec<(u16, &[u8])> {
    let mut fields = Vec::new();
    let mut offset = 0usize;
    while offset + 4 <= extra.len() {
        let Some(id) = read_u16(extra, offset) else {
            break;
        };
        let Some(length) = read_u16(extra, offset + 2).map(usize::from) else {
            break;
        };
        let Some(end) = offset
            .checked_add(4)
            .and_then(|value| value.checked_add(length))
        else {
            break;
        };
        if end > extra.len() {
            break;
        }
        fields.push((id, &extra[offset + 4..end]));
        offset = end;
    }
    fields
}

struct ExtraMetadata {
    uncompressed_size: Option<u64>,
    compressed_size: Option<u64>,
    local_header_offset: Option<u64>,
    disk_start: Option<u32>,
    unicode_name: Option<String>,
}

fn parse_extra(
    extra: &[u8],
    raw_name: &[u8],
    needs_uncompressed: bool,
    needs_compressed: bool,
    needs_offset: bool,
    needs_disk: bool,
) -> Result<ExtraMetadata, String> {
    let mut metadata = ExtraMetadata {
        uncompressed_size: None,
        compressed_size: None,
        local_header_offset: None,
        disk_start: None,
        unicode_name: None,
    };

    for (id, data) in extra_fields(extra) {
        if id == 0x0001 {
            let mut offset = 0usize;
            macro_rules! next_u64 {
                () => {{
                    let value = read_u64(data, offset)
                        .ok_or_else(|| invalid_data("ZIP64 扩展字段损坏"))?;
                    offset += 8;
                    value
                }};
            }
            if needs_uncompressed {
                metadata.uncompressed_size = Some(next_u64!());
            }
            if needs_compressed {
                metadata.compressed_size = Some(next_u64!());
            }
            if needs_offset {
                metadata.local_header_offset = Some(next_u64!());
            }
            if needs_disk {
                metadata.disk_start =
                    Some(read_u32(data, offset).ok_or_else(|| invalid_data("ZIP64 磁盘编号损坏"))?);
            }
        } else if id == 0x7075 && data.len() > 5 && data[0] == 1 {
            let expected_crc = read_u32(data, 1).unwrap_or(u32::MAX);
            if expected_crc == crc32fast::hash(raw_name) {
                metadata.unicode_name = std::str::from_utf8(&data[5..]).ok().map(str::to_owned);
            }
        }
    }
    Ok(metadata)
}

struct CentralDirectory {
    offset: u64,
    size: u64,
    count: usize,
}

fn parse_central_directory(file: &mut File, file_len: u64) -> Result<CentralDirectory, String> {
    if file_len < 22 {
        return Err(invalid_data("压缩包过短"));
    }
    let tail_len = file_len.min(MAX_EOCD_SEARCH_BYTES);
    let tail_start = file_len - tail_len;
    file.seek(SeekFrom::Start(tail_start))
        .map_err(|error| command_failed(format!("读取 ZIP 目录失败：{error}")))?;
    let mut tail = vec![0u8; tail_len as usize];
    file.read_exact(&mut tail)
        .map_err(|error| invalid_data(format!("ZIP 尾部不完整：{error}")))?;

    let signature = SIG_EOCD.to_le_bytes();
    let mut search_end = tail.len();
    loop {
        let Some(position) = tail[..search_end]
            .windows(4)
            .rposition(|window| window == signature)
        else {
            return Err(invalid_data("未找到 ZIP 目录结尾"));
        };
        if position + 22 > tail.len() {
            search_end = position;
            continue;
        }
        let comment_length = read_u16(&tail, position + 20).unwrap_or(0) as usize;
        if position + 22 + comment_length == tail.len() {
            let disk = read_u16(&tail, position + 4).unwrap_or(0);
            let central_disk = read_u16(&tail, position + 6).unwrap_or(0);
            let entries_on_disk = read_u16(&tail, position + 8).unwrap_or(0);
            let total_entries = read_u16(&tail, position + 10).unwrap_or(0);
            let central_size = read_u32(&tail, position + 12).unwrap_or(0) as u64;
            let central_offset = read_u32(&tail, position + 16).unwrap_or(0) as u64;
            let eocd_offset = tail_start + position as u64;

            let needs_zip64 = total_entries == u16::MAX
                || entries_on_disk == u16::MAX
                || central_size == u32::MAX as u64
                || central_offset == u32::MAX as u64;
            if needs_zip64 {
                if disk != u16::MAX && disk != 0 {
                    return Err(unsupported("不支持分卷 ZIP"));
                }
                let locator_offset = eocd_offset
                    .checked_sub(20)
                    .ok_or_else(|| invalid_data("ZIP64 定位器缺失"))?;
                let mut locator = [0u8; 20];
                file.seek(SeekFrom::Start(locator_offset))
                    .map_err(|error| command_failed(format!("读取 ZIP64 定位器失败：{error}")))?;
                file.read_exact(&mut locator)
                    .map_err(|error| invalid_data(format!("ZIP64 定位器不完整：{error}")))?;
                if read_u32(&locator, 0) != Some(SIG_ZIP64_LOCATOR) {
                    return Err(invalid_data("ZIP64 定位器签名无效"));
                }
                if read_u32(&locator, 4) != Some(0) || read_u32(&locator, 16).unwrap_or(0) != 1 {
                    return Err(unsupported("不支持分卷 ZIP64"));
                }
                let zip64_offset =
                    read_u64(&locator, 8).ok_or_else(|| invalid_data("ZIP64 目录偏移损坏"))?;
                if zip64_offset >= file_len {
                    return Err(invalid_data("ZIP64 目录偏移越界"));
                }
                let mut zip64 = [0u8; 56];
                file.seek(SeekFrom::Start(zip64_offset))
                    .map_err(|error| command_failed(format!("读取 ZIP64 目录失败：{error}")))?;
                file.read_exact(&mut zip64)
                    .map_err(|error| invalid_data(format!("ZIP64 目录不完整：{error}")))?;
                if read_u32(&zip64, 0) != Some(SIG_ZIP64_EOCD) {
                    return Err(invalid_data("ZIP64 目录签名无效"));
                }
                let record_size = read_u64(&zip64, 4).unwrap_or(0);
                let record_end = zip64_offset
                    .checked_add(12)
                    .and_then(|value| value.checked_add(record_size));
                if record_size < 44 || record_end.map_or(true, |end| end > file_len) {
                    return Err(invalid_data("ZIP64 目录长度无效"));
                }
                if read_u32(&zip64, 16) != Some(0) || read_u32(&zip64, 20) != Some(0) {
                    return Err(unsupported("不支持分卷 ZIP64"));
                }
                let entries =
                    read_u64(&zip64, 32).ok_or_else(|| invalid_data("ZIP64 条目数量损坏"))?;
                let size =
                    read_u64(&zip64, 40).ok_or_else(|| invalid_data("ZIP64 目录大小损坏"))?;
                let offset =
                    read_u64(&zip64, 48).ok_or_else(|| invalid_data("ZIP64 目录偏移损坏"))?;
                return validate_central_directory(offset, size, entries, file_len);
            }

            if disk != 0 || central_disk != 0 || entries_on_disk != total_entries {
                return Err(unsupported("不支持分卷 ZIP"));
            }
            return validate_central_directory(
                central_offset,
                central_size,
                total_entries as u64,
                file_len,
            );
        }
        if position == 0 {
            break;
        }
        search_end = position;
    }
    Err(invalid_data("未找到完整的 ZIP 目录结尾"))
}

fn validate_central_directory(
    offset: u64,
    size: u64,
    entries: u64,
    file_len: u64,
) -> Result<CentralDirectory, String> {
    if entries == 0 {
        return Err(invalid_data("压缩包内没有可用条目"));
    }
    if entries > MAX_ENTRIES as u64 {
        return Err(limit_exceeded("压缩包条目数量过多"));
    }
    if size > MAX_CENTRAL_DIRECTORY_BYTES {
        return Err(limit_exceeded("ZIP 中央目录过大"));
    }
    let end = offset
        .checked_add(size)
        .ok_or_else(|| invalid_data("ZIP 中央目录偏移溢出"))?;
    if end > file_len {
        return Err(invalid_data("ZIP 中央目录越界"));
    }
    Ok(CentralDirectory {
        offset,
        size,
        count: entries as usize,
    })
}

fn read_zip_archive(path: &Path) -> Result<ZipArchive, String> {
    let metadata =
        fs::metadata(path).map_err(|error| invalid_data(format!("压缩包不存在：{error}")))?;
    if !metadata.is_file() {
        return Err(invalid_data("压缩包路径不是文件"));
    }
    let file_len = metadata.len();
    if file_len > MAX_ARCHIVE_BYTES {
        return Err(limit_exceeded("压缩包文件过大"));
    }
    let mut file =
        File::open(path).map_err(|error| command_failed(format!("打开压缩包失败：{error}")))?;
    let central = parse_central_directory(&mut file, file_len)?;
    let size = central.size as usize;
    let mut bytes = vec![0u8; size];
    file.seek(SeekFrom::Start(central.offset))
        .map_err(|error| command_failed(format!("定位 ZIP 中央目录失败：{error}")))?;
    file.read_exact(&mut bytes)
        .map_err(|error| invalid_data(format!("ZIP 中央目录不完整：{error}")))?;

    let mut entries = Vec::with_capacity(central.count);
    let mut offset = 0usize;
    for _ in 0..central.count {
        if offset + 46 > bytes.len() {
            return Err(invalid_data("ZIP 中央目录条目越界"));
        }
        if read_u32(&bytes, offset) != Some(SIG_CENTRAL_HEADER) {
            return Err(invalid_data("ZIP 中央目录条目签名无效"));
        }

        let flags = read_u16(&bytes, offset + 8).unwrap_or(0);
        let method = read_u16(&bytes, offset + 10).unwrap_or(0);
        let crc32 = read_u32(&bytes, offset + 16).unwrap_or(0);
        let compressed_32 = read_u32(&bytes, offset + 20).unwrap_or(0) as u64;
        let uncompressed_32 = read_u32(&bytes, offset + 24).unwrap_or(0) as u64;
        let name_length = read_u16(&bytes, offset + 28).unwrap_or(0) as usize;
        let extra_length = read_u16(&bytes, offset + 30).unwrap_or(0) as usize;
        let comment_length = read_u16(&bytes, offset + 32).unwrap_or(0) as usize;
        let disk_start_16 = read_u16(&bytes, offset + 34).unwrap_or(0);
        let local_offset_32 = read_u32(&bytes, offset + 42).unwrap_or(0) as u64;
        let record_end = offset
            .checked_add(46)
            .and_then(|value| value.checked_add(name_length))
            .and_then(|value| value.checked_add(extra_length))
            .and_then(|value| value.checked_add(comment_length))
            .ok_or_else(|| invalid_data("ZIP 中央目录条目长度溢出"))?;
        if record_end > bytes.len() {
            return Err(invalid_data("ZIP 中央目录条目长度越界"));
        }

        let raw_name = &bytes[offset + 46..offset + 46 + name_length];
        let extra = &bytes[offset + 46 + name_length..offset + 46 + name_length + extra_length];
        let extra_metadata = parse_extra(
            extra,
            raw_name,
            uncompressed_32 == u32::MAX as u64,
            compressed_32 == u32::MAX as u64,
            local_offset_32 == u32::MAX as u64,
            disk_start_16 == u16::MAX,
        )?;
        let compressed_size = if compressed_32 == u32::MAX as u64 {
            extra_metadata
                .compressed_size
                .ok_or_else(|| invalid_data("ZIP64 压缩大小缺失"))?
        } else {
            compressed_32
        };
        let uncompressed_size = if uncompressed_32 == u32::MAX as u64 {
            extra_metadata
                .uncompressed_size
                .ok_or_else(|| invalid_data("ZIP64 解压大小缺失"))?
        } else {
            uncompressed_32
        };
        let local_header_offset = if local_offset_32 == u32::MAX as u64 {
            extra_metadata
                .local_header_offset
                .ok_or_else(|| invalid_data("ZIP64 本地头偏移缺失"))?
        } else {
            local_offset_32
        };
        let disk_start = if disk_start_16 == u16::MAX {
            extra_metadata
                .disk_start
                .ok_or_else(|| invalid_data("ZIP64 磁盘编号缺失"))?
        } else {
            disk_start_16 as u32
        };
        if disk_start != 0 {
            return Err(unsupported("不支持分卷 ZIP"));
        }
        if local_header_offset >= file_len {
            return Err(invalid_data("ZIP 本地头偏移越界"));
        }

        let name = extra_metadata
            .unicode_name
            .unwrap_or_else(|| decode_zip_name(raw_name, flags));
        let is_directory = name.ends_with('/') || name.ends_with('\\');
        if !is_directory && !name.contains("__MACOSX") {
            entries.push(ZipEntry {
                name,
                flags,
                method,
                crc32,
                compressed_size,
                uncompressed_size,
                local_header_offset,
            });
            if entries.len() > MAX_ENTRIES {
                return Err(limit_exceeded("压缩包条目数量过多"));
            }
        }
        offset = record_end;
    }

    entries.sort_by(|left, right| natural_order(&left.name, &right.name));
    Ok(ZipArchive { entries })
}

fn entry_info(entry: &ZipEntry, index: usize) -> EntryInfo {
    EntryInfo {
        index,
        name: entry.name.clone(),
        path: entry.name.clone(),
        size: entry.uncompressed_size,
        mime: mime_for(&entry.name).to_string(),
    }
}

fn resolve_archive_path(data_root: &Path, raw_path: &str) -> Result<PathBuf, String> {
    if raw_path.trim().is_empty() {
        return Err(invalid_data("缺少压缩包路径"));
    }
    let source_root = data_root.join(SOURCE_ROOT);
    let source_root = source_root
        .canonicalize()
        .map_err(|error| invalid_data(format!("原生存档目录不可用：{error}")))?;
    let candidate = Path::new(raw_path);
    let candidate = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        data_root.join(candidate)
    };
    let file = candidate
        .canonicalize()
        .map_err(|error| invalid_data(format!("压缩包不存在：{error}")))?;
    if !file.starts_with(&source_root) {
        return Err(security_limit("压缩包路径不在 HOMURA 存档目录内"));
    }
    if !file.is_file() {
        return Err(invalid_data("压缩包路径不是文件"));
    }
    Ok(file)
}

fn resolve_archive_file(app: &AppHandle, raw_path: &str) -> Result<PathBuf, String> {
    let data_root = app
        .path()
        .app_data_dir()
        .map_err(|error| command_failed(format!("无法定位 AppData：{error}")))?;
    resolve_archive_path(&data_root, raw_path)
}

fn cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join(CACHE_ROOT))
        .map_err(|error| command_failed(format!("无法定位 AppCache：{error}")))
}

fn safe_cache_segment(value: &str) -> String {
    let segment: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .take(160)
        .collect();
    if segment.is_empty() || segment == "." || segment == ".." {
        "book".to_string()
    } else {
        segment
    }
}

fn cache_dir_for(app: &AppHandle, book_id: &str) -> Result<PathBuf, String> {
    Ok(cache_root(app)?.join(safe_cache_segment(book_id)))
}

fn safe_extension(name: &str) -> &'static str {
    match name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") => "jpg",
        Some("jpeg") => "jpeg",
        Some("png") => "png",
        Some("webp") => "webp",
        Some("gif") => "gif",
        Some("avif") => "avif",
        Some("bmp") => "bmp",
        _ => "img",
    }
}

fn touch(path: &Path) -> std::io::Result<()> {
    let file = OpenOptions::new().write(true).open(path)?;
    file.set_modified(SystemTime::now())
}

fn copy_entry_to<W: Write>(
    archive_path: &Path,
    entry: &ZipEntry,
    limit: u64,
    writer: &mut W,
) -> Result<CopyOutcome, String> {
    if entry.flags & 0x0001 != 0 {
        return Err(unsupported("暂不支持加密 ZIP 条目"));
    }
    if entry.method != 0 && entry.method != 8 {
        return Err(unsupported(format!(
            "不支持的 ZIP 压缩方式：{}",
            entry.method
        )));
    }
    if entry.uncompressed_size > limit {
        return Ok(CopyOutcome::TooLarge);
    }

    let mut file = File::open(archive_path)
        .map_err(|error| command_failed(format!("打开压缩包失败：{error}")))?;
    let file_len = file
        .metadata()
        .map_err(|error| command_failed(format!("读取压缩包大小失败：{error}")))?
        .len();
    file.seek(SeekFrom::Start(entry.local_header_offset))
        .map_err(|error| command_failed(format!("定位 ZIP 本地头失败：{error}")))?;
    let mut header = [0u8; 30];
    file.read_exact(&mut header)
        .map_err(|error| invalid_data(format!("ZIP 本地头不完整：{error}")))?;
    if read_u32(&header, 0) != Some(SIG_LOCAL_HEADER) {
        return Err(invalid_data("ZIP 本地头签名无效"));
    }
    let name_length = read_u16(&header, 26).unwrap_or(0) as u64;
    let extra_length = read_u16(&header, 28).unwrap_or(0) as u64;
    let data_offset = entry
        .local_header_offset
        .checked_add(30)
        .and_then(|value| value.checked_add(name_length))
        .and_then(|value| value.checked_add(extra_length))
        .ok_or_else(|| invalid_data("ZIP 数据偏移溢出"))?;
    let data_end = data_offset
        .checked_add(entry.compressed_size)
        .ok_or_else(|| invalid_data("ZIP 数据长度溢出"))?;
    if data_end > file_len {
        return Err(invalid_data("ZIP 数据区越界"));
    }
    file.seek(SeekFrom::Start(data_offset))
        .map_err(|error| command_failed(format!("定位 ZIP 数据区失败：{error}")))?;

    let base = BufReader::new(file).take(entry.compressed_size);
    let mut reader: Box<dyn Read> = if entry.method == 8 {
        Box::new(DeflateDecoder::new(base))
    } else {
        Box::new(base)
    };
    let mut buffer = vec![0u8; COPY_BUFFER_BYTES];
    let mut total = 0u64;
    let mut hasher = Hasher::new();
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| invalid_data(format!("解压 ZIP 条目失败：{error}")))?;
        if read == 0 {
            break;
        }
        let next_total = total
            .checked_add(read as u64)
            .ok_or_else(|| limit_exceeded("ZIP 条目解压后过大"))?;
        if next_total > limit {
            return Ok(CopyOutcome::TooLarge);
        }
        hasher.update(&buffer[..read]);
        writer
            .write_all(&buffer[..read])
            .map_err(|error| command_failed(format!("写入页面缓存失败：{error}")))?;
        total = next_total;
    }

    if entry.uncompressed_size > 0 && total != entry.uncompressed_size {
        return Err(invalid_data("ZIP 条目解压大小不一致"));
    }
    if total > 0 && hasher.finalize() != entry.crc32 {
        return Err(invalid_data("ZIP 条目 CRC 校验失败"));
    }
    Ok(CopyOutcome::Copied(total))
}

fn trim_cache(dir: &Path, keep: Option<&Path>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, u64, SystemTime)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if keep.is_some_and(|candidate| candidate == path.as_path()) {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file()
                || path.extension().and_then(|value| value.to_str()) == Some("part")
            {
                return None;
            }
            Some((
                path,
                metadata.len(),
                metadata.modified().unwrap_or(UNIX_EPOCH),
            ))
        })
        .collect();
    let mut total = files.iter().map(|(_, size, _)| *size).sum::<u64>();
    let mut count = files.len();
    files.sort_by_key(|(_, _, modified)| *modified);
    for (path, size, _) in files {
        if count <= MAX_CACHE_FILES && total <= MAX_CACHE_BYTES {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(size);
            count = count.saturating_sub(1);
        }
    }
}

fn session_for(
    state: &DesktopArchiveState,
    archive_id: &str,
) -> Result<Arc<ArchiveSession>, String> {
    let sessions = state
        .sessions
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let session = sessions
        .get(archive_id)
        .cloned()
        .ok_or_else(|| command_failed("压缩包会话已关闭"))?;
    if session.closed.load(Ordering::Acquire) {
        return Err(command_failed("压缩包会话已关闭"));
    }
    Ok(session)
}

fn retire_session(session: Arc<ArchiveSession>) {
    session.closed.store(true, Ordering::Release);
    let _guard = session
        .extract_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
}

fn open_archive(
    app: &AppHandle,
    state: &DesktopArchiveState,
    archive_id: &str,
    path: &str,
    document: bool,
) -> Result<OpenResponse, String> {
    if archive_id.trim().is_empty() {
        return Err(invalid_data("缺少压缩包会话 ID"));
    }
    let archive_file = resolve_archive_file(app, path)?;
    let archive = read_zip_archive(&archive_file)?;
    let images: Vec<ZipEntry> = archive
        .entries
        .iter()
        .filter(|entry| is_image(&entry.name))
        .cloned()
        .collect();
    let entries = if document {
        archive.entries
    } else {
        images.clone()
    };
    if entries.is_empty() {
        return Err(invalid_data("压缩包内未找到图片"));
    }

    let entry_index_by_name = entries
        .iter()
        .enumerate()
        .map(|(index, entry)| (entry.name.clone(), index))
        .collect::<HashMap<_, _>>();
    let images = if document {
        images
            .iter()
            .map(|entry| {
                let index = entry_index_by_name.get(&entry.name).copied().unwrap_or(0);
                entry_info(entry, index)
            })
            .collect()
    } else {
        Vec::new()
    };
    let session = Arc::new(ArchiveSession {
        path: archive_file,
        entries: entries.clone(),
        entry_index_by_name,
        extract_lock: Mutex::new(()),
        closed: AtomicBool::new(false),
    });
    let previous = state
        .sessions
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(archive_id.to_string(), session);
    if let Some(previous) = previous {
        retire_session(previous);
    }

    Ok(OpenResponse {
        archive_id: archive_id.to_string(),
        entries: entries
            .iter()
            .enumerate()
            .map(|(index, entry)| entry_info(entry, index))
            .collect(),
        images,
    })
}

#[tauri::command(async)]
pub fn open(
    app: AppHandle,
    state: State<'_, DesktopArchiveState>,
    archive_id: String,
    path: String,
) -> Result<OpenResponse, String> {
    open_archive(&app, state.inner(), &archive_id, &path, false)
}

#[tauri::command(async, rename = "openDocument")]
pub fn open_document(
    app: AppHandle,
    state: State<'_, DesktopArchiveState>,
    archive_id: String,
    path: String,
) -> Result<OpenResponse, String> {
    open_archive(&app, state.inner(), &archive_id, &path, true)
}

#[tauri::command(async)]
pub fn extract(
    app: AppHandle,
    state: State<'_, DesktopArchiveState>,
    archive_id: String,
    index: i64,
) -> Result<ExtractedPage, String> {
    let session = session_for(state.inner(), &archive_id)?;
    let index = usize::try_from(index).map_err(|_| invalid_data("页面索引无效"))?;
    let entry = session
        .entries
        .get(index)
        .ok_or_else(|| invalid_data("页面索引越界"))?;
    if entry.uncompressed_size > MAX_PAGE_BYTES {
        return Err(limit_exceeded("单页图片过大"));
    }

    let _guard = session
        .extract_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if session.closed.load(Ordering::Acquire) {
        return Err(command_failed("压缩包会话已关闭"));
    }
    let dir = cache_dir_for(&app, &archive_id)?;
    fs::create_dir_all(&dir)
        .map_err(|error| command_failed(format!("创建页面缓存目录失败：{error}")))?;
    let extension = safe_extension(&entry.name);
    let cache_path = dir.join(format!("{index:05}.{extension}"));
    if cache_path.is_file()
        && fs::metadata(&cache_path)
            .map(|metadata| metadata.len() > 0 && metadata.len() == entry.uncompressed_size)
            .unwrap_or(false)
    {
        let _ = touch(&cache_path);
        let size = fs::metadata(&cache_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        return Ok(ExtractedPage {
            path: cache_path.to_string_lossy().into_owned(),
            mime: mime_for(&entry.name).to_string(),
            size,
        });
    }

    let temporary = dir.join(format!("{index:05}.{extension}.part"));
    let result = (|| {
        let mut output = File::create(&temporary)
            .map_err(|error| command_failed(format!("创建页面临时文件失败：{error}")))?;
        match copy_entry_to(&session.path, entry, MAX_PAGE_BYTES, &mut output)? {
            CopyOutcome::Copied(_) => {}
            CopyOutcome::TooLarge => return Err(limit_exceeded("单页图片解压后过大")),
        }
        output
            .flush()
            .map_err(|error| command_failed(format!("写入页面缓存失败：{error}")))?;
        drop(output);
        if cache_path.exists() {
            fs::remove_file(&cache_path)
                .map_err(|error| command_failed(format!("替换页面缓存失败：{error}")))?;
        }
        fs::rename(&temporary, &cache_path)
            .map_err(|error| command_failed(format!("提交页面缓存失败：{error}")))?;
        let _ = touch(&cache_path);
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }

    trim_cache(&dir, Some(&cache_path));
    let size = fs::metadata(&cache_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    Ok(ExtractedPage {
        path: cache_path.to_string_lossy().into_owned(),
        mime: mime_for(&entry.name).to_string(),
        size,
    })
}

#[tauri::command(async, rename = "readTextBatch")]
pub fn read_text_batch(
    state: State<'_, DesktopArchiveState>,
    archive_id: String,
    paths_json: String,
) -> Result<TextBatchResponse, String> {
    let session = session_for(state.inner(), &archive_id)?;
    let _guard = session
        .extract_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if session.closed.load(Ordering::Acquire) {
        return Err(command_failed("压缩包会话已关闭"));
    }
    let requested: Vec<String> =
        serde_json::from_str(&paths_json).map_err(|_| invalid_data("文本条目请求无效"))?;
    if requested.len() > MAX_TEXT_PATHS {
        return Err(limit_exceeded("批量读取文本条目过多"));
    }

    let mut texts = Vec::new();
    let mut total_bytes = 0u64;
    for path in requested {
        if total_bytes >= MAX_TEXT_TOTAL_BYTES {
            break;
        }
        let Some(index) = session.entry_index_by_name.get(&path).copied() else {
            continue;
        };
        let Some(entry) = session.entries.get(index) else {
            continue;
        };
        let remaining = MAX_TEXT_TOTAL_BYTES - total_bytes;
        let limit = MAX_TEXT_ENTRY_BYTES.min(remaining);
        if entry.uncompressed_size > limit {
            continue;
        }
        let mut bytes = Vec::new();
        match copy_entry_to(&session.path, entry, limit, &mut bytes)? {
            CopyOutcome::Copied(size) => {
                total_bytes = total_bytes.saturating_add(size);
                texts.push(TextEntry {
                    path,
                    text: String::from_utf8_lossy(&bytes).into_owned(),
                    size: bytes.len(),
                });
            }
            CopyOutcome::TooLarge => {}
        }
    }

    Ok(TextBatchResponse { texts, total_bytes })
}

#[tauri::command(async)]
pub fn close(state: State<'_, DesktopArchiveState>, archive_id: String) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&archive_id);
    if let Some(session) = session {
        retire_session(session);
    }
    Ok(())
}

#[tauri::command(async, rename = "clearBook")]
pub fn clear_book(
    app: AppHandle,
    state: State<'_, DesktopArchiveState>,
    book_id: String,
) -> Result<(), String> {
    let removed = {
        let mut sessions = state
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let ids: Vec<String> = sessions
            .iter()
            .filter(|(id, _)| id.as_str() == book_id)
            .map(|(id, _)| id.clone())
            .collect();
        ids.into_iter()
            .filter_map(|id| sessions.remove(&id))
            .collect::<Vec<_>>()
    };
    for session in removed {
        retire_session(session);
    }
    let dir = cache_dir_for(&app, &book_id)?;
    if let Err(error) = fs::remove_dir_all(&dir) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(command_failed(format!("清理页面缓存失败：{error}")));
        }
    }
    Ok(())
}

#[tauri::command(async, rename = "clearAll")]
pub fn clear_all(app: AppHandle, state: State<'_, DesktopArchiveState>) -> Result<(), String> {
    let removed = {
        let mut sessions = state
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        sessions
            .drain()
            .map(|(_, session)| session)
            .collect::<Vec<_>>()
    };
    for session in removed {
        retire_session(session);
    }
    let root = cache_root(&app)?;
    if let Err(error) = fs::remove_dir_all(&root) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(command_failed(format!("清理页面缓存失败：{error}")));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::DeflateEncoder;
    use flate2::Compression;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn push_u16(bytes: &mut Vec<u8>, value: u16) {
        bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn push_u32(bytes: &mut Vec<u8>, value: u32) {
        bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn push_u64(bytes: &mut Vec<u8>, value: u64) {
        bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn build_zip(entries: &[(&str, &[u8], bool)]) -> Vec<u8> {
        struct BuiltEntry {
            name: Vec<u8>,
            method: u16,
            crc32: u32,
            compressed: Vec<u8>,
            uncompressed_size: u32,
            local_offset: u32,
        }

        let mut output = Vec::new();
        let mut built = Vec::new();
        for (name, data, deflate) in entries {
            let local_offset = output.len() as u32;
            let compressed = if *deflate {
                let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
                encoder.write_all(data).unwrap();
                encoder.finish().unwrap()
            } else {
                data.to_vec()
            };
            let crc32 = crc32fast::hash(data);
            push_u32(&mut output, SIG_LOCAL_HEADER);
            push_u16(&mut output, 20);
            push_u16(&mut output, 0);
            push_u16(&mut output, if *deflate { 8 } else { 0 });
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, crc32);
            push_u32(&mut output, compressed.len() as u32);
            push_u32(&mut output, data.len() as u32);
            push_u16(&mut output, name.len() as u16);
            push_u16(&mut output, 0);
            output.extend_from_slice(name.as_bytes());
            output.extend_from_slice(&compressed);
            built.push(BuiltEntry {
                name: name.as_bytes().to_vec(),
                method: if *deflate { 8 } else { 0 },
                crc32,
                compressed,
                uncompressed_size: data.len() as u32,
                local_offset,
            });
        }

        let central_offset = output.len() as u32;
        for entry in &built {
            push_u32(&mut output, SIG_CENTRAL_HEADER);
            push_u16(&mut output, 20);
            push_u16(&mut output, 20);
            push_u16(&mut output, 0);
            push_u16(&mut output, entry.method);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, entry.crc32);
            push_u32(&mut output, entry.compressed.len() as u32);
            push_u32(&mut output, entry.uncompressed_size);
            push_u16(&mut output, entry.name.len() as u16);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u16(&mut output, 0);
            push_u32(&mut output, 0);
            push_u32(&mut output, entry.local_offset);
            output.extend_from_slice(&entry.name);
        }
        let central_size = output.len() as u32 - central_offset;
        push_u32(&mut output, SIG_EOCD);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, built.len() as u16);
        push_u16(&mut output, built.len() as u16);
        push_u32(&mut output, central_size);
        push_u32(&mut output, central_offset);
        push_u16(&mut output, 0);
        output
    }

    fn build_zip64(name: &str, data: &[u8]) -> Vec<u8> {
        let mut output = Vec::new();
        let crc32 = crc32fast::hash(data);
        push_u32(&mut output, SIG_LOCAL_HEADER);
        push_u16(&mut output, 45);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u32(&mut output, crc32);
        push_u32(&mut output, data.len() as u32);
        push_u32(&mut output, data.len() as u32);
        push_u16(&mut output, name.len() as u16);
        push_u16(&mut output, 0);
        output.extend_from_slice(name.as_bytes());
        output.extend_from_slice(data);

        let central_offset = output.len() as u64;
        push_u32(&mut output, SIG_CENTRAL_HEADER);
        push_u16(&mut output, 45);
        push_u16(&mut output, 45);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u32(&mut output, crc32);
        push_u32(&mut output, u32::MAX);
        push_u32(&mut output, u32::MAX);
        push_u16(&mut output, name.len() as u16);
        push_u16(&mut output, 28);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u32(&mut output, 0);
        push_u32(&mut output, u32::MAX);
        output.extend_from_slice(name.as_bytes());
        push_u16(&mut output, 0x0001);
        push_u16(&mut output, 24);
        push_u64(&mut output, data.len() as u64);
        push_u64(&mut output, data.len() as u64);
        push_u64(&mut output, 0);

        let central_size = output.len() as u64 - central_offset;
        let zip64_offset = output.len() as u64;
        push_u32(&mut output, SIG_ZIP64_EOCD);
        push_u64(&mut output, 44);
        push_u16(&mut output, 45);
        push_u16(&mut output, 45);
        push_u32(&mut output, 0);
        push_u32(&mut output, 0);
        push_u64(&mut output, 1);
        push_u64(&mut output, 1);
        push_u64(&mut output, central_size);
        push_u64(&mut output, central_offset);

        push_u32(&mut output, SIG_ZIP64_LOCATOR);
        push_u32(&mut output, 0);
        push_u64(&mut output, zip64_offset);
        push_u32(&mut output, 1);

        push_u32(&mut output, SIG_EOCD);
        push_u16(&mut output, 0);
        push_u16(&mut output, 0);
        push_u16(&mut output, u16::MAX);
        push_u16(&mut output, u16::MAX);
        push_u32(&mut output, u32::MAX);
        push_u32(&mut output, u32::MAX);
        push_u16(&mut output, 0);
        output
    }

    fn temp_zip(bytes: &[u8]) -> PathBuf {
        let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "homura-desktop-archive-{}-{sequence}.zip",
            std::process::id()
        ));
        fs::write(&path, bytes).unwrap();
        path
    }

    fn temp_dir() -> PathBuf {
        let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "homura-desktop-archive-dir-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn reads_store_and_deflate_entries() {
        let first = b"first page bytes";
        let second = b"second page bytes with a longer payload";
        let path = temp_zip(&build_zip(&[
            ("pages/001.jpg", first.as_slice(), false),
            ("pages/002.jpg", second.as_slice(), true),
        ]));
        let archive = read_zip_archive(&path).unwrap();
        assert_eq!(archive.entries.len(), 2);
        assert_eq!(archive.entries[0].name, "pages/001.jpg");

        let mut output = Vec::new();
        assert_eq!(
            copy_entry_to(&path, &archive.entries[0], 1024, &mut output).unwrap(),
            CopyOutcome::Copied(first.len() as u64)
        );
        assert_eq!(output, first);

        output.clear();
        assert_eq!(
            copy_entry_to(&path, &archive.entries[1], 1024, &mut output).unwrap(),
            CopyOutcome::Copied(second.len() as u64)
        );
        assert_eq!(output, second);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn enforces_entry_limits_and_detects_corruption() {
        let data = vec![b'x'; 4096];
        let path = temp_zip(&build_zip(&[("page.jpg", data.as_slice(), true)]));
        let archive = read_zip_archive(&path).unwrap();
        let mut output = Vec::new();
        assert_eq!(
            copy_entry_to(&path, &archive.entries[0], 32, &mut output).unwrap(),
            CopyOutcome::TooLarge
        );

        let mut bytes = fs::read(&path).unwrap();
        let data_offset = 30 + "page.jpg".len();
        bytes[data_offset] ^= 0x7f;
        fs::write(&path, bytes).unwrap();
        assert!(copy_entry_to(&path, &archive.entries[0], 1_000_000, &mut Vec::new()).is_err());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reads_zip64_central_directory() {
        let data = b"zip64 page";
        let path = temp_zip(&build_zip64("pages/064.jpg", data));
        let archive = read_zip_archive(&path).unwrap();
        assert_eq!(archive.entries.len(), 1);
        assert_eq!(archive.entries[0].uncompressed_size, data.len() as u64);
        let mut output = Vec::new();
        assert_eq!(
            copy_entry_to(&path, &archive.entries[0], 1024, &mut output).unwrap(),
            CopyOutcome::Copied(data.len() as u64)
        );
        assert_eq!(output, data);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn sorts_naturally_and_maps_extensions_safely() {
        let mut names = vec!["chapter10.jpg", "chapter2.jpg", "chapter1.jpg"];
        names.sort_by(|left, right| natural_order(left, right));
        assert_eq!(names, vec!["chapter1.jpg", "chapter2.jpg", "chapter10.jpg"]);
        assert_eq!(safe_extension("../../evil.JPG"), "jpg");
        assert_eq!(safe_cache_segment("../library/book"), ".._library_book");
        assert_eq!(safe_cache_segment("."), "book");
        assert_eq!(safe_cache_segment(".."), "book");
    }

    #[test]
    fn resolves_sources_only_inside_native_storage() {
        let data_root = temp_dir();
        let source_dir = data_root.join(SOURCE_ROOT).join("book-1").join("source");
        fs::create_dir_all(&source_dir).unwrap();
        let inside = source_dir.join("book.cbz");
        let outside = data_root.join("outside.cbz");
        let external = data_root.parent().unwrap().join(format!(
            "{}-outside.cbz",
            data_root.file_name().unwrap().to_string_lossy()
        ));
        fs::write(&inside, b"inside").unwrap();
        fs::write(&outside, b"outside").unwrap();
        fs::write(&external, b"external").unwrap();

        let relative = format!("{SOURCE_ROOT}/book-1/source/book.cbz");
        assert_eq!(
            resolve_archive_path(&data_root, &relative).unwrap(),
            inside.canonicalize().unwrap()
        );
        let traversal = format!("../{}", external.file_name().unwrap().to_string_lossy());
        assert!(resolve_archive_path(&data_root, &traversal)
            .unwrap_err()
            .starts_with("NATIVE_SECURITY_LIMIT"));
        assert!(resolve_archive_path(&data_root, outside.to_str().unwrap())
            .unwrap_err()
            .starts_with("NATIVE_SECURITY_LIMIT"));

        let _ = fs::remove_dir_all(data_root);
        let _ = fs::remove_file(external);
    }
}
