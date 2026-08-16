<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import TemplateEditForm from './TemplateEditForm.vue'
import type { FlowPlanTemplate } from '@shared/flowTypes'

defineProps<{
  templates: FlowPlanTemplate[]
  /** 目标日 YYYY-MM-DD（套用确认卡目标） */
  date: string
}>()

const emit = defineEmits<{
  save: [data: { id?: number; name: string; type: 'daily' | 'weekly'; items: { text: string }[] }]
  delete: [id: number]
  /** 套用确认：向目标日批量插入 */
  apply: [templateId: number, items: { text: string }[]]
}>()

const showForm = ref(false)
const editingTpl = ref<FlowPlanTemplate | null>(null)
const confirmDelete = ref<number | null>(null)

/** 展开套用确认卡的模板 id */
const applyTplId = ref<number | null>(null)
/** 套用确认卡内编辑文本（按 index 索引） */
const applyItems = ref<{ checked: boolean; text: string }[]>([])

function openCreate(): void {
  editingTpl.value = null
  showForm.value = true
}

function openEdit(tpl: FlowPlanTemplate): void {
  editingTpl.value = tpl
  showForm.value = true
}

function onSaved(data: { id?: number; name: string; type: 'daily' | 'weekly'; items: { text: string }[] }): void {
  emit('save', data)
  showForm.value = false
}

function openApply(tpl: FlowPlanTemplate): void {
  applyTplId.value = tpl.id
  applyItems.value = tpl.items.map(i => ({ checked: true, text: i.text }))
}

function cancelApply(): void {
  applyTplId.value = null
}

/** 套用确认卡有效选中项数（勾选且非空文本）——空选禁提交（F3） */
const selectedCount = computed(() => applyItems.value.filter(i => i.checked && i.text.trim()).length)

function confirmApply(): void {
  const id = applyTplId.value
  if (id === null) return
  const items = applyItems.value
    .filter(i => i.checked && i.text.trim())
    .map(i => ({ text: i.text.trim() }))
  if (items.length === 0) return
  emit('apply', id, items)
  applyTplId.value = null
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="Copy" :size="18" />
        <h2>模板</h2>
        <span class="count-chip">{{ templates.length }}</span>
      </div>
      <button class="add-btn" @click="openCreate">
        <AppIcon name="Plus" :size="16" />
        <span>新建模板</span>
      </button>
    </header>

    <!-- 模板列表 -->
    <ul v-if="templates.length" class="tpl-list">
      <li v-for="tpl in templates" :key="tpl.id" class="tpl-row">
        <div class="tpl-info">
          <span class="tpl-name">{{ tpl.name }}</span>
          <span class="tpl-badge" :class="tpl.type">{{ tpl.type === 'daily' ? '日' : '周' }}</span>
          <span class="tpl-count">{{ tpl.items.length }}项</span>
        </div>
        <div class="tpl-actions">
          <!-- 套用确认卡 -->
          <template v-if="applyTplId === tpl.id">
            <div class="apply-card">
              <div class="apply-items">
                <label v-for="(item, i) in applyItems" :key="i" class="apply-item">
                  <input type="checkbox" v-model="item.checked" />
                  <input
                    v-model="item.text"
                    class="apply-input"
                    :class="{ unchecked: !item.checked }"
                  />
                </label>
              </div>
              <div class="apply-actions">
                <span v-if="selectedCount === 0" class="apply-hint">请至少勾选一项</span>
                <button class="tiny-btn primary" :disabled="selectedCount === 0" @click="confirmApply">
                  套用到 {{ date }}
                </button>
                <button class="tiny-btn" @click="cancelApply">取消</button>
              </div>
            </div>
          </template>
          <template v-else>
            <button class="pick-btn" @click="openApply(tpl)">
              <AppIcon name="Copy" :size="14" />
              <span>套用</span>
            </button>
            <button class="icon-btn" title="编辑" @click="openEdit(tpl)">
              <AppIcon name="Pencil" :size="14" />
            </button>
            <template v-if="confirmDelete === tpl.id">
              <span class="confirm-bar">
                <span class="confirm-text">删除？</span>
                <button class="tiny-btn primary" @click="emit('delete', tpl.id); confirmDelete = null">确认</button>
                <button class="tiny-btn" @click="confirmDelete = null">取消</button>
              </span>
            </template>
            <button v-else class="icon-btn danger" title="删除模板" @click="confirmDelete = tpl.id">
              <AppIcon name="Trash2" :size="14" />
            </button>
          </template>
        </div>
      </li>
    </ul>
    <div v-else class="empty">
      <p>暂无模板，点击「新建模板」创建</p>
    </div>

    <!-- 新建/编辑表单 -->
    <TemplateEditForm
      v-if="showForm"
      :template="editingTpl"
      @save="onSaved"
      @cancel="showForm = false"
    />
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
.add-btn {
  display: inline-flex; align-items: center; gap: var(--s1);
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  color: var(--accent); background: var(--accent-soft);
  border: none; border-radius: var(--r-pill);
  padding: var(--s2) var(--s4); cursor: pointer;
  transition: all var(--dur-fast);
}
.add-btn:hover { background: var(--accent-ring); }
.tpl-list { list-style: none; display: flex; flex-direction: column; gap: var(--s2); }
.tpl-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--s3) var(--s4); border-radius: var(--r-md);
  border: 1px solid var(--border-soft);
  transition: background var(--dur-fast);
}
.tpl-row:hover { background: var(--bg-hover); }
.tpl-info { display: flex; align-items: center; gap: var(--s2); flex: 1; min-width: 0; }
.tpl-name { font-size: var(--fs-body); color: var(--text-strong); }
.tpl-badge {
  font-size: var(--fs-caption); font-weight: var(--fw-medium);
  letter-spacing: var(--tracking-wide); border-radius: var(--r-pill);
  padding: 1px 8px; flex-shrink: 0;
}
.tpl-badge.daily { color: var(--cat-work); background: var(--cat-work-soft); }
.tpl-badge.weekly { color: var(--cat-learn); background: var(--cat-learn-soft); }
.tpl-count { font-size: var(--fs-caption); color: var(--text-faint); }
.tpl-actions { display: flex; align-items: center; gap: var(--s1); flex-shrink: 0; }
.pick-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: inherit; font-size: var(--fs-caption); font-weight: var(--fw-medium);
  color: var(--accent); background: var(--accent-soft);
  border: none; border-radius: var(--r-pill);
  padding: var(--s1) var(--s3); cursor: pointer;
  transition: all var(--dur-fast);
}
.pick-btn:hover { background: var(--accent-ring); }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: var(--r-sm);
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all var(--dur-fast);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--accent); }
.icon-btn.danger:hover { color: var(--danger); background: var(--danger-faint); }
.confirm-bar { display: flex; align-items: center; gap: var(--s1); }
.confirm-text { font-size: var(--fs-caption); color: var(--warn); }
.apply-card {
  display: flex; flex-direction: column; gap: var(--s3);
  padding: var(--s4); border-radius: var(--r-md);
  background: var(--bg-sunken); border: 1px solid var(--border-soft);
  min-width: 280px;
}
.apply-items { display: flex; flex-direction: column; gap: var(--s2); }
.apply-item { display: flex; align-items: center; gap: var(--s2); }
.apply-input {
  font-family: inherit; font-size: var(--fs-small); flex: 1;
  padding: 5px 8px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--bg-surface);
  color: var(--text-base); outline: none;
}
.apply-input:focus { border-color: var(--accent-ring); }
.apply-input.unchecked { opacity: .4; }
.apply-actions { display: flex; align-items: center; gap: var(--s2); justify-content: flex-end; }
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
.apply-hint { font-size: var(--fs-caption); color: var(--warn); }
.empty {
  padding: var(--s4); text-align: center;
  color: var(--text-muted); font-size: var(--fs-small);
}
</style>