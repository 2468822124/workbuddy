<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import type { FlowWeekInstance } from '@shared/flowTypes'

defineProps<{
  /** 本周可选取清单（服务端 wood 纯渲染，前端零过滤） */
  rail: FlowWeekInstance[]
  /** 是否历史日（选取 disabled） */
  isHistory: boolean
}>()

const emit = defineEmits<{
  pick: [inst: FlowWeekInstance]
}>()
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="Repeat" :size="18" />
        <h2>本周可选取</h2>
        <span class="count-chip">{{ rail.length }}</span>
      </div>
    </header>

    <ul v-if="rail.length" class="rail-list">
      <li v-for="inst in rail" :key="inst.id" class="rail-row">
        <div class="rail-info">
          <span class="rail-title">{{ inst.title }}</span>
          <span v-if="inst.kind === 'multi'" class="rail-meta">{{ inst.targetCount }}次</span>
        </div>
        <button
          class="pick-btn"
          :disabled="isHistory"
          :title="isHistory ? '历史日不可选取；未完成请用周统筹页「转下周」' : '选取安排到当日'"
          @click="emit('pick', inst)"
        >
          <AppIcon name="MoveRight" :size="15" />
          <span>选取</span>
        </button>
      </li>
    </ul>
    <div v-else class="empty">
      <span class="party">🎉</span>
      <p>本周任务已全部安排</p>
    </div>

    <div v-if="isHistory" class="hint-bar">
      <p>历史日不可选取；未完成请用周统筹页「转下周」</p>
    </div>
  </section>
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
  gap: var(--s4);
}
.card-head { display: flex; align-items: center; justify-content: space-between; }
.head-title { display: flex; align-items: center; gap: var(--s2); color: var(--accent); }
.head-title h2 { font-size: var(--fs-h2); font-weight: var(--fw-semibold); color: var(--text-strong); }
.count-chip {
  font-size: var(--fs-caption);
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: var(--r-pill);
  padding: 2px 8px;
  letter-spacing: var(--tracking-wide);
}
.rail-list { list-style: none; display: flex; flex-direction: column; gap: var(--s2); }
.rail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  border: 1px dashed var(--border-soft);
  transition: background var(--dur-fast);
}
.rail-row:hover { background: var(--bg-hover); }
.rail-info { display: flex; align-items: center; gap: var(--s2); flex: 1; min-width: 0; }
.rail-title { font-size: var(--fs-body); color: var(--text-base); }
.rail-meta {
  font-size: var(--fs-caption); color: var(--text-faint);
  letter-spacing: var(--tracking-wide);
}
.pick-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  color: var(--accent); background: var(--accent-soft);
  border: none; border-radius: var(--r-pill);
  padding: var(--s1) var(--s3); cursor: pointer;
  transition: all var(--dur-fast);
  flex-shrink: 0;
}
.pick-btn:hover { background: var(--accent-ring); }
.pick-btn:disabled { opacity: .35; cursor: default; }
.party { font-size: var(--fs-h2); }
.empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--s1);
  padding: var(--s4); text-align: center;
  color: var(--text-muted);
}
.empty p { font-size: var(--fs-small); }
.hint-bar {
  padding: var(--s3) var(--s4); border-radius: var(--r-md);
  background: var(--bg-sunken);
}
.hint-bar p { font-size: var(--fs-caption); color: var(--text-faint); text-align: center; }
</style>