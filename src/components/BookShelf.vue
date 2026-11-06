<template>
  <Transition name="shelf-header" :css="isAndroid">
    <div v-if="showShelfHeaderRow" class="min-h-11 px-4 min-[900px]:px-7 pt-3 flex items-center gap-2">
      <span class="shrink-0 text-[11px] font-medium text-[var(--md-on-surface-variant)]">{{ favoritesOnly ? `已收藏 · ${displayBooks.length} 本作品` : '我的书架' }}</span>
      <Transition name="continue-pill" :css="isAndroid">
        <button
          v-if="showContinueReading && continueCollapsed"
          type="button"
          class="continue-pill min-w-0 flex-1"
          aria-label="展开上次阅读"
          aria-expanded="false"
          data-no-scroll-bounce
          @click="setContinueCollapsed(false)"
        >
          <span><MdIcon name="expand_more" :size="16" /></span>
        </button>
      </Transition>
      <button type="button" class="md-library-text-button ml-auto" :disabled="!displayBooks.length && !displayCollections.length" @click="toggleSelection">选择</button>
    </div>
  </Transition>
  <div v-if="currentCollection" class="relative mx-4 min-[900px]:mx-7 mt-2 flex items-center gap-2">
    <button
      class="shelf-back-button w-11 h-11 shrink-0 rounded-full grid place-items-center bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] transition-colors duration-200"
      :class="{ 'is-drop-target': touchDrag.home }"
      data-shelf-home
      title="返回书架"
      aria-label="返回书架"
      @click="shelf.activeCollectionId = null"
      @dragover="onRootDragOver"
      @drop="onRootDrop"
    >
      <MdIcon name="chevron_left" class="w-5 h-5" />
    </button>
    <div class="relative flex-1 min-w-0 h-11">
      <Transition name="shelf-select" :css="isAndroid">
        <button v-if="!selecting" key="select" type="button" class="absolute right-0 top-0 md-library-text-button" :disabled="!displayBooks.length" @click="toggleSelection">选择</button>
        <ShelfBatchBar
          v-else
          key="batch"
          class="absolute inset-0"
          :label="selectionLabel"
          :compact-label="compactSelectionLabel"
          :all-selected="allSelected"
          move-label="移出书库"
          :move-disabled="!selectedIds.length || busy"
          :delete-label="favoritesOnly ? '取消收藏' : '删除'"
          :delete-disabled="(!selectedIds.length && !selectedCollectionIds.length) || busy"
          :danger-delete="!favoritesOnly"
          @select-all="selectAll"
          @move="moveSelected(null)"
          @delete="deleteSelected"
          @cancel="toggleSelection"
        />
      </Transition>
    </div>
  </div>
  <Transition v-else name="shelf-batch" :css="isAndroid">
    <div v-if="selecting" class="mx-4 min-[900px]:mx-7 mt-2">
      <ShelfBatchBar
        :label="selectionLabel"
        :compact-label="compactSelectionLabel"
        :all-selected="allSelected"
        :move-label="'移入书库'"
        :move-disabled="!selectedIds.length || !!selectedCollectionIds.length || busy"
        :delete-label="favoritesOnly ? '取消收藏' : '删除'"
        :delete-disabled="(!selectedIds.length && !selectedCollectionIds.length) || busy"
        :danger-delete="!favoritesOnly"
        @select-all="selectAll"
        @move="chooseDestination"
        @delete="deleteSelected"
        @cancel="toggleSelection"
      />
    </div>
  </Transition>
  <section class="md-shelf-grid" :aria-label="favoritesOnly ? '收藏内容' : currentCollection ? `书库：${currentCollection.title}` : '书架内容'">
    <Transition name="continue-panel" :css="isAndroid && !currentCollection">
      <div v-if="showContinueReading && (currentCollection || !continueCollapsed)" class="md-featured-cell continue-panel">
        <div class="continue-panel-inner">
          <ContinueReading :book="lastReadBook" :record="shelf.progressMap[lastReadBook.id]" @open="$emit('open', $event)" />
          <button
            v-if="!currentCollection"
            type="button"
            class="continue-collapse"
            aria-label="收起上次阅读"
            aria-expanded="true"
            data-no-scroll-bounce
            @click="setContinueCollapsed(true)"
          >
            <MdIcon name="expand_more" :size="17" class="rotate-180" />
          </button>
        </div>
      </div>
    </Transition>
    <CollectionCard v-for="collection in displayCollections" :key="collection.id" :collection="collection" :books="booksForCollection(collection)" :sort-key="sortKey" :touch-over="touchDrag.overId === collection.id" :selecting="selecting" :selected="selectedCollectionIds.includes(collection.id)" :import-status="shelf.importingCollections[collection.id]" @open="openCollection" @toggle="toggleCollection" @move="moveDropped" />
    <BookCard v-for="book in orderedBooks" :key="book.id" :book="book" :progress="shelf.progressInfoFor(book.id)" :selecting="selecting" :selected="selectedIds.includes(book.id)" :dragging="touchDrag.active && touchDrag.ids.includes(book.id)" :remove-label="favoritesOnly ? '取消收藏' : '从书架移除'" :import-ratio="importingBookId === book.id ? shelf.importingBook.ratio : null" @open="openBook" @remove="removeBook" @drag="onBookDrag" @touchstart="importingBookId !== book.id && onBookTouchStart($event, book.id)" />
    <p v-if="!displayBooks.length && !displayCollections.length" class="col-span-full py-16 text-center text-[13px] text-[var(--md-on-surface-variant)]">{{ emptyShelfHint }}</p>
  </section>

  <Teleport to="body">
    <div v-if="touchDrag.active" class="md-touch-drag-ghost" :style="touchGhostStyle" aria-hidden="true">
      <span class="md-touch-drag-cover">
        <img v-if="touchDrag.cover" :src="touchDrag.cover" alt="" draggable="false" />
        <span v-else class="md-touch-drag-mark">H</span>
        <b v-if="touchDrag.count > 1" class="md-touch-drag-count">{{ touchDrag.count }}</b>
      </span>
      <span class="md-touch-drag-copy">
        <b>{{ touchDrag.count > 1 ? `${touchDrag.count} 本作品` : touchDrag.title }}</b>
        <small>{{ touchDragHint }}</small>
      </span>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useShelfStore } from '../stores/shelf.js';
import { useShelfDialogs } from '../composables/useShelfDialogs.js';
import { useViewport } from '../composables/useViewport.js';
import { compareBookTitles, normalizeBookTitle } from '../services/bookTitles.js';
import { groupShelfBooks } from '../services/shelfSections.js';
import { isAndroid } from '../services/platform.js';
import BookCard from './BookCard.vue';
import ContinueReading from './ContinueReading.vue';
import CollectionCard from './CollectionCard.vue';
import MdIcon from './MdIcon.vue';
import ShelfBatchBar from './ShelfBatchBar.vue';

const props = defineProps({ books: { type: Array, default: () => [] }, sortKey: { type: String, default: 'title' }, query: { type: String, default: '' }, hasFilter: { type: Boolean, default: false }, homeRequest: { type: Number, default: 0 }, favoritesOnly: { type: Boolean, default: false } });
const emit = defineEmits(['open', 'browse']);
const shelf = useShelfStore();
const { askShelfDialog } = useShelfDialogs();
const { isTouch } = useViewport();
const selecting = ref(false);
const continueCollapsed = ref(localStorage.getItem('homura_continue_collapsed') === '1');
const selectedIds = ref([]);
const selectedCollectionIds = ref([]);
const busy = ref(false);
const EMPTY_BOOKS = [];
const currentCollection = computed(() => props.favoritesOnly ? null : shelf.collections.find(item => item.id === shelf.activeCollectionId) || null);
const showShelfHeaderRow = computed(() => !currentCollection.value && !selecting.value);
const groupedIds = computed(() => new Set(shelf.collections.flatMap(item => item.bookIds)));
const importingBookId = computed(() => shelf.importingBook?.book.id);
const memberIds = computed(() => currentCollection.value ? new Set(currentCollection.value.bookIds) : null);
const displayBooks = computed(() => props.books.filter(book => props.favoritesOnly ? book.favorite : memberIds.value ? memberIds.value.has(book.id) : !groupedIds.value.has(book.id)));
const lastReadBook = computed(() => {
  if (props.favoritesOnly || selecting.value) return null;
  const ids = memberIds.value;
  const records = shelf.progressMap;
  let lastRead = null;
  let latest = 0;
  for (const book of shelf.library) {
    if ((ids && !ids.has(book.id)) || book.id === importingBookId.value) continue;
    const time = records[book.id]?.updatedAt || 0;
    if (time > latest) {
      latest = time;
      lastRead = book;
    }
  }
  return lastRead;
});
const showContinueReading = computed(() => !!lastReadBook.value);

function setContinueCollapsed(collapsed) {
  continueCollapsed.value = collapsed;
  localStorage.setItem('homura_continue_collapsed', collapsed ? '1' : '0');
}
const orderedBooks = computed(() => currentCollection.value ? displayBooks.value : groupShelfBooks(displayBooks.value).flatMap(section => section.books));
const selectableBooks = computed(() => displayBooks.value.filter(book => book.id !== importingBookId.value));
const selectableCollections = computed(() => displayCollections.value.filter(item => !shelf.importingCollections[item.id]));
const allSelected = computed(() => {
  const total = selectableBooks.value.length + selectableCollections.value.length;
  return total > 0 &&
    selectableBooks.value.every(book => selectedIds.value.includes(book.id)) &&
    selectableCollections.value.every(collection => selectedCollectionIds.value.includes(collection.id));
});
const selectionLabel = computed(() => {
  const bookCount = selectedIds.value.length;
  const collectionCount = selectedCollectionIds.value.length;
  if (collectionCount) return `已选 ${bookCount + collectionCount} 项`;
  return `已选 ${bookCount} 本`;
});
const compactSelectionLabel = computed(() => currentCollection.value ? `${selectedIds.value.length} 本` : selectionLabel.value);
const emptyShelfHint = computed(() => {
  if (props.hasFilter) return '没有符合条件的作品，换个关键词或筛选试试';
  if (props.favoritesOnly) return '还没有收藏的书，在阅读器中点亮星星即可收藏';
  if (currentCollection.value) return isTouch.value ? '书库还是空的，长按主页书本拖入，或多选后移入书库' : '书库还是空的，可从主页拖入书本，或多选后移入书库';
  return '书库还是空的，可从主页拖入书本，或多选后移入书库';
});

const TOUCH_DRAG_DELAY = 420;
const TOUCH_DRAG_CANCEL_DISTANCE = 10;
const AUTO_SCROLL_EDGE = 88;
const AUTO_SCROLL_MAX_SPEED = 14;
const touchDrag = reactive({
  active: false,
  x: 0,
  y: 0,
  ids: [],
  title: '',
  cover: '',
  count: 0,
  overId: null,
  home: false
});
let touchTimer = null;
let touchContext = null;
let autoScrollFrame = 0;
let autoScrollVelocity = 0;
let autoScrollEl = null;
let swallowClick = false;
let swallowClickTimer = null;

const canTouchMoveBooks = computed(() => !props.favoritesOnly && (displayCollections.value.length > 0 || !!currentCollection.value));
const touchGhostStyle = computed(() => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 390;
  const left = Math.min(Math.max(12, touchDrag.x - 34), Math.max(12, viewportWidth - 232));
  return { transform: `translate3d(${left}px, ${Math.max(18, touchDrag.y - 108)}px, 0)` };
});
const touchDragHint = computed(() => {
  if (touchDrag.overId) {
    const collection = shelf.collections.find(item => item.id === touchDrag.overId);
    return collection ? `松手移入「${collection.title}」` : '松手移入书库';
  }
  if (touchDrag.home) return '松手移回主页';
  return '拖到书库上松手';
});

const displayCollections = computed(() => {
  if (props.favoritesOnly || currentCollection.value) return [];
  const visible = new Set(props.books.map(book => book.id));
  const keyword = normalizeBookTitle(props.query);
  const collections = new Map(shelf.collections.map(item => [item.id, item]));
  for (const { collection } of Object.values(shelf.importingCollections)) {
    if (!collections.has(collection.id)) collections.set(collection.id, collection);
  }
  const list = [...collections.values()].filter(item => !props.hasFilter || (keyword && normalizeBookTitle(item.title).includes(keyword)) || item.bookIds.some(id => visible.has(id)));
  const latest = item => Math.max(0, ...item.bookIds.map(id => shelf.progressMap[id]?.updatedAt || 0));
  return [...list].sort((a, b) => (props.sortKey === 'recent' ? b.createdAt - a.createdAt : props.sortKey === 'progress' ? latest(b) - latest(a) : 0) || compareBookTitles(a, b));
});

const collectionBooks = computed(() => {
  const booksById = new Map(shelf.library.map(book => [book.id, book]));
  return new Map(shelf.collections.map(collection => [
    collection.id,
    collection.bookIds.map(id => booksById.get(id)).filter(Boolean)
  ]));
});

function booksForCollection(collection) {
  return collectionBooks.value.get(collection.id) || EMPTY_BOOKS;
}

function openCollection(id) { shelf.activeCollectionId = id; emit('browse'); }
function clearSelection() { selectedIds.value = []; selectedCollectionIds.value = []; }
function toggleSelection() { selecting.value = !selecting.value; clearSelection(); }
function toggleCollection(id) {
  selectedCollectionIds.value = selectedCollectionIds.value.includes(id)
    ? selectedCollectionIds.value.filter(item => item !== id)
    : [...selectedCollectionIds.value, id];
}
function selectAll() {
  if (allSelected.value) {
    clearSelection();
    return;
  }
  selectedIds.value = selectableBooks.value.map(book => book.id);
  selectedCollectionIds.value = selectableCollections.value.map(collection => collection.id);
}
async function removeBook(id) {
  if (!props.favoritesOnly) {
    try {
      await shelf.removeBook(id);
    } catch (err) {
      shelf.error = err.message || '移除书本失败，请重试';
      console.warn('[HOMURA] 移除书本失败', err);
    }
    return;
  }
  try {
    await shelf.setFavorite(id, false);
  } catch (err) {
    shelf.error = err.message || '取消收藏失败，请重试';
    console.warn('[HOMURA] 取消收藏失败', err);
  }
}
function openBook(id) {
  if (!selecting.value) return emit('open', id);
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(item => item !== id) : [...selectedIds.value, id];
}

async function perform(action) {
  if (busy.value) return;
  busy.value = true;
  try { await action(); } catch (err) { console.warn('[HOMURA] 书库操作失败', err); } finally { busy.value = false; }
}

async function chooseDestination() {
  const options = shelf.collections.filter(item => item.id !== shelf.activeCollectionId).sort(compareBookTitles).map(item => ({ value: item.id, title: item.title }));
  const target = await askShelfDialog({ kind: 'move', title: '移入书库', message: `将选中的 ${selectedIds.value.length} 本书移动到：`, options });
  if (target !== null) await moveSelected(target);
}

async function deleteSelected() {
  const bookCount = selectedIds.value.length;
  const collectionCount = selectedCollectionIds.value.length;
  if ((!bookCount && !collectionCount) || busy.value) return;
  const removingFavorites = props.favoritesOnly;
  const changes = [];
  if (bookCount) changes.push(`删除选中的 ${bookCount} 本作品、原始文件与阅读记录`);
  if (collectionCount) changes.push(`删除选中的 ${collectionCount} 个书库（书库内作品会移回主页）`);
  const confirmed = await askShelfDialog({
    kind: 'confirm',
    title: removingFavorites
      ? '取消收藏'
      : collectionCount && !bookCount
        ? '删除书库'
        : bookCount && !collectionCount
          ? '删除书本'
          : '删除所选内容',
    message: removingFavorites
      ? `将取消收藏选中的 ${bookCount} 本作品，不会删除原始文件。`
      : `将${changes.join('；')}。此操作无法撤销。`,
    confirmLabel: removingFavorites ? '取消收藏' : '确认删除'
  });
  if (!confirmed) return;

  const bookIds = [...selectedIds.value];
  const collectionIds = selectedCollectionIds.value.filter(id => !shelf.importingCollections[id]);
  await perform(async () => {
    const failedBooks = [];
    const failedCollections = [];
    for (const id of bookIds) {
      try {
        if (removingFavorites) await shelf.setFavorite(id, false);
        else await shelf.removeBook(id);
      } catch (err) {
        failedBooks.push(id);
      }
    }
    for (const id of collectionIds) {
      try {
        await shelf.deleteCollection(id);
      } catch (err) {
        failedCollections.push(id);
      }
    }
    if (failedBooks.length || failedCollections.length) {
      selectedIds.value = failedBooks;
      selectedCollectionIds.value = failedCollections;
      shelf.error = removingFavorites ? '部分作品取消收藏失败，请重试' : '部分内容删除失败，请重试';
      return;
    }
    clearSelection();
    selecting.value = false;
  });
}

async function moveSelected(target) {
  await perform(async () => { await shelf.moveBooks(selectedIds.value, target); clearSelection(); selecting.value = false; });
}

function onBookDrag(event, id) {
  const ids = selectedIds.value.includes(id) ? selectedIds.value : [id];
  event.dataTransfer.setData('application/x-homura-books', JSON.stringify(ids));
  event.dataTransfer.effectAllowed = 'move';
}

async function moveDropped(ids, target) {
  await perform(async () => { await shelf.moveBooks(ids, target); selectedIds.value = []; selecting.value = false; });
}

function onBookTouchStart(event, id) {
  if (!canTouchMoveBooks.value || touchDrag.active || event.touches.length !== 1) return;
  if (event.target && event.target.closest('.card-remove-btn')) return;

  cancelTouchCandidate();
  const touch = event.touches[0];
  touchContext = {
    id,
    startX: touch.clientX,
    startY: touch.clientY,
    x: touch.clientX,
    y: touch.clientY,
    scrollEl: findScrollParent(event.currentTarget)
  };
  window.addEventListener('touchmove', onBookTouchMove, { passive: false });
  window.addEventListener('touchend', onBookTouchEnd, { passive: false });
  window.addEventListener('touchcancel', onBookTouchCancel, { passive: false });
  touchTimer = window.setTimeout(beginTouchDrag, TOUCH_DRAG_DELAY);
}

function beginTouchDrag() {
  touchTimer = null;
  if (!touchContext || touchDrag.active) return;
  const ids = selectedIds.value.includes(touchContext.id) ? [...selectedIds.value] : [touchContext.id];
  const book = shelf.library.find(item => item.id === touchContext.id);
  autoScrollEl = touchContext.scrollEl;
  touchDrag.active = true;
  touchDrag.x = touchContext.x;
  touchDrag.y = touchContext.y;
  touchDrag.ids = ids;
  touchDrag.title = book?.title || '';
  touchDrag.cover = book?.cover || '';
  touchDrag.count = ids.length;
  document.body.classList.add('md-touch-dragging');
  try { navigator.vibrate?.(12); } catch (err) {}
  updateTouchDropTarget();
  updateAutoScroll();
}

function onBookTouchMove(event) {
  if (!touchContext) return;
  if (event.touches.length !== 1) {
    if (touchDrag.active) finishTouchDrag(false);
    else cancelTouchCandidate();
    return;
  }
  const touch = event.touches[0];
  if (!touch) return;
  touchContext.x = touch.clientX;
  touchContext.y = touch.clientY;

  if (!touchDrag.active) {
    const distance = Math.hypot(touch.clientX - touchContext.startX, touch.clientY - touchContext.startY);
    if (distance > TOUCH_DRAG_CANCEL_DISTANCE) cancelTouchCandidate();
    return;
  }

  event.preventDefault();
  touchDrag.x = touch.clientX;
  touchDrag.y = touch.clientY;
  updateTouchDropTarget();
  updateAutoScroll();
}

function onBookTouchEnd(event) {
  if (!touchContext) return;
  if (touchDrag.active) {
    event.preventDefault();
    finishTouchDrag(true);
    return;
  }
  cancelTouchCandidate();
}

function onBookTouchCancel(event) {
  if (!touchContext) return;
  event.preventDefault();
  finishTouchDrag(false);
}

function finishTouchDrag(commit) {
  const wasActive = touchDrag.active;
  const ids = [...touchDrag.ids];
  const targetId = touchDrag.overId;
  const moveHome = touchDrag.home;
  if (wasActive) armClickGuard();
  resetTouchDrag();
  if (!commit || !wasActive) return;
  if (targetId) moveDropped(ids, targetId);
  else if (moveHome) moveDropped(ids, null);
}

function cancelTouchCandidate() {
  if (touchTimer !== null) {
    window.clearTimeout(touchTimer);
    touchTimer = null;
  }
  window.removeEventListener('touchmove', onBookTouchMove);
  window.removeEventListener('touchend', onBookTouchEnd);
  window.removeEventListener('touchcancel', onBookTouchCancel);
  touchContext = null;
}

function resetTouchDrag() {
  cancelTouchCandidate();
  stopAutoScroll();
  touchDrag.active = false;
  touchDrag.ids = [];
  touchDrag.title = '';
  touchDrag.cover = '';
  touchDrag.count = 0;
  touchDrag.overId = null;
  touchDrag.home = false;
  autoScrollEl = null;
  document.body.classList.remove('md-touch-dragging');
}

function updateTouchDropTarget() {
  const element = document.elementFromPoint(touchDrag.x, touchDrag.y);
  const collection = element?.closest('[data-collection-id]');
  const home = element?.closest('[data-shelf-home]');
  touchDrag.overId = collection?.getAttribute('data-collection-id') || null;
  touchDrag.home = !collection && !!home;
}

function findScrollParent(element) {
  let current = element?.parentElement || null;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY)) return current;
    current = current.parentElement;
  }
  return document.scrollingElement;
}

function updateAutoScroll() {
  if (!autoScrollEl) {
    autoScrollVelocity = 0;
    return;
  }
  const rect = autoScrollEl.getBoundingClientRect();
  if (!rect.height) return;
  const edge = Math.min(AUTO_SCROLL_EDGE, rect.height * 0.24);
  let velocity = 0;
  if (touchDrag.y < rect.top + edge) {
    velocity = -Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, (rect.top + edge - touchDrag.y) / edge));
  } else if (touchDrag.y > rect.bottom - edge) {
    velocity = Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, (touchDrag.y - (rect.bottom - edge)) / edge));
  }
  autoScrollVelocity = velocity;
  if (velocity && !autoScrollFrame) autoScrollFrame = window.requestAnimationFrame(tickAutoScroll);
}

function tickAutoScroll() {
  autoScrollFrame = 0;
  if (!touchDrag.active || !autoScrollEl || !autoScrollVelocity) return;
  const maxTop = Math.max(0, autoScrollEl.scrollHeight - autoScrollEl.clientHeight);
  const nextTop = Math.max(0, Math.min(maxTop, autoScrollEl.scrollTop + autoScrollVelocity));
  if (nextTop === autoScrollEl.scrollTop) {
    autoScrollVelocity = 0;
    return;
  }
  autoScrollEl.scrollTop = nextTop;
  updateTouchDropTarget();
  autoScrollFrame = window.requestAnimationFrame(tickAutoScroll);
}

function stopAutoScroll() {
  if (autoScrollFrame) window.cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = 0;
  autoScrollVelocity = 0;
}

function armClickGuard() {
  swallowClick = true;
  if (swallowClickTimer !== null) window.clearTimeout(swallowClickTimer);
  swallowClickTimer = window.setTimeout(() => {
    swallowClick = false;
    swallowClickTimer = null;
  }, 500);
}

function onDocumentClick(event) {
  if (!swallowClick) return;
  swallowClick = false;
  if (swallowClickTimer !== null) {
    window.clearTimeout(swallowClickTimer);
    swallowClickTimer = null;
  }
  event.preventDefault();
  event.stopPropagation();
}

function onRootDragOver(event) {
  if (Array.from(event.dataTransfer?.types || []).includes('application/x-homura-books')) event.preventDefault();
}

function onRootDrop(event) {
  if (!Array.from(event.dataTransfer?.types || []).includes('application/x-homura-books')) return;
  event.preventDefault();
  event.stopPropagation();
  try { const ids = JSON.parse(event.dataTransfer.getData('application/x-homura-books')); if (Array.isArray(ids)) moveDropped(ids.filter(id => typeof id === 'string'), null); } catch (err) { console.warn('[HOMURA] 拖动书本失败', err); }
}

watch([() => shelf.activeCollectionId, () => props.homeRequest, () => props.favoritesOnly], () => {
  selecting.value = false;
  clearSelection();
});
watch(displayBooks, list => { const ids = new Set(list.map(book => book.id)); selectedIds.value = selectedIds.value.filter(id => ids.has(id)); });

onMounted(() => document.addEventListener('click', onDocumentClick, true));
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true);
  if (swallowClickTimer !== null) window.clearTimeout(swallowClickTimer);
  resetTouchDrag();
});
</script>

<style scoped>
.continue-panel {
  display: grid;
  grid-template-rows: 1fr;
  min-width: 0;
  align-self: stretch;
}
.continue-panel-inner {
  position: relative;
  overflow: hidden;
  min-height: 0;
}
@media (min-width: 768px) {
  .continue-panel { container-type: inline-size; }
}
.continue-collapse {
  position: absolute;
  inset: 2px 2px auto auto;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--md-on-primary-container);
  border-radius: 50%;
}
.continue-collapse:hover {
  background: color-mix(in oklab, var(--md-on-primary-container) 9%, transparent);
}
.continue-pill {
  height: 44px;
  display: grid;
  align-items: center;
}
.continue-pill > span {
  height: 23px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}
.continue-panel-enter-active,
.continue-panel-leave-active {
  transition: grid-template-rows 280ms var(--md-ease-emphasized), opacity 200ms ease;
}
.continue-panel-enter-from,
.continue-panel-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}
.continue-panel-leave-active {
  pointer-events: none;
}
@media (max-width: 767px) {
  /* 把整行特色卡的间距放进动画轨道，移除卡片时网格不用再补一次位移。 */
  .md-shelf-grid {
    row-gap: 0;
  }
  .md-shelf-grid > :is(.md-shelf-card, .md-collection-card) {
    margin-bottom: var(--md-space-150);
  }
  .continue-panel {
    grid-template-rows: 1fr var(--md-space-150);
  }
  .continue-panel-enter-from,
  .continue-panel-leave-to {
    grid-template-rows: 0fr 0px;
  }
}
.continue-pill-enter-active,
.continue-pill-leave-active {
  transition: opacity 200ms ease, transform 240ms var(--md-ease-emphasized);
}
.continue-pill-enter-from,
.continue-pill-leave-to {
  opacity: 0;
  transform: scaleX(.94);
}
.shelf-header-enter-active,
.shelf-header-leave-active,
.shelf-batch-enter-active,
.shelf-batch-leave-active {
  transition:
    opacity 200ms cubic-bezier(0.2, 0, 0, 1),
    transform 200ms cubic-bezier(0.2, 0, 0, 1);
}
.shelf-header-enter-from,
.shelf-header-leave-to,
.shelf-batch-enter-from,
.shelf-batch-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
.shelf-select-enter-active,
.shelf-select-leave-active {
  transition: opacity 200ms cubic-bezier(0.2, 0, 0, 1);
}
.shelf-select-enter-from,
.shelf-select-leave-to {
  opacity: 0;
}
.shelf-select-leave-active {
  pointer-events: none;
}
.shelf-header-leave-active,
.shelf-batch-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  pointer-events: none;
}
.shelf-back-button:hover {
  background: color-mix(in oklab, var(--md-secondary-container) 92%, var(--md-on-secondary-container));
}
.shelf-back-button.is-drop-target {
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}
@media (prefers-reduced-motion: reduce) {
  .continue-panel-enter-active,
  .continue-panel-leave-active,
  .continue-pill-enter-active,
  .continue-pill-leave-active {
    transition: none;
  }
  .shelf-header-enter-active,
  .shelf-header-leave-active,
  .shelf-select-enter-active,
  .shelf-select-leave-active,
  .shelf-batch-enter-active,
  .shelf-batch-leave-active {
    transition: none;
  }
  .shelf-header-enter-from,
  .shelf-header-leave-to,
  .shelf-select-enter-from,
  .shelf-select-leave-to,
  .shelf-batch-enter-from,
  .shelf-batch-leave-to {
    transform: none;
  }
}
</style>
