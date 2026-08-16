<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjects } from '@/composables/useProjects'
import AppIcon from '@/components/AppIcon.vue'
import KanbanBoard from '@/components/project/KanbanBoard.vue'
import ProjectListView from '@/components/project/ProjectListView.vue'
import ProjectForm from '@/components/project/ProjectForm.vue'

const router = useRouter()
const { projects, viewMode, toggleView, load, create, remove, changeStatus } = useProjects()
const showForm = ref(false)
const deleteId = ref<string | null>(null)
let delTimer: ReturnType<typeof setTimeout> | undefined

onMounted(load)

function onSave(data: { name: string; description?: string }) {
  create(data.name, data.description)
}

function onEdit(id: string) {
  router.push('/projects/' + id)
}

function requestDelete(id: string) {
  deleteId.value = id
  clearTimeout(delTimer)
  delTimer = setTimeout(() => { deleteId.value = null }, 3000)
}

async function doDelete() {
  if (!deleteId.value) return
  await remove(deleteId.value)
  deleteId.value = null
}

function cancelDelete() {
  clearTimeout(delTimer)
  deleteId.value = null
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="tabs">
        <button :class="{ active: viewMode === 'kanban' }" @click="toggleView('kanban')">看板</button>
        <button :class="{ active: viewMode === 'list' }" @click="toggleView('list')">列表</button>
      </div>
      <button class="btn-add" @click="showForm = !showForm">
        <AppIcon name="Plus" :size="17" />新建项目
      </button>
    </div>

    <ProjectForm :show="showForm" @close="showForm = false" @save="onSave" />

    <KanbanBoard v-if="viewMode === 'kanban'" :projects="projects" @move="changeStatus" />
    <ProjectListView v-else :projects="projects" @select="onEdit" @edit="onEdit" @remove="requestDelete" />

    <!-- inline delete confirm -->
    <div v-if="deleteId" class="del-bar">
      <span>确认删除此项目？（任务将保留，仅取消关联）</span>
      <button class="yes" @click="doDelete">确认</button>
      <button class="no" @click="cancelDelete">取消</button>
    </div>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--s5); }
.top { display: flex; align-items: center; gap: var(--s4); flex-wrap: wrap; }
.tabs { display: flex; border-radius: var(--r-md); overflow: hidden; border: 1px solid var(--border-soft); }
.tabs button { font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium); padding: 8px 16px; background: var(--bg-surface); color: var(--text-muted); border: none; cursor: pointer; transition: all var(--dur-base); }
.tabs button.active { background: var(--accent-soft); color: var(--accent); }
.tabs button:hover:not(.active) { background: var(--bg-hover); }
.btn-add { display: inline-flex; align-items: center; gap: var(--s2); font-family: inherit; font-size: var(--fs-body); font-weight: var(--fw-medium); padding: 8px 16px; border-radius: var(--r-md); background: var(--accent); color: var(--text-on-primary); border: none; cursor: pointer; transition: all var(--dur-base); }
.btn-add:hover { background: var(--accent-hover); }
.del-bar { display: flex; align-items: center; gap: var(--s3); padding: var(--s4); background: var(--danger-faint); border-radius: var(--r-md); font-size: var(--fs-small); color: var(--danger); }
.del-bar .yes { font-family: inherit; font-size: var(--fs-small); padding: 4px 12px; border-radius: var(--r-sm); border: 1px solid var(--danger); background: var(--danger); color: var(--text-on-primary); cursor: pointer; font-weight: var(--fw-medium); }
.del-bar .no { font-family: inherit; font-size: var(--fs-small); padding: 4px 12px; border-radius: var(--r-sm); border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; }
</style>
