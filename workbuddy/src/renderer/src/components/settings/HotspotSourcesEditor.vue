<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps<{ sourcesJson: string }>()
const emit = defineEmits<{ save: [json: string] }>()

interface Provider { id: string; name: string; type: string; url: string }

const providers = ref<Provider[]>([])
const newName = ref('')
const newUrl = ref('')

watch(() => props.sourcesJson, (v) => {
  try { providers.value = JSON.parse(v) }
  catch { providers.value = [] }
}, { immediate: true })

function add() {
  if (!newName.value.trim() || !newUrl.value.trim()) return
  if (!/^https?:\/\/.+/.test(newUrl.value.trim())) return
  providers.value.push({
    id: Date.now().toString(36),
    name: newName.value.trim(),
    type: 'rss',
    url: newUrl.value.trim(),
  })
  newName.value = ''
  newUrl.value = ''
  commit()
}

function remove(id: string) {
  providers.value = providers.value.filter(p => p.id !== id)
  commit()
}

function update(index: number, field: 'name' | 'url', value: string) {
  providers.value[index] = { ...providers.value[index], [field]: value }
}

function commit() {
  emit('save', JSON.stringify(providers.value))
}
</script>

<template>
  <div class="editor">
    <div v-for="(p, i) in providers" :key="p.id" class="row">
      <input :value="p.name" class="pf" placeholder="名称" @input="update(i, 'name', ($event.target as HTMLInputElement).value)" @blur="commit" />
      <input :value="p.url" class="pf url" placeholder="https://..." @input="update(i, 'url', ($event.target as HTMLInputElement).value)" @blur="commit" />
      <button class="del" @click="remove(p.id)"><AppIcon name="Trash2" :size="14" /></button>
    </div>
    <div class="add-row">
      <input v-model="newName" class="pf" placeholder="源名称" />
      <input v-model="newUrl" class="pf url" placeholder="https://..." />
      <button class="add-btn" @click="add"><AppIcon name="Plus" :size="15" /> 添加</button>
    </div>
  </div>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; gap: var(--s3); }
.row, .add-row { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.pf { font-family: inherit; font-size: var(--fs-small); padding: 7px 10px; border-radius: var(--r-sm); border: 1px solid var(--border-soft); background: var(--bg-sunken); color: var(--text-base); outline: none; flex: 1; min-width: 100px; }
.pf.url { flex: 2; }
.pf:focus { border-color: var(--accent-ring); }
.del { background: none; border: none; cursor: pointer; color: var(--text-faint); padding: 4px; border-radius: var(--r-sm); }
.del:hover { color: var(--danger); }
.add-btn { display: inline-flex; align-items: center; gap: var(--s1); font-family: inherit; font-size: var(--fs-small); padding: 7px 12px; border-radius: var(--r-md); background: var(--accent); color: var(--text-on-primary); border: none; cursor: pointer; }
.add-btn:hover { background: var(--accent-hover); }
</style>
