/* ============================================================================
   HOMURA · GitHub Releases
   ----------------------------------------------------------------------------
   更新检查只读取公开的稳定版Release。网络请求与Markdown清洗留在本模块，
   组件只消费结构化版本、说明和当前平台安装包，避免把不可信发布内容交给
   v-html或被误当作外链。
   ========================================================================== */

import { isAndroid } from './platform.js';

export const REPOSITORY_URL = 'https://github.com/ningnanzhenshit-coder/HOMURA-reader';
export const RELEASES_PAGE_URL = `${REPOSITORY_URL}/releases`;

const RELEASES_API_URL = 'https://api.github.com/repos/ningnanzhenshit-coder/HOMURA-reader/releases?per_page=10';
const REQUEST_TIMEOUT = 12000;
const CACHE_TTL = 5 * 60 * 1000;

let cachedReleases = [];
let cachedAt = 0;
let pendingRequest = null;

const GROUP_LABELS = [
  [/新功能|新增|features?/i, '新增'],
  [/问题修复|修复|bug|fixes?/i, '修复'],
  [/改进|优化|improve/i, '改进'],
  [/重构|refactor/i, '重构'],
  [/文档|docs?/i, '文档'],
  [/构建|ci|build/i, '构建'],
  [/其他|chore|other/i, '其他']
];

function cleanInlineMarkdown(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanListItem(value) {
  return cleanInlineMarkdown(value)
    .replace(/\s*[（(]\s*[0-9a-f]{7,40}\s*[）)]\s*$/i, '')
    .trim();
}

function cleanHeading(value) {
  return cleanInlineMarkdown(value)
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

function normalizeGroupTitle(value) {
  const title = cleanHeading(value);
  const match = GROUP_LABELS.find(([pattern]) => pattern.test(title));
  return match ? match[1] : title || '更新';
}

export function parseReleaseNotes(body) {
  const markdown = String(body || '').replace(/\r\n?/g, '\n');
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => /^##\s+.*更新日志/.test(line));

  if (start < 0) {
    return { intro: '', groups: [], itemCount: 0 };
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const groups = [];
  const introLines = [];
  let currentGroup = null;

  for (const rawLine of lines.slice(start + 1, end)) {
    const line = rawLine.trim();
    if (!line || /^---+$/.test(line)) continue;

    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      currentGroup = {
        title: normalizeGroupTitle(heading[1]),
        items: []
      };
      const existing = groups.find(group => group.title === currentGroup.title);
      if (existing) currentGroup = existing;
      else groups.push(currentGroup);
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      const item = cleanListItem(bullet[1]);
      if (!item) continue;
      if (currentGroup) {
        currentGroup.items.push(item);
      } else {
        let fallback = groups.find(group => group.title === '更新');
        if (!fallback) {
          fallback = { title: '更新', items: [] };
          groups.push(fallback);
        }
        fallback.items.push(item);
      }
      continue;
    }

    if (!currentGroup && !/完整对比/.test(line)) {
      const text = cleanListItem(line);
      if (text) introLines.push(text);
    }
  }

  const visibleGroups = groups.filter(group => group.items.length > 0);
  const itemCount = visibleGroups.reduce((total, group) => total + group.items.length, 0);
  return {
    intro: cleanInlineMarkdown(introLines.join(' ')),
    groups: visibleGroups,
    itemCount
  };
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] || ''
  };
}

export function normalizeVersion(value) {
  const parsed = parseVersion(value);
  if (!parsed) return String(value || '').trim().replace(/^v/i, '');
  return parsed.core.join('.') + (parsed.prerelease ? `-${parsed.prerelease}` : '');
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;

  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }

  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, 'en', { numeric: true });
}

export function isVersionNewer(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

export function formatReleaseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期未知';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isAllowedReleaseUrl(value) {
  try {
    const url = new URL(value);
    const repositoryPath = '/ningnanzhenshit-coder/HOMURA-reader';
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && (url.pathname === repositoryPath || url.pathname.startsWith(`${repositoryPath}/`));
  } catch (error) {
    return false;
  }
}

function normalizeAsset(asset) {
  const name = String(asset && asset.name || '').trim();
  const url = asset && asset.browser_download_url;
  if (!name || !isAllowedReleaseUrl(url)) return null;
  return {
    name,
    url,
    size: Number(asset.size) || 0,
    downloadCount: Number(asset.download_count) || 0
  };
}

export function normalizeReleases(payload) {
  if (!Array.isArray(payload)) throw new Error('GitHub 返回了无法识别的发布数据。');

  const seen = new Set();
  return payload
    .filter(release => release && !release.draft && !release.prerelease)
    .map(release => {
      const version = normalizeVersion(release.tag_name);
      if (!parseVersion(version) || seen.has(version)) return null;
      seen.add(version);
      return {
        id: release.id,
        version,
        tag: release.tag_name || `v${version}`,
        title: cleanInlineMarkdown(release.name) || `HOMURA v${version}`,
        publishedAt: release.published_at || release.created_at || '',
        dateLabel: formatReleaseDate(release.published_at || release.created_at),
        htmlUrl: isAllowedReleaseUrl(release.html_url) ? release.html_url : RELEASES_PAGE_URL,
        notes: parseReleaseNotes(release.body),
        assets: (release.assets || []).map(normalizeAsset).filter(Boolean)
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version));
}

export function detectUpdatePlatform() {
  if (isAndroid) return 'android';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const platform = typeof navigator !== 'undefined'
    ? navigator.userAgentData?.platform || navigator.platform || ''
    : '';
  const descriptor = `${platform} ${userAgent}`;

  if (/Win/i.test(descriptor)) return 'windows';
  if (/Mac|iPhone|iPad|iPod/i.test(descriptor)) return 'macos';
  if (/Linux|X11/i.test(descriptor)) return 'linux';
  return 'unknown';
}

function assetScore(asset, platform) {
  const name = asset.name.toLowerCase();
  if (platform === 'android' && /\.apk$/.test(name)) {
    return /arm64/.test(name) ? 30 : 20;
  }
  if (platform === 'macos' && /\.dmg$/.test(name)) return 30;
  if (platform === 'windows') {
    if (/\.exe$/.test(name)) return /setup/.test(name) ? 32 : 30;
    if (/\.msi$/.test(name)) return 24;
  }
  if (platform === 'linux') {
    if (/\.deb$/.test(name)) return 32;
    if (/\.rpm$/.test(name)) return 30;
    if (/\.appimage$/.test(name)) return 24;
  }
  return 0;
}

function platformPackageCopy(asset, platform) {
  if (platform === 'android') {
    return {
      label: 'Android · arm64 APK',
      note: '适用于当前 Android 设备'
    };
  }
  if (platform === 'macos') {
    return {
      label: 'macOS · Universal DMG',
      note: 'Apple Silicon 与 Intel 通用'
    };
  }
  if (platform === 'windows') {
    const label = /\.msi$/i.test(asset.name) ? 'Windows · MSI 安装包' : 'Windows · NSIS 安装包';
    return { label, note: asset.name };
  }
  if (platform === 'linux') {
    if (/\.deb$/i.test(asset.name)) return { label: 'Linux · DEB 安装包', note: 'Debian / Ubuntu 等发行版' };
    if (/\.rpm$/i.test(asset.name)) return { label: 'Linux · RPM 安装包', note: 'Fedora / openSUSE 等发行版' };
    return { label: 'Linux · AppImage', note: '无需安装，直接运行' };
  }
  return { label: 'GitHub Releases', note: '选择适合当前系统的安装包' };
}

export function selectReleaseAsset(release, platform = detectUpdatePlatform()) {
  const assets = release && Array.isArray(release.assets) ? release.assets : [];
  const selected = assets
    .map(asset => ({ asset, score: assetScore(asset, platform) }))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.asset;

  if (!selected) {
    return {
      platform,
      label: 'GitHub Releases',
      note: '选择适合当前系统的安装包',
      url: release && release.htmlUrl || RELEASES_PAGE_URL,
      asset: null
    };
  }

  return {
    platform,
    ...platformPackageCopy(selected, platform),
    url: selected.url,
    asset: selected
  };
}

function updateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function getUpdateErrorMessage(error) {
  if (error && error.name === 'AbortError') return '连接 GitHub 超时，请检查网络后重试。';
  if (error && error.code === 'RATE_LIMIT') return 'GitHub 暂时限制了更新查询，请稍后再试。';
  if (error && error.code === 'NO_RELEASES') return '目前没有可用的稳定版本记录。';
  if (error && error.code === 'HTTP_ERROR') return error.message;
  return '无法连接 GitHub，请检查网络后重试。';
}

async function requestReleases() {
  if (typeof fetch !== 'function') throw updateError('NETWORK', '当前环境不支持网络请求。');

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (response.status === 403) throw updateError('RATE_LIMIT', 'GitHub API rate limit reached');
    if (!response.ok) throw updateError('HTTP_ERROR', `GitHub 返回了 ${response.status}。`);

    const releases = normalizeReleases(await response.json());
    if (releases.length === 0) throw updateError('NO_RELEASES', 'No stable releases');
    return releases;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function fetchStableReleases({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedReleases.length > 0 && now - cachedAt < CACHE_TTL) {
    return cachedReleases;
  }
  if (pendingRequest) return pendingRequest;

  pendingRequest = requestReleases()
    .then(releases => {
      cachedReleases = releases;
      cachedAt = Date.now();
      return releases;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}
