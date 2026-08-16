<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import InstanceRow from './InstanceRow.vue'
import type { FlowVoucherView, FlowWeekInstance, InstanceCompletion } from '@shared/flowTypes'

const props = defineProps<{
  instances: FlowWeekInstance[]
  /** id → 完成态（board 实时派生，禁止缓存字段） */
  completions: Record<number, InstanceCompletion>
  /** 固定徽标文字（fixed → `固定·一/三`；temp → null） */
  badgeOf: (inst: FlowWeekInstance) => string | null
  /** 本实例凭据（凭据弹层数据源） */
  vouchersOf: (inst: FlowWeekInstance) => FlowVoucherView[]
  /** 历史周 → 行内显示「转下周」 */
  isHistory: boolean
}>()

const emit = defineEmits<{
  create: [title: string, kind: 'once' | 'multi', targetCount: number]
  rename: [id: number, title: string]
  renameGuide: []
  delete: [id: number]
  skip: [id: number]
  carryNext: [id: number]
  complete: [id: number]
  addSession: [id: number]
  voucherDelete: [id: number]
  voucherUpdate: [id: number, data: { occurredAt?: string; note?: string | null }]
}>()

const adding = ref(false)
const title = ref('')
const kind = ref<'once' | 'multi'>('once')
/** multi 目标场次 N，clamp 1–99 */
const count = ref(1)

function submit(): void {
  const t = title.value.trim()
  if (!t) return
  const n = Math.min(99, Math.max(1, Math.round(count.value) || 1))
  emit('create', t, kind.value, n)
  title.value = ''
  kind.value = 'once'
  count.value = 1
  adding.value = false
}

// 展示层排序：跳过实例排清单尾部（规格 §5.2「排清单尾部」；纯展示性派生，不改变数据顺序）
const sortedInstances = computed(() => {
  const open: FlowWeekInstance[] = []
  const skipped: FlowWeekInstance[] = []
  for (const inst of props.instances) {
    const c = props.completions[inst.id]
    if (c?.skipped) skipped.push(inst)
    else open.push(inst)
  }
  return [...open, ...skipped]
})
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="ListChecks" :size="18" />
        <h2>本周任务清单</h2>
        <span class="count-chip">{{ instances.length }}</span>
      </div>
      <button class="icon-btn" :title="adding ? '收起' : '添加任务'" @click="adding = !adding">
        <AppIcon :name="adding ? 'ChevronUp' : 'Plus'" />
      </button>
    </header>

    <!-- 头部创建临时实例（本周临时，不回写任何上游） -->
    <form v-if="adding" class="add-row" @submit.prevent="submit">
      <input v-model="title" class="input" placeholder="要做什么？" autofocus />
      <select v-model="kind" class="input select">
        <option value="once">一次</option>
        <option value="multi">场次型</option>
      </select>
      <input
        v-if="kind === 'multi'"
        v-model.number="count"
        type="number"
        min="1"
        max="99"
        class="input count"
        title="目标场次 N（1–99）"
      />
      <button type="submit" class="btn primary" :disabled="!title.trim()">添加</button>
    </form>

    <ul v-if="sortedInstances.length" class="rows">
      <InstanceRow
        v-for="inst in sortedInstances"
        :key="inst.id"
        :inst="inst"
        :completion="completions[inst.id]"
        :badge="badgeOf(inst)"
        :is-history="isHistory"
        :vouchers="vouchersOf(inst)"
        @rename="(id, title) => emit('rename', id, title)"
        @rename-guide="emit('renameGuide')"
        @delete="emit('delete', inst.id)"
        @skip="emit('skip', inst.id)"
        @carry-next="emit('carryNext', inst.id)"
        @complete="emit('complete', inst.id)"
        @add-session="emit('addSession', inst.id)"
        @voucher-delete="emit('voucherDelete', $event)"
        @voucher-update="(id, data) => emit('voucherUpdate', id, data)"
      />
    </ul>
    <div v-else-if="!adding" class="empty">
      <AppIcon name="Inbox" :size="20" />
      <p>本周暂无任务，点右上 + 添加</p>
    </div>
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
}
.card-head { display: flex; align-items: center; justify-content: space-between; }
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
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: var(--r-md);
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all var(--dur-fast) var(--ease-out);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--accent); }
.add-row { display: flex; gap: var(--s2); flex-wrap: wrap; }
.input {
  font-family: inherit; font-size: var(--fs-body);
  padding: 8px 12px; border-radius: var(--r-md);
  border: 1px solid var(--border-soft); background: var(--bg-sunken);
  color: var(--text-base); outline: none;
  flex: 1; min-width: 160px;
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ring); }
.select { flex: 0 0 auto; min-width: 0; }
.count { flex: 0 0 80px; min-width: 0; }
.btn.primary {
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  padding: 8px 16px; border-radius: var(--r-md);
  border: none; background: var(--accent); color: var(--text-on-primary);
  cursor: pointer; transition: all var(--dur-fast);
}
.btn.primary:hover { background: var(--accent-hover); }
.btn.primary:disabled { opacity: .5; cursor: default; }
.rows { list-style: none; display: flex; flex-direction: column; }
.empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--s2);
  padding: var(--s6); color: var(--text-faint);
}
.empty p { font-size: var(--fs-small); }
</style>