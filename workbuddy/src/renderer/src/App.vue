<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApi } from './composables/useApi'
import AppLayout from './components/AppLayout.vue'

const api = useApi()
const isFirstLaunch = ref(false)
const dbHealthy = ref(true)

onMounted(async () => {
  const r = await api.app.isFirstLaunch()
  if (r.ok) isFirstLaunch.value = r.data
  const h = await api.db.health()
  if (h.ok && h.data.readonly) dbHealthy.value = false
})

async function onDismissFirstLaunch() {
  await api.settings.set('onboarded', 'true')
  isFirstLaunch.value = false
}
</script>

<template>
  <div class="app-root">
    <div v-if="isFirstLaunch" class="first-launch-bar" role="status">
      <span>欢迎使用 WorkBuddy ☀ 前往「设置」配置你的 AI 与称呼</span>
      <button class="fl-btn" @click="onDismissFirstLaunch">知道了</button>
    </div>
    <div v-if="!dbHealthy" class="safe-mode-bar" role="alert">
      ⚠ 数据同步异常，已进入只读安全模式，请重启应用
    </div>
    <AppLayout />
  </div>
</template>

<style scoped>
.app-root {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.first-launch-bar,
.safe-mode-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s3);
  padding: 10px var(--s4);
  font-size: var(--fs-small);
  z-index: 100;
}
.first-launch-bar {
  background: var(--accent-soft);
  color: var(--accent);
  border-bottom: 1px solid var(--accent-ring);
}
.safe-mode-bar {
  background: var(--danger-soft);
  color: var(--danger);
  border-bottom: 1px solid var(--danger);
  border-top: none;
}
.fl-btn {
  font-family: inherit;
  font-size: var(--fs-small);
  padding: 4px var(--s3);
  border-radius: var(--r-sm);
  border: 1px solid var(--accent-ring);
  background: var(--bg-surface);
  color: var(--accent);
  cursor: pointer;
  font-weight: var(--fw-medium);
}
.fl-btn:hover {
  background: var(--accent);
  color: var(--text-on-primary);
}
</style>
