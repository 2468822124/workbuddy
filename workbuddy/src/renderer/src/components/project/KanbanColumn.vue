<script setup lang="ts">
import ProjectCard from './ProjectCard.vue'
import type { Project } from '@shared/types'

defineProps<{
  status: string
  label: string
  items: (Project & { totalTasks: number; openTasks: number })[]
}>()

const emit = defineEmits<{ drop: [id: string] }>()

function onDrop(e: DragEvent) {
  e.preventDefault()
  const id = e.dataTransfer?.getData('text/plain')
  if (id) emit('drop', id)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}
</script>

<template>
  <div class="col" @dragover="onDragOver" @drop="onDrop">
    <div class="header">
      <span class="label">{{ label }}</span>
      <span class="count">{{ items.length }}</span>
    </div>
    <div class="cards">
      <ProjectCard v-for="p in items" :key="p.id" :project="p" />
    </div>
  </div>
</template>

<style scoped>
.col {
  flex: 1;
  min-width: 200px;
  background: var(--bg-sunken);
  border-radius: var(--r-lg);
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  transition: background var(--dur-base);
}
.col:hover { background: var(--bg-hover); }
.header { display: flex; align-items: center; gap: var(--s2); }
.label { font-size: var(--fs-small); font-weight: var(--fw-semibold); color: var(--text-base); }
.count { font-size: var(--fs-caption); color: var(--text-faint); background: var(--bg-surface); padding: 1px 8px; border-radius: var(--r-pill); }
.cards { display: flex; flex-direction: column; gap: var(--s2); }
</style>
