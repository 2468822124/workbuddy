<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import type { Project } from '@shared/types'

const props = defineProps<{ project: Project & { totalTasks: number; openTasks: number } }>()

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('text/plain', props.project.id)
  e.dataTransfer.effectAllowed = 'move'
}

const statusColors: Record<string, string> = {
  active: 'var(--accent)',
  paused: 'var(--warn)',
  done: 'var(--ok)',
  dropped: 'var(--text-muted)',
}
</script>

<template>
  <div
    class="card"
    draggable="true"
    @dragstart="onDragStart"
  >
    <div class="head">
      <span class="status-dot" :style="{ background: statusColors[project.status] }" />
      <span class="name">{{ project.name }}</span>
    </div>
    <p v-if="project.description" class="desc">{{ project.description }}</p>
    <div class="meta">
      <span class="chippy">{{ project.openTasks }} / {{ project.totalTasks }} 待办</span>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-md);
  padding: var(--s4);
  cursor: grab;
  transition: box-shadow var(--dur-base) var(--ease-out), transform var(--dur-base);
}
.card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.card:active { cursor: grabbing; }
.head { display: flex; align-items: center; gap: var(--s2); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.name { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.desc { font-size: var(--fs-small); color: var(--text-muted); margin-top: var(--s1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { margin-top: var(--s3); }
.chippy { font-size: 11px; padding: 2px 8px; border-radius: var(--r-pill); background: var(--bg-sunken); color: var(--text-faint); }
</style>
