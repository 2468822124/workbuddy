<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ReviewPanel from '@/components/planning/ReviewPanel.vue'
import PlanPanel from '@/components/planning/PlanPanel.vue'
import { usePlanning, LEVEL_TO_PLAN_TYPE, LEVEL_TO_REVIEW_TYPE, extractTaskTexts } from '@/composables/usePlanning'
import { useApi } from '@/composables/useApi'
import {
  periodStartFor, periodLabel, nextPeriodStart, addDays, getWeekStart, getMonthStart,
  getWeekRange, getMonthRange,
} from '@shared/period'
import type { Plan, Review, Template, PlanningLevel } from '@shared/types'

const props = defineProps<{ level: string }>()

const router = useRouter()
const route = useRoute()
const api = useApi()

// 非法 level → 重定向日规划（保 /planning/:level 路由健壮）
const level = computed<PlanningLevel>(() =>
  props.level === 'weekly' || props.level === 'monthly' ? props.level : 'daily',
)

const plan = usePlanning(level.value)
const planType = LEVEL_TO_PLAN_TYPE[level.value]
const reviewType = LEVEL_TO_REVIEW_TYPE[level.value]
const isDaily = computed(() => level.value === 'daily')

// 本期（复盘引用）起始 / 下期（规划引用）起始
const curStart = ref(periodStartFor(level.value, typeof route.query.date === 'string' ? route.query.date : ''))
const nextStart = computed(() => nextPeriodStart(level.value, curStart.value))

// 已存记录 + 草稿（view 拥有；组合式只产出草稿）
const savedPlan = ref<Plan | null>(null)
const savedReview = ref<Review | null>(null)
const planDraft = ref('')
const reviewDraft = ref('')

const templates = ref<Template[]>([])
const selectedTplId = ref<string | null>(null)

const loading = ref(true)
const savingPlan = ref(false)
const savingReview = ref(false)

const ring = ref<{ done: number; total: number }>({ done: 0, total: 0 })

type Feedback = { kind: 'success' | 'warn' | 'info' | 'error'; text: string }
const feedback = ref<Feedback | null>(null)

const periodEnd = computed(() =>
  level.value === 'weekly' ? getWeekRange(curStart.value)[1] : getMonthRange(curStart.value)[1],
)

// F3-1.3-A：rail 隐藏源 = 编辑中计划内容派生的任务文本集（替代原会话级乐观隐藏）
const inDraftTexts = computed(() => extractTaskTexts(planDraft.value))

async function loadRing() {
  if (isDaily.value) {
    const r = await api.todos.today(curStart.value)
    const todos = r.ok ? r.data : []
    ring.value = {
      done: todos.filter(t => t.status === 'done').length,
      total: todos.length,
    }
    return
  }
  const r = await api.todos.findInRange({ from: curStart.value, to: periodEnd.value })
  const todos = r.ok ? r.data : []
  const toEx = nextPeriodStart('daily', periodEnd.value)
  ring.value = {
    done: todos.filter(t => t.status === 'done' && !!t.completedAt && t.completedAt >= curStart.value && t.completedAt < toEx).length,
    total: todos.length,
  }
}

async function load() {
  loading.value = true
  feedback.value = null
  const [reviewR, planR, tplR] = await Promise.all([
    api.reviews.byDate(curStart.value, reviewType),
    api.plans.getByPeriod({ type: planType, date: nextStart.value }),
    templates.value.length ? Promise.resolve({ ok: true as const, data: [] as Template[] }) : api.templates.list(planType),
  ])
  if (reviewR.ok && reviewR.data) {
    savedReview.value = reviewR.data
    reviewDraft.value = reviewR.data.content ?? ''
  } else {
    savedReview.value = null
    reviewDraft.value = ''
  }
  if (planR.ok && planR.data) {
    savedPlan.value = planR.data
    planDraft.value = planR.data.content ?? ''
  } else {
    savedPlan.value = null
    planDraft.value = templates.value.find(t => t.id === selectedTplId.value)?.content ?? ''
  }
  if (tplR.ok && tplR.data.length) {
    templates.value = tplR.data
    const def = tplR.data.find(t => t.isDefault && t.type === planType)
    if (def) selectedTplId.value = def.id
    else if (!selectedTplId.value && tplR.data.length) selectedTplId.value = tplR.data[0].id
    if (!savedPlan.value) planDraft.value = templates.value.find(t => t.id === selectedTplId.value)?.content ?? ''
  }
  await loadRing()
  // 级联基准 = 当前查看期（curStart）而非规划期（nextStart）：业务规则「本周周任务」=
  // 查看日所在周的 weekly_plan；规划期可能跨周（周日出/周六看），基准错则 rail 空（用户反馈3.1 F3-1.1）
  await plan.loadParentTasks(curStart.value)
  loading.value = false
  await applyFocus()
}

function selectTpl(id: string) {
  selectedTplId.value = id
  const tpl = templates.value.find(t => t.id === id)
  if (tpl && !savedPlan.value) planDraft.value = tpl.content ?? ''
}

function prevPeriod() {
  if (level.value === 'daily') curStart.value = addDays(curStart.value, -1)
  else if (level.value === 'weekly') curStart.value = getWeekStart(addDays(curStart.value, -1))
  else curStart.value = getMonthStart(addDays(curStart.value, -1))
}
function nextPeriod() {
  curStart.value = nextPeriodStart(level.value, curStart.value)
}
const todayStart = computed(() => periodStartFor(level.value, new Date().toISOString().slice(0, 10)))
const isTodayPeriod = computed(() => curStart.value === todayStart.value)

// 日历选日期（用户反馈3 F3-2）：原生 input[type=date] showPicker，三级通用，periodStartFor 归一化
const dateInput = ref<HTMLInputElement | null>(null)
function pickDate() {
  dateInput.value?.showPicker()
}
function onPickDate(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) curStart.value = periodStartFor(level.value, v)
}

watch(curStart, () => {
  router.replace({ path: `/planning/${level.value}`, query: { date: curStart.value } })
  load()
})

async function onSavePlan() {
  if (savingPlan.value || loading.value) return
  savingPlan.value = true
  feedback.value = null
  try {
    const data = {
      date: nextStart.value,
      type: planType,
      content: planDraft.value,
      templateId: selectedTplId.value ?? undefined,
    }
    const r = savedPlan.value
      ? await api.plans.update({ id: savedPlan.value.id, ...data })
      : await api.plans.create(data)
    if (r.ok) {
      savedPlan.value = r.data.plan
      const lines: string[] = []
      if (r.data.generatedCount > 0) {
        lines.push(`✅ 已保存，生成 ${r.data.generatedCount} 条待办`)
      } else {
        lines.push('✅ 已保存')
      }
      // F3.2-1 方案B：orphan 分流计数文案 —— 未完成随计划删除移除 / 已完成保留为历史
      const removed = r.data.removedOpenCount ?? 0
      const kept = r.data.keptDoneCount ?? 0
      if (removed > 0 || kept > 0) {
        const parts: string[] = []
        if (removed > 0) parts.push(`${removed} 条未完成待办已随计划删除移除`)
        if (kept > 0) parts.push(`${kept} 条已完成待办保留为历史`)
        lines.push(`ℹ️ ${parts.join('；')}`)
      }
      // v0.2修复计划·§3.6：跨级删除分流（任务从上级计划移除 → 其下游 todo open 软删 / done 保留失效标注）
      const cascadeRemoved = r.data.cascadeRemovedOpenCount ?? 0
      const cascadeInvalidated = r.data.cascadeInvalidatedDoneCount ?? 0
      if (cascadeRemoved > 0 || cascadeInvalidated > 0) {
        const parts: string[] = []
        if (cascadeRemoved > 0) parts.push(`${cascadeRemoved} 条未完成待办已随上级任务删除移除`)
        if (cascadeInvalidated > 0) parts.push(`${cascadeInvalidated} 条已完成待办来源失效`)
        lines.push(`ℹ️ ${parts.join('；')}`)
      }
      const hasCascade = removed > 0 || kept > 0 || cascadeRemoved > 0 || cascadeInvalidated > 0
      feedback.value = { kind: hasCascade ? 'info' : 'success', text: lines.join('\n') }
      // 第四轮实测·问题2a：保存后重载上级任务 rail —— scheduledInPeriod/consumed 均为后端字段，
      // 删子任务行须 reload 重算（与 pickTask 末尾 loadParentTasks 对齐），否则 rail 冻结在旧快照全空
      await plan.loadParentTasks(curStart.value)
    } else {
      feedback.value = { kind: 'error', text: `❌ 保存失败：${r.error?.message ?? '未知错误'}` }
    }
  } finally {
    savingPlan.value = false
  }
}

async function onSaveReview() {
  if (savingReview.value || loading.value) return
  savingReview.value = true
  feedback.value = null
  try {
    const data = { date: curStart.value, type: reviewType, content: reviewDraft.value }
    const r = savedReview.value
      ? await api.reviews.update({ id: savedReview.value.id, ...data })
      : await api.reviews.create(data)
    if (r.ok) {
      savedReview.value = r.data
      feedback.value = { kind: 'success', text: '✅ 复盘已保存' }
    } else {
      feedback.value = { kind: 'error', text: `❌ 保存失败：${r.error?.message ?? '未知错误'}` }
    }
  } finally {
    savingReview.value = false
  }
}

function applyDraft(mode: 'replace' | 'append') {
  if (mode === 'replace') reviewDraft.value = plan.reviewContent.value
  else reviewDraft.value = reviewDraft.value + '\n\n' + plan.reviewContent.value
  plan.clearReview()
}

function insertSuggestion(item: { placeholder: string; question: string; suggestion: string }) {
  planDraft.value = plan.applySuggestion(item, planDraft.value)
}

function skipSuggestion(i: number) {
  plan.guideItems.value = plan.guideItems.value.filter((_, idx) => idx !== i)
}

async function onPickTask(task: { text: string; tid: string | null }) {
  // 下沉任务插入「明日」计划（planDraft 对应 nextStart），但重载 rail 以 curStart 为基准（同 load()）
  try {
    const r = await plan.pickTask(task, planDraft.value, curStart.value)
    planDraft.value = r.content
    // 回归专项（点选取无反应）：正确去重（计划内已存在同名任务）→ 显式提示，杜绝静默
    if (!r.picked) feedback.value = { kind: 'info', text: 'ℹ️ 该任务已在计划中，未重复添加' }
  } catch (e: unknown) {
    // 异常路径（prepareTaskLink/IPC 抛错）→ 错误反馈条，杜绝静默无反应
    feedback.value = { kind: 'error', text: `❌ 选取失败：${(e as Error).message}` }
  }
}

// ---- v0.2修复计划·§3.5：来源链跳转定位（TodayView 出处 tag → ?date=上期&focus=tid）----
const planPanelRef = ref<InstanceType<typeof PlanPanel> | null>(null)
const CHAIN_LEVEL_LABEL: Record<PlanningLevel, string> = { daily: '日任务', weekly: '周任务', monthly: '月任务' }

/** 任务位于「上期」计划（编辑器规划 nextStart；日期已由 TodayView 偏移），
 *  故 planDraft 即任务所在计划。按 `tid:{hex}` 定位行 + 展示来源链 breadcrumb。 */
async function applyFocus() {
  const focusTid = typeof route.query.focus === 'string' ? route.query.focus : ''
  if (!focusTid) return
  const fragment = `tid:${focusTid}`
  if (!planDraft.value.includes(fragment)) return
  planPanelRef.value?.focusLine(fragment)
  let chainText = '🔗 已定位来源任务'
  const chainR = await api.tasks.resolveChain({ tid: focusTid })
  if (chainR.ok && chainR.data.length) {
    chainText += '：' + chainR.data.map(c => `${CHAIN_LEVEL_LABEL[c.level]}·${c.content}`).join(' → ')
  }
  feedback.value = { kind: 'info', text: chainText }
}
watch(() => route.query.focus, applyFocus)

onMounted(() => {
  if (props.level !== level.value) {
    router.replace({ path: `/planning/${level.value}`, query: { date: curStart.value } })
  }
  load()
})
</script>

<template>
  <div class="page">
    <header class="pg-head">
      <h2>规划</h2>
      <div class="period-nav">
        <button class="nav-arrow" :disabled="loading" title="上一期" @click="prevPeriod">
          <AppIcon name="ChevronLeft" :size="17" />
        </button>
        <span class="period-label">{{ periodLabel(level, curStart) }}</span>
        <button class="nav-arrow" :disabled="loading" title="下一期" @click="nextPeriod">
          <AppIcon name="ChevronRight" :size="17" />
        </button>
        <button class="nav-arrow" title="选择日期" :disabled="loading" @click="pickDate">
          <AppIcon name="Calendar" :size="17" />
        </button>
        <input
          ref="dateInput"
          type="date"
          class="date-input-hidden"
          :value="curStart"
          @change="onPickDate"
        />
        <button v-if="!isTodayPeriod" class="today-btn" :disabled="loading" @click="curStart = todayStart">
          回到今天
        </button>
      </div>
    </header>

    <div v-if="feedback" class="feedback" :class="feedback.kind">
      {{ feedback.text }}
    </div>

    <div class="panels">
      <!-- 视觉权重：daily 规划为主（order 0）；周/月复盘为主 -->
      <ReviewPanel
        :style="{ order: isDaily ? 1 : 0 }"
        :level="level"
        :period-start="curStart"
        :model-value="reviewDraft"
        :saved="!!savedReview"
        :ring="ring"
        :llm-ready="plan.llmReady.value"
        :generating="plan.reviewLoading.value"
        :gen-error="plan.reviewError.value"
        :gen-draft="plan.reviewContent.value"
        :saving="savingReview"
        :loading="loading"
        @update:model-value="(v: string) => (reviewDraft = v)"
        @generate="() => plan.summarize(curStart)"
        @regenerate="() => plan.regenerate(curStart)"
        @clear-gen="plan.clearReview"
        @save="onSaveReview"
        @go-settings="plan.goSettings"
        @apply-draft="applyDraft"
      />
      <PlanPanel
        ref="planPanelRef"
        :style="{ order: isDaily ? 0 : 1 }"
        :level="level"
        :period-start="nextStart"
        :model-value="planDraft"
        :saved="!!savedPlan"
        :saving="savingPlan"
        :loading="loading"
        :templates="templates"
        :selected-tpl-id="selectedTplId"
        :llm-ready="plan.llmReady.value"
        :guide-items="plan.guideItems.value"
        :guide-loading="plan.guideLoading.value"
        :guide-error="plan.guideError.value"
        :parent-tasks="plan.parentTasks.value"
        :cascade-loading="plan.parentTasksLoading.value"
        :in-draft-texts="inDraftTexts"
        @update:model-value="(v: string) => (planDraft = v)"
        @save="onSavePlan"
        @select-tpl="selectTpl"
        @guide="() => selectedTplId && plan.guide(selectedTplId, planDraft)"
        @clear-guide="plan.clearGuide"
        @insert-suggestion="insertSuggestion"
        @skip-suggestion="skipSuggestion"
        @pick-task="onPickTask"
        @go-settings="plan.goSettings"
      />
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1080px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--s5);
}
.pg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
  flex-wrap: wrap;
}
.pg-head h2 {
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
}
.period-nav { display: flex; align-items: center; gap: var(--s3); }
.period-label { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-muted); min-width: 120px; text-align: center; }
.nav-arrow {
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all var(--dur-base);
}
.nav-arrow:hover:not(:disabled) { border-color: var(--accent-ring); color: var(--accent); }
.nav-arrow:disabled { opacity: .35; cursor: not-allowed; }
.today-btn {
  padding: 5px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--accent);
  font-size: var(--fs-caption);
  font-family: inherit;
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: all var(--dur-base);
}
.today-btn:hover { border-color: var(--accent-ring); background: var(--accent-soft); }
/* 日历按钮的隐藏原生输入：占位不占视觉，showPicker 依赖其渲染（故不用 display:none） */
.date-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

.panels { display: flex; flex-direction: column; gap: var(--s5); }

.feedback {
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  font-size: var(--fs-small);
  line-height: var(--lh-base);
  white-space: pre-line;
}
.feedback.success { background: var(--accent-soft); color: var(--accent); }
.feedback.warn { background: var(--warn-soft); color: var(--warn); }
.feedback.info { background: var(--accent-soft); color: var(--text-muted); }
.feedback.error { background: var(--danger-soft); color: var(--danger); }
</style>
