<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { monthLabel, parseMonthQuery, shiftMonth, useFlowMonth } from '@/composables/useFlowMonth'
import AppIcon from '@/components/AppIcon.vue'
import type { FlowMonthGoal } from '@shared/flowTypes'

const route = useRoute()
const router = useRouter()
const fm = useFlowMonth()

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const today = todayStr()

/** 月导航：router.replace 改 ?month= 查询 → watch 触发 reload（URL 即状态） */
function navigate(month: string): void {
  router.replace({ query: { ...route.query, month } })
}

watch(
  () => route.query.month,
  q => {
    const target = parseMonthQuery(q, today)
    if (target !== fm.month.value) fm.load(target)
  },
)

onMounted(() => fm.load(parseMonthQuery(route.query.month, today)))

// 新建 / 改名 / 关闭 / 删除
const adding = ref(false)
const title = ref('')
const editingId = ref<number | null>(null)
const editTitle = ref('')
const confirmId = ref<number | null>(null)
const histConfirmId = ref<number | null>(null)

/** 历史未关闭（跨月滚动）展开态 */
const showHistory = ref(false)

function submit(): void {
  const t = title.value.trim()
  if (!t) return
  fm.save(t)
  title.value = ''
  adding.value = false
}

function startEdit(g: FlowMonthGoal): void {
  editingId.value = g.id
  editTitle.value = g.title
}

function saveEdit(g: FlowMonthGoal): void {
  const t = editTitle.value.trim()
  if (!t) return
  fm.save(t, g.id)
  editingId.value = null
}
</script>

<template>
  <div class="page">
    <div class="month-nav">
      <button class="nav-btn" title="上一月" @click="navigate(shiftMonth(fm.month, -1))">
        <AppIcon name="ChevronLeft" />
      </button>
      <button v-if="fm.month !== today.slice(0, 7)" class="nav-btn today-btn" title="回到本月" @click="navigate(today.slice(0, 7))">
        本月
      </button>
      <div class="label">{{ monthLabel(fm.month) }}</div>
      <button class="nav-btn" title="下一月" @click="navigate(shiftMonth(fm.month, 1))">
        <AppIcon name="ChevronRight" />
      </button>
    </div>

    <div v-if="fm.error" class="feedback error">{{ fm.error }}</div>
    <div v-else-if="fm.info" class="feedback info">{{ fm.info }}</div>

    <section class="card">
      <header class="card-head">
        <div class="head-title">
          <AppIcon name="Target" :size="18" />
          <h2>月目标</h2>
          <span class="count-chip">{{ fm.goals.length }}</span>
        </div>
        <button class="icon-btn" :title="adding ? '收起' : '新建月目标'" @click="adding = !adding">
          <AppIcon :name="adding ? 'ChevronUp' : 'Plus'" />
        </button>
      </header>

      <form v-if="adding" class="add-row" @submit.prevent="submit">
        <input v-model="title" class="input" placeholder="本月想完成什么？" autofocus />
        <button type="submit" class="btn primary" :disabled="!title.trim()">添加</button>
      </form>

      <!-- 超过 5 个 → 软提示（非阻断） -->
      <p v-if="fm.goals.length > 5" class="soft-hint">
        <AppIcon name="Info" :size="14" />
        本月目标超过 5 个，建议精简聚焦
      </p>

      <ul v-if="fm.goals.length" class="goal-list">
        <li v-for="g in fm.goals" :key="g.id" class="goal-row" :class="{ closed: g.closedAt !== null }">
          <template v-if="editingId === g.id">
            <input v-model="editTitle" class="input" @keyup.enter="saveEdit(g)" @keyup.esc="editingId = null" />
            <button class="tiny-btn primary" :disabled="!editTitle.trim()" @click="saveEdit(g)">保存</button>
            <button class="tiny-btn" @click="editingId = null">取消</button>
          </template>
          <template v-else>
            <span class="goal-title">{{ g.title }}</span>
            <span v-if="g.closedAt" class="badge closed">已关闭</span>
            <div class="goal-actions">
              <button class="tiny-btn" :disabled="g.closedAt !== null" @click="startEdit(g)">改名</button>
              <template v-if="confirmId === `close-${g.id}`">
                <button class="tiny-btn danger solid" @click="fm.closeGoal(g); confirmId = null">确认关闭</button>
                <button class="tiny-btn" @click="confirmId = null">取消</button>
              </template>
              <template v-else-if="confirmId === `del-${g.id}`">
                <button class="tiny-btn danger solid" @click="fm.deleteGoal(g.id); confirmId = null">确认删除</button>
                <button class="tiny-btn" @click="confirmId = null">取消</button>
              </template>
              <template v-else>
                <button
                  v-if="g.closedAt === null"
                  class="tiny-btn"
                  title="手动关闭；未关闭目标跨月滚动展示"
                  @click="confirmId = `close-${g.id}`"
                >
                  关闭
                </button>
                <button class="tiny-btn danger" title="删除目标" @click="confirmId = `del-${g.id}`">删除</button>
              </template>
            </div>
          </template>
        </li>
      </ul>
      <div v-else-if="!adding" class="empty">本月暂无目标，点右上 + 新建</div>
    </section>

    <!-- 历史未关闭目标（默认收进展开区；无自动结算，跨月滚动） -->
    <section v-if="fm.historyUnclosed.length" class="card history">
      <button class="history-toggle" @click="showHistory = !showHistory">
        <AppIcon :name="showHistory ? 'ChevronDown' : 'ChevronRight'" :size="16" />
        <span>历史未关闭目标（{{ fm.historyUnclosed.length }}）</span>
      </button>
      <ul v-if="showHistory" class="goal-list">
        <li v-for="g in fm.historyUnclosed" :key="g.id" class="goal-row closed">
          <span class="goal-title">{{ g.title }}</span>
          <span class="badge month">{{ g.month }}</span>
          <div class="goal-actions">
            <template v-if="histConfirmId === g.id">
              <button class="tiny-btn danger solid" @click="fm.deleteGoal(g.id); histConfirmId = null">确认删除</button>
              <button class="tiny-btn" @click="histConfirmId = null">取消</button>
            </template>
            <button v-else class="tiny-btn danger" @click="histConfirmId = g.id">删除</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.page { padding: var(--s4); display: flex; flex-direction: column; gap: var(--s3); max-width: 860px; margin: 0 auto; }
.month-nav { display: flex; align-items: center; gap: var(--s3); padding: var(--s4) var(--s2); }
.nav-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 36px; height: 36px; padding: 0 var(--s3);
  border-radius: var(--r-md); border: 1px solid var(--border-soft);
  background: var(--bg-surface); color: var(--text-muted);
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  cursor: pointer; transition: all var(--dur-fast) var(--ease-out);
}
.nav-btn:hover { background: var(--bg-hover); color: var(--accent); border-color: var(--accent-ring); }
.label {
  flex: 1; text-align: center;
  font-size: var(--fs-h2); font-weight: var(--fw-semibold);
  color: var(--text-strong); letter-spacing: var(--tracking-wide);
}
.feedback {
  font-size: var(--fs-small); border-radius: var(--r-md);
  padding: var(--s3) var(--s4); margin: 0 var(--s2);
}
.feedback.error { color: var(--danger); background: var(--danger-faint); border: 1px solid var(--danger); }
.feedback.info { color: var(--ok); background: var(--ok-soft); border: 1px solid var(--ok); }
.card {
  background: var(--bg-surface); border: 1px solid var(--border-soft);
  border-radius: var(--r-xl); padding: var(--s6);
  box-shadow: var(--shadow-sm);
  display: flex; flex-direction: column; gap: var(--s4);
}
.card-head { display: flex; align-items: center; justify-content: space-between; }
.head-title { display: flex; align-items: center; gap: var(--s2); color: var(--accent); }
.head-title h2 { font-size: var(--fs-h2); font-weight: var(--fw-semibold); color: var(--text-strong); }
.count-chip {
  font-size: var(--fs-caption); color: var(--accent); background: var(--accent-soft);
  border-radius: var(--r-pill); padding: 2px 8px; letter-spacing: var(--tracking-wide);
}
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: var(--r-md);
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all var(--dur-fast) var(--ease-out);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--accent); }
.add-row { display: flex; gap: var(--s2); }
.input {
  font-family: inherit; font-size: var(--fs-body);
  padding: 8px 12px; border-radius: var(--r-md);
  border: 1px solid var(--border-soft); background: var(--bg-sunken);
  color: var(--text-base); outline: none; flex: 1; min-width: 160px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ring); }
.btn.primary {
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  padding: 8px 16px; border-radius: var(--r-md);
  border: none; background: var(--accent); color: var(--text-on-primary);
  cursor: pointer; transition: all var(--dur-fast);
}
.btn.primary:hover { background: var(--accent-hover); }
.btn.primary:disabled { opacity: .5; cursor: default; }
.soft-hint {
  display: flex; align-items: center; gap: var(--s1);
  font-size: var(--fs-caption); color: var(--warn);
  background: var(--warn-soft); border-radius: var(--r-md);
  padding: var(--s2) var(--s3);
}
.goal-list { list-style: none; display: flex; flex-direction: column; gap: var(--s2); }
.goal-row {
  display: flex; align-items: center; gap: var(--s3);
  padding: var(--s3) var(--s4); border-radius: var(--r-md);
  transition: background var(--dur-fast);
}
.goal-row:hover { background: var(--bg-hover); }
.goal-row.closed .goal-title { color: var(--text-faint); text-decoration: line-through; }
.goal-title { flex: 1; min-width: 0; font-size: var(--fs-body); color: var(--text-strong); }
.badge {
  font-size: var(--fs-caption); letter-spacing: var(--tracking-wide);
  border-radius: var(--r-pill); padding: 2px 9px; flex-shrink: 0;
}
.badge.closed { color: var(--text-faint); background: var(--bg-sunken); }
.badge.month { color: var(--cat-health); background: var(--warn-soft); }
.goal-actions { display: flex; gap: var(--s1); flex-shrink: 0; }
.tiny-btn {
  font-family: inherit; font-size: var(--fs-caption);
  color: var(--text-muted); background: transparent;
  border: 1px solid var(--border-soft); border-radius: var(--r-sm);
  padding: 3px 8px; cursor: pointer; transition: all var(--dur-fast);
}
.tiny-btn:hover { background: var(--bg-hover); color: var(--accent); }
.tiny-btn:disabled { opacity: .4; cursor: default; }
.tiny-btn.primary { color: var(--accent); border-color: var(--accent-ring); background: var(--accent-soft); }
.tiny-btn.primary:disabled { opacity: .45; cursor: default; }
.tiny-btn.danger:hover { background: var(--danger-faint); color: var(--danger); border-color: var(--danger); }
.tiny-btn.danger.solid { background: var(--danger); border-color: var(--danger); color: var(--text-on-primary); }
.empty { font-size: var(--fs-small); color: var(--text-faint); padding: var(--s2); }
.history { gap: var(--s2); }
.history-toggle {
  display: inline-flex; align-items: center; gap: var(--s1);
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  color: var(--text-muted); background: transparent;
  border: none; cursor: pointer; padding: var(--s1) var(--s2);
  border-radius: var(--r-sm); transition: all var(--dur-fast);
}
.history-toggle:hover { background: var(--bg-hover); color: var(--accent); }
</style>
