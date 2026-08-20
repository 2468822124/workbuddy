<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'

const route = useRoute()
</script>

<template>
  <div class="layout">
    <AppSidebar />
    <main class="main">
      <!-- key=path：flow 页之间切换时强制重建组件（setup 重跑），
           修复 vue-router 组件复用导致的期派生量冻结（原 /planning/:level 的 F3-1 修复沿用到 flow 路由）。
           用 path 而非 fullPath：同页内翻期（date 在 query）不重建、不丢草稿。 -->
      <router-view :key="route.path" />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex: 1;
  min-height: 0;
}
.main {
  flex: 1;
  min-width: 0;
  padding: clamp(20px, 2.5vw, 40px) clamp(20px, 3vw, 48px) var(--s12);
  max-width: 1500px;
  margin: 0 auto;
  overflow-x: hidden;
}
</style>
