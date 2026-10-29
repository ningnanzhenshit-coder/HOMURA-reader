<template>
  <!-- 书架网格 -->
  <section class="space-y-4">
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5">
      <BookCard
        v-for="book in books"
        :key="book.id"
        :book="book"
        :progress="shelf.progressInfoFor(book.id)"
        @open="$emit('open', $event)"
        @remove="shelf.removeBook"
      />
      <div v-if="books.length === 0" class="col-span-full py-16 text-center text-[var(--fg-muted)] text-xs font-medium">
        没有符合条件的作品，换个关键词或筛选试试
      </div>
    </div>
  </section>
</template>

<script setup>
import { useShelfStore } from '../stores/shelf.js';
import BookCard from './BookCard.vue';

defineProps({
  books: { type: Array, default: () => [] }
});

defineEmits(['open']);

const shelf = useShelfStore();
</script>
