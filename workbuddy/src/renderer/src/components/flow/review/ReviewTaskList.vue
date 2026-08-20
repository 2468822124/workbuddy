<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { FlowReviewTask } from '@shared/flowTypes'

const props = defineProps<{
  tasks: FlowReviewTask[]
  isClosed: boolean
  /** 转下周进行中的实例 id（防双击/防连点；null=空闲） */
  carryingId: number | null
}>()

// F3（复审批次2）：defineEmits 必须赋值绑定 —— 未绑定时 script 内 `emit` 为 undefined，
// confirmCarry 点击确认即抛 TypeError。
const emit = defineEmits<{ carry: [id: number] }>()

/** 行内确认（F3）：点「转下周」先展开确认条，确认后才 emit carry；取消恢复原样 */
const confirmId = ref<number | null>(null)

function ask(id: number): void {
  confirmId.value = id
}

function cancelConfirm(): void {
  confirmId.value = null
}

function confirmCarry(id: number): void {
  emit('carry', id) // 动作中父级 carryingId 驱动禁用；失败后确认条保留可重试
}

/** 状态徽标文案：done → 已完成；unfinished → 未完成；skipped → 已跳过 */
function statusText(status: FlowReviewTask['status']): string {
  if (status === 'done') return '已完成'
  if (status === 'skipped') return '已跳过'
  return '未完成'
}
</script>

<template>
  <section class="list card">
    <header class="head">
      <h3 class="title">周任务状态</h3>
      <span class="hint">未完成任务（历史周）可「转下周」显式清债</span>
    </header>

    <div v-if="tasks.length === 0" class="empty">本周无任务</div>
    <ul v-else class="rows">
      <li v-for="t in tasks" :key="t.id" class="row" :class="t.status">
        <div class="title-col">
          <span class="dot" :class="t.status" />
          <span class="name">{{ t.title }}</span>
          <span v-if="t.origin === 'fixed'" class="badge">固定</span>
          <span v-if="t.kind === 'multi'" class="badge">多次 · {{ t.completion.doneCount }}/{{ t.targetCount }}</span>
          <span v-if="t.unarranged" class="badge warn">未安排</span>
        </div>
        <div class="status">
          <span class="chip" :class="t.status">{{ statusText(t.status) }}</span>
          <template v-if="t.carryable && isClosed">
            <template v-if="confirmId === t.id">
              <span class="confirm-text">确认转为下周一次性任务？</span>
              <button class="confirm-btn" :disabled="carryingId !== null" @click="confirmCarry(t.id)">确认</button>
              <button class="cancel-btn" :disabled="carryingId !== null" @click="cancelConfirm()">取消</button>
              <span v-if="carryingId === t.id" class="carrying">转出中…</span>
            </template>
            <button v-else class="carry-btn" title="生成下周一次性任务（显式清债）" @click="ask(t.id)">
              <AppIcon name="CornerUpRight" size="15" />
              转下周
            </button>
          </template>
        </div>
      </li>
    </ul>
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
  margin-bottom: var(--s4);
}
.title { margin: 0; font-size: var(--fs-h2); font-weight: var(--fw-semibold); color: var(--text-strong); }
.hint { font-size: var(--fs-caption); color: var(--text-faint); }
.empty { padding: var(--s8) 0; text-align: center; color: var(--text-faint); font-size: var(--fs-small); }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s2); }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  background: var(--bg-sunken);
}
.row.done { opacity: .6; }
.title-col {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-width: 0;
}
.name {
  font-size: var(--fs-body);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row.done .name { text-decoration: line-through; color: var(--text-muted); }
.row.skipped .name { color: var(--text-muted); }
.dot { width: 8px; height: 8px; border-radius: var(--r-pill); flex: none; }
.dot.done { background: var(--ok); }
.dot.unfinished { background: var(--warn); }
.dot.skipped { background: var(--text-faint); }
.badge {
  flex: none;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-pill);
  padding: 1px var(--s2);
}
.badge.warn { color: var(--warn); border-color: var(--warn); }
.status { display: flex; align-items: center; gap: var(--s3); flex: none; }
.chip {
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  border-radius: var(--r-pill);
  padding: 2px var(--s3);
}
.chip.done { color: var(--ok); background: var(--ok-soft); }
.chip.unfinished { color: var(--warn); background: var(--warn-soft); }
.chip.skipped { color: var(--text-muted); background: var(--bg-hover); }
.carry-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s1);
  font-family: inherit;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-ring);
  border-radius: var(--r-md);
  padding: var(--s2) var(--s3);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.carry-btn:hover { background: var(--accent); color: var(--text-on-primary); }
.carry-btn:active { transform: translateY(1px); }
.confirm-text { font-size: var(--fs-caption); color: var(--text-muted); white-space: nowrap; }
.confirm-btn, .cancel-btn {
  font-family: inherit;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  border-radius: var(--r-md);
  padding: var(--s2) var(--s3);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.confirm-btn {
  color: var(--text-on-primary);
  background: var(--accent);
  border: 1px solid var(--accent);
}
.confirm-btn:hover:not(:disabled) { filter: brightness(1.08); }
.cancel-btn {
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
}
.cancel-btn:hover:not(:disabled) { background: var(--bg-hover); }
.confirm-btn:disabled, .cancel-btn:disabled { opacity: .5; cursor: not-allowed; }
.carrying { font-size: var(--fs-caption); color: var(--accent); white-space: nowrap; }
@media (max-width: 640px) {
  .row { flex-direction: column; align-items: flex-start; }
  .status { flex-wrap: wrap; }
}
</style>
