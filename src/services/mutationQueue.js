/* ============================================================================
   HOMURA · 书架写操作互斥队列
   ----------------------------------------------------------------------------
   导入、清空书架等会同时操作 IndexedDB 与原始文件的任务必须串行执行，
   避免清空根目录时误删刚写入的新书，或两批导入互相覆盖落盘状态。
   ========================================================================== */

export function createMutationQueue() {
  let tail = Promise.resolve();

  return function runMutation(task) {
    const current = tail.then(task);
    tail = current.catch(() => {});
    return current;
  };
}

export const runShelfMutation = createMutationQueue();
