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
const fw = useFlowWeek()

const today = fw.todayStr()

const isCurrentWeek = computed(() => fw.weekStart.value === getWeekStart(today))

/** 周导航：router.replace 改 ?week= 查询 → watch 触发 reload（URL 即状态） */
function navigate(week: string): void {
  router.replace({ query: { ...route.query, week } })
}

watch(
  () => route.query.week,
  q => {
    const target = parseWeekQuery(q, today)
    if (target !== fw.weekStart.value) fw.load(target)
  },
)

onMounted(() => fw.load(parseWeekQuery(route.query.week, today)))

/** id → 完成态（board 内联实时派生） */
const completions = computed<Record<number, InstanceCompletion>>(() => {
  const m: Record<number, InstanceCompletion> = {}
  for (const i of fw.board.value?.instances ?? []) m[i.id] = i.completion
  return m
})

const badgeOf = (inst: FlowWeekInstance): string | null => fixedBadge(inst, fw.fixedDefs.value)
const vouchersOfInst = (inst: FlowWeekInstance) => vouchersOf(inst.id, fw.board.value?.vouchers ?? [])
const titleOf = (f: FlowWeekFocus): string => focusDisplayTitle(f, fw.monthGoalMap.value)
const transferredOf = (f: FlowWeekFocus): boolean => hasTransferred(f, fw.board.value?.instances ?? [])
</script>

<template>
  <div class="page">
    <WeekNav
      :label="fw.weekStart ? weekLabel(fw.weekStart) : ''"
      :is-current-week="isCurrentWeek"
      @prev="navigate(shiftWeek(fw.weekStart, -1))"
      @current="navigate(getWeekStart(today))"
      @next="navigate(shiftWeek(fw.weekStart, 1))"
    />

    <!-- 反馈条（错误 8s / 信息 4s 自动消隐；IPC err 可见，禁静默） -->
    <div v-if="fw.error" class="feedback error">{{ fw.error }}</div>
    <div v-else-if="fw.info" class="feedback info">{{ fw.info }}</div>

    <div v-if="fw.loading && !fw.board" class="loading">加载中…</div>
    <div v-else-if="!fw.board" class="loading error-text">面板加载失败，请重试</div>
    <template v-else>
      <div class="grid">
        <!-- 上半：核心目标 + 每周固定（Bento 双列） -->
        <FocusBlock
          :focus="fw.board.focus"
          :open-goals="fw.openGoals"
          :title-of="titleOf"
          :transferred-of="transferredOf"
          @add="fw.addFocus($event.title, $event.monthGoalId)"
          @toggle-done="fw.toggleFocusDone($event)"
          @transfer="fw.transferFocus($event)"
          @remove="fw.deleteFocus($event)"
        />
        <FixedDefsPanel
          :fixed-defs="fw.fixedDefs"
          @create="fw.saveFixedDef($event)"
          @save="fw.saveFixedDef($event)"
          @delete="fw.deleteFixedDef($event)"
        />

        <!-- 下半：任务清单 + 固定待安排（全宽） -->
        <InstanceList
          class="span2"
          :instances="fw.board.instances"
          :completions="completions"
          :badge-of="badgeOf"
          :vouchers-of="vouchersOfInst"
          :is-history="isHistoryWeek(fw.weekStart, today)"
          @create="fw.createTemp($event.title, $event.kind, $event.targetCount)"
          @rename="(id, title) => fw.renameInstance(id, title)"
          @rename-guide="fw.setInfo('固定任务请在左侧「每周固定」里改名（仅影响未来克隆）')"
          @delete="fw.deleteInstance($event)"
          @skip="fw.skipInstance($event)"
          @carry-next="fw.carryNext($event)"
          @complete="fw.manualComplete($event)"
          @add-session="fw.addSession($event)"
          @voucher-delete="fw.voucherDelete($event)"
          @voucher-update="(id, data) => fw.voucherUpdate(id, data)"
        />
        <RailBlock class="span2" :rail="fw.board.rail" :badge-of="badgeOf" />
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
