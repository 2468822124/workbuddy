<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { formatCompletionRate } from '@/composables/useFlowReview'
import type { FlowReviewDay, FlowReviewSummary } from '@shared/flowTypes'

defineProps<{ summary: FlowReviewSummary; days: FlowReviewDay[] }>()

/** 周一(0)…周日(6) */
const WEEKDAY = '一二三四五六日'
</script>

<template>
  <section class="summary card">
    <div class="top">
      <div class="rate">
        <div class="rate-num">{{ formatCompletionRate(summary.completionRate) }}</div>
        <div class="rate-label">计划完成率</div>
        <div class="rate-sub">
          {{ summary.completedPlannedCount }}/{{ summary.plannedCount }} 已完成
        </div>
      </div>
      <div class="stats">
        <div class="stat">
          <AppIcon name="CornerUpRight" size="16" />
          <span class="num">{{ summary.deferredCount }}</span>
          <span class="cap">顺延</span>
        </div>
        <div class="stat">
          <AppIcon name="ListChecks" size="16" />
          <span class="num">{{ summary.unfinishedCount }}</span>
          <span class="cap">未完成</span>
        </div>
        <div class="stat">
          <AppIcon name="CalendarDays" size="16" />
          <span class="num">{{ summary.unarrangedCount }}</span>
          <span class="cap">未安排</span>
        </div>
        <div class="stat">
          <AppIcon name="SkipForward" size="16" />
          <span class="num">{{ summary.skippedCount }}</span>
          <span class="cap">跳过</span>
        </div>
      </div>
    </div>

    <!-- 日计划明细（规格 §5.5.4）：周一至周日 计划/完成/完成率；当前周未来日完成率 null → '—' -->
    <div class="days">
      <div class="days-head">日计划明细</div>
      <div class="days-grid">
        <div v-for="(d, i) in days" :key="d.date" class="day">
          <span class="dow">周{{ WEEKDAY[i] }}</span>
          <span class="date">{{ d.date.slice(5) }}</span>
          <span class="n">{{ d.completedPlannedCount }}/{{ d.plannedCount }}</span>
          <span class="rate" :class="{ empty: d.completionRate === null }">
            {{ formatCompletionRate(d.completionRate) }}
          </span>
        </div>
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
.summary { display: flex; flex-direction: column; gap: var(--s5); }
.top { display: flex; align-items: center; gap: var(--s8); }
/* R2（复审2）：min-width 仅限顶部完成率块；`.day .rate` 若继承会撑破窄 track */
.top > .rate { min-width: 180px; }
.rate-num {
  font-size: var(--fs-hero);
  font-weight: var(--fw-bold);
  color: var(--accent);
  letter-spacing: var(--tracking-tight);
  line-height: var(--lh-tight);
}
.rate-label {
  margin-top: var(--s1);
  font-size: var(--fs-small);
  color: var(--text-muted);
  font-weight: var(--fw-medium);
}
.rate-sub {
  margin-top: var(--s1);
  font-size: var(--fs-caption);
  color: var(--text-faint);
}
.stats {
  flex: 1;
  min-width: 0; /* R2：grid 容器作为 flex 子项，允许收缩到 0 而非 min-content */
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)); /* R2：track 最小 0，杜绝 1fr 隐含 min-content */
  gap: var(--s4);
}
.stat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s1);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  background: var(--bg-sunken);
  color: var(--text-muted);
}
.stat .num {
  font-size: var(--fs-h2);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  line-height: var(--lh-tight);
}
.stat .cap { font-size: var(--fs-caption); color: var(--text-faint); }
.days { border-top: 1px dashed var(--border-soft); padding-top: var(--s4); }
.days-head {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
  margin-bottom: var(--s3);
}
.days-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--s2); } /* R2：minmax(0,1fr) 替代 1fr，track 可收缩 */
.day {
  min-width: 0; /* R2：子项省略号生效前提 */
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  padding: var(--s3) var(--s2);
  border-radius: var(--r-md);
  background: var(--bg-sunken);
  align-items: flex-start;
}
/* R2：窄 track 下文本省略，禁止撑破网格 */
.dow { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--text-strong); }
.date { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--fs-caption); color: var(--text-faint); }
.n { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.day .rate { min-width: 0; font-size: var(--fs-caption); color: var(--accent); } /* R2：不继承 .top > .rate 的 180px */
.day .rate.empty { color: var(--text-faint); }
@media (max-width: 760px) {
  .top { flex-direction: column; align-items: stretch; }
  .stats { width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); } /* R2：窄视口 2 列统计 */
  .stat { flex-direction: row; align-items: center; }
  .days-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 480px) {
  .days-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } /* R2：极窄视口 2 列日明细 */
}
</style>
