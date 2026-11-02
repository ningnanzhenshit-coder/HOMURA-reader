/* ============================================================================
   HOMURA · 同名导入确认
   ----------------------------------------------------------------------------
   文件选择与拖拽入口共用一个确认状态；导入队列确保同一时间只处理一本同名书。
   ========================================================================== */

import { shallowRef } from 'vue';

const pendingDuplicate = shallowRef(null);
let resolveDuplicate = null;

export function useDuplicateImport() {
  function confirmDuplicate(book, existingBook) {
    return new Promise(resolve => {
      resolveDuplicate = resolve;
      pendingDuplicate.value = { title: book.title, existingTitle: existingBook.title };
    });
  }

  function resolveImport(keep = false) {
    const resolve = resolveDuplicate;
    resolveDuplicate = null;
    pendingDuplicate.value = null;
    if (resolve) resolve(keep);
  }

  return { pendingDuplicate, confirmDuplicate, resolveImport };
}
