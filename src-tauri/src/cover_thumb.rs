/* ============================================================================
HOMURA · 封面缩略图
----------------------------------------------------------------------------
书架只需要最长边 480px 的封面。这里用 image crate 在 Rust 侧解码与缩放，
避免 WebView 为每本书保留一份大位图；不支持或损坏的格式交回前端 Canvas。
========================================================================== */

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::codecs::{jpeg::JpegEncoder, webp::WebPEncoder};
use image::imageops::FilterType;
use image::{ExtendedColorType, ImageEncoder, ImageFormat, ImageReader, Limits};
use serde::Serialize;
use std::io::Cursor;

const DEFAULT_MAX_EDGE: u32 = 480;
const MIN_MAX_EDGE: u32 = 64;
const MAX_MAX_EDGE: u32 = 2048;
const MAX_INPUT_BYTES: usize = 20 * 1024 * 1024;
const MAX_BASE64_CHARS: usize = ((MAX_INPUT_BYTES + 2) / 3) * 4 + 4;
const MAX_DIMENSION: u32 = 20_000;
const MAX_DECODED_PIXELS: u64 = 40_000_000;
const MAX_OUTPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_DECODE_ALLOC: u64 = 256 * 1024 * 1024;
const JPEG_QUALITY: u8 = 84;
const KEEP_ORIGINAL_PERCENT: u64 = 92;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverThumbnail {
    changed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    bytes_base64: Option<String>,
    mime: String,
    width: u32,
    height: u32,
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

fn supported_format(format: ImageFormat) -> bool {
    matches!(
        format,
        ImageFormat::Png
            | ImageFormat::Jpeg
            | ImageFormat::Gif
            | ImageFormat::WebP
            | ImageFormat::Bmp
    )
}

fn max_edge(value: Option<u32>) -> Result<u32, String> {
    let edge = value.unwrap_or(DEFAULT_MAX_EDGE);
    if !(MIN_MAX_EDGE..=MAX_MAX_EDGE).contains(&edge) {
        return Err(limit_exceeded("封面缩略图边长超出允许范围"));
    }
    Ok(edge)
}

fn reader_for(bytes: &[u8]) -> Result<(ImageReader<Cursor<&[u8]>>, ImageFormat, u32, u32), String> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| invalid_data(format!("无法识别封面格式：{error}")))?;
    let format = reader
        .format()
        .ok_or_else(|| unsupported("封面格式暂不支持原生缩略图"))?;
    if !supported_format(format) {
        return Err(unsupported("封面格式暂不支持原生缩略图"));
    }

    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    reader.limits(limits);
    let (width, height) = reader
        .into_dimensions()
        .map_err(|error| image_error("读取封面尺寸失败", error))?;
    if width == 0 || height == 0 {
        return Err(invalid_data("封面尺寸无效"));
    }
    if u64::from(width).saturating_mul(u64::from(height)) > MAX_DECODED_PIXELS {
        return Err(limit_exceeded("封面解码像素过多"));
    }

    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| invalid_data(format!("无法识别封面格式：{error}")))?;
    Ok((reader, format, width, height))
}

fn image_error(label: &str, error: image::ImageError) -> String {
    if matches!(error, image::ImageError::Limits(_)) {
        limit_exceeded(format!("{label}：{error}"))
    } else if matches!(error, image::ImageError::Unsupported(_)) {
        unsupported(format!("{label}：{error}"))
    } else {
        invalid_data(format!("{label}：{error}"))
    }
}

fn encode_webp(image: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut output = Vec::new();
    WebPEncoder::new_lossless(&mut output)
        .write_image(rgba.as_raw(), width, height, ExtendedColorType::Rgba8)
        .map_err(|error| image_error("编码 WebP 封面失败", error))?;
    Ok(output)
}

fn encode_jpeg(image: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let rgb = image.to_rgb8();
    let mut output = Vec::new();
    JpegEncoder::new_with_quality(&mut output, JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|error| image_error("编码 JPEG 封面失败", error))?;
    Ok(output)
}

fn create_thumbnail(bytes: &[u8], requested_edge: Option<u32>) -> Result<CoverThumbnail, String> {
    if bytes.is_empty() {
        return Err(invalid_data("封面数据为空"));
    }
    if bytes.len() > MAX_INPUT_BYTES {
        return Err(limit_exceeded("封面图片过大"));
    }
    let edge = max_edge(requested_edge)?;
    let (reader, format, width, height) = reader_for(bytes)?;
    let mime = format.to_mime_type().to_string();

    if width.max(height) <= edge {
        return Ok(CoverThumbnail {
            changed: false,
            bytes_base64: None,
            mime,
            width,
            height,
        });
    }

    let image = reader
        .decode()
        .map_err(|error| image_error("解码封面失败", error))?;
    let resized = image.resize(edge, edge, FilterType::Lanczos3);
    let output = if image.color().has_alpha() {
        encode_webp(&resized)?
    } else {
        encode_jpeg(&resized)?
    };
    if output.len() > MAX_OUTPUT_BYTES {
        return Err(limit_exceeded("封面缩略图输出过大"));
    }
    if (output.len() as u64).saturating_mul(100)
        >= (bytes.len() as u64).saturating_mul(KEEP_ORIGINAL_PERCENT)
    {
        return Ok(CoverThumbnail {
            changed: false,
            bytes_base64: None,
            mime,
            width,
            height,
        });
    }

    Ok(CoverThumbnail {
        changed: true,
        bytes_base64: Some(STANDARD.encode(&output)),
        mime: if image.color().has_alpha() {
            "image/webp".to_string()
        } else {
            "image/jpeg".to_string()
        },
        width: resized.width(),
        height: resized.height(),
    })
}

#[tauri::command]
pub fn create_cover_thumbnail(
    bytes_base64: String,
    max_edge: Option<u32>,
) -> Result<CoverThumbnail, String> {
    if bytes_base64.len() > MAX_BASE64_CHARS {
        return Err(limit_exceeded("封面图片过大"));
    }
    let bytes = STANDARD
        .decode(bytes_base64.as_bytes())
        .map_err(|_| invalid_data("封面图片 Base64 无效"))?;
    create_thumbnail(&bytes, max_edge)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, ImageBuffer, Rgba};
    use std::io::Cursor;

    fn png_bytes(image: ImageBuffer<Rgba<u8>, Vec<u8>>) -> Vec<u8> {
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        bytes
    }

    #[test]
    fn resizes_large_cover_and_preserves_aspect_ratio() {
        let image = ImageBuffer::from_fn(1200, 800, |x, y| {
            Rgba([
                ((x * 17 + y * 3) % 256) as u8,
                ((x * 5 + y * 23) % 256) as u8,
                ((x * 31 + y * 7) % 256) as u8,
                255,
            ])
        });
        let thumb = create_thumbnail(&png_bytes(image), Some(480)).unwrap();
        assert!(thumb.changed);
        assert_eq!((thumb.width, thumb.height), (480, 320));
        assert_eq!(thumb.mime, "image/webp");

        let output = STANDARD.decode(thumb.bytes_base64.unwrap()).unwrap();
        let decoded = image::load_from_memory(&output).unwrap();
        assert_eq!(decoded.dimensions(), (480, 320));
    }

    #[test]
    fn keeps_small_cover_and_rejects_bad_limits() {
        let image = ImageBuffer::from_pixel(120, 80, Rgba([20, 40, 60, 255]));
        let thumb = create_thumbnail(&png_bytes(image), Some(480)).unwrap();
        assert!(!thumb.changed);
        assert!(thumb.bytes_base64.is_none());
        assert_eq!((thumb.width, thumb.height), (120, 80));

        assert!(create_thumbnail(b"not an image", Some(480))
            .unwrap_err()
            .starts_with("NATIVE_UNSUPPORTED"));
        assert!(max_edge(Some(1))
            .unwrap_err()
            .starts_with("NATIVE_LIMIT_EXCEEDED"));
        assert!(max_edge(Some(MAX_MAX_EDGE + 1))
            .unwrap_err()
            .starts_with("NATIVE_LIMIT_EXCEEDED"));
    }

    #[test]
    fn command_rejects_invalid_base64() {
        let error = create_cover_thumbnail("不是 base64".to_string(), Some(480)).unwrap_err();
        assert!(error.starts_with("NATIVE_INVALID_DATA"));
    }
}
