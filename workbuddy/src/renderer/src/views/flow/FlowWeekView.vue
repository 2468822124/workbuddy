<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  focusDisplayTitle,
  fixedBadge,
  hasTransferred,
  isHistoryWeek,
  parseWeekQuery,
  shiftWeek,
  useFlowWeek,
  vouchersOf,
  weekLabel,
} from '@/composables/useFlowWeek'
import { getWeekStart } from '@shared/period'
import type { FlowWeekFocus, FlowWeekInstance, InstanceCompletion } from '@shared/flowTypes'
import WeekNav from '@/components/flow/WeekNav.vue'
import FocusBlock from '@/components/flow/FocusBlock.vue'
import FixedDefsPanel from '@/components/flow/FixedDefsPanel.vue'
import InstanceList from '@/components/flow/InstanceList.vue'
import RailBlock from '@/components/flow/RailBlock.vue'

const route = useRoute()
const router = useRouter()
// 阶段6修复批次 · F2：顶层解构 refs（模板自动解包只在 script setup 顶层绑定生效；
// 普通对象属性 fw.weekStart 不解包 → weekLabel 收到 Ref → date.split 崩溃，白屏根因）
const {
  weekStart,
  board,
  fixedDefs,
  monthGoalMap,
  openGoals,
  loading,
  error,
  info,
  todayStr,
  load,
  setInfo,
  createTemp,
  renameInstance,
  deleteInstance,
  skipInstance,
  carryNext,
  manualComplete,
  addSession,
  voucherDelete,
  voucherUpdate,
  addFocus,
  toggleFocusDone,
  deleteFocus,
  transferFocus,
  saveFixedDef,
  deleteFixedDef,
} = useFlowWeek()

const today = todayStr()

const isCurrentWeek = computed(() => weekStart.value === getWeekStart(today))

/** 周导航：router.replace 改 ?week= 查询 → watch 触发 reload（URL 即状态） */
function navigate(week: string): void {
  router.replace({ query: { ...route.query, week } })
}

watch(
  () => route.query.week,
  q => {
    const target = parseWeekQuery(q, today)
    if (target !== weekStart.value) load(target)
  },
)

onMounted(() => load(parseWeekQuery(route.query.week, today)))

/** id → 完成态（board 内联实时派生） */
const completions = computed<Record<number, InstanceCompletion>>(() => {
  const m: Record<number, InstanceCompletion> = {}
  for (const i of board.value?.instances ?? []) m[i.id] = i.completion
  return m
})

const badgeOf = (inst: FlowWeekInstance): string | null => fixedBadge(inst, fixedDefs.value)
const vouchersOfInst = (inst: FlowWeekInstance) => vouchersOf(inst.id, board.value?.vouchers ?? [])
const titleOf = (f: FlowWeekFocus): string => focusDisplayTitle(f, monthGoalMap.value)
const transferredOf = (f: FlowWeekFocus): boolean => hasTransferred(f, board.value?.instances ?? [])

/** R1 Fix2（U-7）：board 逐行 carried（已存在 active 承接实例）→ 行内收敛 + 转周入口随生命周期消失 */
const carriedOf = (inst: FlowWeekInstance): boolean =>
  (board.value?.instances ?? []).some(i => i.id === inst.id && i.carried)
</script>

<template>
  <div class="page">
    <WeekNav
      :label="weekStart ? weekLabel(weekStart) : ''"
      :is-current-week="isCurrentWeek"
      @prev="navigate(shiftWeek(weekStart, -1))"
      @current="navigate(getWeekStart(today))"
      @next="navigate(shiftWeek(weekStart, 1))"
    />

    <!-- 反馈条（错误 8s / 信息 4s 自动消隐；IPC err 可见，禁静默） -->
    <div v-if="error" class="feedback error">{{ error }}</div>
    <div v-else-if="info" class="feedback info">{{ info }}</div>

    <div v-if="loading && !board" class="loading">加载中…</div>
    <div v-else-if="!board" class="loading error-text">面板加载失败，请重试</div>
    <template v-else>
      <div class="grid">
        <!-- 上半：核心目标 + 每周固定（Bento 双列） -->
        <FocusBlock
          :focus="board.focus"
          :open-goals="openGoals"
          :title-of="titleOf"
          :transferred-of="transferredOf"
          @add="(title, monthGoalId) => addFocus(title, monthGoalId)"
          @toggle-done="toggleFocusDone($event)"
          @transfer="transferFocus($event)"
          @remove="deleteFocus($event)"
        />
        <FixedDefsPanel
          :fixed-defs="fixedDefs"
          :effective-week-start="weekStart"
          @create="saveFixedDef($event)"
          @save="saveFixedDef($event)"
          @delete="deleteFixedDef($event)"
        />

        <!-- 下半：任务清单 + 固定待安排（全宽） -->
        <InstanceList
          class="span2"
          :instances="board.instances"
          :completions="completions"
          :badge-of="badgeOf"
          :vouchers-of="vouchersOfInst"
          :carried-of="carriedOf"
          :is-history="isHistoryWeek(weekStart, today)"
          @create="(title, kind, targetCount) => createTemp(title, kind, targetCount)"
          @rename="(id, title) => renameInstance(id, title)"
          @rename-guide="setInfo('固定任务请在左侧「每周固定」里改名（仅影响未来克隆）')"
          @delete="deleteInstance($event)"
          @skip="skipInstance($event)"
          @carry-next="carryNext($event)"
          @complete="manualComplete($event)"
          @add-session="addSession($event)"
          @voucher-delete="voucherDelete($event)"
          @voucher-update="(id, data) => voucherUpdate(id, data)"
        />
        <RailBlock class="span2" :rail="board.rail" :badge-of="badgeOf" />
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
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s4);
  align-items: start;
}
.span2 { grid-column: 1 / -1; }
@media (max-width: 980px) {
  .grid { grid-template-columns: 1fr; }
  .span2 { grid-column: auto; }
}
</style>
