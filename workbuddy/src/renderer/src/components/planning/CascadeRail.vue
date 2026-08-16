<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

// 上级任务点选侧栏：未消费 + 不在编辑中计划内 →「选取」下沉到本级；
// 已消费（todo 完成触发 [x]）→ 不再显示（业务规则3）；
// 已在编辑中计划内（inDraftTexts，planDraft 派生）→ 隐藏——选取即隐、保存后跨日持续隐藏、
// 未保存丢弃（planDraft 重置）回显（F3-1.3-A；替代 F3-1.2 会话级乐观隐藏）
const props = defineProps<{
  // v0.2修复计划：tid 惰性分配（未分配为 null；pick 传整对象，prepareTaskLink 按 tid/文本定位）
  // 第二轮实测·问题①：scheduledInPeriod=本期已安排（后端按 parent:{tid} 扫描子级计划）→ 全期隐藏
  tasks: { text: string; consumed: boolean; tid: string | null; scheduledInPeriod: boolean }[]
  loading: boolean
  title: string
  emptyText?: string
  inDraftTexts: Set<string>
}>()

const emit = defineEmits<{ pick: [task: { text: string; tid: string | null }] }>()

// 三轴隐藏：①consumed（todo 完成）②inDraftTexts（当日草稿文本）③scheduledInPeriod（本期已安排，tid 关联跨天/改名稳定）
const activeTasks = computed(() =>
  props.tasks.filter(t => !t.consumed && !t.scheduledInPeriod && !props.inDraftTexts.has(t.text))
)
</script>

<template>
  <aside class="rail">
    <div class="rail-head">
      <span class="rail-title">{{ title }}</span>
      <span v-if="!loading" class="rail-count">{{ activeTasks.length }} 可选</span>
    </div>

    <div v-if="loading" class="rail-state">
      <AppIcon name="Loader" :size="14" class="spin" />
      <span>加载中…</span>
    </div>

    <div v-else-if="activeTasks.length === 0" class="rail-state">
      <span>{{ emptyText ?? '暂无上级任务' }}</span>
    </div>

    <div v-else class="rail-list">
      <div v-for="(t, i) in activeTasks" :key="i" class="rail-row">
        <span class="rail-text">{{ t.text }}</span>
        <button class="pick-btn" @click="emit('pick', { text: t.text, tid: t.tid })">选取</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  min-width: 0;
}
.rail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s2);
}
.rail-title {
  font-size: var(--fs-small);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.rail-count {
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: var(--tracking-wide);
}
.rail-state {
  display: flex;
  align-items: center;
  gap: var(--s2);
  color: var(--text-faint);
  font-size: var(--fs-caption);
  padding: var(--s4) 0;
  justify-content: center;
}
.rail-list {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  max-height: 380px;
  overflow-y: auto;
}
.rail-row {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: 8px 10px;
  border-radius: var(--r-md);
  background: var(--bg-sunken);
  border: 1px solid var(--border-soft);
  transition: all var(--dur-base);
}
.rail-text {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-small);
  color: var(--text-base);
  line-height: var(--lh-base);
  word-break: break-word;
}
.pick-btn {
  flex-shrink: 0;
  padding: 3px 12px;
  border-radius: var(--r-pill);
  border: none;
  background: var(--accent);
  color: var(--text-on-primary);
  font-size: var(--fs-caption);
  font-family: inherit;
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: all var(--dur-base);
}
.pick-btn:hover { background: var(--accent-hover); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
