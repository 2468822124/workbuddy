<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getWeekStart } from '@shared/period'
import { shiftWeek } from '@/composables/useFlowWeek'
import {
  isCurrentReviewWeek,
  parseReviewWeekQuery,
  reviewWeekLabel,
  useFlowReview,
} from '@/composables/useFlowReview'
import WeekNav from '@/components/flow/WeekNav.vue'
import ReviewSummary from '@/components/flow/review/ReviewSummary.vue'
import ReviewTrend from '@/components/flow/review/ReviewTrend.vue'
import ReviewTaskList from '@/components/flow/review/ReviewTaskList.vue'
import ReviewDeferred from '@/components/flow/review/ReviewDeferred.vue'
import ReviewJournal from '@/components/flow/review/ReviewJournal.vue'

const route = useRoute()
const router = useRouter()

// 顶层解包 refs（F1）：composable 返回的普通对象内嵌 ref 在模板中不会被自动解包，
// 传给纯函数会拿到 Ref 对象（period.ts toUtcMs → .split 崩溃 → 白屏）。
// 顶层解构后：模板直接用顶层名（自动解包为值），script 侧用 .value。
const {
  weekStart,
  board,
  loading,
  error,
  info,
  weekContent,
  monthContent,
  savingWeek,
  savingMonth,
  weekError,
  monthError,
  carryingId,
  load,
  reload,
  carryNext,
  saveJournal,
} = useFlowReview()

/** 本地今天（toISOString 是 UTC，8 小时窗口会算错周） */
function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const isCurrentWeek = computed(() => isCurrentReviewWeek(weekStart.value, todayStr()))

/** 周导航：router.replace 改 ?week= 查询 → watch 触发 reload（URL 即状态） */
function navigate(week: string): void {
  router.replace({ query: { ...route.query, week } })
}

watch(
  () => route.query.week,
  q => {
    const target = parseReviewWeekQuery(q, todayStr())
    if (target !== weekStart.value) load(target)
  },
)

onMounted(() => load(parseReviewWeekQuery(route.query.week, todayStr())))
</script>

<template>
  <div class="page">
    <WeekNav
      :label="weekStart ? reviewWeekLabel(weekStart) : ''"
      :is-current-week="isCurrentWeek"
      :next-disabled="isCurrentWeek"
      @prev="navigate(shiftWeek(weekStart, -1))"
      @current="navigate(getWeekStart(todayStr()))"
      @next="navigate(shiftWeek(weekStart, 1))"
    />

    <!-- 反馈条（错误 8s / 信息 4s 自动消隐；IPC err 可见，禁静默） -->
    <div v-if="error" class="feedback error">{{ error }}</div>
    <div v-else-if="info" class="feedback info">{{ info }}</div>

    <div v-if="loading && !board" class="loading">加载中…</div>
    <div v-else-if="!board" class="loading error-text">面板加载失败，请重试</div>
    <template v-else>
      <div v-if="board.isClosed" class="closed-tag">历史周 · 只读展示</div>
      <div class="grid">
        <ReviewSummary class="span2" :summary="board.summary" :days="board.days" />
        <ReviewTrend class="span2" :trend="board.trend" />
        <ReviewTaskList
          :tasks="board.tasks"
          :is-closed="board.isClosed"
          :carrying-id="carryingId"
          @carry="carryNext($event)"
        />
        <ReviewDeferred :deferred="board.deferred" />
        <ReviewJournal
          class="span2"
          :week-content="weekContent"
          :month-content="monthContent"
          :saving-week="savingWeek"
          :saving-month="savingMonth"
          :week-error="weekError"
          :month-error="monthError"
          @save="saveJournal"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { padding: var(--s4); display: flex; flex-direction: column; gap: var(--s3); }
.feedback {
  font-size: var(--fs-small);
  border-radius: var(--r-md);
  padding: var(--s3) var(--s4);
  margin: 0 var(--s2);
}
.feedback.error { color: var(--danger); background: var(--danger-faint); border: 1px solid var(--danger); }
.feedback.info { color: var(--ok); background: var(--ok-soft); border: 1px solid var(--ok); }
.loading { padding: var(--s10); text-align: center; color: var(--text-faint); font-size: var(--fs-small); }
.error-text { color: var(--danger); }
.closed-tag {
  margin: 0 var(--s2);
  font-size: var(--fs-caption);
  color: var(--text-muted);
  background: var(--bg-surface-2);
  border: 1px dashed var(--border-soft);
  border-radius: var(--r-md);
  padding: var(--s2) var(--s4);
  width: fit-content;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)); /* R2（复审2）：1fr 隐含 minmax(auto,1fr)，390 下轨道被 .summary 撑至 396 横向溢出 */
  gap: var(--s4);
  align-items: start;
}
.span2 { grid-column: 1 / -1; }
@media (max-width: 980px) {
  .grid { grid-template-columns: minmax(0, 1fr); }
  .span2 { grid-column: auto; }
}
</style>
