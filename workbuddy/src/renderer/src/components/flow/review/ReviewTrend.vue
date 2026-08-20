<script setup lang="ts">
import { computed } from 'vue'
import { formatCompletionRate } from '@/composables/useFlowReview'
import type { FlowReviewTrendPoint } from '@shared/flowTypes'

const props = defineProps<{ trend: FlowReviewTrendPoint[] }>()

interface Bar extends FlowReviewTrendPoint {
  rateText: string
  barHeight: string
  weekTag: string
}

/** 纯 CSS 迷你柱图（无图表库）：柱高=完成率%，空周占位；标签 W 号+起日 MM-DD */
const bars = computed<Bar[]>(() =>
  props.trend.map(p => ({
    ...p,
    rateText: formatCompletionRate(p.completionRate),
    barHeight: p.completionRate === null ? '0%' : `${Math.max(4, Math.round(p.completionRate * 100))}%`,
    weekTag: p.weekStart.slice(5).replace('-', '/'),
  })),
)
</script>

<template>
  <section class="trend card">
    <header class="head">
      <h3 class="title">近 8 周趋势</h3>
      <span class="hint">柱高 = 计划完成率 · 末点为当前所选周</span>
    </header>
    <div class="chart">
      <div v-for="b in bars" :key="b.weekStart" class="col" :title="`${b.weekTag} 起 · ${b.completedPlannedCount}/${b.plannedCount}`">
        <div class="value">{{ b.rateText }}</div>
        <div class="track">
          <div class="fill" :style="{ height: b.barHeight }" />
        </div>
        <div class="tag">{{ b.weekTag }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  padding: var(--s6) var(--s8);
  box-shadow: var(--shadow-xs);
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s4);
  margin-bottom: var(--s5);
}
.title {
  margin: 0;
  font-size: var(--fs-h2);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.hint { font-size: var(--fs-caption); color: var(--text-faint); }
.chart {
  display: flex;
  align-items: stretch;
  gap: var(--s3);
  height: 180px;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  min-width: 0;
}
.value { font-size: var(--fs-caption); color: var(--text-muted); white-space: nowrap; }
.track {
  flex: 1;
  width: 100%;
  max-width: 46px;
  display: flex;
  align-items: flex-end;
  background: var(--bg-sunken);
  border-radius: var(--r-sm);
  overflow: hidden;
}
.fill {
  width: 100%;
  background: var(--accent);
  border-radius: var(--r-sm) var(--r-sm) 0 0;
  transition: height var(--dur-base) var(--ease-out);
}
.tag { font-size: var(--fs-caption); color: var(--text-faint); }
</style>
