<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import DayEntryRow from './DayEntryRow.vue'
import type { DayBoardEntry } from '@shared/flowTypes'

const props = defineProps<{
  entries: DayBoardEntry[]
  /** 最小挪动日（今天，历史日允许挪向今天） */
  minDate: string
}>()

const emit = defineEmits<{
  add: [title: string]
  toggle: [id: number]
  remove: [id: number]
  move: [id: number, newDate: string]
  skip: [id: number]
  rename: [id: number, title: string]
  renameGuide: []
  updateNote: [id: number, note: string | null]
}>()

/** 展示层分组：当日区（deferredCount=0）+ 顺延区（deferredCount>0），纯展示性派生不改变数据 */
const todayEntries = computed(() => props.entries.filter(e => e.deferredCount === 0))
const deferredEntries = computed(() => props.entries.filter(e => e.deferredCount > 0))

const showAdd = ref(false)
const newTitle = ref('')

function submitAdd(): void {
  const t = newTitle.value.trim()
  if (!t) return
  emit('add', t)
  newTitle.value = ''
  showAdd.value = false
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="CheckSquare" :size="18" />
        <h2>当日任务</h2>
        <span class="count-chip">{{ entries.length }}</span>
      </div>
      <button v-if="!showAdd" class="add-btn" @click="showAdd = true">
        <AppIcon name="Plus" :size="16" />
        <span>添加任务</span>
      </button>
    </header>

    <!-- 添加行 -->
    <div v-if="showAdd" class="add-bar">
      <input
        v-model="newTitle"
        class="add-input"
        placeholder="输入任务标题"
        @keyup.enter="submitAdd"
        @keyup.esc="newTitle = ''; showAdd = false"
      />
      <button class="tiny-btn primary" :disabled="!newTitle.trim()" @click="submitAdd">添加</button>
      <button class="tiny-btn" @click="newTitle = ''; showAdd = false">取消</button>
    </div>

    <!-- 当日区 -->
    <ul v-if="todayEntries.length" class="entry-list">
      <DayEntryRow
        v-for="entry in todayEntries"
        :key="entry.id"
        :entry="entry"
        :min-date="minDate"
        @toggle="emit('toggle', $event)"
        @remove="emit('remove', $event)"
        @move="(id, d) => emit('move', id, d)"
        @skip="emit('skip', $event)"
        @rename="(id, t) => emit('rename', id, t)"
        @rename-guide="emit('renameGuide')"
        @update-note="(id, n) => emit('updateNote', id, n)"
      />
    </ul>

    <!-- 顺延区分隔 + 列表 -->
    <div v-if="deferredEntries.length" class="defer-divider">
      <span class="divider-line"></span>
      <span class="divider-label">顺延</span>
      <span class="divider-line"></span>
    </div>
    <ul v-if="deferredEntries.length" class="entry-list">
      <DayEntryRow
        v-for="entry in deferredEntries"
        :key="entry.id"
        :entry="entry"
        :min-date="minDate"
        @toggle="emit('toggle', $event)"
        @remove="emit('remove', $event)"
        @move="(id, d) => emit('move', id, d)"
        @skip="emit('skip', $event)"
        @rename="(id, t) => emit('rename', id, t)"
        @rename-guide="emit('renameGuide')"
        @update-note="(id, n) => emit('updateNote', id, n)"
      />
    </ul>

    <!-- 空态 -->
    <div v-if="!entries.length && !showAdd" class="empty">
      <span class="party">☀️</span>
      <p>今天还没有任务</p>
      <p class="hint">手动添加 / 从 rail 选取 / 套用模板</p>
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
.add-btn {
  display: inline-flex; align-items: center; gap: var(--s1);
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  color: var(--accent); background: var(--accent-soft);
  border: none; border-radius: var(--r-pill);
  padding: var(--s2) var(--s4); cursor: pointer;
  transition: all var(--dur-fast);
}
.add-btn:hover { background: var(--accent-ring); }
.add-bar {
  display: flex; align-items: center; gap: var(--s2);
  padding: var(--s3) var(--s4); border-radius: var(--r-md);
  background: var(--bg-sunken);
}
.add-input {
  font-family: inherit; font-size: var(--fs-body); flex: 1;
  padding: 6px 10px; border-radius: var(--r-sm);
  border: 1px solid var(--accent-ring); background: var(--bg-surface);
  color: var(--text-base); outline: none;
}
.entry-list { list-style: none; display: flex; flex-direction: column; }
.defer-divider {
  display: flex; align-items: center; gap: var(--s3);
  padding: 0 var(--s4);
}
.divider-line { flex: 1; height: 1px; background: var(--border-soft); }
.divider-label {
  font-size: var(--fs-caption); color: var(--text-faint);
  letter-spacing: var(--tracking-wide);
}
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
.party { font-size: var(--fs-h2); }
.empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--s1);
  padding: var(--s4); text-align: center;
  color: var(--text-muted);
}
.empty p { font-size: var(--fs-small); }
.hint { font-size: var(--fs-caption); color: var(--text-faint); max-width: 46ch; }
</style>