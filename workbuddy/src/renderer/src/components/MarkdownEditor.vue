<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import AppIcon from './AppIcon.vue'
// 第三轮实测·问题甲：textarea 显纯文本（剥 tid 注释），回写按行 reconcile 保留注释
import { displayPlanContent, reconcilePlanContent } from '@/lib/planTid'

const props = withDefaults(
  defineProps<{
    modelValue: string
    readonly?: boolean
    placeholder?: string
    toolbar?: boolean
    showPreview?: boolean
  }>(),
  { readonly: false, placeholder: '', toolbar: true, showPreview: true },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

// ---- mode ----
const previewVisible = ref(props.showPreview)
function togglePreview() {
  previewVisible.value = !previewVisible.value
}

// ---- marked / DOMpurify ----
const renderedHtml = computed(() => {
  try {
    const raw = marked.parse(props.modelValue || '', { breaks: false, gfm: true }) as string
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })
  } catch {
    return '<p style="color:var(--text-faint)">预览不可用，仅显示源码</p>'
  }
})

// ---- textarea ref ----
const ta = ref<HTMLTextAreaElement>()

// 编辑面显示文本：剥任务行 tid 注释（raw 仍为真相源，注释保留在 modelValue）
const displayText = computed(() => displayPlanContent(props.modelValue))

function onInput(e: Event) {
  const nextDisplay = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', reconcilePlanContent(props.modelValue, nextDisplay))
}

// toolbar actions
const btnDefs = [
  { label: '粗体',       icon: 'Bold',      prefix: '**', suffix: '**', hint: '粗体 (Ctrl+B)' },
  { label: '斜体',       icon: 'Italic',    prefix: '_',  suffix: '_',  hint: '斜体 (Ctrl+I)' },
  { label: '标题',       icon: 'Heading',   prefix: '## ', suffix: '',   hint: '标题' },
  { label: '任务',       icon: 'ListChecks',prefix: '- [ ] ',suffix: '',  hint: '任务列表' },
  { label: '无序列表',    icon: 'List',      prefix: '- ',   suffix: '',   hint: '无序列表' },
  { label: '链接',       icon: 'Link',      prefix: '[',    suffix: '](url)', hint: '链接' },
]

function insertSyntax(prefix: string, suffix: string) {
  if (!ta.value) return
  const el = ta.value
  const start = el.selectionStart
  const end   = el.selectionEnd
  // 基于 display 文本操作（textarea 实际内容），回写经 reconcile 保留注释
  const selected = displayText.value.slice(start, end)
  const replacement = prefix + selected + suffix
  const newDisplay = displayText.value.slice(0, start) + replacement + displayText.value.slice(end)
  emit('update:modelValue', reconcilePlanContent(props.modelValue, newDisplay))
  nextTick(() => {
    el.focus()
    const cursor = start + prefix.length + selected.length
    el.setSelectionRange(cursor, cursor)
  })
}

// resize textarea height on input
function autoResize() {
  if (!ta.value) return
  ta.value.style.height = 'auto'
  ta.value.style.height = ta.value.scrollHeight + 'px'
}
watch(() => props.modelValue, autoResize, { immediate: true })

// v0.2修复计划·§3.5：来源链跳转定位 —— 按片段找行，选中整行 + 滚动到可视区（不修改内容）。
// 片段用 `tid:{hex}`（content 内唯一）；找不到（行被改/删）→ 静默 no-op，不抛不崩。
// 第三轮实测·问题甲：注释已从 textarea 隐藏 → 片段在 raw modelValue 定位行号，
// display 与 raw 行号一致（display 即逐行剥注释）→ 按行号在 textarea 选中。
function focusLine(fragment: string) {
  if (!ta.value || !fragment) return
  const raw = props.modelValue
  const at = raw.indexOf(fragment)
  if (at === -1) return
  const rawLineStart = raw.lastIndexOf('\n', at - 1) + 1
  const lineNo = raw.slice(0, rawLineStart).split('\n').length - 1
  // 在 display 文本中定位同行（行号对齐）
  const val = ta.value.value
  const lines = val.split('\n')
  if (lineNo >= lines.length) return
  let lineStart = 0
  for (let i = 0; i < lineNo; i++) lineStart += lines[i].length + 1
  const lineEnd = lineStart + lines[lineNo].length
  ta.value.focus()
  ta.value.setSelectionRange(lineStart, lineEnd)
  const totalLines = lines.length
  const maxTop = ta.value.scrollHeight - ta.value.clientHeight
  ta.value.scrollTop = Math.max(0, Math.min(maxTop, (lineNo / Math.max(1, totalLines - 1)) * maxTop))
}
defineExpose({ focusLine })
</script>

<template>
  <div class="mde" :class="{ readonly: readonly }">
    <!-- toolbar -->
    <div v-if="toolbar && !readonly" class="mde-tb">
      <button
        v-for="b in btnDefs"
        :key="b.label"
        class="mde-tb-btn"
        :title="b.hint"
        type="button"
        @click="insertSyntax(b.prefix, b.suffix)"
      >
        <AppIcon :name="b.icon" :size="16" />
      </button>
      <span class="mde-tb-spacer" />
      <button
        class="mde-tb-btn"
        :title="previewVisible ? '隐藏预览' : '显示预览'"
        type="button"
        @click="togglePreview"
      >
        <AppIcon :name="previewVisible ? 'Eye' : 'EyeOff'" :size="16" />
      </button>
    </div>

    <!-- body -->
    <div class="mde-body" :class="{ split: previewVisible }">
      <textarea
        ref="ta"
        class="mde-src"
        :value="displayText"
        :readonly="readonly"
        :placeholder="placeholder"
        :disabled="readonly"
        @input="onInput"
      />

      <div v-if="previewVisible" class="mde-preview markdown-body" v-html="renderedHtml" />
    </div>
  </div>
</template>

<style scoped>
.mde {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg, 14px);
  overflow: hidden;
  background: var(--bg-surface);
  transition: border-color var(--dur-base, 200ms);
}
.mde:focus-within { border-color: var(--accent-ring); }

/* toolbar */
.mde-tb {
  display: flex;
  align-items: center;
  gap: var(--s1, 4px);
  padding: var(--s2, 8px) var(--s3, 12px);
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-surface-2);
}
.mde-tb-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm, 6px);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--dur-base, 200ms), color var(--dur-base, 200ms);
}
.mde-tb-btn:hover { background: var(--bg-hover); color: var(--text-strong); }
.mde-tb-btn:active { background: var(--bg-sunken); }
.mde-tb-spacer { flex: 1; }

/* body */
.mde-body { display: flex; min-height: 280px; }
.mde-body.split { min-height: 320px; }

.mde-src {
  flex: 1;
  min-width: 0;
  background: var(--bg-surface);
  color: var(--text-base);
  font: var(--fs-body, 14.5px) / var(--lh-base, 1.6) var(--font-sans);
  border: none;
  outline: none;
  padding: var(--s4, 16px);
  resize: vertical;
  tab-size: 2;
  overflow-y: hidden;
}
.mde-src::placeholder { color: var(--text-faint); }
.mde-src:disabled, .mde-src[readonly] {
  opacity: 1;
  -webkit-text-fill-color: var(--text-base);
  cursor: default;
}

.mde-preview {
  flex: 1;
  min-width: 0;
  padding: var(--s4, 16px);
  border-left: 1px solid var(--border-soft);
  overflow-y: auto;
  background: var(--bg-app);
  font: var(--fs-body, 14.5px) / var(--lh-base, 1.6) var(--font-sans);
  color: var(--text-base);
}

/* markdown-body scoped styles (matches editor area) */
.markdown-body :deep(h1),
.markdown-body :deep(h2) {
  color: var(--text-strong);
  font-weight: var(--fw-bold, 700);
  margin-top: 0;
  margin-bottom: var(--s3, 12px);
  line-height: var(--lh-tight, 1.25);
}
.markdown-body :deep(h1) { font-size: var(--fs-h1, 22px); }
.markdown-body :deep(h2) { font-size: var(--fs-h2, 17px); }
.markdown-body :deep(p) { margin: 0 0 var(--s2, 8px); }
.markdown-body :deep(ul) { padding-left: var(--s5, 20px); margin: 0 0 var(--s2, 8px); }
.markdown-body :deep(li) { margin-bottom: var(--s1, 4px); }
.markdown-body :deep(li:has(input[type=checkbox])) {
  list-style: none;
  margin-left: calc(-1 * var(--s5, 20px));
}
.markdown-body :deep(input[type=checkbox]) {
  accent-color: var(--accent);
  pointer-events: none;
  margin-right: var(--s2, 8px);
  transform: scale(1.15);
}
.markdown-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}
.markdown-body :deep(a:hover) { color: var(--accent-hover); }
.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-soft);
  margin: var(--s4, 16px) 0;
}
.markdown-body :deep(code) {
  background: var(--bg-sunken);
  padding: 1px 6px;
  border-radius: var(--r-sm, 4px);
  font-size: var(--fs-small, 13px);
  font-family: 'SF Mono', 'Fira Code', monospace;
}
.markdown-body :deep(pre) {
  background: var(--bg-sunken);
  border-radius: var(--r-md, 10px);
  padding: var(--s4, 16px);
  overflow-x: auto;
}
.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: var(--fs-small, 13px);
}

/* responsive: stack on narrow */
@media (width < 720px) {
  .mde-body.split { flex-direction: column; min-height: 360px; }
  .mde-preview { border-left: none; border-top: 1px solid var(--border-soft); max-height: 50vh; }
}
</style>
