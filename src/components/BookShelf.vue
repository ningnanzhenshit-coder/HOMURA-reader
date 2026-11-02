<template>
  <div class="px-4 min-[900px]:px-7 pt-3 flex flex-wrap items-center gap-1">
    <template v-if="currentCollection">
      <button class="md-library-text-button" @click="shelf.activeCollectionId = null" @dragover="onRootDragOver" @drop="onRootDrop">← 书架</button>
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
    <ContinueReading v-if="!favoritesOnly && !selecting && featuredBooks.length" :books="featuredBooks" @open="$emit('open', $event)" />
    <CollectionCard v-for="collection in displayCollections" :key="collection.id" :collection="collection" :books="booksForCollection(collection)" :sort-key="sortKey" @open="openCollection" @move="moveDropped" />
    <BookCard v-for="book in orderedBooks" :key="book.id" :book="book" :progress="shelf.progressInfoFor(book.id)" :selecting="selecting" :selected="selectedIds.includes(book.id)" :remove-label="favoritesOnly ? '取消收藏' : '从书架移除'" @open="openBook" @remove="removeBook" @drag="onBookDrag" />
    <p v-if="!displayBooks.length && !displayCollections.length" class="col-span-full py-16 text-center text-[13px] text-[var(--md-on-surface-variant)]">{{ hasFilter ? '没有符合条件的作品，换个关键词或筛选试试' : favoritesOnly ? '还没有收藏的书，在阅读器中点亮星星即可收藏' : '书库还是空的，可从主页拖入书本，或多选后移入书库' }}</p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useShelfStore } from '../stores/shelf.js';
import { useShelfDialogs } from '../composables/useShelfDialogs.js';
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
const selecting = ref(false);
const selectedIds = ref([]);
const busy = ref(false);
const currentCollection = computed(() => props.favoritesOnly ? null : shelf.collections.find(item => item.id === shelf.activeCollectionId) || null);
const groupedIds = computed(() => new Set(shelf.collections.flatMap(item => item.bookIds)));
const displayBooks = computed(() => props.books.filter(book => props.favoritesOnly ? book.favorite : currentCollection.value ? currentCollection.value.bookIds.includes(book.id) : !groupedIds.value.has(book.id)));
const featuredBooks = computed(() => currentCollection.value ? displayBooks.value : props.hasFilter ? props.books : shelf.library);
const orderedBooks = computed(() => currentCollection.value ? displayBooks.value : groupShelfBooks(displayBooks.value).flatMap(section => section.books));
const allSelected = computed(() => displayBooks.value.length > 0 && displayBooks.value.every(book => selectedIds.value.includes(book.id)));

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
  if (!props.favoritesOnly) return shelf.removeBook(id);
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
</script>
