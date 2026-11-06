<template>
  <Transition name="import-shade">
    <span v-if="ratio !== null" class="import-shade" :style="{ '--remaining': 1 - ratio }" aria-hidden="true"></span>
  </Transition>
</template>

<script setup>
defineProps({ ratio: { type: Number, default: null } });
</script>

<style scoped>
.import-shade {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(to bottom, color-mix(in oklab, var(--md-shadow-color) 52%, transparent) 94%, transparent);
  transform-origin: top;
  transform: scaleY(var(--remaining));
  transition: transform 360ms ease-out;
}

.import-shade-leave-to {
  transform: scaleY(0);
}

@media (prefers-reduced-motion: reduce) {
  .import-shade {
    transition: none;
  }
}
</style>
