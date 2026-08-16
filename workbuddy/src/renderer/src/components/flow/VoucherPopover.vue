<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { FlowVoucherView } from '@shared/flowTypes'

const props = defineProps<{
  vouchers: FlowVoucherView[]
  /** 空凭据（无 manual/extra，仅 check）时显示的占位标题 */
  instanceTitle: string
}>()

const emit = defineEmits<{
  close: []
  remove: [id: number]
  update: [id: number, data: { occurredAt?: string; note?: string | null }]
}>()

const KIND_LABEL: Record<FlowVoucherView['kind'], string> = {
  check: '勾选',
  manual: '手动',
  extra: '场次',
}

const editingId = ref<number | null>(null)
const editDate = ref('')
const editNote = ref('')
const confirmId = ref<number | null>(null)

/** check 凭据归到实例标题展示（无 manual/extra 时也可删勾选凭据回退完成态） */
const display = computed(() =>
  props.vouchers.map(v => ({ ...v, title: v.targetTitle || props.instanceTitle })),
)

function startEdit(v: FlowVoucherView): void {
  editingId.value = v.id
  editDate.value = v.occurredAt
  editNote.value = v.note ?? ''
}

function saveEdit(id: number): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate.value)) return
  emit('update', id, { occurredAt: editDate.value, note: editNote.value.trim() || null })
  editingId.value = null
}
</script>

<template>
  <div class="popover">
    <div class="backdrop" @click="emit('close')" />
    <div class="panel" role="menu" aria-label="完成凭据">
      <header class="pop-head">
        <span class="pop-title">完成凭据</span>
        <button class="icon-btn mini" title="关闭" @click="emit('close')">
          <AppIcon name="X" :size="15" />
        </button>
      </header>

      <ul v-if="display.length" class="voucher-list">
        <li v-for="v in display" :key="v.id" class="voucher-row">
          <span class="kind-chip" :class="v.kind">{{ KIND_LABEL[v.kind] }}</span>
          <div class="voucher-body">
            <div class="voucher-line">
              <span class="v-target">{{ v.title }}</span>
              <time class="v-date">{{ v.occurredAt }}</time>
            </div>
            <div v-if="v.note" class="v-note">{{ v.note }}</div>

            <form v-if="editingId === v.id" class="edit-form" @submit.prevent="saveEdit(v.id)">
              <input v-model="editDate" type="date" class="input" />
              <input v-model="editNote" class="input" placeholder="备注（可选）" />
              <button type="submit" class="tiny-btn primary" :disabled="!/^\d{4}-\d{2}-\d{2}$/.test(editDate)">保存</button>
              <button type="button" class="tiny-btn" @click="editingId = null">取消</button>
            </form>
            <div v-else class="v-actions">
              <button class="tiny-btn" @click="startEdit(v)">改日期/备注</button>
              <button v-if="confirmId !== v.id" class="tiny-btn danger" @click="confirmId = v.id">删</button>
              <template v-else>
                <button class="tiny-btn danger solid" @click="emit('remove', v.id); confirmId = null">确认删</button>
                <button class="tiny-btn" @click="confirmId = null">取消</button>
              </template>
            </div>
          </div>
        </li>
      </ul>
      <div v-else class="pop-empty">本任务暂无凭据</div>
    </div>
  </div>
</template>

<style scoped>
.popover { position: absolute; z-index: 30; }
.backdrop { position: fixed; inset: 0; }
.panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 300px;
  max-height: 340px;
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}
.pop-head { display: flex; align-items: center; justify-content: space-between; }
.pop-title { font-size: var(--fs-small); font-weight: var(--fw-semibold); color: var(--text-strong); }
.icon-btn.mini {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: var(--r-sm);
  border: none; background: transparent; color: var(--text-muted); cursor: pointer;
}
.icon-btn.mini:hover { background: var(--bg-hover); color: var(--accent); }
.voucher-list { list-style: none; display: flex; flex-direction: column; gap: var(--s2); }
.voucher-row { display: flex; gap: var(--s2); padding: var(--s2); border-radius: var(--r-md); background: var(--bg-surface-2); }
.kind-chip {
  font-size: var(--fs-caption);
  letter-spacing: var(--tracking-wide);
  border-radius: var(--r-pill);
  padding: 2px 8px;
  height: fit-content;
  color: var(--cat-learn);
  background: var(--cat-learn-soft);
}
.kind-chip.manual { color: var(--accent); background: var(--accent-soft); }
.kind-chip.extra { color: var(--cat-health); background: var(--warn-soft); }
.voucher-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--s2); }
.voucher-line { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); }
.v-target { font-size: var(--fs-small); color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-date { font-size: var(--fs-caption); color: var(--text-faint); flex-shrink: 0; }
.v-note { font-size: var(--fs-caption); color: var(--text-muted); }
.v-actions { display: flex; gap: var(--s1); flex-wrap: wrap; }
.edit-form { display: flex; flex-direction: column; gap: var(--s2); }
.input {
  font-family: inherit;
  font-size: var(--fs-small);
  padding: 6px 10px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-soft);
  background: var(--bg-sunken);
  color: var(--text-base);
  outline: none;
}
.input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ring); }
.tiny-btn {
  font-family: inherit;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-soft);
  border-radius: var(--r-sm);
  padding: 3px 8px;
  cursor: pointer;
  transition: all var(--dur-fast);
}
.tiny-btn:hover { background: var(--bg-hover); color: var(--accent); }
.tiny-btn.primary { color: var(--accent); border-color: var(--accent-ring); background: var(--accent-soft); }
.tiny-btn.primary:disabled { opacity: .45; cursor: default; }
.tiny-btn.danger:hover { background: var(--danger-faint); color: var(--danger); border-color: var(--danger); }
.tiny-btn.danger.solid { background: var(--danger); border-color: var(--danger); color: var(--text-on-primary); }
.pop-empty { font-size: var(--fs-small); color: var(--text-faint); text-align: center; padding: var(--s3); }
</style>
