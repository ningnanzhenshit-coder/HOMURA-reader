<template>
  <div class="px-4 min-[900px]:px-7 pt-3 flex flex-wrap items-center gap-1">
    <template v-if="currentCollection">
      <button class="md-library-text-button" :class="{ 'is-drop-target': touchDrag.home }" data-shelf-home @click="shelf.activeCollectionId = null" @dragover="onRootDragOver" @drop="onRootDrop">← 书架</button>
      <h2 class="text-[17px] font-semibold break-words min-w-0 flex-1">{{ currentCollection.title }}</h2>
      <button class="md-library-text-button" @click="renameCurrent">重命名</button>
      <button class="md-library-text-button" title="删除书库，书本移回主页" @click="deleteCurrent">删除书库</button>
    </template>
    <span v-else class="text-[11px] text-[var(--md-on-surface-variant)] flex-1">{{ favoritesOnly ? `已收藏 · ${displayBooks.length} 本作品` : shelf.collections.length ? `${shelf.collections.length} 个书库 · ${displayBooks.length} 本单本` : '我的书架' }}</span>
    <button class="md-library-text-button" :disabled="!displayBooks.length && !selecting" @click="toggleSelection">{{ selecting ? '取消多选' : '多选' }}</button>
  </div>
  <div v-if="selecting" class="mx-4 min-[900px]:mx-7 mt-2 p-2 rounded-2xl flex flex-wrap items-center gap-1 bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]" aria-label="书本批量操作">
    <span class="text-[13px] px-2" aria-live="polite">已选 {{ selectedIds.length }} 本</span>
    <button class="md-library-text-button" @click="selectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
    <button class="md-library-text-button" :disabled="!selectedIds.length || busy" @click="chooseDestination">移入书库</button>
    <button v-if="currentCollection" class="md-library-text-button" :disabled="!selectedIds.length || busy" @click="moveSelected(null)">移出到主页</button>
  </div>
  <section class="md-shelf-grid" :aria-label="favoritesOnly ? '收藏内容' : currentCollection ? `书库：${currentCollection.title}` : '书架内容'">
    <ContinueReading v-if="!favoritesOnly && !currentCollection && !selecting && featuredBooks.length" :books="featuredBooks" @open="$emit('open', $event)" />
    <CollectionCard v-for="collection in displayCollections" :key="collection.id" :collection="collection" :books="booksForCollection(collection)" :sort-key="sortKey" :touch-over="touchDrag.overId === collection.id" @open="openCollection" @move="moveDropped" />
    <BookCard v-for="book in orderedBooks" :key="book.id" :book="book" :progress="shelf.progressInfoFor(book.id)" :selecting="selecting" :selected="selectedIds.includes(book.id)" :dragging="touchDrag.active && touchDrag.ids.includes(book.id)" :remove-label="favoritesOnly ? '取消收藏' : '从书架移除'" @open="openBook" @remove="removeBook" @drag="onBookDrag" @touchstart="onBookTouchStart($event, book.id)" />
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
import { collectionNameError } from '../services/collections.js';
import { groupShelfBooks } from '../services/shelfSections.js';
import BookCard from './BookCard.vue';
import ContinueReading from './ContinueReading.vue';
import CollectionCard from './CollectionCard.vue';

const props = defineProps({ books: { type: Array, default: () => [] }, sortKey: { type: String, default: 'title' }, query: { type: String, default: '' }, hasFilter: { type: Boolean, default: false }, homeRequest: { type: Number, default: 0 }, favoritesOnly: { type: Boolean, default: false } });
const emit = defineEmits(['open', 'browse']);
const shelf = useShelfStore();
const { askShelfDialog } = useShelfDialogs();
const { isTouch } = useViewport();
const selecting = ref(false);
const selectedIds = ref([]);
const busy = ref(false);
const currentCollection = computed(() => props.favoritesOnly ? null : shelf.collections.find(item => item.id === shelf.activeCollectionId) || null);
const groupedIds = computed(() => new Set(shelf.collections.flatMap(item => item.bookIds)));
const displayBooks = computed(() => props.books.filter(book => props.favoritesOnly ? book.favorite : currentCollection.value ? currentCollection.value.bookIds.includes(book.id) : !groupedIds.value.has(book.id)));
const featuredBooks = computed(() => currentCollection.value ? displayBooks.value : props.hasFilter ? props.books : shelf.library);
const orderedBooks = computed(() => currentCollection.value ? displayBooks.value : groupShelfBooks(displayBooks.value).flatMap(section => section.books));
const allSelected = computed(() => displayBooks.value.length > 0 && displayBooks.value.every(book => selectedIds.value.includes(book.id)));
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
  const list = shelf.collections.filter(item => !props.hasFilter || (keyword && normalizeBookTitle(item.title).includes(keyword)) || item.bookIds.some(id => visible.has(id)));
  const latest = item => Math.max(0, ...item.bookIds.map(id => shelf.progressMap[id]?.updatedAt || 0));
  return [...list].sort((a, b) => (props.sortKey === 'recent' ? b.createdAt - a.createdAt : props.sortKey === 'progress' ? latest(b) - latest(a) : 0) || compareBookTitles(a, b));
});

function booksForCollection(collection) {
  const ids = new Set(collection.bookIds);
  return shelf.library.filter(book => ids.has(book.id));
}

function openCollection(id) { shelf.activeCollectionId = id; emit('browse'); }
function toggleSelection() { selecting.value = !selecting.value; selectedIds.value = []; }
function selectAll() { selectedIds.value = allSelected.value ? [] : displayBooks.value.map(book => book.id); }
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

async function renameCurrent() {
  const item = currentCollection.value;
  const title = await askShelfDialog({ kind: 'name', title: '重命名书库', initialName: item.title, validate: name => collectionNameError(name, shelf.collections, item.id) });
  if (title !== null) await perform(() => shelf.renameCollection(item.id, title));
}

function deleteCurrent() { const id = currentCollection.value.id; return perform(() => shelf.deleteCollection(id)); }

async function chooseDestination() {
  const options = shelf.collections.filter(item => item.id !== shelf.activeCollectionId).sort(compareBookTitles).map(item => ({ value: item.id, title: item.title }));
  const target = await askShelfDialog({ kind: 'move', title: '移入书库', message: `将选中的 ${selectedIds.value.length} 本书移动到：`, options });
  if (target !== null) await moveSelected(target);
}

async function moveSelected(target) {
  await perform(async () => { await shelf.moveBooks(selectedIds.value, target); selectedIds.value = []; selecting.value = false; });
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

watch(() => shelf.activeCollectionId, () => { selecting.value = false; selectedIds.value = []; });
watch(() => props.homeRequest, () => { selecting.value = false; selectedIds.value = []; });
watch(displayBooks, list => { const ids = new Set(list.map(book => book.id)); selectedIds.value = selectedIds.value.filter(id => ids.has(id)); });

onMounted(() => document.addEventListener('click', onDocumentClick, true));
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true);
  if (swallowClickTimer !== null) window.clearTimeout(swallowClickTimer);
  resetTouchDrag();
});
</script>
