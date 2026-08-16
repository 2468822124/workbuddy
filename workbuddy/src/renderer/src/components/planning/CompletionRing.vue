<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ done: number; total: number; size?: number }>(),
  { size: 96 },
)

const pct = computed(() => (props.total === 0 ? 0 : Math.round((props.done / props.total) * 100)))
const ringBg = computed(() => `conic-gradient(var(--accent) ${pct.value}%, var(--bg-sunken) 0)`)
</script>

<template>
  <div class="ring" :style="{ background: ringBg, width: size + 'px', height: size + 'px' }">
    <div class="hole">
      <b>{{ done }}/{{ total }}</b>
      <span>完成率 {{ pct }}%</span>
    </div>
  </div>
</template>

<style scoped>
.ring {
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  transition: background var(--dur-base);
}
.hole {
  width: calc(100% - 18px);
  height: calc(100% - 18px);
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}
.hole b {
  font-size: 15px;
  font-weight: var(--fw-bold);
  color: var(--text-strong);
  letter-spacing: var(--tracking-tight);
}
.hole span {
  font-size: var(--fs-caption);
  color: var(--text-faint);
}
</style>
