/* ============================================================================
   HOMURA · 应用更新 Store
   ----------------------------------------------------------------------------
   检查、下载、安装和更新日志共用同一份状态，保证启动自动检查与设置页手动
   检查不会各自弹出两套更新界面。网络失败只在用户主动检查时展示。
   ========================================================================== */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import packageInfo from '../../package.json';
import { openGitHubUrl } from '../services/external.js';
import {
  canDownloadUpdateInApp,
  cancelUpdateDownload,
  clearPendingUpdate,
  downloadUpdateAsset,
  installDownloadedUpdate as launchDownloadedUpdate,
  loadPendingUpdate,
  savePendingUpdate
} from '../services/updateDownload.js';
import {
  detectUpdatePlatform,
  fetchStableReleases,
  isVersionNewer,
  RELEASES_PAGE_URL,
  selectReleaseAsset
} from '../services/updates.js';

function emptyDownloadState() {
  return {
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    fileName: '',
    path: '',
    size: 0,
    version: ''
  };
}

function createDownloadId() {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `update_${random.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export const useUpdateStore = defineStore('updates', () => {
  const appVersion = packageInfo.version;
  const updatePlatform = detectUpdatePlatform();
  const releases = ref([]);
  const latestRelease = ref(null);
  const updateDialogOpen = ref(false);
  const updateStatus = ref('idle');
  const updateError = ref(null);
  const downloadError = ref(null);
  const changelogOpen = ref(false);
  const changelogStatus = ref('idle');
  const changelogError = ref(null);
  const downloadedUpdate = ref(restorePendingUpdate());
  const downloadState = ref(emptyDownloadState());
  let activeDownloadId = '';
  let updateRequestId = 0;
  let downloadRequestId = 0;
  let changelogRequestId = 0;

  const updatePackage = computed(() => selectReleaseAsset(
    latestRelease.value || { htmlUrl: RELEASES_PAGE_URL, assets: [] },
    updatePlatform
  ));
  const hasNewRelease = computed(() => {
    const latest = releases.value[0];
    return !!latest && isVersionNewer(latest.version, appVersion);
  });
  const hasPendingInstall = computed(() =>
    !!downloadedUpdate.value
    && isVersionNewer(downloadedUpdate.value.version, appVersion)
  );
  const overlayOpen = computed(() => updateDialogOpen.value || changelogOpen.value);

  function restorePendingUpdate() {
    const pending = loadPendingUpdate();
    if (
      !pending
      || pending.platform !== updatePlatform
      || !isVersionNewer(pending.version, appVersion)
    ) {
      if (pending) clearPendingUpdate();
      return null;
    }
    return pending;
  }

  function fillDownloadState(pending) {
    downloadState.value = {
      ...emptyDownloadState(),
      ...pending,
      progress: 1,
      downloadedBytes: pending.size,
      totalBytes: pending.size
    };
  }

  function openDownloadedUpdate() {
    if (!downloadedUpdate.value) return;
    fillDownloadState(downloadedUpdate.value);
    updateDialogOpen.value = true;
    updateStatus.value = 'downloaded';
  }

  function syncPendingRelease(latest) {
    if (downloadedUpdate.value && downloadedUpdate.value.version !== latest?.version) {
      downloadedUpdate.value = null;
      clearPendingUpdate();
    }
  }

  async function checkForUpdates({ startup = false } = {}) {
    const requestId = ++updateRequestId;
    changelogOpen.value = false;
    downloadError.value = null;
    if (!startup) {
      updateDialogOpen.value = true;
      updateStatus.value = 'loading';
      updateError.value = null;
      latestRelease.value = null;
    }

    try {
      const result = await fetchStableReleases({ force: true });
      if (requestId !== updateRequestId) return false;
      releases.value = result;
      latestRelease.value = result[0] || null;
      syncPendingRelease(latestRelease.value);

      const available = !!latestRelease.value
        && isVersionNewer(latestRelease.value.version, appVersion);
      if (!available) {
        if (!startup) {
          updateStatus.value = 'latest';
          updateDialogOpen.value = true;
        }
        return false;
      }

      // 已经下载过同一版本时直接恢复到完成卡片，避免启动提示诱导重复下载。
      if (downloadedUpdate.value?.version === latestRelease.value.version) {
        openDownloadedUpdate();
      } else {
        updateStatus.value = 'available';
        updateDialogOpen.value = true;
      }
      return true;
    } catch (error) {
      if (requestId !== updateRequestId) return false;
      console.warn(startup ? '启动时检查更新失败' : '检查更新失败', error);
      if (startup) return false;
      updateError.value = error;
      updateStatus.value = 'error';
      updateDialogOpen.value = true;
      return false;
    }
  }

  function handlePrimaryUpdateAction() {
    if (hasPendingInstall.value) {
      openDownloadedUpdate();
      return;
    }
    checkForUpdates();
  }

  async function startUpdateDownload() {
    const release = latestRelease.value;
    const asset = updatePackage.value && updatePackage.value.asset;
    downloadError.value = null;
    if (!release || !asset) {
      try {
        await openGitHubUrl(updatePackage.value?.url || RELEASES_PAGE_URL);
      } catch (error) {
        downloadError.value = { message: '无法打开系统浏览器，请稍后再试。' };
        console.warn('打开更新下载页失败', error);
      }
      return;
    }

    if (!canDownloadUpdateInApp()) {
      try {
        await openGitHubUrl(asset.url);
      } catch (error) {
        downloadError.value = { message: '无法打开系统浏览器，请稍后再试。' };
        console.warn('打开更新下载页失败', error);
      }
      return;
    }

    const requestId = ++downloadRequestId;
    const downloadId = createDownloadId();
    activeDownloadId = downloadId;
    downloadedUpdate.value = null;
    clearPendingUpdate();
    downloadState.value = {
      ...emptyDownloadState(),
      fileName: asset.name,
      version: release.version
    };
    updateStatus.value = 'downloading';

    try {
      const result = await downloadUpdateAsset({
        downloadId,
        url: asset.url,
        fileName: asset.name,
        expectedSize: asset.size,
        onProgress(progress) {
          if (requestId !== downloadRequestId) return;
          downloadState.value = {
            ...downloadState.value,
            progress: Number(progress.fraction) || 0,
            downloadedBytes: Number(progress.downloadedBytes) || 0,
            totalBytes: Number(progress.totalBytes) || 0
          };
        }
      });
      if (requestId !== downloadRequestId) return;
      const pendingUpdate = {
        ...result,
        version: release.version,
        packageLabel: updatePackage.value.label,
        platform: updatePlatform
      };
      downloadedUpdate.value = pendingUpdate;
      savePendingUpdate(pendingUpdate);
      downloadState.value = {
        ...downloadState.value,
        ...result,
        progress: 1,
        totalBytes: result.size,
        downloadedBytes: result.size
      };
      updateStatus.value = 'downloaded';
    } catch (error) {
      if (requestId !== downloadRequestId) return;
      if (error?.code === 'CANCELLED') {
        updateStatus.value = 'available';
        return;
      }
      console.warn('下载更新失败', error);
      downloadError.value = error;
      updateStatus.value = 'download-error';
    } finally {
      if (activeDownloadId === downloadId) activeDownloadId = '';
    }
  }

  async function cancelCurrentDownload() {
    const downloadId = activeDownloadId;
    downloadRequestId += 1;
    activeDownloadId = '';
    downloadState.value = emptyDownloadState();
    downloadError.value = null;
    updateStatus.value = 'available';
    if (!downloadId) return;
    try {
      await cancelUpdateDownload(downloadId);
    } catch (error) {
      console.warn('取消更新下载失败', error);
    }
  }

  async function closeUpdateDialog() {
    downloadError.value = null;
    if (updateStatus.value === 'downloading') {
      await cancelCurrentDownload();
    }
    updateDialogOpen.value = false;
  }

  async function installDownloadedUpdate() {
    if (!downloadedUpdate.value) return;
    downloadError.value = null;
    try {
      await launchDownloadedUpdate(downloadedUpdate.value);
      updateDialogOpen.value = false;
    } catch (error) {
      console.warn('启动更新安装失败', error);
      downloadError.value = typeof error === 'string' ? { message: error } : error;
    }
  }

  async function loadChangelog(force = false) {
    const requestId = ++changelogRequestId;
    changelogStatus.value = 'loading';
    changelogError.value = null;

    try {
      const result = await fetchStableReleases({ force });
      if (requestId !== changelogRequestId) return;
      releases.value = result;
      changelogStatus.value = 'ready';
    } catch (error) {
      if (requestId !== changelogRequestId) return;
      console.warn('读取更新日志失败', error);
      changelogError.value = error;
      changelogStatus.value = 'error';
    }
  }

  function openChangelog() {
    updateDialogOpen.value = false;
    changelogOpen.value = true;
    if (releases.value.length > 0) {
      changelogStatus.value = 'ready';
      return;
    }
    loadChangelog();
  }

  function closeChangelog() {
    changelogOpen.value = false;
  }

  return {
    appVersion,
    updatePlatform,
    releases,
    latestRelease,
    updateDialogOpen,
    updateStatus,
    updateError,
    downloadError,
    changelogOpen,
    changelogStatus,
    changelogError,
    downloadedUpdate,
    downloadState,
    updatePackage,
    hasNewRelease,
    hasPendingInstall,
    overlayOpen,
    checkForUpdates,
    handlePrimaryUpdateAction,
    startUpdateDownload,
    cancelCurrentDownload,
    closeUpdateDialog,
    installDownloadedUpdate,
    loadChangelog,
    openChangelog,
    closeChangelog
  };
});
