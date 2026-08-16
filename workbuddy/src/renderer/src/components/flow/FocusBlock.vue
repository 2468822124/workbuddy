<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { FlowMonthGoal, FlowWeekFocus } from '@shared/flowTypes'

const props = defineProps<{
  focus: FlowWeekFocus[]
  /** 当月末关闭目标（选取下拉） */
  openGoals: FlowMonthGoal[]
  /** 弱级联显示标题（monthGoalId → 月目标实时标题） */
  titleOf: (f: FlowWeekFocus) => string
  /** 防重复转（本周已有同名 temp 实例） */
  transferredOf: (f: FlowWeekFocus) => boolean
}>()

const emit = defineEmits<{
  add: [title: string, monthGoalId: number | null]
  toggleDone: [f: FlowWeekFocus]
  transfer: [f: FlowWeekFocus]
  remove: [id: number]
}>()

const adding = ref(false)
const title = ref('')
const goalId = ref<string>('')
const confirmId = ref<number | null>(null)

/** 选取月目标时自动带入标题（规格 §5.3「选中带入标题」；手写后选目标可覆盖） */
watch(goalId, (id) => {
  if (!id) return
  const g = props.openGoals.find(g => g.id === Number(id))
  if (g) title.value = g.title
})

function submit(): void {
  const t = title.value.trim()
  if (!t) return
  const gid = goalId.value ? Number(goalId.value) : null
  emit('add', t, gid)
  title.value = ''
  goalId.value = ''
  adding.value = false
}
</script>

<template>
  <section class="focus card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="Target" :size="18" />
        <h2>本周核心推进目标</h2>
        <span class="count-chip">{{ focus.length }}</span>
      </div>
      <button class="icon-btn" title="添加核心目标" :disabled="adding" @click="adding = !adding">
        <AppIcon name="Plus" />
      </button>
    </header>

    <form v-if="adding" class="add-row" @submit.prevent="submit">
      <input v-model="title" class="input" placeholder="手写一个目标" autofocus />
      <select v-model="goalId" class="input select">
        <option value="">或从月目标选取…</option>
        <option v-for="g in openGoals" :key="g.id" :value="String(g.id)">{{ g.title }}</option>
      </select>
      <button type="submit" class="btn primary" :disabled="!title.trim()">添加</button>
    </form>

    <ul v-if="focus.length" class="focus-list">
      <li v-for="f in focus" :key="f.id" class="focus-row" :class="{ done: f.doneAt !== null }">
        <button class="dot" :title="f.doneAt ? '取消完成' : '标记完成'" @click="emit('toggleDone', f)">
          <AppIcon v-if="f.doneAt" name="Check" :size="14" />
        </button>
        <span class="focus-title">{{ titleOf(f) }}</span>
        <button
          class="tiny-btn"
          :disabled="transferredOf(f)"
          :title="transferredOf(f) ? '已转周任务' : '复制断链转周任务'"
          @click="emit('transfer', f)"
        >
          <AppIcon name="MoveRight" :size="14" />
          <span>{{ transferredOf(f) ? '已转' : '转周任务' }}</span>
        </button>
        <button
          v-if="confirmId !== f.id"
          class="icon-btn mini"
          title="删除"
          @click="confirmId = f.id"
        >
          <AppIcon name="Trash2" :size="15" />
        </button>
        <span v-else class="confirm-bar">
          <button class="tiny-btn danger" @click="emit('remove', f.id); confirmId = null">确认删除</button>
          <button class="tiny-btn" @click="confirmId = null">取消</button>
        </span>
      </li>
    </ul>
    <div v-else-if="!adding" class="muted-hint">从月目标选取或手写添加，本周最重要的 3~5 件事</div>
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
  min-height: 0;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
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
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-md);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--accent); }
.icon-btn:disabled { opacity: .4; cursor: default; }
.icon-btn.mini { width: 28px; height: 28px; }
.add-row { display: flex; gap: var(--s2); flex-wrap: wrap; }
.input {
  font-family: inherit;
  font-size: var(--fs-body);
  padding: 8px 12px;
  border-radius: var(--r-md);
  border: 1px solid var(--border-soft);
  background: var(--bg-sunken);
  color: var(--text-base);
  outline: none;
  flex: 1;
  min-width: 160px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ring); }
.select { flex: 0 0 auto; }
.btn.primary {
  font-family: inherit;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  padding: 8px 16px;
  border-radius: var(--r-md);
  border: none;
  background: var(--accent);
  color: var(--text-on-primary);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.btn.primary:hover { background: var(--accent-hover); }
.btn.primary:disabled { opacity: .5; cursor: default; }
.focus-list { list-style: none; display: flex; flex-direction: column; gap: var(--s2); }
.focus-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s2) var(--s3);
  border-radius: var(--r-md);
  transition: background var(--dur-fast);
}
.focus-row:hover { background: var(--bg-hover); }
.focus-row.done .focus-title { color: var(--text-faint); text-decoration: line-through; }
.dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--border-strong);
  background: var(--bg-surface);
  color: var(--text-on-primary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--dur-base) var(--ease-out);
}
.focus-row.done .dot { background: var(--accent); border-color: var(--accent); }
.focus-title { flex: 1; font-size: var(--fs-body); color: var(--text-base); min-width: 0; }
.tiny-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s1);
  font-family: inherit;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-soft);
  border-radius: var(--r-sm);
  padding: 3px 8px;
  cursor: pointer;
  transition: all var(--dur-fast);
  white-space: nowrap;
}
.tiny-btn:hover { background: var(--bg-hover); color: var(--accent); }
.tiny-btn:disabled { opacity: .45; cursor: default; color: var(--text-disabled); }
.tiny-btn.danger:hover { background: var(--danger-faint); color: var(--danger); border-color: var(--danger); }
.confirm-bar { display: inline-flex; gap: var(--s1); }
.muted-hint { font-size: var(--fs-small); color: var(--text-faint); padding: var(--s2); }
</style>
