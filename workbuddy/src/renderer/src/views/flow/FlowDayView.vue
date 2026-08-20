<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi'
import {
  dateLabel,
  isHistoryDate,
  parseDateQuery,
  shiftDate,
  useFlowDay,
} from '@/composables/useFlowDay'
import { useFlowTemplates } from '@/composables/useFlowTemplates'
import type { FlowWeekInstance } from '@shared/flowTypes'
import DayNav from '@/components/flow/DayNav.vue'
import DayEntryList from '@/components/flow/DayEntryList.vue'
import RailPanel from '@/components/flow/RailPanel.vue'
import TemplatePanel from '@/components/flow/TemplatePanel.vue'
import JournalBlock from '@/components/flow/JournalBlock.vue'

const route = useRoute()
const router = useRouter()
const api = useApi()
// 阶段6修复批次 · F2：顶层解构 refs——模板只自动解包 script setup 顶层绑定；
// 普通对象属性（fd.date）不解包，会把 Ref 传给纯函数导致 date.split 崩溃（白屏根因）
const {
  date,
  dayBoard,
  weekBoard,
  loading,
  error,
  info,
  todayStr,
  load,
  reload,
  setInfo,
  setError,
  addManual,
  railPick,
  toggleEntry,
  removeEntry,
  moveEntry,
  skipEntry,
  updateEntryTitle,
  updateEntryNote,
} = useFlowDay()
const tpl = useFlowTemplates()

const today = todayStr()
const history = computed(() => isHistoryDate(date.value, today))

/** 日导航：router.replace 改 ?date= 查询 → watch 触发 reload（URL 即状态） */
function navigate(day: string): void {
  router.replace({ query: { ...route.query, date: day } })
}

watch(
  () => route.query.date,
  q => {
    const target = parseDateQuery(q, today)
    if (target !== date.value) {
      load(target)
      loadJournal(target)
    }
  },
)

onMounted(() => {
  const initial = parseDateQuery(route.query.date, today)
  load(initial)
  tpl.load()
  loadJournal(initial)
})

// ===== 感想区 =====
const journalContent = ref<string | null>(null)

async function loadJournal(d: string): Promise<void> {
  const res = await api.flow.journal.get('day', d)
  journalContent.value = res.ok && res.data ? res.data.content : null
}

async function saveJournal(content: string): Promise<void> {
  const res = await api.flow.journal.save('day', date.value, content)
  if (res.ok) {
    setInfo('已保存')
    journalContent.value = content
  } else {
    setError(res.error?.message ?? '保存失败')
  }
}

// ===== 模板套用（批量插入，部分失败计数） =====
async function applyTemplate(templateId: number, items: { text: string }[]): Promise<void> {
  let ok = 0
  let fail = 0
  for (const item of items) {
    const res = await api.flow.entry.add({
      date: date.value,
      title: item.text,
      source: 'template',
      templateId,
    })
    if (res.ok) {
      ok++
    } else {
      fail++
    }
  }
  await reload()
  if (fail === 0) {
    setInfo(`已套用 ${ok} 项`)
  } else {
    setError(`成功 ${ok} / 失败 ${fail}`)
  }
}
</script>

<template>
  <div class="page">
    <DayNav
      :label="date ? dateLabel(date) : ''"
      :is-today="date === today"
      @prev="navigate(shiftDate(date, -1))"
      @current="navigate(today)"
      @next="navigate(shiftDate(date, 1))"
      @jump="navigate($event)"
    />

    <!-- 反馈条（错误 8s / 信息 4s 自动消隐；IPC err 可见，禁静默） -->
    <div v-if="error" class="feedback error">{{ error }}</div>
    <div v-else-if="info" class="feedback info">{{ info }}</div>
    <div v-if="tpl.error" class="feedback error">{{ tpl.error }}</div>
    <div v-else-if="tpl.info" class="feedback info">{{ tpl.info }}</div>

    <div v-if="loading && !dayBoard" class="loading">加载中…</div>
    <div v-else-if="!dayBoard" class="loading error-text">面板加载失败，请重试</div>
    <template v-else>
      <div class="grid">
        <!-- 左列：当日任务 -->
        <DayEntryList
          :entries="dayBoard.entries"
          :min-date="today"
          @add="addManual($event)"
          @toggle="toggleEntry($event)"
          @remove="removeEntry($event)"
          @move="(id, d) => moveEntry(id, d)"
          @skip="skipEntry($event)"
          @rename="(id, t) => updateEntryTitle(id, t)"
          @rename-guide="setInfo('锁定行不可改字，请在周统筹页改名')"
          @update-note="(id, n) => updateEntryNote(id, n)"
        />

        <!-- 右列上：rail 选取 -->
        <RailPanel
          :rail="weekBoard?.rail ?? []"
          :is-history="history"
          @pick="(inst: FlowWeekInstance) => railPick(inst)"
        />

        <!-- 右列下：模板 -->
        <TemplatePanel
          :templates="tpl.templates"
          :date="date"
          @save="tpl.save($event)"
          @delete="tpl.remove($event)"
          @apply="(tid, items) => applyTemplate(tid, items)"
        />
      </div>

      <!-- 全宽：感想区 -->
      <JournalBlock
        :date="date"
        :content="journalContent"
        @save="saveJournal($event)"
      />
    </template>
  </div>
</template>

<style scoped>
.page { padding: var(--s4); display: flex; flex-direction: column; gap: var(--s3); }
.feedback {
  font-size: var(--fs-small);
  border-radius: var(--r-md);
  padding: var(--s3) var(--s4);
  margin: 0 var(--s2);
}
.feedback.error { color: var(--danger); background: var(--danger-faint); border: 1px solid var(--danger); }
.feedback.info { color: var(--ok); background: var(--ok-soft); border: 1px solid var(--ok); }
.loading { padding: var(--s10); text-align: center; color: var(--text-faint); font-size: var(--fs-small); }
.error-text { color: var(--danger); }
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s4);
  align-items: start;
}
@media (max-width: 980px) {
  .grid { grid-template-columns: 1fr; }
}
</style>