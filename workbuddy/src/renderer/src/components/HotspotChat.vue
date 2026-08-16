<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHotspotChat } from '@/composables/useHotspotChat'
import AppIcon from '@/components/AppIcon.vue'

const router = useRouter()
const { llmReady, query, result, loading, error, search, clear, openLink } = useHotspotChat()

function goSettings() {
  router.push('/settings')
}
</script>

<template>
  <div class="hotspot-chat">
    <!-- Result panel (above the bar when active) -->
    <div v-if="result || loading || error" class="chat-result">
      <!-- Loading -->
      <div v-if="loading" class="state loading">
        <AppIcon name="Loader" :size="16" class="spin" />
        <span>Agent 思考中…</span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="state error">
        <div class="err-bar">
          <AppIcon name="AlertCircle" :size="15" />
          <span>{{ error.message }}</span>
          <button class="retry-btn" @click="search">重试</button>
        </div>
      </div>

      <!-- Result -->
      <div v-else-if="result" class="state result">
        <div class="answer-block">
          <p class="answer">{{ result.answer }}</p>
          <span v-if="result.refs.length === 0" class="no-refs">未找到相关热点</span>
        </div>
        <div v-if="result.refs.length > 0" class="refs-block">
          <div
            v-for="ref in result.refs"
            :key="ref.item.id"
            class="ref-row"
            @click="openLink(ref.item.link)"
          >
            <div class="ref-source">
              <AppIcon name="Circle" :size="7" />
              {{ ref.item.source }}
            </div>
            <div class="ref-body">
              <div class="ref-title">{{ ref.item.title }}</div>
              <div class="ref-reason">{{ ref.reason }}</div>
            </div>
          </div>
        </div>
        <button class="clear-btn" @click="clear" title="清除结果">
          <AppIcon name="X" :size="14" />
        </button>
      </div>
    </div>

    <!-- Search bar -->
    <div class="chat-bar" :class="{ disabled: !llmReady, loading }">
      <AppIcon name="Sparkles" :size="15" />
      <template v-if="llmReady">
        <input
          v-model="query"
          class="chat-input"
          placeholder="问问 Agent：今天 AI 圈有什么新鲜事？"
          :disabled="loading"
          @keydown.enter="search"
        />
        <button class="send-btn" :disabled="loading || !query.trim()" @click="search">
          <AppIcon v-if="!loading" name="Send" :size="15" />
          <AppIcon v-else name="Loader" :size="15" class="spin" />
        </button>
      </template>
      <template v-else>
        <span class="chat-placeholder">配置 AI 后即可对话搜索</span>
        <button class="go-settings-btn" @click="goSettings">去设置</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hotspot-chat {
  display: flex;
  flex-direction: column;
}

/* ── Result panel ── */
.chat-result {
  margin-bottom: var(--s3);
  max-height: 260px;
  overflow-y: auto;
  position: relative;
}

.state {
  padding: var(--s4);
  border-radius: var(--r-md);
  font-size: var(--fs-small);
}

/* Loading */
.loading {
  display: flex;
  align-items: center;
  gap: var(--s2);
  color: var(--text-muted);
  background: var(--bg-sunken);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error */
.error {
  padding: 0;
}

.err-bar {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-weight: var(--fw-medium);
}

.retry-btn {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  font-size: var(--fs-caption);
  font-family: inherit;
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: background var(--dur-fast);
}

.retry-btn:hover {
  background: var(--danger-soft);
}

/* Result */
.result {
  padding: 0;
  position: relative;
}

.answer-block {
  padding: var(--s4);
  border-radius: var(--r-md);
  background: var(--accent-soft);
  margin-bottom: var(--s3);
}

.answer {
  color: var(--text-strong);
  font-size: var(--fs-body);
  line-height: var(--lh-base);
}

.no-refs {
  display: block;
  margin-top: var(--s2);
  font-size: var(--fs-caption);
  color: var(--text-faint);
}

.refs-block {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
  margin-bottom: var(--s3);
}

.ref-row {
  display: flex;
  gap: var(--s3);
  padding: var(--s3);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: all var(--dur-base);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-soft);
}

.ref-row:hover {
  background: var(--bg-hover);
  transform: translateX(2px);
}

.ref-source {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--accent);
  flex-shrink: 0;
  width: 56px;
  padding-top: 2px;
}

.ref-body {
  min-width: 0;
  flex: 1;
}

.ref-title {
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  color: var(--text-strong);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ref-reason {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  margin-top: 2px;
}

.clear-btn {
  position: absolute;
  top: var(--s2);
  right: var(--s2);
  width: 26px;
  height: 26px;
  border-radius: var(--r-sm);
  border: none;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all var(--dur-fast);
}

.clear-btn:hover {
  background: var(--bg-hover);
  color: var(--text-base);
}

/* ── Search bar ── */
.chat-bar {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 9px 14px;
  border-radius: var(--r-pill);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  font-size: var(--fs-small);
  transition: all var(--dur-base);
  color: var(--text-muted);
}

.chat-bar.disabled {
  background: var(--bg-sunken);
  border-color: var(--border-soft);
  color: var(--text-disabled);
}

.chat-bar.loading {
  border-color: var(--accent-ring);
}

.chat-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--fs-small);
  color: var(--text-strong);
  outline: none;
  min-width: 0;
}

.chat-input::placeholder {
  color: var(--text-faint);
}

.chat-input:disabled {
  color: var(--text-disabled);
}

.chat-placeholder {
  flex: 1;
  color: var(--text-disabled);
  font-size: var(--fs-small);
  user-select: none;
}

.send-btn {
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  border: none;
  background: var(--accent);
  color: var(--text-on-primary);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: all var(--dur-fast);
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.send-btn:disabled {
  background: var(--text-faint);
  cursor: not-allowed;
}

.go-settings-btn {
  padding: 4px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: var(--fs-caption);
  font-family: inherit;
  font-weight: var(--fw-semibold);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--dur-fast);
}

.go-settings-btn:hover {
  background: var(--accent-soft);
}
</style>
