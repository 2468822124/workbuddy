<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

// F1（复审批次2）：defineProps/defineEmits 必须赋值绑定 —— 未绑定时 script 内 `props`/`emit`
// 为 undefined，setup 阶段 watch getter 即抛 Unhandled error → 整页白屏。
const props = defineProps<{
  weekContent: string | null
  monthContent: string | null
  savingWeek: boolean
  savingMonth: boolean
  weekError: string | null
  monthError: string | null
}>()

const emit = defineEmits<{ save: [scope: 'week' | 'month', content: string] }>()

// 本地草稿：父级 content 仅在保存成功后更新 → 失败时 watch 不触发 → textarea 内容保留（F2 失败保真）
const weekText = ref('')
const monthText = ref('')

watch(() => props.weekContent, c => { weekText.value = c ?? '' })
watch(() => props.monthContent, c => { monthText.value = c ?? '' })

function doSave(scope: 'week' | 'month'): void {
  emit('save', scope, scope === 'week' ? weekText.value : monthText.value)
}
</script>

<template>
  <section class="journal card">
    <header class="head">
      <h3 class="title">感想</h3>
      <span class="hint">周感想=所选周 · 月感想=起始日所在月（规格 §9.3）</span>
    </header>

    <div class="block">
      <div class="block-head">
        <h4 class="block-title"><AppIcon name="BookOpen" size="15" />周感想</h4>
        <button class="save-btn" :disabled="savingWeek" @click="doSave('week')">
          {{ savingWeek ? '保存中…' : '保存' }}
        </button>
      </div>
      <textarea v-model="weekText" class="input" rows="4" placeholder="本周回顾、收获与改进…" />
      <div v-if="weekError" class="err">{{ weekError }}</div>
    </div>

    <div class="block">
      <div class="block-head">
        <h4 class="block-title"><AppIcon name="BookMarked" size="15" />月感想</h4>
        <button class="save-btn" :disabled="savingMonth" @click="doSave('month')">
          {{ savingMonth ? '保存中…' : '保存' }}
        </button>
      </div>
      <textarea v-model="monthText" class="input" rows="4" placeholder="本月整体回顾与目标复盘…" />
      <div v-if="monthError" class="err">{{ monthError }}</div>
    </div>
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
  margin-bottom: var(--s5);
}
.title { margin: 0; font-size: var(--fs-h2); font-weight: var(--fw-semibold); color: var(--text-strong); }
.hint { font-size: var(--fs-caption); color: var(--text-faint); }
.block {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}
.block + .block { margin-top: var(--s5); }
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
}
.block-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.save-btn {
  font-family: inherit;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-ring);
  border-radius: var(--r-md);
  padding: var(--s2) var(--s4);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.save-btn:hover:not(:disabled) { background: var(--accent); color: var(--text-on-primary); }
.save-btn:disabled { opacity: .5; cursor: not-allowed; }
.input {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-strong);
  background: var(--bg-sunken);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-md);
  padding: var(--s3) var(--s4);
  resize: vertical;
}
.input:focus { outline: none; border-color: var(--accent-ring); }
.err {
  font-size: var(--fs-caption);
  color: var(--danger);
  background: var(--danger-faint);
  border-radius: var(--r-md);
  padding: var(--s2) var(--s3);
}
</style>
