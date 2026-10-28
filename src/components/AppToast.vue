<template>
  <div
    v-if="toast.message"
    :key="toast.token"
    style="background-color: var(--brand-primary);"
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] text-white px-4 py-2 rounded-xl shadow-xl text-xs font-bold tracking-wide pointer-events-none"
  >
    {{ toast.message }}
  </div>
</template>

<script setup>
import { useToast } from '../composables/useToast.js';

const toast = useToast();
</script>
