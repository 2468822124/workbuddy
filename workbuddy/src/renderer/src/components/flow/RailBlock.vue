<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import type { FlowWeekInstance } from '@shared/flowTypes'

defineProps<{
  /** 本周可选取清单（未完成、未过期安排 < 目标）——锁定只读，阶段3 才可选取安排 */
  rail: FlowWeekInstance[]
  /** 惯常日徽标（fixed → `固定·一/三`；temp → null） */
  badgeOf: (inst: FlowWeekInstance) => string | null
}>()

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="Repeat" :size="18" />
        <h2>每周固定待安排</h2>
        <span class="count-chip">{{ rail.length }}</span>
      </div>
    </header>

    <ul v-if="rail.length" class="rail-list">
      <li v-for="inst in rail" :key="inst.id" class="rail-row">
        <span v-if="badgeOf(inst)" class="badge">{{ badgeOf(inst) }}</span>
        <span class="rail-title">{{ inst.title }}</span>
      </li>
    </ul>
    <div v-else class="empty">
      <span class="party">🎉</span>
      <p>全部已安排或已完成</p>
      <p class="hint">
        本周未完成的任务会出现在这里；
        <router-link :to="`/flow/day?date=${todayStr()}`" class="link">去日规划选取 →</router-link>
      </p>
    </div>
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
.rail-list { list-style: none; display: flex; flex-direction: column; gap: var(--s2); }
.rail-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  border: 1px dashed var(--border-soft);
  transition: background var(--dur-fast);
}
.rail-row:hover { background: var(--bg-hover); }
.badge {
  font-size: var(--fs-caption);
  letter-spacing: var(--tracking-wide);
  color: var(--cat-learn);
  background: var(--cat-learn-soft);
  border-radius: var(--r-pill);
  padding: 2px 9px;
  font-weight: var(--fw-medium);
  flex-shrink: 0;
}
.rail-title { font-size: var(--fs-body); color: var(--text-base); }
.party { font-size: var(--fs-h2); }
.empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--s1);
  padding: var(--s4); text-align: center;
  color: var(--text-muted);
}
.empty p { font-size: var(--fs-small); }
.hint { font-size: var(--fs-caption); color: var(--text-faint); max-width: 46ch; }
.link {
  color: var(--accent); text-decoration: none;
  font-weight: var(--fw-medium);
}
.link:hover { text-decoration: underline; }
</style>
