<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps<{
  /** 日期 YYYY-MM-DD */
  date: string
  /** 已有内容（null = 无记录） */
  content: string | null
}>()

const emit = defineEmits<{
  save: [content: string]
}>()

const text = ref('')
const saving = ref(false)

watch(() => props.content, (c) => {
  text.value = c ?? ''
})

watch(() => props.date, () => {
  text.value = props.content ?? ''
})

async function doSave(): Promise<void> {
  saving.value = true
  emit('save', text.value)
  // 外层 save 成功后会 setInfo，这里只做 loading 态
  setTimeout(() => { saving.value = false }, 1000)
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <AppIcon name="NotebookPen" :size="18" />
        <h2>今日感想</h2>
      </div>
      <button
        class="save-btn"
        :disabled="saving"
        @click="doSave"
      >
        <AppIcon name="Check" :size="14" />
        <span>保存</span>
      </button>
    </header>
    <textarea
      v-model="text"
      class="textarea"
      placeholder="记录今天的感想…"
      rows="5"
    ></textarea>
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
.save-btn {
  display: inline-flex; align-items: center; gap: var(--s1);
  font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium);
  color: var(--accent); background: var(--accent-soft);
  border: none; border-radius: var(--r-pill);
  padding: var(--s2) var(--s4); cursor: pointer;
  transition: all var(--dur-fast);
}
.save-btn:hover { background: var(--accent-ring); }
.save-btn:disabled { opacity: .5; cursor: default; }
.textarea {
  font-family: inherit; font-size: var(--fs-body); line-height: var(--lh-base);
  color: var(--text-base); background: var(--bg-sunken);
  border: 1px solid var(--border-soft); border-radius: var(--r-md);
  padding: var(--s4); outline: none; resize: vertical;
  min-height: 80px;
}
.textarea:focus { border-color: var(--accent-ring); }
.textarea::placeholder { color: var(--text-faint); }
</style>