use base64::{engine::general_purpose::STANDARD, Engine as _};
use encoding_rs::{Encoding, GB18030, UTF_16BE, UTF_16LE, UTF_8};
use serde::Serialize;

const UTF16_SAMPLE_BYTES: usize = 64 * 1024;
const MAX_TEXT_BYTES: usize = 16 * 1024 * 1024;
const MAX_BASE64_CHARS: usize = ((MAX_TEXT_BYTES + 2) / 3) * 4 + 4;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecodedText {
  pub text: String,
  pub encoding: String,
}

fn decoded_with(bytes: &[u8], encoding: &'static Encoding) -> DecodedText {
  let (text, _) = encoding.decode_with_bom_removal(bytes);
  DecodedText {
    text: text.into_owned(),
    encoding: encoding.name().to_uppercase(),
  }
}

fn guess_utf16(bytes: &[u8]) -> Option<&'static Encoding> {
  let pairs = bytes.len().min(UTF16_SAMPLE_BYTES) / 2;
  if pairs == 0 {
    return None;
  }

  let mut even_zeros = 0usize;
  let mut odd_zeros = 0usize;
  for index in 0..pairs {
    if bytes[index * 2] == 0 {
      even_zeros += 1;
    }
    if bytes[index * 2 + 1] == 0 {
      odd_zeros += 1;
    }
  }

  let minimum = ((pairs * 15) + 99) / 100;
  if odd_zeros >= minimum && odd_zeros > even_zeros * 3 {
    Some(UTF_16LE)
  } else if even_zeros >= minimum && even_zeros > odd_zeros * 3 {
    Some(UTF_16BE)
  } else {
    None
  }
}

fn decode_text(bytes: &[u8]) -> DecodedText {
  if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
    return decoded_with(bytes, UTF_8);
  }
  if bytes.starts_with(&[0xff, 0xfe]) {
    return decoded_with(bytes, UTF_16LE);
  }
  if bytes.starts_with(&[0xfe, 0xff]) {
    return decoded_with(bytes, UTF_16BE);
  }

  // 无 BOM 的 UTF-16 英文也是合法 UTF-8 字节，必须先检查交错的零字节。
  if let Some(encoding) = guess_utf16(bytes) {
    return decoded_with(bytes, encoding);
  }

  let (text, had_errors) = UTF_8.decode_with_bom_removal(bytes);
  if !had_errors {
    return DecodedText {
      text: text.into_owned(),
      encoding: UTF_8.name().to_uppercase(),
    };
  }

  decoded_with(bytes, GB18030)
}

#[tauri::command]
pub fn decode_text_bytes(bytes_base64: String) -> Result<DecodedText, String> {
  if bytes_base64.len() > MAX_BASE64_CHARS {
    return Err("TEXT_TOO_LARGE: 文本文件过大".to_string());
  }
  let bytes = STANDARD
    .decode(bytes_base64.as_bytes())
    .map_err(|_| "INVALID_TEXT_BYTES: 文本编码数据无效".to_string())?;
  if bytes.len() > MAX_TEXT_BYTES {
    return Err("TEXT_TOO_LARGE: 文本文件过大".to_string());
  }
  Ok(decode_text(&bytes))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn encoded(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
  }

  #[test]
  fn decodes_utf8_and_bom() {
    let text = "第一章 你好，世界。𠀀💫";
    let decoded = decode_text(text.as_bytes());
    assert_eq!(decoded.text, text);
    assert_eq!(decoded.encoding, "UTF-8");

    let mut with_bom = vec![0xef, 0xbb, 0xbf];
    with_bom.extend_from_slice(text.as_bytes());
    let decoded = decode_text(&with_bom);
    assert_eq!(decoded.text, text);
    assert_eq!(decoded.encoding, "UTF-8");
  }

  #[test]
  fn decodes_gb18030_and_four_byte_extension() {
    let bytes = [
      181, 218, 210, 187, 213, 194, 32, 196, 227, 186, 195, 163, 172, 202, 192, 189, 231,
      161, 163, 13, 10, 181, 218, 182, 254, 213, 194, 32, 178, 226, 202, 212, 149, 50, 130,
      54, 148, 57, 218, 53,
    ];
    let decoded = decode_text(&bytes);
    assert_eq!(decoded.text, "第一章 你好，世界。\r\n第二章 测试𠀀💫");
    assert_eq!(decoded.encoding, "GB18030");
  }

  #[test]
  fn decodes_utf16_with_and_without_bom() {
    let text = "第一章\r\n中文与 English 123 💫";
    let mut le = Vec::new();
    for unit in text.encode_utf16() {
      le.extend_from_slice(&unit.to_le_bytes());
    }
    let mut be = Vec::new();
    for unit in text.encode_utf16() {
      be.extend_from_slice(&unit.to_be_bytes());
    }

    let decoded = decode_text(&[&[0xff, 0xfe], le.as_slice()].concat());
    assert_eq!(decoded.text, text);
    assert_eq!(decoded.encoding, "UTF-16LE");

    let decoded = decode_text(&[&[0xfe, 0xff], be.as_slice()].concat());
    assert_eq!(decoded.text, text);
    assert_eq!(decoded.encoding, "UTF-16BE");

    let decoded = decode_text(&le);
    assert_eq!(decoded.text, text);
    assert_eq!(decoded.encoding, "UTF-16LE");

    let decoded = decode_text(&be);
    assert_eq!(decoded.text, text);
    assert_eq!(decoded.encoding, "UTF-16BE");
  }

  #[test]
  fn command_rejects_invalid_base64() {
    let error = decode_text_bytes("不是 base64".to_string()).unwrap_err();
    assert!(error.contains("INVALID_TEXT_BYTES"));
  }

  #[test]
  fn command_decodes_base64_payload() {
    let decoded = decode_text_bytes(encoded("测试文本".as_bytes())).unwrap();
    assert_eq!(decoded.text, "测试文本");
    assert_eq!(decoded.encoding, "UTF-8");
  }
}
