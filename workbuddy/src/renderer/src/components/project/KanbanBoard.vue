<script setup lang="ts">
import KanbanColumn from './KanbanColumn.vue'
import type { Project } from '@shared/types'

const COLUMNS: { status: string; label: string }[] = [
  { status: 'active', label: '进行中' },
  { status: 'paused', label: '已暂停' },
  { status: 'done', label: '已完成' },
  { status: 'dropped', label: '已放弃' },
]

const props = defineProps<{
  projects: (Project & { totalTasks: number; openTasks: number })[]
}>()

const emit = defineEmits<{ move: [id: string, status: string] }>()

function items(status: string) {
  return props.projects.filter(p => p.status === status)
}
</script>

<template>
  <div class="board">
    <KanbanColumn
      v-for="c in COLUMNS" :key="c.status"
      :status="c.status"
      :label="c.label"
      :items="items(c.status)"
      @drop="id => $emit('move', id, c.status)"
    />
  </div>
</template>

<style scoped>
.board { display: flex; gap: var(--s4); overflow-x: auto; padding-bottom: var(--s2); }
</style>
