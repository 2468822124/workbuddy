<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { sourceBadge, DEFER_WARN_DAYS } from '@/composables/useFlowDay'
import type { DayBoardEntry } from '@shared/flowTypes'

const props = defineProps<{
  entry: DayBoardEntry
  /** 最小挪动日（今天，防挪向过去） */
  minDate: string
}>()

const emit = defineEmits<{
  toggle: [id: number]
  remove: [id: number]
  move: [id: number, newDate: string]
  skip: [id: number]
  rename: [id: number, title: string]
  renameGuide: []
  updateNote: [id: number, note: string | null]
}>()

const badge = computed(() => sourceBadge(props.entry.source))
const isDeferred = computed(() => props.entry.deferredCount > 0)
const isLocked = computed(() => props.entry.locked)
const isWarn = computed(() => isDeferred.value && props.entry.deferredCount >= DEFER_WARN_DAYS)

const editing = ref(false)
const editTitle = ref('')
const confirm = ref<'skip' | 'delete' | null>(null)
const showNote = ref(false)
const noteText = ref('')
const showMove = ref(false)
const moveDate = ref('')

function startRename(): void {
  if (isLocked.value) {
    emit('renameGuide')
    return
  }
  editTitle.value = props.entry.displayTitle
  editing.value = true
}

function saveRename(): void {
  const t = editTitle.value.trim()
  if (!t) return
  emit('rename', props.entry.id, t)
  editing.value = false
}

function openNote(): void {
  noteText.value = props.entry.note ?? ''
  showNote.value = !showNote.value
}

function saveNote(): void {
  const n = noteText.value.trim()
  // 空串 → null（服务端 note !== undefined 契约支持 null 清空备注）
  emit('updateNote', props.entry.id, n || null)
  showNote.value = false
}

function openMove(): void {
  moveDate.value = props.minDate
  showMove.value = !showMove.value
}

function confirmMove(): void {
  if (!moveDate.value) return
  emit('move', props.entry.id, moveDate.value)
  showMove.value = false
}
</script>

<template>
  <li class="row" :class="{ done: entry.done, locked: isLocked, skipped: entry.skippedAt !== null }">
    <!-- 勾选框 -->
    <button
      class="state-btn"
      :title="entry.done ? '取消勾选' : '勾选完成'"
      @click="emit('toggle', entry.id)"
    >
      <AppIcon :name="entry.done ? 'Check' : 'Circle'" :size="17" />
    </button>

    <div class="row-body">
      <div class="title-line">
        <!-- 锁定标识 -->
        <span v-if="isLocked" class="lock-icon" title="锁定行（源自周任务）">
          <AppIcon name="Lock" :size="13" />
        </span>
        <!-- 来源徽标 -->
        <span v-if="badge" class="badge" :class="isLocked ? 'lock-badge' : 'free-badge'">{{ badge }}</span>
        <!-- 标题 -->
        <input
          v-if="editing"
          v-model="editTitle"
          class="input"
          @keyup.enter="saveRename"
          @keyup.esc="editing = false"
        />
        <span v-else class="title" :class="{ done: entry.done }">{{ entry.displayTitle }}</span>
        <!-- 顺延徽章 -->
        <span v-if="isDeferred" class="defer-badge" :class="{ warn: isWarn }">
          顺延{{ entry.deferredCount }}天
        </span>
        <span v-if="isDeferred" class="defer-origin">原 {{ entry.date }}</span>
      </div>

      <!-- 私有备注 -->
      <div v-if="entry.note" class="note-line" @dblclick="openNote">
        <span class="note-text">{{ entry.note }}</span>
      </div>

      <!-- 备注编辑 -->
      <div v-if="showNote" class="edit-row">
        <input
          v-model="noteText"
          class="note-input"
          placeholder="私有备注（不传播）"
          @keyup.enter="saveNote"
          @keyup.esc="showNote = false"
        />
        <button class="tiny-btn primary" @click="saveNote">保存</button>
        <button class="tiny-btn" @click="showNote = false">取消</button>
      </div>

      <!-- 挪动日期选择 -->
      <div v-if="showMove" class="edit-row">
        <input
          v-model="moveDate"
          type="date"
          :min="minDate"
          class="date-input"
          @keyup.enter="confirmMove"
        />
        <button class="tiny-btn primary" @click="confirmMove">挪到</button>
        <button class="tiny-btn" @click="showMove = false">取消</button>
      </div>
    </div>

    <div class="actions">
      <template v-if="!confirm && !showMove && !showNote">
        <!-- 改名（仅自由行行内编辑；🔒行引导） -->
        <button class="icon-btn" title="改名" @click="startRename">
          <AppIcon name="Pencil" :size="15" />
        </button>
        <!-- 私有备注 -->
        <button class="icon-btn" :class="{ active: entry.note }" title="私有备注" @click="openNote">
          <AppIcon name="Info" :size="15" />
        </button>
        <!-- 挪动 -->
        <button class="icon-btn" title="挪到其它日" @click="openMove">
          <AppIcon name="MoveRight" :size="15" />
        </button>
        <!-- 跳过 -->
        <button class="icon-btn" title="跳过本场（不计未完成）" @click="confirm = 'skip'">
          <AppIcon name="SkipForward" :size="15" />
        </button>
        <!-- 移除 -->
        <button class="icon-btn danger" title="移除" @click="confirm = 'delete'">
          <AppIcon name="Trash2" :size="15" />
        </button>
      </template>

      <!-- 行内确认 -->
      <span v-else-if="confirm" class="confirm-bar">
        <span class="confirm-text">
          {{ confirm === 'skip' ? '跳过本场？不计未完成' : '移除？凭据保留' }}
        </span>
        <button class="tiny-btn primary" @click="confirm === 'skip' ? emit('skip', entry.id) : emit('remove', entry.id); confirm = null">
          确认
        </button>
        <button class="tiny-btn" @click="confirm = null">取消</button>
      </span>
    </div>
  </li>
</template>

<style scoped>
.row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  transition: background var(--dur-fast);
}
.row:hover { background: var(--bg-hover); }
.row.done { opacity: .62; }
.row.done .title { text-decoration: line-through; color: var(--text-muted); }
.row.skipped { opacity: .5; }
.row.skipped .title { text-decoration: line-through; color: var(--text-faint); }
.state-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: var(--r-sm);
  border: none; background: transparent; color: var(--border-strong);
  cursor: pointer; flex-shrink: 0; margin-top: 1px;
  transition: all var(--dur-base) var(--ease-out);
}
.state-btn:hover { color: var(--accent); transform: scale(1.08); }
.row-body { flex: 1; min-width: 0; }
.title-line { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.lock-icon { display: inline-flex; color: var(--text-muted); flex-shrink: 0; }
.title {
  font-size: var(--fs-body);
  color: var(--text-strong);
  line-height: var(--lh-tight);
}
.title.done { color: var(--text-muted); }
.locked .title { font-weight: var(--fw-medium); }
.input {
  font-family: inherit; font-size: var(--fs-body);
  padding: 5px 10px; border-radius: var(--r-sm);
  border: 1px solid var(--accent-ring); background: var(--bg-sunken);
  color: var(--text-base); outline: none; width: 100%;
}
.badge {
  font-size: var(--fs-caption); letter-spacing: var(--tracking-wide);
  border-radius: var(--r-pill); padding: 2px 9px; font-weight: var(--fw-medium);
  flex-shrink: 0;
}
.lock-badge {
  color: var(--cat-learn); background: var(--cat-learn-soft);
}
.free-badge {
  color: var(--cat-work); background: var(--cat-work-soft);
}
.defer-badge {
  font-size: var(--fs-caption); letter-spacing: var(--tracking-wide);
  border-radius: var(--r-pill); padding: 2px 9px; font-weight: var(--fw-medium);
  color: var(--text-muted); background: var(--bg-sunken);
}
.defer-badge.warn {
  color: var(--warn); background: var(--warn-soft);
}
.defer-origin {
  font-size: var(--fs-caption); color: var(--text-faint);
}
.note-line {
  margin-top: var(--s1);
  cursor: pointer;
}
.note-text {
  font-size: var(--fs-caption);
  color: var(--text-faint);
  padding: 2px var(--s2);
  border-radius: var(--r-sm);
  background: var(--bg-sunken);
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-row {
  display: flex; align-items: center; gap: var(--s2); margin-top: var(--s2);
}
.note-input {
  font-family: inherit; font-size: var(--fs-small);
  padding: 4px 8px; border-radius: var(--r-sm);
  border: 1px solid var(--accent-ring); background: var(--bg-sunken);
  color: var(--text-base); outline: none; flex: 1; max-width: 260px;
}
.date-input {
  font-family: inherit; font-size: var(--fs-small);
  padding: 4px 8px; border-radius: var(--r-sm);
  border: 1px solid var(--accent-ring); background: var(--bg-sunken);
  color: var(--text-base); outline: none;
}
.actions { display: flex; align-items: center; gap: var(--s1); flex-shrink: 0; }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: var(--r-sm);
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all var(--dur-fast);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--accent); }
.icon-btn.danger:hover { color: var(--danger); background: var(--danger-faint); }
.icon-btn.active { color: var(--accent); }
.icon-btn:disabled { opacity: .35; cursor: default; }
.confirm-bar { display: flex; align-items: center; gap: var(--s1); }
.confirm-text { font-size: var(--fs-caption); color: var(--warn); margin-right: var(--s1); }
.tiny-btn {
  font-family: inherit; font-size: var(--fs-caption);
  color: var(--text-muted); background: var(--bg-surface);
  border: 1px solid var(--border-soft); border-radius: var(--r-sm);
  padding: 3px 10px; cursor: pointer; transition: all var(--dur-fast);
}
.tiny-btn:hover { background: var(--bg-hover); color: var(--accent); }
.tiny-btn.primary { color: var(--text-on-primary); background: var(--accent); border-color: var(--accent); }
.tiny-btn.primary:hover { background: var(--accent-hover); }
</style>