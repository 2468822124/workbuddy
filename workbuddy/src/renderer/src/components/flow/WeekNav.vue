<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

defineProps<{
  label: string
  /** 当前周时隐藏「本周」按钮 */
  isCurrentWeek: boolean
}>()

defineEmits<{ prev: []; current: []; next: [] }>()
</script>

<template>
  <div class="week-nav">
    <button class="nav-btn" title="上周" @click="$emit('prev')">
      <AppIcon name="ChevronLeft" />
    </button>
    <button v-if="!isCurrentWeek" class="nav-btn today-btn" title="回到本周" @click="$emit('current')">
      本周
    </button>
    <div class="label">{{ label }}</div>
    <button class="nav-btn" title="下周" @click="$emit('next')">
      <AppIcon name="ChevronRight" />
    </button>
  </div>
</template>

<style scoped>
.week-nav {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s4) var(--s2);
}
.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s1);
  min-width: 36px;
  height: 36px;
  padding: 0 var(--s3);
  border-radius: var(--r-md);
  border: 1px solid var(--border-soft);
  background: var(--bg-surface);
  color: var(--text-muted);
  font-family: inherit;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.nav-btn:hover { background: var(--bg-hover); color: var(--accent); border-color: var(--accent-ring); }
.nav-btn:active { transform: translateY(1px); }
.nav-btn:disabled { opacity: .5; cursor: default; }
.label {
  flex: 1;
  text-align: center;
  font-size: var(--fs-h2);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  letter-spacing: var(--tracking-wide);
}
</style>
