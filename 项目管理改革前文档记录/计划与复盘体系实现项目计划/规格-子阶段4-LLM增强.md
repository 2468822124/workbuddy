# 规格 · 子阶段 4 — LLM 增强（计划与复盘体系）

> **编写**：GLM　**执行**：DeepSeek　**状态**：待实现
> **真相源**：`计划与复盘体系实现项目计划/项目计划.md`（§6.4 LLM 增强 / §9 子阶段4 / §11 验收 / §12 禁止边界·降级）。
> **前置**：子阶段 1（基建）✅ 关闭；子阶段 2（计划核心）✅ 通过；子阶段 3（复盘核心）✅ 通过（`审查日志/计划与复盘-子阶段3.md`，4 LOW 非阻断）。
> **上位复用**：阶段 4 已交付 `services/llm.ts`（`ChatError` / `settingsRepo.get('llmApiKey')` 自动解密 / `logger.redact` 范式）；阶段 5 已交付 `searchNews()` + `useHotspotChat` + `HotspotChat`（禁用态/红色状态条/无 v-html 的降级范式）+ `shared/constants.ts` 护栏常量。本子阶段镜像阶段 5 的 LLM 集成模式。

---

## 0. 元信息

| 项 | 值 |
|---|---|
| 子阶段 | 子阶段 4 — LLM 增强 |
| 编写 | GLM |
| 执行 | DeepSeek |
| 状态 | 待实现 |
| 前置依赖 | 子阶段 1/2/3 全通过；阶段 4/5 的 LLM 基建（`services/llm.ts` + `llm:test`/`llm:search` + `llmBaseUrl`/`llmModel`/`llmApiKey` 密文配置 + `useHotspotChat`/`HotspotChat` 降级范式）已交付并复审通过 |
| 本子阶段定位 | **稳** —— LLM 调用引入「私有数据外发」与「失败降级」两类风险，必须严守 §9/§10。两个增强均为**用户前台主动触发**（红线 N/A），但要把任务/项目数据发往用户自配端点，需透明提示 + 护栏 + 不重试 |

---

## 1. 单元目标

给「计划 / 复盘」补上 **LLM 增强**，离线仍全可用（子阶段 1–3 已保证），配 LLM 后获得两项主动触发的能力：

1. **引导式提问（计划）**：计划页点「✨ AI 引导」→ 主进程取模板占位符 + 用户已填内容 + 今日/逾期待办 + 进行中项目作上下文 → 调 OpenAI 兼容 Chat → 返回「逐占位符」的引导提问 + 建议填写 → 用户逐条「插入」（替换对应 `{{占位符}}`）或「跳过」。一句话演示：**点 AI 引导，得到贴合今日待办的计划建议，逐条采纳回填编辑器。**
2. **复盘自动汇总草稿（复盘）**：复盘页点「✨ AI 汇总」→ 主进程拉该日期已完成任务 + 项目进展 → 调 LLM 生成日复盘 Markdown 草稿 → 用户「替换内容」/「追加到末尾」/「取消」。一句话演示：**点 AI 汇总，基于昨日完成情况生成复盘草稿，改两下就保存。**

两项均：未配 LLM → 入口禁用 + 非阻塞「去设置」；调用失败 → 模块内红色状态条 + 本地日志（脱敏）+ 单次不重试。

---

## 2. 范围

**含**：
1. `shared` 层：2 个 IPC 通道常量（`PLAN_GUIDE` / `REVIEW_SUMMARIZE`）、护栏常量（`shared/constants.ts`）、结果类型（`PlanGuideItem` / `PlanGuideResult` / `ReviewDraftResult`）。
2. `services/llm.ts`：抽取共享 `requestChat()` + 新增 `guidePlan()` / `summarizeReview()` + 逐字 system prompt + 鲁棒 JSON 解析；logger 仅记 latency/计数，**禁记任务/项目/草稿/建议明文**。
3. IPC：`plan:guideQuestion`（挂 `plans.ipc.ts`）、`review:summarizeDraft`（挂 `reviews.ipc.ts`）。
4. preload：`api.plans.guideQuestion` / `api.reviews.summarizeDraft`。
5. 渲染层：2 个组合式（`usePlanGuide` / `useReviewSummary`，镜像 `useHotspotChat`）+ PlanView/ReviewView 各加「AI 按钮 + 内联面板」（镜像 `HotspotChat` 范式：禁用态/去设置/loading/红色错误条/无 v-html）。
6. 降级：未配 LLM、401/403、429、5xx、网络错、超时、模型未按 JSON 回答——全部覆盖。

**不含（推迟）**：
- 多轮对话 / 历史持久化（本子阶段为**单轮一问一答**；不建 chats 表；面板关闭即清）。
- 流式（streaming）输出（沿用阶段 5 `stream:false` 单发）。
- 周复盘的跨期统计汇总（仅日复盘草稿；周复盘模板存在但不接汇总）。
- 引导式提问的「逐个占位符循环提问」交互（本子阶段一次调用返回**全部占位符**的引导，UI 逐条采纳；不做多轮往返）。
- 新增「允许 AI 读取我的任务/项目数据」开关（见 §10 决策：以「用户主动触发 + 用户自配端点」为 §9 豁免依据，按钮旁内联透明提示替代硬开关，避免改设置页扩大范围）。

---

## 3. 技术栈与本子阶段新增依赖

无新增依赖。沿用：Node 22 全局 `fetch` + `AbortController`、`marked`/`dompurify`（MarkdownEditor 已有）、`vue-router`、`lucide-vue-next`、token.css、阶段 4 `services/llm.ts`、阶段 5 `shared/constants.ts`。

**`shared/constants.ts` 新增护栏常量**（UPPER_SNAKE_CASE，与既有 `LLM_*` 同文件）：

| 常量 | 值 | 用途 |
|---|---|---|
| `LLM_GUIDE_MAX_TOKENS` | `800` | 引导提问输出上限（前台触发，§9 红线 N/A，但限成本） |
| `LLM_DRAFT_MAX_TOKENS` | `1000` | 复盘草稿输出上限（草稿较长） |
| `LLM_TODO_LIMIT` | `50` | 注入上下文的待办条数上限（成本护栏） |
| `LLM_TODO_CHARS` | `80` | 单条待办 content 在 prompt 内的截断长度 |
| `LLM_PROJECT_LIMIT` | `10` | 注入上下文的项目条数上限 |
| `LLM_GUIDE_ITEMS_MAX` | `8` | 返回引导条目上限（按模型顺序截断） |

> 复用既有 `LLM_CHAT_TIMEOUT_MS = 30_000`（`shared/constants.ts:13`）作为两个新调用的 AbortController 超时。

---

## 4. 目录结构（本子阶段新增/变动）

```
workbuddy/src/
├── shared/
│   ├── types.ts                       ← 变动（+PlanGuideItem/PlanGuideResult/ReviewDraftResult）
│   ├── ipc.ts                         ← 变动（+PLAN_GUIDE / REVIEW_SUMMARIZE）
│   └── constants.ts                   ← 变动（+6 个 LLM_* 常量）
├── main/
│   ├── services/llm.ts                ← 变动（+requestChat 共享 + guidePlan + summarizeReview + 逐字 system prompt + parseJsonObject）
│   ├── ipc/plans.ipc.ts               ← 变动（+plan:guideQuestion handler）
│   └── ipc/reviews.ipc.ts             ← 变动（+review:summarizeDraft handler）
├── preload/index.ts                   ← 变动（+api.plans.guideQuestion / api.reviews.summarizeDraft）
└── renderer/src/
    ├── composables/
    │   ├── usePlanGuide.ts            ← 新增（镜像 useHotspotChat）
    │   └── useReviewSummary.ts        ← 新增（镜像 useHotspotChat）
    └── views/
        ├── PlanView.vue               ← 变动（.pg-bar +AI 引导按钮；下方 +内联引导面板）
        └── ReviewView.vue             ← 变动（.pg-bar +AI 汇总按钮；下方 +内联草稿面板）
```

> 无新组件文件：两个面板与各自 view 的 `editContent` ref 强耦合（回填需直接写该 ref），内联在 view 里比抽组件更直接（避免 prop/emit 传递 ref）。LLM 状态逻辑下沉到 composable。

---

## 5. 核心设计

### 5.1 服务层共享：`requestChat()`（`services/llm.ts` 新增，抽取阶段 5 `searchNews` 的公共逻辑）

> **不重构 `searchNews`**（避免触碰已复审的 Phase 5 代码、控制本子阶段爆炸半径）；新函数 `guidePlan`/`summarizeReview` 调用 `requestChat`。`searchNews` 与之少量重复可接受（YAGNI；留维护期统一）。

```ts
// 仅供主进程调用；读库内配置（apiKey 自动解密），不接收 apiKey 入参
// 统一：配置探测 → endpoint 规范化 → fetch + AbortController → 状态码 → ChatError → 返回 content 字符串
async function requestChat(messages: { role: string; content: string }[], opts: { maxTokens: number; temperature?: number }): Promise<{ content: string; latencyMs: number }> {
  const base = settingsRepo.get('llmBaseUrl')?.value?.trim()
  const model = settingsRepo.get('llmModel')?.value?.trim()
  const apiKey = settingsRepo.get('llmApiKey')?.value            // 已解密（settingsRepo.rowToSetting）
  if (!base || !model || !apiKey) {
    throw new ChatError('LLM_NOT_CONFIGURED', '未配置 AI，请先在设置中填写 Base URL、Model 与 API Key')
  }
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_CHAT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.4, max_tokens: opts.maxTokens, stream: false }),
      signal: controller.signal,
    })
  } catch (e: unknown) {
    clearTimeout(timer)
    if ((e as Error).name === 'AbortError') throw new ChatError('LLM_TIMEOUT', 'AI 响应超时（>30s），请稍后重试')
    throw new ChatError('LLM_NETWORK', '网络连接失败，请检查网络或 Base URL')
  }
  clearTimeout(timer)
  if (res.status === 401 || res.status === 403) throw new ChatError('LLM_AUTH', 'API Key 无效或已过期，请前往设置检查')
  if (res.status === 429)                 throw new ChatError('LLM_RATE_LIMIT', '请求过于频繁，请稍后再试')
  if (res.status >= 500)                  throw new ChatError('LLM_UNAVAILABLE', `AI 服务暂时不可用（${res.status}），请稍后重试`)
  if (!res.ok)                            throw new ChatError('LLM_ERROR', `AI 返回异常（${res.status}）`)
  const content = await extractContent(res)   // 复用阶段 5 extractContent（data.choices[0].message.content 容错）
  return { content, latencyMs: Date.now() - started }
}
```

> **apiKey 永不入日志**：`logger.redact` 兜底（键名匹配 `apiKey` 自动 `***REDACTED***`）；`requestChat` 及调用方显式不传 apiKey/content 进 logger；错误分支仅记 `ChatError.code`。

### 5.2 `guidePlan()`（计划引导，`services/llm.ts` 新增）

```ts
export interface PlanGuideItem { placeholder: string; question: string; suggestion: string }
export interface PlanGuideResult { items: PlanGuideItem[]; latencyMs: number }

const GUIDE_SYSTEM_PROMPT = `你是 WorkBuddy 的计划助手，帮用户做日/周计划。依据用户提供的「待办与项目上下文」+「计划模板结构」+「用户已填内容」，为模板里出现的每个占位符（形如 {{名称}}）给出引导。
规则：
1. 对模板里出现的每个 {{占位符}}，输出一个对象：placeholder=占位符名（不含花括号），question=一句引导提问（≤30 字），suggestion=一条具体可用、贴合上下文的建议填写（≤80 字）。
2. 若上下文有逾期/今日待办/进行中项目，在相关 suggestion 里点名（如"先处理逾期的 X"）。
3. 不要编造上下文里没有的任务或项目名。
4. 必须只输出一个 JSON 对象，不要任何解释或 markdown 代码块标记：
{"items":[{"placeholder":"focus","question":"...","suggestion":"..."}]}`

export async function guidePlan(args: { templateId: string; filled: string }): Promise<PlanGuideResult> {
  // 1. 模板（占位符来源）
  const tpl = templateRepo.findById(args.templateId)
  if (!tpl || !tpl.content) throw new ChatError('INVALID', '模板不存在或为空')

  // 2. 上下文：今日待办 + 逾期 + 进行中项目（裁剪 + 截断）
  const today = todayStr()                                    // 'YYYY-MM-DD'
  const openTodos = todoRepo.findOpenToday(today).slice(0, LLM_TODO_LIMIT)      // 未完成且 planDate<=today
  const overdue = todoRepo.findOverdue(today).slice(0, LLM_TODO_LIMIT)
  const projects = projectRepo.findActive().slice(0, LLM_PROJECT_LIMIT)         // status='active'
  const ctx = buildGuideContext(openTodos, overdue, projects)  // 见 5.3：每条 todo content 截断 LLM_TODO_CHARS；项目仅 name/status/openTasks

  // 3. messages（system 强制 JSON；user 注入模板 + 已填 + 上下文）
  const messages = [
    { role: 'system', content: GUIDE_SYSTEM_PROMPT },
    { role: 'user', content: `计划模板：\n${tpl.content}\n\n用户已填内容：\n${args.filled || '（空）'}\n\n上下文：\n${ctx}\n\n请为模板里出现的每个 {{占位符}} 给出引导，按系统提示的 JSON 格式输出。` },
  ]

  // 4. 调用 + 鲁棒解析
  const { content, latencyMs } = await requestChat(messages, { maxTokens: LLM_GUIDE_MAX_TOKENS, temperature: 0.5 })
  const parsed = parseJsonObject(content)                       // 见 5.5
  const items: PlanGuideItem[] = Array.isArray(parsed?.items)
    ? parsed.items
        .filter((it: unknown): it is PlanGuideItem =>
          it != null && typeof it === 'object' &&
          typeof (it as PlanGuideItem).placeholder === 'string' &&
          typeof (it as PlanGuideItem).question === 'string' &&
          typeof (it as PlanGuideItem).suggestion === 'string')
        .map((it: PlanGuideItem) => ({
          placeholder: it.placeholder.slice(0, 40),
          question: it.question.slice(0, 80),
          suggestion: it.suggestion.slice(0, 200),
        }))
        .slice(0, LLM_GUIDE_ITEMS_MAX)
    : []

  logger.info(`plan guide OK, ${latencyMs}ms, items=${items.length}`)   // 仅记计数
  return { items, latencyMs }
}
```

### 5.3 上下文构造（`buildGuideContext`，脱敏 + 裁剪）

```ts
// todo content 截断；项目仅暴露 name/status/openTasks（不暴露 description，最小化外发）
function buildGuideContext(open: Todo[], overdue: Todo[], projects: ProjectWithCounts[]): string {
  const fmt = (t: Todo, tag: string) =>
    `[${tag}] ${String(t.content).slice(0, LLM_TODO_CHARS)}${t.projectId ? '（项目内）' : ''}`
  const lines: string[] = []
  if (overdue.length) lines.push('逾期未完成：\n' + overdue.map(t => fmt(t, '逾期')).join('\n'))
  if (open.length)   lines.push('今日待办：\n' + open.map(t => fmt(t, '今日')).join('\n'))
  if (projects.length) lines.push('进行中项目：\n' + projects.map(p => `- ${p.name}（${p.status}，${p.openTasks} 项待办）`).join('\n'))
  return lines.join('\n\n') || '（无上下文）'
}
```

### 5.4 `summarizeReview()`（复盘汇总草稿，`services/llm.ts` 新增）

```ts
export interface ReviewDraftResult { draft: string; latencyMs: number }

const DRAFT_SYSTEM_PROMPT = `你是 WorkBuddy 的复盘助手，帮用户写日复盘。依据用户提供的「当日已完成任务」+「项目进展」，生成一份简洁、真实的日复盘 Markdown 草稿。
规则：
1. 只使用上下文里真实出现的任务与项目，不得编造。
2. 草稿用中文，结构含：一段今日完成概述 + 关键进展（按条目或按项目）+ 一句反思 + 明日可关注点。总长度适中（约 150–300 字）。
3. 任务用普通列表（- ），不要用 - [ ] 任务框（复盘不生成待办）。
4. 必须只输出一个 JSON 对象，不要任何解释或 markdown 代码块标记：
{"draft":"# 日复盘草稿\\n\\n..."}`

export async function summarizeReview(date: string): Promise<ReviewDraftResult> {
  // 1. 上下文：该 date 已完成任务 + 进行中项目进展
  const done = todoRepo.findCompletedOn(date).slice(0, LLM_TODO_LIMIT)     // completedAt 以 date 开头
  const projects = projectRepo.findActive().slice(0, LLM_PROJECT_LIMIT)
  if (done.length === 0) {
    return { draft: `# 日复盘草稿 · ${date}\n\n（当日暂无完成任务记录，可手动补充今日收获与反思。）`, latencyMs: 0 }
  }
  const ctx = buildSummaryContext(done, projects)                          // 见 5.5：done content 截断；项目 name + open/done

  // 2. messages + 调用 + 解析
  const messages = [
    { role: 'system', content: DRAFT_SYSTEM_PROMPT },
    { role: 'user', content: `复盘日期：${date}\n\n当日已完成任务：\n${ctx.done}\n\n项目进展：\n${ctx.projects}\n\n请按系统提示的 JSON 格式输出日复盘草稿。` },
  ]
  const { content, latencyMs } = await requestChat(messages, { maxTokens: LLM_DRAFT_MAX_TOKENS, temperature: 0.4 })
  const parsed = parseJsonObject(content)
  const draft = (parsed && typeof parsed.draft === 'string')
    ? parsed.draft.slice(0, 4000)
    : content.slice(0, 1000)                        // 降级：原文当草稿
  logger.info(`review draft OK, ${latencyMs}ms, draftLen=${draft.length}`)   // 仅记长度
  return { draft, latencyMs }
}
```

### 5.5 鲁棒 JSON 解析（`parseJsonObject`，复用阶段 5 `parseChatJson` 范式，泛化为通用对象解析）

```ts
// 容错：剥离 ```json 代码块围栏；取首个 '{' 到末个 '}'；解析失败 → null（调用方降级）
function parseJsonObject(raw: string): Record<string, unknown> | null {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{'); const last = s.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try { return JSON.parse(s.slice(first, last + 1)) } catch { return null }
}
```

> 阶段 5 的 `parseChatJson` 可在维护期改调本函数（本子阶段不动它，控制爆炸半径）。

### 5.6 IPC handler（挂各自域文件，调用服务层）

**`plans.ipc.ts`（在 `registerPlansIpc` 内新增）：**
```ts
ipcMain.handle(IPC.PLAN_GUIDE, async (_e, arg: { templateId: string; filled: string }) => {
  try {
    if (!arg?.templateId) return err('INVALID', 'templateId is required')
    if (typeof arg.filled !== 'string') return err('INVALID', 'filled must be string')
    const result = await guidePlan({ templateId: arg.templateId, filled: arg.filled.slice(0, 4000) })
    return ok(result)
  } catch (e: unknown) {
    if (e instanceof ChatError) { logger.warn(`plan guide failed: ${e.code}`); return err(e.code, e.message) }
    logger.error('plan:guideQuestion error', e)
    return err('INTERNAL', `内部错误：${(e as Error).message}`)
  }
})
```

**`reviews.ipc.ts`（在 `registerReviewsIpc` 内新增）：**
```ts
ipcMain.handle(IPC.REVIEW_SUMMARIZE, async (_e, arg: { date: string }) => {
  try {
    if (!arg?.date) return err('INVALID', 'date is required')
    const result = await summarizeReview(arg.date)
    return ok(result)
  } catch (e: unknown) {
    if (e instanceof ChatError) { logger.warn(`review draft failed: ${e.code}`); return err(e.code, e.message) }
    logger.error('review:summarizeDraft error', e)
    return err('INTERNAL', `内部错误：${(e as Error).message}`)
  }
})
```

### 5.7 组合式（渲染层，镜像 `useHotspotChat`）

**`usePlanGuide.ts`**（暴露 `{ llmReady, items, loading, error, guide, applySuggestion, clear, goSettings }`）：
- `checkReady()`：onMounted 探测 `llmBaseUrl/llmModel/llmApiKey` 三项非空 → `llmReady`（同 `useHotspotChat.checkReady`）。
- `guide(templateId, filled)`：`!llmReady` → 本地置 `error={code:'LLM_NOT_CONFIGURED',...}`；否则 `loading=true`，调 `api.plans.guideQuestion({templateId, filled})`，存 `items` 或 `error`。
- `applySuggestion(item, currentContent): string`：**纯函数式回填**——在 `currentContent` 里把首个 `{{<item.placeholder>}}` 替换为 `item.suggestion`；若该占位符已不存在，则在末尾追加 `\n- ${item.suggestion}`。返回新字符串（view 赋给 `editContent`，不可变更新）。
- `clear()`：清 items/error。

**`useReviewSummary.ts`**（暴露 `{ llmReady, draft, loading, error, summarize, applyDraft, clear, goSettings }`）：
- `checkReady()`：同上。
- `summarize(date)`：`!llmReady` → 本地 `LLM_NOT_CONFIGURED`；否则调 `api.reviews.summarizeDraft({date})`，存 `draft` 或 `error`。
- `applyDraft(mode, currentContent, draft): string`：`mode='replace'` → 返回 `draft`；`mode='append'` → 返回 `currentContent + '\n\n' + draft`。view 赋给 `editContent`。
- `clear()`。

> 两 composable 不持有 `editContent`（view 拥有）；回填动作把新字符串交回 view 赋值，保持单向数据流 + 不可变更新。

### 5.8 View 改动（PlanView / ReviewView，最小侵入）

**PlanView.vue**：
- `.pg-bar` 在「保存」按钮**左侧**加「✨ AI 引导」按钮（`Sparkles` 图标，已注册于 AppIcon，见阶段 5）。`!llmReady || loading` 时 disabled。
- 按钮旁内联透明提示（`<span class="ai-hint">`，`--text-faint` token）：「基于你的待办与项目，调用你配置的 AI」。`!llmReady` 时该位换为非阻塞「去设置」链接（`router.push('/settings')`）。
- `.pg-bar` 下方（feedback 之上）加内联引导面板 `v-if="items.length || loading || error"`：
  - `loading`：「AI 思考中…」+ 纯 CSS 旋转（token 配色）。
  - `error`：**红色状态条**（`--danger` / `--danger-soft`，非模态）显 `error.message` +「重试」。
  - `items`：逐条卡片「📌 {{placeholder}}」+ question + suggestion +「插入」（`@click="editContent = applySuggestion(it, editContent)"`）+「跳过」。全 `{{}}` 插值，**禁 v-html**。右上「×」`clear()`。

**ReviewView.vue**：
- `.pg-bar` 加「✨ AI 汇总」按钮（`Sparkles`）。透明提示：「基于该日完成任务与项目进展，调用你配置的 AI」；`!llmReady` → 「去设置」链接。
- `.pg-bar` 下方加内联草稿面板 `v-if="draft || loading || error"`：
  - `loading`/`error`：同上。
  - `draft`：草稿预览（**复用 MarkdownEditor 只读预览**：`<MarkdownEditor :model-value="draft" readonly :toolbar="false" />` —— DOMPurify 已 sanitize，安全；或用 `<pre class="draft-preview">{{ draft }}</pre>` 纯文本，二选一，**禁 v-html 自渲染**）+「替换内容」（`@click="editContent = applyDraft('replace', editContent, draft)"`）+「追加到末尾」（append）+「取消」（clear）。

> 回填后面板**不自动关闭**（用户可能想再调一次或对比）；显式「×」/「取消」关闭。

---

## 6. 数据模型变更

**无新表 / 无迁移 / 不写任何表。** 全程只读：
- `templates`（`templateRepo.findById`，取模板结构/占位符）。
- `todos`（取今日/逾期/已完成；**仅 content 进 prompt，不进日志**）。
- `projects`（取进行中项目 name/status/openTasks；**不暴露 description**，最小化外发）。
- `settings`（`llmBaseUrl`/`llmModel`/`llmApiKey`，`llmApiKey` 自动解密）。

**新增共享类型**（`shared/types.ts`）：
```ts
export interface PlanGuideItem { placeholder: string; question: string; suggestion: string }
export interface PlanGuideResult { items: PlanGuideItem[]; latencyMs: number }
export interface ReviewDraftResult { draft: string; latencyMs: number }
```

**依赖的只读 repo 方法**（若不存在则新增**只读**方法，命名按 `命名规则.md`）：
- `todoRepo.findOpenToday(date: string): Todo[]` —— `status='todo' AND isDeleted=0 AND planDate <= date`（今日及之前未完成）。
- `todoRepo.findOverdue(date: string): Todo[]` —— 同 `useToday`/既有 overdue 语义（`planDate < date AND status='todo' AND isDeleted=0`）；若已有同名方法直接复用。
- `todoRepo.findCompletedOn(date: string): Todo[]` —— `status='done' AND isDeleted=0 AND completedAt LIKE date+'%'`。
- `projectRepo.findActive(): ProjectWithCounts[]` —— `status='active' AND isDeleted=0`（带 openTasks/totalTasks 计数；若 `ProjectWithCounts` 已有聚合方法则复用）。

> DeepSeek 按既有 `todoRepo`/`projectRepo` 实现风格补齐上述只读方法；**只读不改写**。`todayStr()` / 日期工具复用既有（注意子阶段3 LOW-1 的 UTC/local 议题：本子阶段日期来自 view 的 `planDate`/`reviewDate`，沿用既有值即可，不另算）。

---

## 7. IPC 契约（`shared/ipc.ts` 新增）

| 通道 | 入参 | 返回 `Result<T>` | 说明 |
|---|---|---|---|
| `plan:guideQuestion` | `{ templateId: string; filled: string }` | `PlanGuideResult` | 主进程读库内配置 + 模板 + 待办/项目上下文 → 调 OpenAI 兼容 chat → 逐占位符引导；**渲染层只传 templateId/filled，不传 apiKey** |
| `review:summarizeDraft` | `{ date: string }` | `ReviewDraftResult` | 主进程读库内配置 + 该 date 完成任务/项目进展 → 调 chat → 草稿；渲染层只传 date |

**通道常量**（`shared/ipc.ts`，`domain:action` camelCase，承袭功能计划 §7 命名）：
```ts
PLAN_GUIDE: 'plan:guideQuestion'
REVIEW_SUMMARIZE: 'review:summarizeDraft'
```

**错误 code 枚举**（复用阶段 5 全集）：`INVALID` / `LLM_NOT_CONFIGURED` / `LLM_TIMEOUT` / `LLM_NETWORK` / `LLM_AUTH` / `LLM_RATE_LIMIT` / `LLM_UNAVAILABLE` / `LLM_ERROR` / `INTERNAL`。

**preload**（`api.plans` / `api.reviews` 各加一方法）：
```ts
api.plans.guideQuestion(data: { templateId: string; filled: string }): Promise<Result<PlanGuideResult>>
  → ipcRenderer.invoke(IPC.PLAN_GUIDE, data)
api.reviews.summarizeDraft(data: { date: string }): Promise<Result<ReviewDraftResult>>
  → ipcRenderer.invoke(IPC.REVIEW_SUMMARIZE, data)
```

---

## 8. 任务拆解（DeepSeek 执行顺序）

1. **常量 + 类型 + IPC 常量**：`shared/constants.ts` +6 常量；`shared/types.ts` +3 类型；`shared/ipc.ts` +`PLAN_GUIDE`/`REVIEW_SUMMARIZE`。
2. **只读 repo 方法**：按 §6 在 `todoRepo`/`projectRepo` 补齐 `findOpenToday`/`findOverdue`(复用)/`findCompletedOn`/`findActive`（只读，不写迁移）。
3. **服务层**：`services/llm.ts` 抽 `requestChat` + `parseJsonObject`；实现 `buildGuideContext`/`buildSummaryContext` + `guidePlan` + `summarizeReview`（逐字 system prompt；logger 仅记 latency/计数；不记 content/draft/items 明文）。
4. **IPC**：`plans.ipc.ts` +`plan:guideQuestion`；`reviews.ipc.ts` +`review:summarizeDraft`（ChatError→err 映射）。
5. **preload**：`api.plans.guideQuestion` / `api.reviews.summarizeDraft`。
6. **组合式**：`usePlanGuide.ts`（checkReady/guide/applySuggestion/clear）、`useReviewSummary.ts`（checkReady/summarize/applyDraft/clear）。
7. **View**：PlanView +「AI 引导」按钮 + 透明提示 + 内联引导面板（loading/error/items + 插入/跳过）；ReviewView +「AI 汇总」按钮 + 透明提示 + 内联草稿面板（loading/error/draft + 替换/追加/取消）。两处禁用态 + 去设置链接；红色错误条用 `--danger` token；全 `{{}}` 插值禁 v-html。
8. **自测**：全部验收点；更新 `当前状态.md`（§11 追加子阶段4 小节）；写 `项目日志/计划与复盘-子阶段4-LLM增强.md`。

---

## 9. 验收点（GLM 评审依据，可勾选可验证）

- [ ] `shared` 三件套齐：`constants.ts` +6 常量、`types.ts` +3 类型、`ipc.ts` +2 通道（`plan:guideQuestion`/`review:summarizeDraft`）。
- [ ] `services/llm.ts`：`requestChat` 共享 + `guidePlan`/`summarizeReview` + 逐字 system prompt + `parseJsonObject` 鲁棒解析；`searchNews` 不被改动（diff 不含其逻辑改动）。
- [ ] **未配 LLM**（`llmBaseUrl`/`llmModel`/`llmApiKey` 任一空）→ 两 AI 按钮 disabled + 非阻塞「去设置」可跳 `/settings`；**不发起任何网络请求**（DevTools Network 无 `chat/completions`）。
- [ ] **已配** → 「AI 引导」调 `plan:guideQuestion`（入参仅 templateId/filled）、「AI 汇总」调 `review:summarizeDraft`（入参仅 date）；主进程用**库内** `llmApiKey`（密文读出），渲染层 grep 无明文 key。
- [ ] 引导：返回逐占位符 `items`（placeholder/question/suggestion）；逐条「插入」→ 把 `{{placeholder}}` 替换为 suggestion（或末尾追加），`editContent` 更新；「跳过」不动内容。
- [ ] 汇总：返回 `draft`；「替换内容」→ `editContent=draft`；「追加到末尾」→ `editContent += draft`；「取消」不动内容；**替换前面板已有文字提示「替换将覆盖当前内容」**。
- [ ] 汇总无数据（当日无完成任务）→ **不调 LLM**，直接返回占位草稿（含日期），不抛错。> 注（2026-08-07 用户反馈2 订正）：原"且无项目"条件 + `findActive()` 全局查询致短路永不触发，改为仅看当日完成数。
- [ ] 模型未按 JSON 回答（包裹 ```json```、多余解释）→ `parseJsonObject` 鲁棒降级：引导 `items=[]`、汇总 draft 取原文前 1000 字，不崩。
- [ ] 401/403 →「API Key 无效或已过期」；429 →「请求过于频繁」；5xx →「AI 服务暂时不可用」；网络错 →「网络连接失败」；超时(>30s) →「AI 响应超时」；**均单次不重试**（无循环、无自动重发）。
- [ ] 失败时显示**模块内红色状态条**（`--danger`/`--danger-soft` token，非模态、非 alert/confirm）；可点「重试」。
- [ ] **§9 日志**：logger 不输出 apiKey 明文（`logger.redact` 兜底）；不输出 todo/项目 content、不输出 draft/suggestion 明文；错误仅记 `ChatError.code`，成功仅记 `latencyMs`/`items.length`/`draft.length`（grep 主进程 + `llm.ts` 核对）。
- [ ] **§9 私有数据外发透明性**：两 AI 按钮旁有内联文字提示「基于…调用你配置的 AI」（`--text-faint`，非模态）；数据仅发往用户自配 `llmBaseUrl`（用户指定端点，§9 豁免）。
- [ ] **§9 token 红线**：本子阶段全为前台用户触发，红线 N/A；仍落实 `LLM_GUIDE_MAX_TOKENS:800`/`LLM_DRAFT_MAX_TOKENS:1000` + 上下文 `LLM_TODO_LIMIT:50`/`LLM_PROJECT_LIMIT:10` + 单条截断 `LLM_TODO_CHARS:80` 成本护栏（代码可见）。
- [ ] **§9 软删除 / 数据外发**：本子阶段**不写、不删**任何表（templates/todos/projects/settings 全只读）；外发仅 todos(content) + projects(name/status/counts)，**不外发** projects.description / notes / inboxes 等。
- [ ] **XSS**：引导 suggestion/question、草稿 preview 全 `{{}}` 插值或经 MarkdownEditor(DOMPurify) 渲染，**禁自写 v-html**；不信任模型输出链接（草稿里若有链接，由 DOMPurify 处理，不特殊信任）。
- [ ] **无新表 / 无迁移**（grep migrations 目录无新增；DB schemaVersion 不变）。
- [ ] **无硬编码 hex**：`grep '#[0-9a-fA-F]{3,6}|rgba?\(' src/renderer/src/{views,composables}/**/*.{vue,ts}`（本子阶段新增/变动文件）为空；红色错误条用 `--danger` token。
- [ ] **无新图标**：AI 按钮用 `Sparkles`（阶段 5 已注册于 AppIcon）；不新增图标。
- [ ] **静态 import**：服务层 `import { randomUUID }` 之类无新 require（本子阶段无新增 require）。
- [ ] `npm run build` 绿，零 TS 错误。

---

## 10. 禁止边界 & 错误降级（承袭并具化）

**禁止边界（v0.3 §9 / 项目计划 §7-B）**：
- **日志**：`apiKey` 永不入日志（`logger.redact` 兜底 + 调用方显式不传）；**禁记** todo/项目 content、draft/suggestion 明文；错误仅记 `ChatError.code`，成功仅记 latency/计数。
- **私有数据外发**：todos(content) + projects(name/status/counts) 发往**用户自配** `llmBaseUrl`（属 §9「用户指定的云端」豁免 + 用户主动触发）；**严禁**外发 projects.description / notes / inboxes / reviews 等其他私有表；按钮旁内联透明提示（非模态）让用户知晓。**不新增设置开关**（以透明提示替代，避免扩大范围改设置页）——此为本子阶段明确决策。
- **token 红线**：仅约束后台自主调用；本子阶段**全前台用户触发**，红线 N/A；仍设输出/上下文/截断三重成本护栏。
- **软删除**：本子阶段不写不删任何数据（全只读）。
- **无模态弹窗**：错误用模块内红色状态条；「去设置」用路由跳转/链接，禁 alert/confirm；透明提示用内联 span。
- **无新图标 / 无硬编码 hex**：用 `Sparkles`（既有）+ token 配色。
- **XSS**：全 `{{}}` 插值或经 MarkdownEditor(DOMPurify)；禁自写 v-html。

**错误降级（v0.3 §10 / 项目计划 §7-C）**：
- **LLM 失败**（401/403、429、5xx、网络错、超时）：单次不重试（无循环、无自动重发）+ 本地日志（脱敏）+ 模块内**红色状态条**（非模态）+ 可读错误码映射（v0.3 §10「智能复盘…红色状态条」原文落地）。
- **模型未按 JSON 回答**：`parseJsonObject` 鲁棒降级（引导 items=[]、汇总 draft 取原文前 1000 字），不抛未捕获异常。
- **无数据**（汇总当日无完成任务）：不调 LLM，返回占位草稿。（2026-08-07 用户反馈2 订正：去"且无项目"——全局进行中项目不应阻断短路。）
- **未配 LLM**：入口 disabled + 非阻塞「去设置」，不发包。
- **回填安全**：「替换内容」面板提示「将覆盖当前内容」；用户显式点击才替换（浏览器 textarea 原生 undo 可撤销）；「追加」为非破坏操作。

---

## 11. 交付与运行说明

- **启动/构建**：`cd E:\workspace\workbuddy && npm run dev` / `npm run build`。无新增必需 env（LLM 配置沿用 settings 中 `llmBaseUrl`/`llmModel`/`llmApiKey`）。
- **DeepSeek 须在 `当前状态.md` 补充**（§11 追加子阶段4 小节）：新增 IPC 通道清单（2 个）、新增文件清单（2 composable + 服务层 + view 改动）、护栏常量清单、自测（未配降级 / 已配引导 / 已配汇总 / JSON 降级 / 四类错误码 / 无数据占位 / 回填两种模式）、私有数据外发透明性说明、运行/复测命令、已知项。
- **GLM 审查入口**：实现完成后用 03 prompt（`{{unit}}=子阶段4`、`{{计划目录}}=计划与复盘体系实现项目计划`）启动审查。GLM 依 §9 + §10 逐条核：
  - headless 可核：未配禁用态（grep + Network）、错误端点验失败/超时态、构造非 JSON 响应验 `parseJsonObject`、grep 日志无明文/apiKey、grep 无硬编码 hex、build 绿。
  - **需真实可用 LLM 端点**才能验「已配」全链路（引导逐条采纳、汇总草稿替换/追加）；用户 E2E 实跑。
- **本子阶段关闭后**：计划与复盘体系 v0.2.0 四子阶段全齐（基建/计划/复盘/LLM 增强），可按项目计划 §13 bump `0.2.0` 并发版（CHANGELOG + package.json version，属代码改动，由 DeepSeek 在发版步骤同步）。
