<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import type { FlowReviewDeferredEntry } from '@shared/flowTypes'

defineProps<{ deferred: FlowReviewDeferredEntry[] }>()

function sourceLabel(source: string): string {
  if (source === 'project') return '项目'
  if (source === 'template') return '模板'
  if (source === 'manual') return '手动'
  return source
}
</script>

<template>
  <section class="deferred card">
    <header class="head">
      <h3 class="title">顺延清单</h3>
      <span class="hint">原计划日早于观察日的自由任务 · 按顺延天数降序</span>
    </header>

    <div v-if="deferred.length === 0" class="empty">无顺延记录</div>
    <ul v-else class="rows">
      <li v-for="d in deferred" :key="d.entryId" class="row" :class="d.status">
        <div class="title-col">
          <AppIcon :name="d.status === 'done' ? 'Check' : 'CornerUpRight'" size="15" />
          <span class="name">{{ d.title }}</span>
          <span class="badge">{{ sourceLabel(d.source) }}</span>
        </div>
        <div class="meta">
          <span class="days">{{ d.deferredDays }} 天</span>
          <!-- 原计划日入口：跳 /flow/day?date= 查看当日（规格 §5.5.7 顺延区） -->
          <RouterLink
            class="date-link"
            :to="{ path: '/flow/day', query: { date: d.originalDate } }"
            :title="`查看 ${d.originalDate} 日规划`"
          >
            {{ d.originalDate }}
          </RouterLink>
          <span v-if="d.status === 'done'" class="chip done">已完成 · {{ d.resolvedAt }}</span>
          <span v-else class="chip open">顺延中</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  padding: var(--s6) var(--s8);
  box-shadow: var(--shadow-xs);
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s4);
  margin-bottom: var(--s4);
}
.title { margin: 0; font-size: var(--fs-h2); font-weight: var(--fw-semibold); color: var(--text-strong); }
.hint { font-size: var(--fs-caption); color: var(--text-faint); }
.empty { padding: var(--s8) 0; text-align: center; color: var(--text-faint); font-size: var(--fs-small); }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s2); }
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  background: var(--bg-sunken);
}
.row.done { opacity: .6; }
.title-col {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-width: 0;
  color: var(--text-muted);
}
.name {
  font-size: var(--fs-body);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row.done .name { text-decoration: line-through; color: var(--text-muted); }
.badge {
  flex: none;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-pill);
  padding: 1px var(--s2);
}
.meta { display: flex; align-items: center; gap: var(--s3); flex: none; }
.days { font-size: var(--fs-small); font-weight: var(--fw-semibold); color: var(--warn); }
.date-link {
  font-size: var(--fs-caption);
  color: var(--accent);
  text-decoration: none;
  padding: 1px var(--s2);
  border-radius: var(--r-sm);
}
.date-link:hover { background: var(--accent-soft); text-decoration: underline; }
.chip {
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  border-radius: var(--r-pill);
  padding: 2px var(--s3);
}
.chip.done { color: var(--ok); background: var(--ok-soft); }
.chip.open { color: var(--warn); background: var(--warn-soft); }
@media (max-width: 640px) {
  .row { flex-direction: column; align-items: flex-start; }
}
</style>
