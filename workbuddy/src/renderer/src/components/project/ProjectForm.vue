<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Project } from '@shared/types'

const props = defineProps<{
  project?: Project & { totalTasks?: number; openTasks?: number }
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [data: { name: string; description?: string; status?: string }]
}>()

const name = ref('')
const description = ref('')
const status = ref('active')

watch(() => props.show, (v) => {
  if (v && props.project) {
    name.value = props.project.name
    description.value = props.project.description ?? ''
    status.value = props.project.status
  } else if (v) {
    name.value = ''
    description.value = ''
    status.value = 'active'
  }
})

function submit() {
  if (!name.value.trim()) return
  emit('save', {
    name: name.value.trim(),
    description: description.value.trim() || undefined,
    status: status.value,
  })
  emit('close')
}
</script>

<template>
  <transition name="slide">
    <div v-if="show" class="panel">
      <div class="fields">
        <input v-model="name" class="input" placeholder="项目名称（必填）" maxlength="80" @keydown.enter="submit" />
        <input v-model="description" class="input" placeholder="描述（选填）" maxlength="500" />
        <select v-if="project" v-model="status" class="input select">
          <option value="active">进行中</option>
          <option value="paused">已暂停</option>
          <option value="done">已完成</option>
          <option value="dropped">已放弃</option>
        </select>
      </div>
      <div class="actions">
        <button class="btn-cancel" @click="$emit('close')">取消</button>
        <button class="btn-save" @click="submit" :disabled="!name.trim()">保存</button>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.panel { background: var(--bg-surface); border: 1px solid var(--border-soft); border-radius: var(--r-lg); padding: var(--s5) var(--s6); box-shadow: var(--shadow-sm); margin-bottom: var(--s5); }
.fields { display: flex; flex-wrap: wrap; gap: var(--s3); }
.input { font-family: inherit; font-size: var(--fs-body); padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--border-soft); background: var(--bg-sunken); color: var(--text-base); outline: none; min-width: 200px; flex: 1; }
.input:focus { border-color: var(--accent-ring); }
.select { cursor: pointer; }
.actions { display: flex; gap: var(--s2); margin-top: var(--s4); }
.btn-cancel, .btn-save { font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium); padding: 8px 16px; border-radius: var(--r-md); cursor: pointer; transition: all var(--dur-base); border: 1px solid var(--border); }
.btn-cancel { background: transparent; color: var(--text-muted); }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-base); }
.btn-save { background: var(--accent); color: var(--text-on-primary); border-color: transparent; }
.btn-save:hover { background: var(--accent-hover); }
.btn-save:disabled { opacity: .5; cursor: not-allowed; }
.slide-enter-active, .slide-leave-active { transition: all var(--dur-base) var(--ease-out); }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
