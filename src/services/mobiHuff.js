/* ============================================================================
   HOMURA · MOBI HUFF/CDIC 文本记录解压
   ========================================================================== */

const signature = (bytes, offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
const viewOf = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export function createHuffDecoder(records) {
  const [huff, ...dictionaries] = records;
  if (huff?.length < 24 || !huff || signature(huff, 0) !== 'HUFF' || !dictionaries.length) {
    throw new Error('缺少 HUFF/CDIC 字典');
  }
  const header = viewOf(huff);
  const lookupOffset = header.getUint32(8);
  const rangesOffset = header.getUint32(12);
  if (lookupOffset + 1024 > huff.length || rangesOffset + 256 > huff.length) {
    throw new Error('HUFF 码表超出记录范围');
  }

  const symbols = [];
  let symbolCount;
  for (const record of dictionaries) {
    if (record.length < 16 || signature(record, 0) !== 'CDIC') throw new Error('无效的 CDIC 记录');
    const data = viewOf(record);
    const base = data.getUint32(4);
    const total = data.getUint32(8);
    const width = data.getUint32(12);
    symbolCount ??= total;
    if (base < 16 || width > 16 || total !== symbolCount || total <= symbols.length) {
      throw new Error('无效的 CDIC 字典头');
    }
    const count = Math.min(2 ** width, total - symbols.length);
    const offsetsEnd = base + count * 2;
    if (offsetsEnd > record.length) throw new Error('CDIC 索引超出记录范围');
    for (let i = 0; i < count; i++) {
      const offset = base + data.getUint16(base + i * 2);
      if (offset < offsetsEnd || offset + 2 > record.length) throw new Error('无效的 CDIC 词条位置');
      const info = data.getUint16(offset);
      const end = offset + 2 + (info & 0x7fff);
      if (end > record.length) throw new Error('CDIC 词条超出记录范围');
      symbols.push({ literal: !!(info & 0x8000), bytes: record.subarray(offset + 2, end) });
    }
  }
  if (symbols.length !== symbolCount) throw new Error('CDIC 字典不完整');

  return (compressed, limit) => {
    const result = new Uint8Array(limit);
    const active = new Set();
    let written = 0;
    // 限制损坏字典的递归和总解码次数，输出也始终受文本记录大小约束。
    let budget = 64 * (compressed.length + limit);
    function expand(input) {
      for (let bit = 0; bit < input.length * 8 && written < limit;) {
        if (--budget < 0) throw new Error('HUFF 解码超过记录限额');
        const byte = bit >>> 3;
        const shift = bit & 7;
        const word = (input[byte] << 24) | (input[byte + 1] << 16) | (input[byte + 2] << 8) | input[byte + 3];
        const window = ((word << shift) | ((input[byte + 4] || 0) >>> (8 - shift))) >>> 0;
        const fast = header.getUint32(lookupOffset + (window >>> 24) * 4);
        let width = fast & 31;
        if (!width) throw new Error('无效的 HUFF 码长');
        let maximum = fast >>> 8;
        let code = window >>> (32 - width);
        if (!(fast & 128)) {
          while (code < header.getUint32(rangesOffset + (width - 1) * 8)) {
            if (++width > 32) throw new Error('HUFF 码长超出范围');
            code = window >>> (32 - width);
          }
          maximum = header.getUint32(rangesOffset + (width - 1) * 8 + 4);
        }
        bit += width;
        if (bit > input.length * 8) break;
        const index = maximum - code;
        const symbol = symbols[index];
        if (!symbol) throw new Error('HUFF 词条索引超出范围');
        if (symbol.literal) {
          const count = Math.min(symbol.bytes.length, limit - written);
          result.set(symbol.bytes.subarray(0, count), written);
          written += count;
        } else {
          if (active.has(index) || active.size >= 32) throw new Error('CDIC 词条循环引用或嵌套过深');
          active.add(index);
          expand(symbol.bytes);
          active.delete(index);
        }
      }
    }
    expand(compressed);
    return result.subarray(0, written);
  };
}
