<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

defineProps<{
  label: string
  isToday: boolean
}>()

const emit = defineEmits<{
  prev: []
  current: []
  next: []
  jump: [date: string]
}>()
</script>

<template>
  <nav class="day-nav">
    <div class="nav-group">
      <button class="nav-btn" title="前一天" @click="emit('prev')">
        <AppIcon name="ChevronLeft" :size="18" />
      </button>
      <span class="nav-label">{{ label }}</span>
      <button class="nav-btn" title="后一天" @click="emit('next')">
        <AppIcon name="ChevronRight" :size="18" />
      </button>
    </div>
    <div class="nav-group">
      <button v-if="!isToday" class="nav-btn today-btn" @click="emit('current')">今天</button>
      <input
        type="date"
        class="date-input"
        title="直选日期"
        @change="emit('jump', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </nav>
</template>

<style scoped>
.day-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  padding: var(--s3) 0;
}
.nav-group {
  display: flex;
  align-items: center;
  gap: var(--s2);
}
.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-soft);
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.nav-btn:hover { background: var(--bg-hover); color: var(--accent); }
.nav-btn:active { transform: scale(0.96); }
.nav-label {
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  white-space: nowrap;
  min-width: 170px;
  text-align: center;
}
.today-btn {
  width: auto;
  padding: 0 var(--s3);
  font-family: inherit;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  color: var(--accent);
  border-color: var(--accent-ring);
}
.date-input {
  font-family: inherit;
  font-size: var(--fs-small);
  padding: 5px 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-soft);
  background: var(--bg-surface);
  color: var(--text-base);
  outline: none;
}
.date-input:focus { border-color: var(--accent-ring); }
</style>