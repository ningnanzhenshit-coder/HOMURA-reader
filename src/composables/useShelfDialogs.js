import { shallowRef } from 'vue';

const pendingShelfDialog = shallowRef(null);
let resolvePending = null;
let queue = Promise.resolve();

export function useShelfDialogs() {
  function askShelfDialog(options) {
    const task = queue.then(() => new Promise(resolve => {
      resolvePending = resolve;
      pendingShelfDialog.value = options;
    }));
    queue = task.catch(() => {});
    return task;
  }

  function resolveShelfDialog(value = null) {
    const resolve = resolvePending;
    pendingShelfDialog.value = null;
    resolvePending = null;
    if (resolve) resolve(value);
  }

  return { pendingShelfDialog, askShelfDialog, resolveShelfDialog };
}
