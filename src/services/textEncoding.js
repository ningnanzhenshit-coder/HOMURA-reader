/* ============================================================================
   HOMURA · TXT 编码兼容
   ----------------------------------------------------------------------------
   先识别 BOM 与 UTF-16 零字节特征，再严格验证 UTF-8；旧中文 ANSI 文本
   使用 GB18030 解码，覆盖 GBK / GB2312，无需修改或转存原文件。
   ========================================================================== */

function guessUtf16(bytes) {
  const pairs = Math.floor(Math.min(bytes.length, 65536) / 2);
  if (!pairs) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < pairs * 2; i += 2) {
    if (bytes[i] === 0) evenZeros++;
    if (bytes[i + 1] === 0) oddZeros++;
  }
  const minimum = Math.max(1, Math.ceil(pairs * 0.15));
  if (oddZeros >= minimum && oddZeros > evenZeros * 3) return 'utf-16le';
  if (evenZeros >= minimum && evenZeros > oddZeros * 3) return 'utf-16be';
  return null;
}

export function decodeTxtBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  // 无 BOM 的 UTF-16 英文也是合法 UTF-8 字节，必须先检查交错的零字节。
  const utf16 = guessUtf16(bytes);
  if (utf16) return new TextDecoder(utf16).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    return new TextDecoder('gb18030').decode(bytes);
  }
}
