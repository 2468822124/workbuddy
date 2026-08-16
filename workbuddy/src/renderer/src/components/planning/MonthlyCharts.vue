<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import CompletionRing from './CompletionRing.vue'
import { getMonthRange, getWeekStart, getWeekRange, isoWeekOf, nextPeriodStart } from '@shared/period'
import type { Todo } from '@shared/types'

// 月级确定性图表：整月宏观（环 + 分割条）+ 每周「条长=任务总数·填充=完成率」
const props = defineProps<{ monthStart: string }>()

const api = useApi()
const todos = ref<Todo[]>([])
const loading = ref(true)

interface WeekRow {
  label: string
  from: string
  to: string
  total: number
  done: number
}

const weeks = ref<WeekRow[]>([])

const monthEnd = computed(() => getMonthRange(props.monthStart)[1])

const monthTotal = computed(() => todos.value.length)
const monthDone = computed(() => {
  const from = props.monthStart
  const toEx = nextPeriodStart('daily', monthEnd.value)
  return todos.value.filter(
    t => t.status === 'done' && !!t.completedAt && t.completedAt >= from && t.completedAt < toEx,
  ).length
})
const monthPct = computed(() => (monthTotal.value === 0 ? 0 : Math.round((monthDone.value / monthTotal.value) * 100)))
const doneBarPct = computed(() => (monthTotal.value === 0 ? 0 : Math.round((monthDone.value / monthTotal.value) * 100)))

async function load() {
  loading.value = true
  const r = await api.todos.findInRange({ from: props.monthStart, to: monthEnd.value })
  todos.value = r.ok ? r.data : []
  weeks.value = buildWeeks(todos.value)
  loading.value = false
}

/** 月内按周切分（与月边界相交的周计入；截断到月）。 */
function buildWeeks(list: Todo[]): WeekRow[] {
  const out: WeekRow[] = []
  let w = props.monthStart
  while (w <= monthEnd.value) {
    const ws = getWeekStart(w)
    const we = getWeekRange(ws)[1]
    const from = ws >= props.monthStart ? ws : props.monthStart
    const to = we <= monthEnd.value ? we : monthEnd.value
    const toEx = nextPeriodStart('daily', to)
    const total = list.filter(t => t.planDate !== null && t.planDate >= from && t.planDate <= to).length
    const done = list.filter(
      t => t.status === 'done' && !!t.completedAt && t.completedAt >= from && t.completedAt < toEx,
    ).length
    out.push({ label: `W${isoWeekOf(ws)}`, from, to, total, done })
    w = nextPeriodStart('daily', we)
  }
  return out
}

const maxWeekTotal = computed(() => Math.max(1, ...weeks.value.map(w => w.total)))

watch(() => props.monthStart, load)
onMounted(load)
</script>

<template>
  <div class="charts">
    <div class="macro">
      <CompletionRing :done="monthDone" :total="monthTotal" :size="72" />
      <div class="macro-info">
        <div class="macro-nums">
          <b>{{ monthDone }}</b><span> 完成 / </span><b>{{ monthTotal }}</b><span> 总数</span>
        </div>
        <div class="split-bar">
          <div class="split-done" :style="{ width: doneBarPct + '%' }" />
        </div>
        <div class="split-labels">
          <span>完成 {{ doneBarPct }}%</span><span>未完成 {{ 100 - doneBarPct }}%</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="charts-state">加载中…</div>
    <div v-else class="week-list">
      <div v-for="wk in weeks" :key="wk.label" class="week-row">
        <span class="week-label">{{ wk.label }}</span>
        <div class="week-bar-track">
          <div
            class="week-bar"
            :style="{ width: Math.round((wk.total / maxWeekTotal) * 100) + '%', '--fill': Math.round((wk.done / (wk.total || 1)) * 100) + '%' }"
          />
        </div>
        <span class="week-nums">{{ wk.done }}/{{ wk.total }}</span>
        <span class="week-pct">{{ wk.total === 0 ? 0 : Math.round((wk.done / wk.total) * 100) }}%</span>
      </div>
      <div class="charts-caption">柱长 = 任务总数（相对本月最大周）· 填充 = 完成率</div>
    </div>
  </div>
</template>

<style scoped>
.charts {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  padding: var(--s4);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  background: var(--bg-surface-2);
}
.macro {
  display: flex;
  align-items: center;
  gap: var(--s5);
}
.macro-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--s2); }
.macro-nums { font-size: var(--fs-small); color: var(--text-muted); }
.macro-nums b { color: var(--accent); font-weight: var(--fw-bold); font-size: 16px; }
.split-bar {
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--bg-sunken);
  border: 1px solid var(--border-soft);
  overflow: hidden;
}
.split-done {
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--accent);
  transition: width var(--dur-base) var(--ease-out);
}
.split-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-faint);
}
.week-list { display: flex; flex-direction: column; gap: var(--s2); }
.week-row {
  display: grid;
  grid-template-columns: 44px 1fr 56px 44px;
  align-items: center;
  gap: var(--s3);
}
.week-label {
  font-size: 11px;
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
}
.week-bar-track {
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--bg-sunken);
  border: 1px solid var(--border-soft);
  overflow: hidden;
}
.week-bar {
  height: 100%;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--accent) 0 calc(var(--fill, 0) * 1%), var(--accent-light) calc(var(--fill, 0) * 1%) 100%);
  transition: width var(--dur-base) var(--ease-out);
}
.week-nums { font-size: 11px; color: var(--text-muted); text-align: right; }
.week-pct { font-size: 12px; font-weight: var(--fw-semibold); color: var(--accent); text-align: right; }
.charts-caption {
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: var(--tracking-wide);
  padding-top: var(--s1);
  border-top: 1px dashed var(--border);
}
.charts-state { text-align: center; color: var(--text-faint); font-size: var(--fs-caption); padding: var(--s4); }
</style>
