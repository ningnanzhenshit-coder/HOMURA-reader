<template>
  <div class="md-collection-card" :class="{ 'is-drop-target': highlighted }" :data-collection-id="collection.id" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <button class="md-collection-open" :aria-label="`打开书库：${collection.title}，${books.length} 本`" @click="$emit('open', collection.id)">
      <span class="md-collection-art" aria-hidden="true">
        <span class="md-collection-board">
          <span v-for="index in 4" :key="index" class="md-collection-tile" :class="{ 'is-empty': !covers[index - 1] }">
            <template v-if="covers[index - 1]">
              <img v-if="covers[index - 1].cover" :src="covers[index - 1].cover" alt="" draggable="false" />
              <span v-else class="md-collection-fallback">{{ covers[index - 1].title }}</span>
            </template>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5v-13Z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M8 8h7M8 11h5" />
            </svg>
          </span>
        </span>
      </span>
      <span class="md-collection-info">
        <span class="md-collection-title">{{ collection.title }}</span>
        <span class="md-collection-meta">
          <span v-if="highlighted" class="md-collection-drop">松开移入书库</span>
          <template v-else>
            <span class="md-collection-count">{{ books.length }} 本作品</span>
            <span class="md-collection-action">打开 →</span>
          </template>
        </span>
      </span>
    </button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { sortShelfBooks } from '../services/bookTitles.js';
import { useShelfStore } from '../stores/shelf.js';

const props = defineProps({ collection: { type: Object, required: true }, books: { type: Array, default: () => [] }, sortKey: { type: String, default: 'title' }, touchOver: { type: Boolean, default: false } });
const emit = defineEmits(['open', 'move']);
const hovering = ref(false);
const shelf = useShelfStore();
const highlighted = computed(() => hovering.value || props.touchOver);
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
