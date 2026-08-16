<script setup lang="ts">
defineProps<{ interactive?: boolean }>()
</script>

<template>
  <div class="card" :class="{ interactive }">
    <slot />
  </div>
</template>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-xl);
  padding: var(--s6);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: box-shadow var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.card.interactive:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
</style>
