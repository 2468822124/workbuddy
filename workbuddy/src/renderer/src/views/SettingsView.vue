<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSettings } from '@/composables/useSettings'
import AppIcon from '@/components/AppIcon.vue'
import BaseCard from '@/components/BaseCard.vue'
import HotspotSourcesEditor from '@/components/settings/HotspotSourcesEditor.vue'

const { settings, testResult, testing, save, testLlm, exportData, importData, refreshNews, archiveLegacy } = useSettings()

const nickname = ref('')
const morningStart = ref('06:00')
const morningEnd = ref('09:00')
const llmBaseUrl = ref('')
const llmModel = ref('')
const llmApiKey = ref('')
const newsSources = ref('[]')
const importConfirm = ref(false)
const importMsg = ref('')
const importMsgOk = ref(false)
const archiveConfirm = ref(false)
const archiveMsg = ref('')
const archiveMsgOk = ref(false)

// 阶段6：旧表归档（规格 §5.4：先备份、再事务 DROP；行内确认条，非阻断模态）
async function doArchive() {
  archiveConfirm.value = false
  archiveMsg.value = ''
  const r = await archiveLegacy()
  if (r.ok) {
    const c = r.data.counts ?? {}
    const total = (c.plans ?? 0) + (c.tasks ?? 0) + (c.templates ?? 0) + (c.reviews ?? 0)
    archiveMsg.value = `归档完成：${total} 条旧规划数据已备份，旧表已清理`
    archiveMsgOk.value = true
  } else {
    archiveMsg.value = '归档失败：' + ((r as any)?.error?.message ?? '未知错误')
    archiveMsgOk.value = false
  }
}

watch(settings, (s) => {
  nickname.value = s.nickname ?? ''
  morningStart.value = s.morningStart ?? '06:00'
  morningEnd.value = s.morningEnd ?? '09:00'
  llmBaseUrl.value = s.llmBaseUrl ?? ''
  llmModel.value = s.llmModel ?? ''
  llmApiKey.value = s.llmApiKey ?? ''
  newsSources.value = s.newsProviders ?? '[]'
}, { immediate: true })

const canTest = computed(() => llmBaseUrl.value.trim() && llmModel.value.trim() && llmApiKey.value.trim())
const testMsg = computed(() => testResult.value?.ok ? `连接成功 · ${testResult.value.latencyMs}ms` : testResult.value?.message ?? '')

async function doImport() {
  importConfirm.value = false
  importMsg.value = ''
  const r = await importData()
  if (r.ok) {
    importMsg.value = '导入成功，即将刷新…'
    importMsgOk.value = true
    setTimeout(() => { window.location.hash = '#/today' }, 1500)
  } else {
    importMsg.value = '导入失败：' + ((r as any)?.error?.message ?? '未知错误')
    importMsgOk.value = false
  }
}
</script>

<template>
  <div class="settings">
    <!-- 通用 -->
    <BaseCard>
      <div class="card-head"><div class="ico"><AppIcon name="Settings" :size="18" /></div><h2>通用设置</h2></div>
      <div class="fields">
        <label class="lbl">称呼</label>
        <input v-model="nickname" class="fi" placeholder="你的昵称" maxlength="80" @blur="save('nickname', nickname)" />
        <label class="lbl">晨间时段</label>
        <div class="inline"><input v-model="morningStart" type="time" class="fi sm" @change="save('morningStart', morningStart)" /><span class="sep">—</span><input v-model="morningEnd" type="time" class="fi sm" @change="save('morningEnd', morningEnd)" /></div>
      </div>
    </BaseCard>

    <!-- AI 配置 -->
    <BaseCard>
      <div class="card-head"><div class="ico"><AppIcon name="Sparkles" :size="18" /></div><h2>AI 配置</h2><span v-if="!canTest" class="hint">配置完成后可测试连接</span></div>
      <div class="fields">
        <label class="lbl">API Base URL</label>
        <input v-model="llmBaseUrl" class="fi" placeholder="https://api.openai.com" @blur="save('llmBaseUrl', llmBaseUrl)" />
        <label class="lbl">Model Name</label>
        <input v-model="llmModel" class="fi" placeholder="gpt-4o" @blur="save('llmModel', llmModel)" />
        <label class="lbl">API Key</label>
        <input v-model="llmApiKey" type="password" class="fi" placeholder="sk-..." @blur="llmApiKey && save('llmApiKey', llmApiKey)" />
      </div>
      <div class="test-row">
        <button class="btn-test" :disabled="!canTest || testing" @click="testLlm(llmBaseUrl, llmModel, llmApiKey)">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <span v-if="testResult && testResult.ok" class="msg ok">{{ testMsg }}</span>
        <span v-else-if="testResult && !testResult.ok" class="msg fail">{{ testMsg }}</span>
      </div>
    </BaseCard>

    <!-- 热点源 -->
    <BaseCard>
      <div class="card-head"><div class="ico"><AppIcon name="Newspaper" :size="18" /></div><h2>热点源</h2><button class="btn-refresh" @click="refreshNews"><AppIcon name="RefreshCw" :size="15" /> 立即刷新</button></div>
      <HotspotSourcesEditor :sources-json="newsSources" @save="(v) => { newsSources = v; save('newsProviders', v) }" />
    </BaseCard>

    <!-- 数据管理 -->
    <BaseCard>
      <div class="card-head"><div class="ico"><AppIcon name="Download" :size="18" /></div><h2>数据管理</h2></div>
      <div class="data-actions">
        <button class="btn-d" @click="exportData()"><AppIcon name="Download" :size="16" /> 导出 JSON</button>
        <template v-if="!importConfirm">
          <button class="btn-d warn" @click="importConfirm = true"><AppIcon name="Upload" :size="16" /> 导入 JSON</button>
        </template>
        <template v-else>
          <span class="cfm">确认覆盖全部业务数据？</span>
          <button class="btn-d yes" @click="doImport">确认导入</button>
          <button class="btn-d no" @click="importConfirm = false">取消</button>
        </template>
      </div>
      <div v-if="importMsg" class="import-msg" :class="{ ok: importMsgOk }">{{ importMsg }}</div>
    </BaseCard>

    <!-- 旧数据清理（阶段6） -->
    <BaseCard>
      <div class="card-head"><div class="ico"><AppIcon name="Library" :size="18" /></div><h2>旧数据清理</h2></div>
      <div class="data-actions">
        <template v-if="!archiveConfirm">
          <button class="btn-d warn" @click="archiveConfirm = true"><AppIcon name="Library" :size="16" /> 归档并清理旧规划数据</button>
        </template>
        <template v-else>
          <span class="cfm">将备份旧规划数据到本地 JSON 并删除旧表，确认继续？</span>
          <button class="btn-d yes" @click="doArchive">确认归档</button>
          <button class="btn-d no" @click="archiveConfirm = false">取消</button>
        </template>
      </div>
      <div v-if="archiveMsg" class="import-msg" :class="{ ok: archiveMsgOk }">{{ archiveMsg }}</div>
    </BaseCard>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: var(--s5); }
.card-head { display: flex; align-items: center; gap: var(--s3); margin-bottom: var(--s5); }
.ico { width: 34px; height: 34px; border-radius: var(--r-md); display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
h2 { font-size: 16px; font-weight: var(--fw-semibold); color: var(--text-strong); }
.hint { font-size: var(--fs-caption); color: var(--text-faint); margin-left: auto; }
.fields { display: flex; flex-direction: column; gap: var(--s3); }
.lbl { font-size: var(--fs-small); font-weight: var(--fw-medium); color: var(--text-muted); }
.fi { font-family: inherit; font-size: var(--fs-body); padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--border-soft); background: var(--bg-sunken); color: var(--text-base); outline: none; }
.fi:focus { border-color: var(--accent-ring); }
.fi.sm { width: 130px; }
.inline { display: flex; align-items: center; gap: var(--s2); }
.sep { color: var(--text-faint); }
.test-row { margin-top: var(--s4); display: flex; align-items: center; gap: var(--s3); }
.btn-test { font-family: inherit; font-size: var(--fs-small); font-weight: var(--fw-medium); padding: 8px 16px; border-radius: var(--r-md); background: var(--accent); color: var(--text-on-primary); border: none; cursor: pointer; transition: all var(--dur-base); }
.btn-test:hover:not(:disabled) { background: var(--accent-hover); }
.btn-test:disabled { opacity: .4; cursor: not-allowed; }
.msg { font-size: var(--fs-small); }
.msg.ok { color: var(--ok); }
.msg.fail { color: var(--danger); }
.data-actions { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; }
.btn-d { display: inline-flex; align-items: center; gap: var(--s2); font-family: inherit; font-size: var(--fs-body); font-weight: var(--fw-medium); padding: 10px 16px; border-radius: var(--r-md); background: var(--bg-surface-2); color: var(--text-base); border: 1px solid var(--border-soft); cursor: pointer; transition: all var(--dur-base); }
.btn-d:hover { background: var(--bg-hover); color: var(--accent); }
.btn-d.warn { color: var(--warn); }
.btn-d.yes { background: var(--danger); color: var(--text-on-primary); border-color: var(--danger); }
.btn-d.no { background: transparent; color: var(--text-muted); }
.cfm { font-size: var(--fs-small); color: var(--danger); font-weight: var(--fw-medium); }
.import-msg { margin-top: var(--s3); font-size: var(--fs-small); padding: var(--s3); border-radius: var(--r-md); color: var(--danger); }
.import-msg.ok { color: var(--ok); }
.btn-refresh { font-family: inherit; font-size: var(--fs-small); display: inline-flex; align-items: center; gap: var(--s1); padding: 6px 12px; border-radius: var(--r-md); background: var(--bg-surface-2); color: var(--accent); border: 1px solid var(--border-soft); cursor: pointer; margin-left: auto; transition: all var(--dur-base); }
.btn-refresh:hover { background: var(--bg-hover); }
</style>
