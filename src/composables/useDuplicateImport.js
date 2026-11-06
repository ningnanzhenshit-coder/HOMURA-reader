/* ============================================================================
   HOMURA · 同名导入确认
   ----------------------------------------------------------------------------
   文件选择与拖拽入口共用一个确认状态；导入队列确保同一时间只处理一组同名书。
   批量导入会先按文件名预检，同名文件可以一次决定保留或跳过。
   ========================================================================== */

import { shallowRef } from 'vue';

const pendingDuplicate = shallowRef(null);
let resolveDuplicate = null;

export function useDuplicateImport() {
  function confirmDuplicates(items) {
    const list = (items || []).filter(item => item && item.title);
    if (list.length === 0) return Promise.resolve(true);
    const count = list.reduce((total, item) => total + (item.count || 1), 0);
    return new Promise(resolve => {
      resolveDuplicate = resolve;
      pendingDuplicate.value = {
        batch: list.length > 1 || count > 1,
        count,
        items: list,
        title: list[0].title,
        existingTitle: list[0].existingTitle
      };
    });
  }

  function confirmDuplicate(book, existingBook) {
    return confirmDuplicates([{ title: book.title, existingTitle: existingBook.title }]);
  }

  function resolveImport(keep = false) {
    const resolve = resolveDuplicate;
    resolveDuplicate = null;
    pendingDuplicate.value = null;
    if (resolve) resolve(keep);
  }

  return { pendingDuplicate, confirmDuplicate, confirmDuplicates, resolveImport };
}
