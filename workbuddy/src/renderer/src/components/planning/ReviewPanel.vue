<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import CompletionRing from './CompletionRing.vue'
import MonthlyCharts from './MonthlyCharts.vue'
import { periodLabel } from '@shared/period'
import type { PlanningLevel } from '@shared/types'

// 复盘卡：完成率环（确定性）+ AI Markdown 文档（可编辑 + 重新生成）。daily 为确定性轻量回顾。
const props = defineProps<{
  level: PlanningLevel
  periodStart: string
  modelValue: string
  saved: boolean
  ring: { done: number; total: number }
  llmReady: boolean
  generating: boolean
  genError: { code: string; message: string } | null
  genDraft: string
  saving: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  generate: []
  regenerate: []
  clearGen: []
  save: []
  goSettings: []
  applyDraft: [mode: 'replace' | 'append']
}>()

const isDaily = computed(() => props.level === 'daily')
const isMonthly = computed(() => props.level === 'monthly')

const roleLabel = computed(() => (isDaily.value ? '复盘 · 次要' : '复盘 · 主干'))
const panelTitle = computed(() => {
  if (isDaily.value) return '本期复盘'
  if (props.level === 'weekly') return '本周复盘'
  return '本月复盘'
})
const genBtnLabel = computed(() => {
  if (isDaily.value) return '回顾今日'
  if (props.level === 'weekly') return 'AI 周复盘'
  return 'AI 月复盘'
})
const genHint = computed(() => {
  if (isDaily.value) return '基于本日完成与未完成待办，确定性生成回顾（不调用 AI）'
  return '基于本期的任务完成与下级复盘，调用你配置的 AI'
})
const placeholder = computed(() => {
  if (isDaily.value) return '记录今天的回顾…'
  if (props.level === 'weekly') return '回顾本周：目标达成、亮点、不足、风险…'
  return '回顾本月：目标、风险、经验教训、下月建议…'
})
</script>

<template>
  <section class="panel" :class="{ main: !isDaily }">
    <div class="panel-head">
      <div class="panel-title">
        <span class="role-tag" :class="{ main: !isDaily }">{{ roleLabel }}</span>
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
      <!-- 确定性：完成率环（+ 月级图表） -->
      <div class="ring-zone">
        <CompletionRing :done="ring.done" :total="ring.total" />
        <MonthlyCharts v-if="isMonthly" :month-start="periodStart" />
      </div>

      <!-- 生成区 -->
      <div class="gen-zone">
        <button
          class="btn-ai"
          :disabled="generating || (!isDaily && !llmReady)"
          @click="emit('generate')"
        >
          <AppIcon name="Sparkles" :size="15" />
          {{ generating ? '思考中…' : genBtnLabel }}
        </button>
        <span v-if="!isDaily && !llmReady" class="go-settings-link" @click="emit('goSettings')">去设置</span>
        <span class="ai-hint">{{ genHint }}</span>
      </div>

      <!-- 生成错误（红色状态条 + 重试） -->
      <div v-if="genError" class="err-bar">
        <AppIcon name="AlertCircle" :size="15" />
        <span>{{ genError.message }}</span>
        <button class="retry-btn" @click="emit('regenerate')">重试</button>
        <button class="g-close" title="关闭" @click="emit('clearGen')">
          <AppIcon name="X" :size="14" />
        </button>
      </div>

      <!-- 生成草稿预览 + 回填动作（非模态；经 MarkdownEditor/DOMPurify 渲染） -->
      <div v-if="genDraft" class="gen-draft">
        <div class="g-head">
          <span class="g-title">生成草稿</span>
          <button class="g-close" title="关闭" @click="emit('clearGen')">
            <AppIcon name="X" :size="14" />
          </button>
        </div>
        <MarkdownEditor :model-value="genDraft" readonly :toolbar="false" />
        <div class="draft-actions">
          <span class="draft-warn">替换将覆盖当前内容</span>
          <button class="g-insert" @click="emit('applyDraft', 'replace')">替换内容</button>
          <button class="g-insert" @click="emit('applyDraft', 'append')">追加到末尾</button>
          <button class="g-skip" @click="emit('clearGen')">取消</button>
        </div>
      </div>

      <!-- 可编辑复盘文档 -->
      <MarkdownEditor
        :model-value="modelValue"
        :placeholder="placeholder"
        @update:model-value="(v: string) => emit('update:modelValue', v)"
      />
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

.ring-zone {
  display: flex;
  align-items: center;
  gap: var(--s5);
  flex-wrap: wrap;
}

.gen-zone { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; }
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

.err-bar {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--fs-small);
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

.gen-draft {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding: var(--s4);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  background: var(--bg-surface-2);
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
.draft-actions { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.draft-warn { margin-right: auto; font-size: var(--fs-caption); color: var(--warn); }
.g-insert {
  padding: 6px 16px;
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
  padding: 6px 16px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--fs-caption);
  font-family: inherit;
  cursor: pointer;
}
</style>
