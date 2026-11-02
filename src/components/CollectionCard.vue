<template>
  <div class="md-collection-card" :class="{ 'is-drop-target': hovering }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <button class="md-collection-open" :aria-label="`打开书库：${collection.title}，${books.length} 本`" @click="$emit('open', collection.id)">
      <span class="md-collection-art" aria-hidden="true">
        <span class="md-collection-tab"></span>
        <span v-for="layer in [3, 2, 1]" :key="layer" class="md-collection-shadow" :style="{ '--collection-layer': layer }">
          <img v-if="covers[layer]?.cover" :src="covers[layer].cover" alt="" draggable="false" />
          <span v-else-if="covers[layer]" class="md-collection-fallback">{{ covers[layer].title }}</span>
        </span>
        <span class="md-collection-front">
          <img v-if="covers[0]?.cover" :src="covers[0].cover" alt="" draggable="false" />
          <span v-else class="md-collection-fallback">{{ covers[0]?.title || collection.title }}</span>
          <span class="md-collection-label">书库 · {{ books.length }} 本</span>
        </span>
      </span>
      <span class="block text-[13px] font-semibold truncate mt-2">{{ collection.title }}</span>
      <span class="block mt-1 text-[11px] text-[var(--md-on-surface-variant)]">{{ hovering ? '松开移入书库' : `${books.length} 本作品` }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { sortShelfBooks } from '../services/bookTitles.js';
import { useShelfStore } from '../stores/shelf.js';

const props = defineProps({ collection: { type: Object, required: true }, books: { type: Array, default: () => [] }, sortKey: { type: String, default: 'title' } });
const emit = defineEmits(['open', 'move']);
const hovering = ref(false);
const shelf = useShelfStore();
const covers = computed(() => {
  return sortShelfBooks(props.books, props.sortKey, shelf.progressMap).slice(0, 4);
});

function onDragOver(event) {
  if (!Array.from(event.dataTransfer?.types || []).includes('application/x-homura-books')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  hovering.value = true;
}

function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) hovering.value = false;
}

function onDrop(event) {
  hovering.value = false;
  if (!Array.from(event.dataTransfer?.types || []).includes('application/x-homura-books')) return;
  event.preventDefault();
  event.stopPropagation();
  try {
    const ids = JSON.parse(event.dataTransfer.getData('application/x-homura-books'));
    if (Array.isArray(ids) && ids.every(id => typeof id === 'string')) emit('move', ids, props.collection.id);
  } catch (err) {
    console.warn('[HOMURA] 无法读取拖动的书本', err);
  }
}
</script>
