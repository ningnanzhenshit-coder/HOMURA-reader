<template>
  <!-- 书架网格：继续阅读特色卡作为第一个格子，桌面 6 列 / 手机 3 列 -->
  <section class="md-shelf-grid">
    <ContinueReading @open="$emit('open', $event)" />

    <BookCard
      v-for="book in books"
      :key="book.id"
      :book="book"
      :progress="shelf.progressInfoFor(book.id)"
      @open="$emit('open', $event)"
      @remove="shelf.removeBook"
    />

    <div v-if="books.length === 0" class="col-span-full py-16 text-center text-[var(--md-on-surface-variant)] text-xs font-medium">
      没有符合条件的作品，换个关键词或筛选试试
    </div>
  </section>
</template>

<script setup>
import { useShelfStore } from '../stores/shelf.js';
import BookCard from './BookCard.vue';
import ContinueReading from './ContinueReading.vue';

defineProps({
  books: { type: Array, default: () => [] }
});

defineEmits(['open']);

const shelf = useShelfStore();
</script>
