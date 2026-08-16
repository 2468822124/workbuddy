<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { Todo } from '@shared/types'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{
  toggle: [id: string]
  update: [id: string, data: { content?: string; planDate?: string | null }]
  delete: [id: string]
}>()

const editing = ref(false)
const editContent = ref(props.todo.content)
const editDate = ref(props.todo.planDate ?? '')
const confirmDelete = ref(false)
let deleteTimer: ReturnType<typeof setTimeout> | undefined

function startEdit() {
  editContent.value = props.todo.content
  editDate.value = props.todo.planDate ?? ''
  editing.value = true
}

function saveEdit() {
  if (!editContent.value.trim()) return
  emit('update', props.todo.id, { content: editContent.value.trim(), planDate: editDate.value || null })
  editing.value = false
}

function requestDelete() {
  confirmDelete.value = true
  deleteTimer = setTimeout(() => { confirmDelete.value = false }, 3000)
}

function doDelete() {
  clearTimeout(deleteTimer)
  confirmDelete.value = false
  emit('delete', props.todo.id)
}

function cancelDelete() {
  clearTimeout(deleteTimer)
  confirmDelete.value = false
}
</script>

<template>
  <div class="row" :class="{ done: todo.status === 'done' }">
    <div class="check" @click="$emit('toggle', todo.id)">
      <AppIcon v-if="todo.status === 'done'" name="Check" :size="13" />
    </div>

    <template v-if="!editing">
      <span class="content" @dblclick="startEdit">{{ todo.content }}</span>
      <span class="date">{{ todo.planDate ?? '无日期' }}</span>
    </template>
    <template v-else>
      <input v-model="editContent" class="ei" maxlength="200" @keydown.enter="saveEdit" />
      <input v-model="editDate" type="date" class="ei dt" />
      <button class="save" @click="saveEdit"><AppIcon name="Check" :size="14" /></button>
    </template>

    <div class="actions">
      <button v-if="!editing" class="ac" @click="startEdit"><AppIcon name="Pencil" :size="14" /></button>
      <template v-if="!confirmDelete">
        <button class="ac del" @click="requestDelete"><AppIcon name="Trash2" :size="14" /></button>
      </template>
      <template v-else>
        <span class="cfm">删除？</span>
        <button class="ac yes" @click="doDelete">确认</button>
        <button class="ac no" @click="cancelDelete">取消</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: var(--s3); padding: 9px 10px; border-radius: var(--r-md); transition: background var(--dur-base); }
.row:hover { background: var(--bg-hover); }
.check { width: 20px; height: 20px; border-radius: var(--r-sm); border: 1.8px solid var(--border); flex-shrink: 0; display: grid; place-items: center; cursor: pointer; color: var(--accent); transition: all var(--dur-base); background: var(--bg-surface); }
.done .check { background: var(--accent); border-color: var(--accent); color: var(--text-on-primary); }
.content { flex: 1; min-width: 0; font-size: var(--fs-body); color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.done .content { color: var(--text-faint); text-decoration: line-through; }
.date { font-size: var(--fs-caption); color: var(--text-faint); flex-shrink: 0; }
.actions { display: flex; gap: 2px; flex-shrink: 0; }
.ac { background: none; border: none; cursor: pointer; padding: 4px; border-radius: var(--r-sm); color: var(--text-faint); display: grid; place-items: center; }
.ac:hover { color: var(--accent); }
.ac.del:hover { color: var(--danger); }
.ac.yes { color: var(--danger); font-weight: var(--fw-semibold); font-size: var(--fs-caption); }
.ac.no { color: var(--text-muted); font-size: var(--fs-caption); }
.cfm { font-size: var(--fs-caption); color: var(--danger); }
.ei { font-family: inherit; font-size: var(--fs-small); padding: 6px 8px; border-radius: var(--r-sm); border: 1px solid var(--border-soft); background: var(--bg-sunken); color: var(--text-base); outline: none; flex: 1; }
.ei.dt { width: 130px; flex: none; }
.save { background: none; border: none; cursor: pointer; color: var(--ok); display: grid; place-items: center; }
</style>
