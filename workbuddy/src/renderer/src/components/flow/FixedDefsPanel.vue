<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { weekdayMaskToLabels } from '@/composables/useFlowWeek'
import type { FlowFixedDef } from '@shared/flowTypes'

const props = defineProps<{
  fixedDefs: FlowFixedDef[]
  effectiveWeekStart: string
}>()

const emit = defineEmits<{
  create: [input: { title: string; kind: 'once' | 'multi'; targetCount?: number; weekdayMask?: number }]
  save: [input: { id: number; title: string; kind: 'once' | 'multi'; targetCount?: number; weekdayMask?: number }]
  delete: [id: number]
}>()

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const adding = ref(false)
const title = ref('')
const kind = ref<'once' | 'multi'>('once')
const count = ref(1)
const days = ref<boolean[]>([false, false, false, false, false, false, false])

/** 7 复选 → mask（bit0=周一 … bit6=周日） */
function maskFrom(days: boolean[]): number {
  return days.reduce((acc, on, i) => (on ? acc | (1 << i) : acc), 0)
}

const mask = computed(() => maskFrom(days.value))
const hasDay = computed(() => mask.value !== 0)

function submit(): void {
  const t = title.value.trim()
  if (!t) return
  const n = Math.min(99, Math.max(1, Math.round(count.value) || 1))
  emit('create', {
    title: t,
    kind: kind.value,
    targetCount: kind.value === 'multi' ? n : undefined,
    weekdayMask: hasDay.value ? mask.value : undefined,
  })
  title.value = ''
  kind.value = 'once'
  count.value = 1
  days.value = [false, false, false, false, false, false, false]
  adding.value = false
}

/** 行内编辑态（按 def.id） */
const editingId = ref<number | null>(null)
const editTitle = ref('')
const editDays = ref<boolean[]>([])
const confirmId = ref<number | null>(null)

function startEdit(d: FlowFixedDef): void {
  editingId.value = d.id
  editTitle.value = d.title
  editDays.value = Array.from({ length: 7 }, (_, i) => (d.weekdayMask & (1 << i)) !== 0)
}

function saveEdit(d: FlowFixedDef): void {
  const t = editTitle.value.trim()
  if (!t) return
  const m = maskFrom(editDays.value)
  emit('save', {
    id: d.id,
    title: t,
    kind: d.kind,
    targetCount: d.kind === 'multi' ? d.targetCount : undefined,
    weekdayMask: m === 0 ? undefined : m,
  })
  editingId.value = null
}

function dayLabels(d: FlowFixedDef): string {
  const ls = weekdayMaskToLabels(d.weekdayMask)
  return ls.length === 0 ? '无惯常日' : ls.join('/')
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="Repeat" :size="18" />
        <h2>每周固定</h2>
        <span class="count-chip">{{ fixedDefs.length }}</span>
      </div>
      <button class="icon-btn" :title="adding ? '收起' : '新建固定任务'" @click="adding = !adding">
        <AppIcon :name="adding ? 'ChevronUp' : 'Plus'" />
      </button>
    </header>

    <!-- 新建：标题 + 类型 + 场次 + 惯常日 7 复选 → mask -->
    <form v-if="adding" class="add-form" @submit.prevent="submit">
      <div class="row">
        <input v-model="title" class="input" placeholder="固定任务名（每周克隆）" autofocus />
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
      </div>
      <div class="day-picker">
        <span class="picker-label">惯常日：</span>
        <label v-for="(on, i) in days" :key="i" class="day-chip" :class="{ on }">
          <input v-model="days[i]" type="checkbox" class="visually-hidden" />
          {{ WEEKDAY_LABELS[i] }}
        </label>
        <span class="day-hint">不选 = 无惯常日（新周在清单出现，不进固定栏）</span>
      </div>
      <button type="submit" class="btn primary" :disabled="!title.trim()">保存</button>
    </form>

    <ul v-if="fixedDefs.length" class="def-list">
      <li v-for="d in fixedDefs" :key="d.id" class="def-row">
        <template v-if="editingId === d.id">
          <div class="row">
            <input v-model="editTitle" class="input" />
          </div>
          <div class="day-picker">
            <label v-for="(on, i) in editDays" :key="i" class="day-chip" :class="{ on }">
              <input v-model="editDays[i]" type="checkbox" class="visually-hidden" />
              {{ WEEKDAY_LABELS[i] }}
            </label>
            <span class="day-hint">改名与惯常日仅影响未来克隆，本周实例不受影响</span>
          </div>
          <div class="def-actions">
            <button class="tiny-btn primary" :disabled="!editTitle.trim()" @click="saveEdit(d)">保存</button>
            <button class="tiny-btn" @click="editingId = null">取消</button>
          </div>
        </template>
        <template v-else>
          <span class="kind-chip">{{ d.kind === 'multi' ? `场次 ×${d.targetCount}` : '一次' }}</span>
          <span class="def-title">{{ d.title }}</span>
          <span class="days">{{ dayLabels(d) }}</span>
          <div class="def-actions">
            <button class="tiny-btn" @click="startEdit(d)">改名/惯常日</button>
            <button
              v-if="confirmId !== d.id"
              class="tiny-btn danger"
              :title="`从 ${effectiveWeekStart} 起停用；生效周和已进入日任务的存量保留`"
              @click="confirmId = d.id"
            >
              停用
            </button>
            <template v-else>
              <span class="confirm-hint">
                从 {{ effectiveWeekStart }} 起；生效周和已进入日任务的存量保留，未进入的未来实例隐藏
              </span>
              <button class="tiny-btn danger solid" @click="emit('delete', d.id); confirmId = null">确认停用</button>
              <button class="tiny-btn" @click="confirmId = null">取消</button>
            </template>
          </div>
        </template>
      </li>
    </ul>
    <div v-else-if="!adding" class="empty">无固定任务，点右上 + 新建（每周自动克隆）</div>
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
.add-form { display: flex; flex-direction: column; gap: var(--s2); }
.row { display: flex; gap: var(--s2); flex-wrap: wrap; }
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
.day-picker { display: flex; align-items: center; gap: var(--s1); flex-wrap: wrap; }
.picker-label { font-size: var(--fs-small); color: var(--text-muted); }
.day-chip {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-pill);
  padding: 3px 10px;
  cursor: pointer;
  user-select: none;
  transition: all var(--dur-fast);
}
.day-chip:hover { background: var(--bg-hover); }
.day-chip.on { color: var(--accent); background: var(--accent-soft); border-color: var(--accent-ring); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.day-hint { font-size: var(--fs-caption); color: var(--text-faint); margin-left: auto; }
.btn.primary {
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  padding: 8px 16px; border-radius: var(--r-md);
  border: none; background: var(--accent); color: var(--text-on-primary);
  cursor: pointer; transition: all var(--dur-fast);
  align-self: flex-start;
}
.btn.primary:hover { background: var(--accent-hover); }
.btn.primary:disabled { opacity: .5; cursor: default; }
.def-list { list-style: none; display: flex; flex-direction: column; gap: var(--s2); }
.def-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  transition: background var(--dur-fast);
}
.def-row:hover { background: var(--bg-hover); }
.kind-chip {
  font-size: var(--fs-caption);
  color: var(--cat-work);
  background: var(--cat-work-soft);
  border-radius: var(--r-pill);
  padding: 2px 8px;
  flex-shrink: 0;
}
.def-title { font-size: var(--fs-body); color: var(--text-strong); flex: 1; min-width: 0; }
.days { font-size: var(--fs-caption); color: var(--text-muted); flex-shrink: 0; }
.def-actions { display: flex; gap: var(--s1); flex-shrink: 0; }
.confirm-hint { font-size: var(--fs-caption); color: var(--danger); align-self: center; }
.tiny-btn {
  font-family: inherit; font-size: var(--fs-caption);
  color: var(--text-muted); background: transparent;
  border: 1px solid var(--border-soft); border-radius: var(--r-sm);
  padding: 3px 8px; cursor: pointer; transition: all var(--dur-fast);
}
.tiny-btn:hover { background: var(--bg-hover); color: var(--accent); }
.tiny-btn.primary { color: var(--accent); border-color: var(--accent-ring); background: var(--accent-soft); }
.tiny-btn.primary:disabled { opacity: .45; cursor: default; }
.tiny-btn.danger:hover { background: var(--danger-faint); color: var(--danger); border-color: var(--danger); }
.tiny-btn.danger.solid { background: var(--danger); border-color: var(--danger); color: var(--text-on-primary); }
.empty { font-size: var(--fs-small); color: var(--text-faint); padding: var(--s2); }
</style>
