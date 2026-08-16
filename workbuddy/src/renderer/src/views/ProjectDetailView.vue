<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectDetail } from '@/composables/useProjectDetail'
import AppIcon from '@/components/AppIcon.vue'
import BaseCard from '@/components/BaseCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import ProjectForm from '@/components/project/ProjectForm.vue'
import TaskRow from '@/components/project/TaskRow.vue'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string
const { project, todos, notFound, load, updateProject, removeProject, createTodo, updateTodo, deleteTodo, toggleTodo } = useProjectDetail(id)

const showEdit = ref(false)
const showNewTask = ref(false)
const newContent = ref('')
const newDate = ref('')
const delConfirm = ref(false)
let delTimer: ReturnType<typeof setTimeout> | undefined

onMounted(load)

function onEditSave(data: { name: string; description?: string; status?: string }) {
  updateProject(data)
}

async function doRemove() {
  const ok = await removeProject()
  if (ok) router.push('/projects')
}

function requestDelete() {
  delConfirm.value = true
  delTimer = setTimeout(() => { delConfirm.value = false }, 3000)
}

function cancelDelete() {
  clearTimeout(delTimer)
  delConfirm.value = false
}

function onAddTask() {
  if (!newContent.value.trim()) return
  createTodo(newContent.value.trim(), newDate.value || null)
  newContent.value = ''
  newDate.value = ''
}
</script>

<template>
  <div v-if="notFound" class="page">
    <BaseCard>
      <EmptyState icon="FolderKanban" title="项目不存在或已删除" description="你访问的项目可能已被移除。" />
      <div style="text-align:center;margin-top:var(--s4)"><button class="back-btn" @click="router.push('/projects')">← 返回项目列表</button></div>
    </BaseCard>
  </div>

  <div v-else-if="project" class="page">
    <!-- Header -->
    <div class="header">
      <button class="back" @click="router.push('/projects')"><AppIcon name="ChevronLeft" :size="18" /> 返回</button>
      <div class="title-row">
        <h1>{{ project.name }}</h1>
        <span class="badge" :class="'s-' + project.status">{{
          { active: '进行中', paused: '已暂停', done: '已完成', dropped: '已放弃' }[project.status]
        }}</span>
      </div>
      <p v-if="project.description" class="desc">{{ project.description }}</p>
      <div class="header-acts">
        <button class="act" @click="showEdit = !showEdit"><AppIcon name="Pencil" :size="15" /> 编辑</button>
        <template v-if="!delConfirm">
          <button class="act del" @click="requestDelete"><AppIcon name="Trash2" :size="15" /> 删除</button>
        </template>
        <template v-else>
          <span class="cfm-text">确认删除？</span>
          <button class="act yes" @click="doRemove">确认</button>
          <button class="act no" @click="cancelDelete">取消</button>
        </template>
      </div>
    </div>

    <ProjectForm :project="project" :show="showEdit" @close="showEdit = false" @save="onEditSave" />

    <!-- Tasks -->
    <BaseCard>
      <div class="card-head">
        <div class="ico"><AppIcon name="CheckSquare" :size="18" /></div>
        <div><h2>任务列表</h2><div class="sub">{{ project.openTasks }} / {{ project.totalTasks }} 未完成</div></div>
        <div class="spacer" />
        <button class="add-btn" @click="showNewTask = !showNewTask"><AppIcon name="Plus" :size="16" /> 新增</button>
      </div>

      <div v-if="showNewTask" class="new-task">
        <input v-model="newContent" class="ni" placeholder="任务内容" maxlength="200" @keydown.enter="onAddTask" />
        <input v-model="newDate" type="date" class="ni dt" />
        <button class="save" @click="onAddTask"><AppIcon name="Check" :size="16" /></button>
      </div>

      <div v-if="todos.length === 0 && !showNewTask" class="empty-hint">暂无任务 · 点击「新增」添加</div>

      <div class="task-list">
        <TaskRow
          v-for="t in todos" :key="t.id"
          :todo="t"
          @toggle="toggleTodo"
          @update="(tid, d) => updateTodo(tid, d)"
          @delete="(tid) => deleteTodo(tid)"
        />
      </div>
    </BaseCard>

    <!-- 关联笔记（空状态） -->
    <BaseCard>
      <EmptyState icon="Library" title="关联笔记即将上线" description="知识库模块完成后可关联读书笔记与原子笔记。" />
    </BaseCard>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--s5); }
.header { background: var(--bg-surface); border: 1px solid var(--border-soft); border-radius: var(--r-xl); padding: var(--s6); box-shadow: var(--shadow-sm); }
.back { font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium); color: var(--text-muted); background: none; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; padding: 0; margin-bottom: var(--s4); }
.back:hover { color: var(--accent); }
.title-row { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; }
h1 { font-size: var(--fs-h1); font-weight: var(--fw-bold); color: var(--text-strong); }
.badge { font-size: var(--fs-caption); padding: 3px 10px; border-radius: var(--r-pill); font-weight: var(--fw-medium); }
.s-active { background: var(--cat-work-soft); color: var(--accent); }
.s-paused { background: var(--warn-soft); color: var(--warn); }
.s-done { background: var(--ok-soft); color: var(--ok); }
.s-dropped { background: var(--bg-sunken); color: var(--text-faint); }
.desc { color: var(--text-muted); margin-top: var(--s3); font-size: var(--fs-body); }
.header-acts { display: flex; gap: var(--s2); margin-top: var(--s4); }
.act { font-family: inherit; font-size: var(--fs-small); display: inline-flex; align-items: center; gap: var(--s1); padding: 6px 12px; border-radius: var(--r-md); border: 1px solid var(--border-soft); background: transparent; color: var(--text-muted); cursor: pointer; transition: all var(--dur-base); }
.act:hover { background: var(--bg-hover); color: var(--accent); }
.act.del:hover { color: var(--danger); border-color: var(--danger); }
.act.yes { color: var(--danger); border-color: var(--danger); font-weight: var(--fw-semibold); }
.act.no { color: var(--text-muted); }
.cfm-text { font-size: var(--fs-small); color: var(--danger); }

/* Card */
.card-head { display: flex; align-items: center; gap: var(--s3); margin-bottom: var(--s5); }
.ico { width: 34px; height: 34px; border-radius: var(--r-md); display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
h2 { font-size: 16px; font-weight: var(--fw-semibold); color: var(--text-strong); }
.sub { font-size: var(--fs-caption); color: var(--text-faint); margin-top: 1px; }
.spacer { flex: 1; }
.add-btn { font-family: inherit; font-size: var(--fs-small); display: inline-flex; align-items: center; gap: var(--s1); padding: 6px 12px; border-radius: var(--r-md); background: var(--accent); color: var(--text-on-primary); border: none; cursor: pointer; }
.add-btn:hover { background: var(--accent-hover); }

.new-task { display: flex; gap: var(--s3); margin-bottom: var(--s4); padding: var(--s3); background: var(--bg-sunken); border-radius: var(--r-md); }
.ni { font-family: inherit; font-size: var(--fs-body); padding: 8px 10px; border-radius: var(--r-sm); border: 1px solid var(--border-soft); background: var(--bg-surface); color: var(--text-base); outline: none; flex: 1; }
.ni.dt { width: 140px; flex: none; }
.ni:focus { border-color: var(--accent-ring); }
.save { background: var(--ok); border: none; border-radius: var(--r-sm); cursor: pointer; color: var(--text-on-primary); padding: 8px 10px; display: grid; place-items: center; }

.task-list { display: flex; flex-direction: column; gap: var(--s1); }
.empty-hint { text-align: center; color: var(--text-faint); padding: var(--s8); font-size: var(--fs-small); }
.back-btn { font-family: inherit; font-size: var(--fs-body); color: var(--accent); background: none; border: none; cursor: pointer; font-weight: var(--fw-medium); }
.back-btn:hover { color: var(--accent-press); }
</style>
