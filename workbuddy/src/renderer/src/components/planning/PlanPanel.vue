<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import CascadeRail from './CascadeRail.vue'
import { periodLabel } from '@shared/period'
import type { PlanGuideItem, PlanningLevel, Template } from '@shared/types'

// 规划卡：模板初始化 + 编辑器（下期规划）+ 保存（daily→待办）+ AI 引导 + 上级任务点选侧栏
const props = defineProps<{
  level: PlanningLevel
  periodStart: string
  modelValue: string
  saved: boolean
  saving: boolean
  loading: boolean
  templates: Template[]
  selectedTplId: string | null
  llmReady: boolean
  guideItems: PlanGuideItem[]
  guideLoading: boolean
  guideError: { code: string; message: string } | null
  parentTasks: { text: string; consumed: boolean; tid: string | null }[]
  cascadeLoading: boolean
  inDraftTexts: Set<string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
  selectTpl: [id: string]
  guide: []
  clearGuide: []
  insertSuggestion: [item: PlanGuideItem]
  skipSuggestion: [index: number]
  pickTask: [task: { text: string; tid: string | null }]
  goSettings: []
}>()

const isDaily = computed(() => props.level === 'daily')
const isWeekly = computed(() => props.level === 'weekly')
const isMonthly = computed(() => props.level === 'monthly')

const roleLabel = computed(() => (isDaily.value ? '规划 · 主干' : '规划 · 次要'))
const panelTitle = computed(() => {
  if (isDaily.value) return '规划明日'
  if (isWeekly.value) return '规划下周'
  return '规划下月'
})
const cascadeTitle = computed(() => {
  if (isDaily.value) return '本周周任务'
  if (isWeekly.value) return '本月月任务'
  return ''
})
const cascadeEmpty = computed(() => {
  if (isDaily.value) return '本周周任务为空，先去周统筹安排'
  if (isWeekly.value) return '本月月任务为空，先去月指导安排'
  return ''
})
const saveHint = computed(() => {
  if (isDaily.value) return '保存后将任务解析为每日待办'
  if (isWeekly.value) return '保存为周计划（任务不生成待办）'
  return '保存为月计划（任务不生成待办）'
})

// v0.2修复计划·§3.5：来源链跳转定位透传（PlanningView 经 ref 调 focusLine）
const editorRef = ref<InstanceType<typeof MarkdownEditor> | null>(null)
function focusLine(fragment: string) {
  editorRef.value?.focusLine(fragment)
}
defineExpose({ focusLine })
</script>

<template>
  <section class="panel" :class="{ main: isDaily }">
    <div class="panel-head">
      <div class="panel-title">
        <span class="role-tag" :class="{ main: isDaily }">{{ roleLabel }}</span>
        <h3>{{ panelTitle }}</h3>
        <span class="period-label">{{ periodLabel(level, periodStart) }}</span>
      </div>
      <div class="head-actions">
        <span v-if="saved" class="saved-tag">已保存</span>
        <button class="btn-save" :disabled="saving || loading" @click="emit('save')">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="panel-state">加载中…</div>

    <template v-else>
      <div class="toolbar">
        <div class="field">
          <label>模板</label>
          <select
            :value="selectedTplId ?? ''"
            :disabled="loading || templates.length === 0"
            @change="(e: Event) => emit('selectTpl', (e.target as HTMLSelectElement).value)"
          >
            <option v-if="templates.length === 0" value="">暂无模板</option>
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>

        <div class="ai-zone">
          <button
            class="btn-ai"
            :disabled="!llmReady || guideLoading || loading || templates.length === 0"
            @click="emit('guide')"
            title="AI 引导"
          >
            <AppIcon name="Sparkles" :size="15" />
            {{ guideLoading ? '思考中…' : 'AI 引导' }}
          </button>
          <span v-if="llmReady" class="ai-hint">基于你的待办与项目，调用你配置的 AI</span>
          <button v-else class="go-settings-link" @click="emit('goSettings')">去设置</button>
        </div>

        <span class="save-hint">{{ saveHint }}</span>
      </div>

      <!-- AI 引导内联面板（非模态；禁 v-html） -->
      <div v-if="guideItems.length || guideLoading || guideError" class="ai-panel">
        <div v-if="guideLoading" class="ai-state loading">
          <AppIcon name="Loader" :size="16" class="spin" />
          <span>AI 思考中…</span>
        </div>

        <div v-else-if="guideError" class="ai-state err-bar">
          <AppIcon name="AlertCircle" :size="15" />
          <span>{{ guideError.message }}</span>
          <button class="retry-btn" @click="emit('guide')">重试</button>
          <button class="g-close" title="关闭" @click="emit('clearGuide')">
            <AppIcon name="X" :size="14" />
          </button>
        </div>

        <template v-else>
          <div class="g-head">
            <span class="g-title">AI 引导建议</span>
            <button class="g-close" title="关闭" @click="emit('clearGuide')">
              <AppIcon name="X" :size="14" />
            </button>
          </div>
          <div v-for="(it, i) in guideItems" :key="i" class="g-card">
            <div class="g-top">
              <span class="g-ph">📌 {{ it.placeholder }}</span>
              <div class="g-actions">
                <button class="g-insert" @click="emit('insertSuggestion', it)">插入</button>
                <button class="g-skip" @click="emit('skipSuggestion', i)">跳过</button>
              </div>
            </div>
            <div class="g-q">{{ it.question }}</div>
            <div class="g-s">{{ it.suggestion }}</div>
          </div>
        </template>
      </div>

      <!-- 编辑器 + 级联侧栏 -->
      <div class="body">
        <MarkdownEditor
          ref="editorRef"
          :model-value="modelValue"
          :placeholder="level === 'daily' ? '规划明天的任务…' : '写这一期的规划…'"
          @update:model-value="(v: string) => emit('update:modelValue', v)"
        />
        <CascadeRail
          v-if="!isMonthly"
          :tasks="parentTasks"
          :loading="cascadeLoading"
          :title="cascadeTitle"
          :empty-text="cascadeEmpty"
          :in-draft-texts="inDraftTexts"
          @pick="(t: { text: string; tid: string | null }) => emit('pickTask', t)"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  padding: var(--s5) var(--s6);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-xs);
}
.panel.main { border-color: var(--accent-ring); }
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
}
.panel-title { display: flex; align-items: center; gap: var(--s3); min-width: 0; }
.panel-title h3 { font-size: 16px; font-weight: var(--fw-semibold); color: var(--text-strong); white-space: nowrap; }
.period-label { font-size: var(--fs-caption); color: var(--text-faint); white-space: nowrap; }
.role-tag {
  font-size: 11px;
  font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-wide);
  padding: 3px 10px;
  border-radius: var(--r-pill);
  background: var(--bg-sunken);
  color: var(--text-faint);
  white-space: nowrap;
}
.role-tag.main { background: var(--accent-soft); color: var(--accent); }
.head-actions { display: flex; align-items: center; gap: var(--s3); }
.saved-tag { font-size: 11px; color: var(--ok); font-weight: var(--fw-semibold); letter-spacing: var(--tracking-wide); }
.btn-save {
  padding: var(--s2) var(--s5);
  border-radius: var(--r-md);
  border: none;
  background: var(--accent);
  color: var(--text-on-primary);
  font: var(--fw-semibold) var(--fs-body) var(--font-sans);
  cursor: pointer;
  transition: opacity var(--dur-base);
}
.btn-save:disabled { opacity: .35; cursor: not-allowed; }
.panel-state { text-align: center; color: var(--text-faint); padding: var(--s6); font-size: var(--fs-small); }

.toolbar { display: flex; align-items: center; gap: var(--s4); flex-wrap: wrap; }
.field { display: flex; align-items: center; gap: var(--s2); }
.field label { font-size: var(--fs-small); color: var(--text-faint); white-space: nowrap; }
.field select {
  padding: 7px var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-surface);
  color: var(--text-base);
  font: var(--fs-body) var(--font-sans);
  outline: none;
}
.field select:focus { border-color: var(--accent-ring); }
.save-hint { font-size: var(--fs-caption); color: var(--text-faint); }

.ai-zone { display: flex; align-items: center; gap: var(--s3); }
.btn-ai {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--s2) var(--s4);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-base);
  font: var(--fw-medium) var(--fs-small) var(--font-sans);
  cursor: pointer;
  transition: all var(--dur-base);
}
.btn-ai:hover:not(:disabled) { border-color: var(--accent-ring); background: var(--bg-hover); color: var(--text-strong); }
.btn-ai:disabled { opacity: .4; cursor: not-allowed; }
.ai-hint { font-size: var(--fs-caption); color: var(--text-faint); }
.go-settings-link {
  border: none;
  background: transparent;
  color: var(--accent);
  font: var(--fs-caption) var(--font-sans);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.ai-panel {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s4);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  background: var(--bg-surface-2);
}
.ai-state { display: flex; align-items: center; gap: var(--s2); font-size: var(--fs-small); }
.ai-state.loading { color: var(--text-muted); }
.err-bar {
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-weight: var(--fw-medium);
}
.retry-btn {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  font-size: var(--fs-caption);
  font-family: inherit;
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.g-head { display: flex; align-items: center; }
.g-title { font-size: var(--fs-small); font-weight: var(--fw-semibold); color: var(--text-strong); }
.g-close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
}
.g-close:hover { background: var(--bg-hover); color: var(--text-base); }
.g-card {
  padding: var(--s3) var(--s4);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-md);
  background: var(--bg-surface);
}
.g-top { display: flex; align-items: center; gap: var(--s2); }
.g-ph { font-size: var(--fs-small); font-weight: var(--fw-semibold); color: var(--accent); }
.g-actions { margin-left: auto; display: flex; gap: var(--s2); }
.g-insert {
  padding: 4px 14px;
  border-radius: var(--r-pill);
  border: none;
  background: var(--accent);
  color: var(--text-on-primary);
  font-size: var(--fs-caption);
  font-family: inherit;
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.g-skip {
  padding: 4px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--fs-caption);
  font-family: inherit;
  cursor: pointer;
}
.g-q { margin-top: var(--s2); font-size: var(--fs-body); color: var(--text-strong); }
.g-s { margin-top: var(--s1); font-size: var(--fs-small); color: var(--text-muted); }

.body {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: var(--s4);
  align-items: start;
}
@media (max-width: 900px) {
  .body { grid-template-columns: 1fr; }
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
