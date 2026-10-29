/* ============================================================================
   HOMURA · OPFS 原始文件存储
   ----------------------------------------------------------------------------
   移动端拿不到 FileSystemFileHandle，IndexedDB 直接塞 Blob 又容易撑爆配额；
   这里把原文件写进 Origin Private File System，只回存一个相对路径。
   路径形如：<bookId>/<fileName> 或 <bookId>/<序号>/<fileName>。
   任一环境不支持 OPFS 时由调用方回落到 IndexedDB Blob。
   ========================================================================== */

const ROOT_DIR = 'homura-sources';

function safeSegment(name) {
  return String(name || 'source').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'source';
}

function splitPath(path) {
  return String(path || '').split('/').filter(Boolean);
}

async function getRoot(create) {
  if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
    throw new Error('OPFS 不可用');
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ROOT_DIR, { create });
}

// 逐级创建目录，最后一级当作文件名写盘
async function resolveParent(segments) {
  const root = await getRoot(true);
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(safeSegment(segment), { create: true });
  }
  return dir;
}

export async function putFile(path, blob) {
  const segments = splitPath(path);
  if (segments.length < 2) throw new Error('OPFS 路径无效');
  const fileName = safeSegment(segments.pop());
  const dir = await resolveParent(segments);
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return [...segments, fileName].join('/');
}

export async function getFile(path) {
  const segments = splitPath(path);
  if (segments.length < 2) throw new Error('OPFS 路径无效');
  const fileName = safeSegment(segments.pop());
  const root = await getRoot(false);
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(safeSegment(segment));
  }
  const handle = await dir.getFileHandle(fileName);
  return handle.getFile();
}

export async function removeBookDir(bookId) {
  if (!bookId) return;
  try {
    const root = await getRoot(false);
    await root.removeEntry(safeSegment(bookId), { recursive: true });
  } catch (err) {}
}

export async function clearAll() {
  try {
    const root = await getRoot(false);
    await root.removeEntry(ROOT_DIR, { recursive: true });
  } catch (err) {}
}
