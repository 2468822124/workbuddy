<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { ComponentPublicInstance } from 'vue'

defineProps<{
  icon: string
  title: string
  description?: string
  kbd?: string
}>()
</script>

<template>
  <div class="empty">
    <div class="doodle">
      <AppIcon :name="icon as any" :size="24" />
    </div>
    <b>{{ title }}</b>
    <span v-if="description">{{ description }}</span>
    <div v-if="kbd" class="kbd-tag">{{ kbd }}</div>
    <div v-if="$slots.default" class="empty-slot">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--s2);
  position: relative;
  border-radius: var(--r-lg);
  padding: var(--s6);
  overflow: hidden;
  min-height: 120px;
}
.empty::before {
  content: "";
  position: absolute;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: var(--accent-soft);
  opacity: .5;
}
.doodle {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: var(--r-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  display: grid;
  place-items: center;
  color: var(--accent);
  box-shadow: var(--shadow-xs);
}
b {
  position: relative;
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  color: var(--text-base);
}
span {
  position: relative;
  font-size: var(--fs-small);
  color: var(--text-faint);
  max-width: 180px;
  line-height: var(--lh-base);
}
.kbd-tag {
  position: relative;
  margin-top: var(--s2);
  font-size: 11px;
  color: var(--text-disabled);
  background: var(--bg-sunken);
  padding: 3px 8px;
  border-radius: var(--r-sm);
  letter-spacing: var(--tracking-wide);
}
.empty-slot {
  position: relative;
  margin-top: var(--s3);
}
</style>
