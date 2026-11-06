<template>
  <div class="md-card md-card--filled md-collection-card" :class="{ 'is-drop-target': highlighted, 'md-collection-selected': selected }" :aria-busy="!!importStatus || undefined" :data-collection-id="importStatus ? null : collection.id" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <button class="md-collection-open" :disabled="!!importStatus" :aria-label="importStatus ? `正在导入书库：${collection.title}，已导入 ${importStatus.loaded} / ${importStatus.total} 本` : selecting ? `选择书库：${collection.title}` : `打开书库：${collection.title}，${books.length} 本`" :aria-pressed="selecting ? selected : undefined" @click="$emit(selecting ? 'toggle' : 'open', collection.id)">
      <span class="md-collection-art" aria-hidden="true">
        <span class="md-collection-board">
          <span class="md-collection-tab"></span>
          <span v-for="layer in [3, 2, 1, 0]" :key="layer" class="md-collection-layer" :style="{ '--layer': layer }">
            <img v-if="covers[layer]?.cover" :src="covers[layer].cover" alt="" loading="lazy" decoding="async" draggable="false" />
            <span v-else-if="layer === 0" class="md-collection-fallback">{{ covers[0]?.title || collection.title }}</span>
          </span>
        </span>
        <span v-if="selecting && !importStatus" class="md-select-badge" aria-hidden="true">
          <MdIcon :name="selected ? 'check' : 'radio_button_unchecked'" :size="16" />
        </span>
        <ImportShade :ratio="importStatus ? importStatus.loaded / importStatus.total : null" />
      </span>
      <span class="md-collection-info">
        <span class="md-collection-title">{{ collection.title }}</span>
        <span class="md-collection-meta">
          <span v-if="importStatus" class="md-collection-count">导入中 · {{ importStatus.loaded }} / {{ importStatus.total }}</span>
          <span v-else-if="highlighted" class="md-collection-drop">松开移入书库</span>
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
import MdIcon from './MdIcon.vue';
import ImportShade from './ImportShade.vue';

const props = defineProps({ collection: { type: Object, required: true }, books: { type: Array, default: () => [] }, sortKey: { type: String, default: 'title' }, touchOver: { type: Boolean, default: false }, selecting: { type: Boolean, default: false }, selected: { type: Boolean, default: false }, importStatus: { type: Object, default: null } });
const emit = defineEmits(['open', 'toggle', 'move']);
const hovering = ref(false);
const shelf = useShelfStore();
const highlighted = computed(() => hovering.value || props.touchOver);
const covers = computed(() => {
  return sortShelfBooks(props.books, props.sortKey, shelf.progressMap).slice(0, 4);
});

function onDragOver(event) {
  if (props.importStatus) return;
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
  if (props.importStatus) return;
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
