<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import type { Project } from '@shared/types'

defineProps<{
  projects: (Project & { totalTasks: number; openTasks: number })[]
}>()

const emit = defineEmits<{
  edit: [id: string]
  remove: [id: string]
  select: [id: string]
}>()

const statusBadges: Record<string, string> = {
  active: '进行中', paused: '已暂停', done: '已完成', dropped: '已放弃',
}
</script>

<template>
  <div class="list">
    <div class="row header">
      <span class="col-name">名称</span>
      <span class="col-status">状态</span>
      <span class="col-tasks">任务</span>
      <span class="col-date">创建时间</span>
      <span class="col-act">操作</span>
    </div>
    <div v-for="p in projects" :key="p.id" class="row" @click="$emit('select', p.id)">
      <span class="col-name">{{ p.name }}</span>
      <span class="col-status"><span class="badge" :class="'s-'+p.status">{{ statusBadges[p.status] }}</span></span>
      <span class="col-tasks t-faint">{{ p.openTasks }} / {{ p.totalTasks }}</span>
      <span class="col-date t-faint">{{ p.createdAt.slice(0, 10) }}</span>
      <span class="col-act">
        <button class="act" @click.stop="$emit('edit', p.id)"><AppIcon name="Settings" :size="14" /></button>
        <button class="act del" @click.stop="$emit('remove', p.id)"><AppIcon name="Trash2" :size="14" /></button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 1px; background: var(--border-soft); border-radius: var(--r-md); overflow: hidden; }
.row { display: flex; align-items: center; gap: var(--s3); padding: 10px var(--s4); background: var(--bg-surface); font-size: var(--fs-small); cursor: pointer; transition: background var(--dur-base); }
.row.header { background: var(--bg-surface-2); font-weight: var(--fw-semibold); color: var(--text-muted); cursor: default; font-size: var(--fs-caption); letter-spacing: var(--tracking-wide); }
.row:not(.header):hover { background: var(--bg-hover); }
.col-name { flex: 2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-status { flex: 1; }
.col-tasks { flex: 0.7; }
.col-date { flex: 0.8; }
.col-act { flex: 0.5; display: flex; gap: var(--s1); }
.t-faint { color: var(--text-faint); }
.badge { font-size: 11px; padding: 2px 8px; border-radius: var(--r-pill); font-weight: var(--fw-medium); }
.s-active { background: var(--cat-work-soft); color: var(--accent); }
.s-paused { background: var(--warn-soft); color: var(--warn); }
.s-done { background: var(--ok-soft); color: var(--ok); }
.s-dropped { background: var(--bg-sunken); color: var(--text-faint); }
.act { background: none; border: none; cursor: pointer; padding: 4px; border-radius: var(--r-sm); color: var(--text-faint); display: grid; place-items: center; }
.act:hover { background: var(--bg-hover); color: var(--accent); }
.act.del:hover { color: var(--danger); }
</style>
