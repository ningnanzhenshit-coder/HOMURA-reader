<template>
  <!-- Bookshelf Section -->
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-line)] pb-3">
      <div class="flex items-center gap-2.5">
        <div class="w-2 h-5 rounded-full bg-[var(--brand-primary)]"></div>
        <h3 class="text-sm font-display font-bold tracking-tight">我的书架</h3>
        <span class="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)]">{{ shelf.library.length }} 本作品</span>
      </div>
      <div class="flex items-center gap-3 text-xs font-semibold text-[var(--fg-muted)]">
        <button @click="addDemoManga" class="hover:text-[var(--brand-primary)] transition">+ 示例漫画</button>
        <span>·</span>
        <button @click="addDemoNovel" class="hover:text-[var(--brand-primary)] transition">+ 示例小说</button>
        <span>·</span>
        <button @click="shelf.clearShelf()" class="hover:text-red-500 transition">清空</button>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
      <BookCard
        v-for="book in shelf.library"
        :key="book.id"
        :book="book"
        :progress="shelf.progressInfoFor(book.id)"
        @open="$emit('open', $event)"
        @remove="shelf.removeBook"
      />
      <div v-if="shelf.library.length === 0" class="col-span-full py-14 text-center text-[var(--fg-muted)] text-xs font-medium">
        书架暂无作品，请拖入文件或点击上方「导入文件 / 导入文件夹」
      </div>
    </div>
  </section>
</template>

<script setup>
import { useShelfStore } from '../stores/shelf.js';
import { createDemoManga, createDemoNovel } from '../services/demo.js';
import { showToast } from '../composables/useToast.js';
import BookCard from './BookCard.vue';

defineEmits(['open']);

const shelf = useShelfStore();

function addDemoManga() {
  shelf.unshiftBook(createDemoManga());
  showToast('已添加《示例漫画》到书架');
}

function addDemoNovel() {
  shelf.unshiftBook(createDemoNovel());
  showToast('已添加《示例轻小说》到书架');
}
</script>
