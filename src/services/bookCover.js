/* ============================================================================
   HOMURA · 自定义封面
   ----------------------------------------------------------------------------
   验证并缩小本地图片，封面单独存入元数据，不修改书本原文件。
   ========================================================================== */

export async function prepareBookCover(file) {
  if (!file || !/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name)) throw new Error('请选择 PNG、JPG、WebP、GIF、AVIF 或 BMP 图片');
  if (file.size > 20 * 1024 * 1024) throw new Error('封面图片请小于 20 MB');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法处理这张图片')), 'image/webp', 0.9));
  } catch (err) {
    throw new Error('无法读取这张图片，请换一张有效的图片');
  } finally {
    URL.revokeObjectURL(url);
  }
}
