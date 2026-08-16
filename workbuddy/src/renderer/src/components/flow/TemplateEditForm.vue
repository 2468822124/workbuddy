<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { FlowPlanTemplate } from '@shared/flowTypes'

const props = defineProps<{
  /** 编辑时传入已有模板，新建时 null */
  template: FlowPlanTemplate | null
}>()

const emit = defineEmits<{
  save: [data: { id?: number; name: string; type: 'daily' | 'weekly'; items: { text: string }[] }]
  cancel: []
}>()

const name = ref('')
const type = ref<'daily' | 'weekly'>('daily')
const items = ref<{ text: string }[]>([])

watch(() => props.template, (tpl) => {
  if (tpl) {
    name.value = tpl.name
    type.value = tpl.type
    items.value = tpl.items.map(i => ({ text: i.text }))
  } else {
    name.value = ''
    type.value = 'daily'
    items.value = [{ text: '' }]
  }
}, { immediate: true })

function addItem(): void {
  items.value.push({ text: '' })
}

function removeItem(index: number): void {
  items.value.splice(index, 1)
}

/** 非空项数量 */
const validCount = () => items.value.filter(i => i.text.trim()).length
const canSave = () => name.value.trim() && validCount() >= 1

function submit(): void {
  if (!canSave()) return
  emit('save', {
    id: props.template?.id,
    name: name.value.trim(),
    type: type.value,
    items: items.value.filter(i => i.text.trim()),
  })
}
</script>

<template>
  <div class="form">
    <div class="form-row">
      <label class="label">名称</label>
      <input
        v-model="name"
        class="form-input"
        placeholder="模板名称"
        @keyup.enter="submit"
      />
    </div>
    <div class="form-row">
      <label class="label">类型</label>
      <select v-model="type" class="form-select">
        <option value="daily">日模板</option>
        <option value="weekly">周模板</option>
      </select>
    </div>
    <div class="form-row">
      <label class="label">任务项</label>
      <div class="items-list">
        <div v-for="(item, i) in items" :key="i" class="item-row">
          <input
            v-model="item.text"
            class="item-input"
            :placeholder="`任务 ${i + 1}`"
            @keyup.enter="submit"
          />
          <button class="icon-btn" title="删除此条" @click="removeItem(i)">
            <AppIcon name="X" :size="14" />
          </button>
        </div>
        <button class="add-item-btn" @click="addItem">
          <AppIcon name="Plus" :size="14" />
          <span>添加项</span>
        </button>
      </div>
    </div>
    <div class="form-actions">
      <button class="tiny-btn primary" :disabled="!canSave()" @click="submit">
        {{ template ? '保存' : '创建' }}
      </button>
      <button class="tiny-btn" @click="emit('cancel')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.form {
  display: flex; flex-direction: column; gap: var(--s3);
  padding: var(--s4); border-radius: var(--r-md);
  background: var(--bg-sunken); border: 1px solid var(--border-soft);
}
.form-row { display: flex; flex-direction: column; gap: var(--s1); }
.label {
  font-size: var(--fs-caption); font-weight: var(--fw-medium);
  color: var(--text-muted); letter-spacing: var(--tracking-wide);
}
.form-input {
  font-family: inherit; font-size: var(--fs-body);
  padding: 6px 10px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--bg-surface);
  color: var(--text-base); outline: none;
}
.form-input:focus { border-color: var(--accent-ring); }
.form-select {
  font-family: inherit; font-size: var(--fs-small);
  padding: 6px 10px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--bg-surface);
  color: var(--text-base); outline: none;
}
.items-list { display: flex; flex-direction: column; gap: var(--s2); }
.item-row { display: flex; align-items: center; gap: var(--s2); }
.item-input {
  font-family: inherit; font-size: var(--fs-small); flex: 1;
  padding: 6px 10px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--bg-surface);
  color: var(--text-base); outline: none;
}
.item-input:focus { border-color: var(--accent-ring); }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: var(--r-sm);
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all var(--dur-fast);
}
.icon-btn:hover { color: var(--danger); background: var(--danger-faint); }
.add-item-btn {
  display: inline-flex; align-items: center; gap: var(--s1);
  font-family: inherit; font-size: var(--fs-caption);
  color: var(--accent); background: transparent;
  border: none; padding: var(--s1) 0; cursor: pointer;
  transition: all var(--dur-fast);
}
.add-item-btn:hover { color: var(--accent-hover); }
.form-actions { display: flex; align-items: center; gap: var(--s2); justify-content: flex-end; }
.tiny-btn {
  font-family: inherit; font-size: var(--fs-caption);
  color: var(--text-muted); background: var(--bg-surface);
  border: 1px solid var(--border-soft); border-radius: var(--r-sm);
  padding: 3px 10px; cursor: pointer; transition: all var(--dur-fast);
}
.tiny-btn:hover { background: var(--bg-hover); color: var(--accent); }
.tiny-btn.primary { color: var(--text-on-primary); background: var(--accent); border-color: var(--accent); }
.tiny-btn.primary:hover { background: var(--accent-hover); }
.tiny-btn:disabled { opacity: .4; cursor: default; }
</style>