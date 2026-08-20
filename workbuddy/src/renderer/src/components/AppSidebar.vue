<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'

const router = useRouter()
const route = useRoute()

const navItems = [
  { path: '/today', label: '今日总览', icon: 'LayoutGrid' as const, disabled: false },
  { path: '/projects', label: '项目', icon: 'FolderKanban' as const, disabled: false },
  // 阶段6：规划组四入口统一切换到 flow 正式路径（规格 §5.1；旧 /planning 不再进入）
  {
    path: '/planning',
    label: '规划',
    icon: 'Calendar' as const,
    disabled: false,
    children: [
      { path: '/flow/day', label: '日规划', icon: 'Calendar' as const },
      { path: '/flow/week', label: '周统筹', icon: 'RefreshCw' as const },
      { path: '/flow/month', label: '月指导', icon: 'Calendar' as const },
      { path: '/flow/review', label: '复盘趋势', icon: 'Calendar' as const },
    ],
  },
  { path: '/knowledge', label: '知识库', icon: 'Library' as const, disabled: true, coming: '敬请期待' },
  { path: '/workout', label: '运动', icon: 'Dumbbell' as const, disabled: true, coming: '敬请期待' },
]

interface NavChild {
  path: string
  label: string
  icon: 'Calendar' | 'RefreshCw'
}

const expanded = ref(false)
const planningExpanded = computed(() => {
  const pl = navItems.find(i => i.path === '/planning')
  return pl && 'children' in pl && (pl.children as NavChild[]).some(c => isActive(c.path))
})
const isPlanningActive = computed(() => planningExpanded.value)

function togglePlanning() {
  expanded.value = !expanded.value
}

const systemItems = [
  { path: '/settings', label: '设置', icon: 'Settings' as const, disabled: false },
]

function isActive(p: string): boolean {
  return route.path.startsWith(p)
}

function navigate(p: string, disabled: boolean) {
  if (disabled) return
  router.push(p)
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">
        <AppIcon name="Sparkles" :size="21" />
      </div>
      <div class="brand-text">
        <b>WorkBuddy</b>
        <span>你的工作伙伴</span>
      </div>
    </div>

    <nav class="nav">
      <div class="nav-label">工作台</div>
      <div v-for="item in navItems" :key="item.path">
        <div
          v-if="'children' in item"
          class="nav-item"
          :class="{ active: isPlanningActive, disabled: item.disabled }"
          @click="togglePlanning"
        >
          <AppIcon :name="item.icon" :size="19" />
          <span class="lbl">{{ item.label }}</span>
          <span class="nav-caret" :class="{ open: expanded || planningExpanded }">
            <AppIcon name="ChevronRight" :size="14" />
          </span>
        </div>
        <div v-else class="nav-item" :class="{ active: isActive(item.path), disabled: item.disabled }" @click="navigate(item.path, item.disabled)">
          <AppIcon :name="item.icon" :size="19" />
          <span class="lbl">{{ item.label }}</span>
          <span v-if="item.coming" class="nav-tag">{{ item.coming }}</span>
        </div>
        <div v-if="'children' in item && (expanded || planningExpanded)" class="nav-children">
          <div
            v-for="c in (item.children as NavChild[])"
            :key="c.path"
            class="nav-item nav-child"
            :class="{ active: isActive(c.path) }"
            @click="navigate(c.path, false)"
          >
            <AppIcon :name="c.icon" :size="17" />
            <span class="lbl">{{ c.label }}</span>
          </div>
        </div>
      </div>

      <div class="nav-label sys">系统</div>
      <div
        v-for="item in systemItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path), disabled: item.disabled }"
        @click="navigate(item.path, item.disabled)"
      >
        <AppIcon :name="item.icon" :size="19" />
        <span class="lbl">{{ item.label }}</span>
      </div>
    </nav>

    <div class="sidebar-foot">
      <div class="agent-card">
        <div class="pulse" />
        <div class="atext">
          <b>Agent 已唤醒</b>
          <span>等待首次启动</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
  padding: var(--s6) var(--s4);
  position: sticky;
  top: 0;
  height: 100vh;
  transition: width var(--dur-base) var(--ease-out);
  overflow: hidden;
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s2) var(--s3) var(--s6);
}
.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: var(--r-md);
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  display: grid;
  place-items: center;
  color: var(--text-on-primary);
  box-shadow: var(--shadow-sm);
}
.brand-text b {
  display: block;
  font-size: 16px;
  font-weight: var(--fw-bold);
  color: var(--text-strong);
  letter-spacing: .02em;
  white-space: nowrap;
}
.brand-text span {
  font-size: var(--fs-caption);
  color: var(--text-faint);
  letter-spacing: .06em;
  white-space: nowrap;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  margin-top: var(--s2);
}
.nav-label {
  font-size: 11px;
  letter-spacing: var(--tracking-xwide);
  text-transform: uppercase;
  color: var(--text-faint);
  padding: var(--s4) var(--s3) var(--s2);
  white-space: nowrap;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 10px 12px;
  border-radius: var(--r-md);
  color: var(--text-muted);
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  cursor: pointer;
  position: relative;
  transition: background var(--dur-base) var(--ease-out), color var(--dur-base);
  white-space: nowrap;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-base); }
.nav-item.active { background: var(--accent-soft); color: var(--accent); }
.nav-item.active::before {
  content: "";
  position: absolute;
  left: -16px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: var(--r-pill);
  background: var(--accent);
}
.nav-item.disabled { color: var(--text-disabled); cursor: not-allowed; }
.nav-item.disabled:hover { background: transparent; }
.nav-caret {
  margin-left: auto;
  display: grid;
  place-items: center;
  color: var(--text-faint);
  transition: transform var(--dur-base) var(--ease-out);
}
.nav-caret.open { transform: rotate(90deg); }
.nav-children {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  margin-left: var(--s5);
  padding-left: var(--s3);
  border-left: 1px solid var(--border-soft);
}
.nav-child { padding: 8px 12px; font-size: var(--fs-small); }
.nav-child.active::before { left: -20px; top: 6px; bottom: 6px; }
.nav-tag {
  margin-left: auto;
  font-size: 10px;
  background: var(--bg-sunken);
  color: var(--text-faint);
  padding: 2px 7px;
  border-radius: var(--r-pill);
  letter-spacing: var(--tracking-wide);
}
.sidebar-foot { margin-top: auto; padding-top: var(--s4); }
.agent-card {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-lg);
  padding: var(--s4);
  display: flex;
  align-items: center;
  gap: var(--s3);
}
.pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ok);
  position: relative;
  flex-shrink: 0;
}
.pulse::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--ok);
  opacity: .5;
  animation: pulse 2.4s var(--ease-out) infinite;
}
@keyframes pulse {
  0% { transform: scale(1); opacity: .5; }
  70% { transform: scale(2.4); opacity: 0; }
  100% { opacity: 0; }
}
.agent-card b { font-size: 12.5px; color: var(--text-strong); display: block; white-space: nowrap; }
.agent-card span { font-size: 11px; color: var(--text-faint); white-space: nowrap; }

/* 窄窗折叠为图标轨道 */
@media (max-width: 1180px) {
  .sidebar {
    width: 68px;
    padding: var(--s6) var(--s2);
    align-items: center;
  }
  .brand { justify-content: center; padding: var(--s2) 0 var(--s6); }
  .brand-text, .nav-label, .nav-item .lbl, .nav-tag, .atext { display: none; }
  .nav-item { justify-content: center; padding: 11px 8px; }
  .agent-card { justify-content: center; padding: 10px; }
}
</style>
