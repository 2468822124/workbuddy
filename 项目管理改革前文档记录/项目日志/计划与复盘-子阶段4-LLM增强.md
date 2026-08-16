# 项目日志 · 计划与复盘 子阶段 4 — LLM 增强

> **维护**：DeepSeek　**用途**：子阶段实现日志

---

## 日志元信息
- **阶段 / 批次**：计划与复盘体系 子阶段 4（LLM 增强，首次实现）
- **日期**：2026-08-07
- **实现者**：DeepSeek
- **规格依据**：`计划与复盘体系实现项目计划/规格-子阶段4-LLM增强.md`

## 实现概要
给「计划 / 复盘」补上 LLM 增强（用户前台主动触发，离线仍全可用）：`services/llm.ts` 抽取共享 `requestChat()`（配置探测→endpoint 规范化→fetch+AbortController→状态码→ChatError→content，apiKey 永不入日志）+ `parseJsonObject()` 鲁棒解析 + `guidePlan()`（逐占位符引导，上下文 = 今日待办+逾期+进行中项目，todo content 截断 80 字、项目仅 name/status/openTasks）+ `summarizeReview()`（日复盘草稿，无数据不调 LLM 占位草稿）。两个 IPC（`plan:guideQuestion` / `review:summarizeDraft`）+ preload 桥；两组合式（usePlanGuide / useReviewSummary，镜像 useHotspotChat）；PlanView「✨ AI 引导」+ ReviewView「✨ AI 汇总」内联面板（loading/红色错误条+重试/逐条插入-跳过/草稿替换-追加-取消，替换前警告）。全 `{{}}` 插值禁 v-html；不重构 searchNews；无新表/无迁移。

## 新增 / 修改文件
| 文件 | 类型 | 说明 |
|---|---|---|
| `workbuddy/src/shared/constants.ts` | 修改 | +6 护栏常量（LLM_GUIDE_MAX_TOKENS=800 / LLM_DRAFT_MAX_TOKENS=1000 / LLM_TODO_LIMIT=50 / LLM_TODO_CHARS=80 / LLM_PROJECT_LIMIT=10 / LLM_GUIDE_ITEMS_MAX=8） |
| `workbuddy/src/shared/types.ts` | 修改 | +PlanGuideItem / PlanGuideResult / ReviewDraftResult |
| `workbuddy/src/shared/ipc.ts` | 修改 | +PLAN_GUIDE='plan:guideQuestion' / REVIEW_SUMMARIZE='review:summarizeDraft' |
| `workbuddy/src/main/db/repositories/todoRepo.ts` | 修改 | +findOpenToday / findCompletedOn（只读；findOverdue 既有复用） |
| `workbuddy/src/main/db/repositories/projectRepo.ts` | 修改 | +findActive（status='active' + counts，只读） |
| `workbuddy/src/main/services/llm.ts` | 修改 | +requestChat / parseJsonObject / buildGuideContext / buildSummaryContext / guidePlan / summarizeReview（逐字 system prompt；searchNews 不动） |
| `workbuddy/src/main/ipc/plans.ipc.ts` | 修改 | +plan:guideQuestion handler（ChatError→err 映射） |
| `workbuddy/src/main/ipc/reviews.ipc.ts` | 修改 | +review:summarizeDraft handler（ChatError→err 映射） |
| `workbuddy/src/preload/index.ts` | 修改 | +api.plans.guideQuestion / api.reviews.summarizeDraft |
| `workbuddy/src/renderer/src/composables/usePlanGuide.ts` | 新增 | checkReady / guide / applySuggestion（纯函数回填，替换首个 {{placeholder}} 或末尾追加）/ clear |
| `workbuddy/src/renderer/src/composables/useReviewSummary.ts` | 新增 | checkReady / summarize / applyDraft（replace/append 纯函数）/ clear |
| `workbuddy/src/renderer/src/views/PlanView.vue` | 修改 | +AI 引导按钮（Sparkles）+透明提示/去设置+内联引导面板（loading/err-bar/逐条卡片） |
| `workbuddy/src/renderer/src/views/ReviewView.vue` | 修改 | +AI 汇总按钮（Sparkles）+透明提示/去设置+内联草稿面板（MarkdownEditor 只读预览+替换/追加/取消） |

## 关键决策与规格偏差
| 偏差 | 原规格 | 实际做法 | 原因 |
|---|---|---|---|
| 无 | — | — | 严格按规格 §5/§7/§8 实现 |

实现细节说明：
- 错误映射：`plan:guideQuestion` / `review:summarizeDraft` 捕获 `ChatError` → `err(e.code, e.message)` + `logger.warn` 仅记 code；非 ChatError → `INTERNAL` + `logger.error`。
- 日期：guidePlan 内 `todayStr()` 用 `new Date().toISOString().slice(0,10)`（UTC，与 useToday 一致）；summarize 日期来自 view 的 `reviewDate`（不另算，规格 §6 要求）。
- `parseJsonObject` 按规格 §5.5 内部实现，未导出。

## 自测记录
| 验收点 | 命令/操作 | 结果 |
|---|---|---|
| vitest 全绿（既有 15 例不回退） | `npm test` | ✅ 2 files / 15 tests all passed，288ms |
| 构建绿，零 TS 错误 | `npm run build` | ✅ 2.31s 绿（main/preload/renderer 完整打包） |
| 无硬编码 hex | `grep '#[0-9a-fA-F]{3,6}\|rgba?('` 新增/变动 renderer 文件 | ✅ 零匹配（全 var(--*) token） |
| 禁 v-html | grep views/composables | ✅ 无实际 v-html（仅注释提及） |
| 无新 require | grep llm.ts 新增段 | ✅ 全静态 import |
| logger 无明文 | 代码审查 | ✅ 仅 latency/items.length/draft.length / ChatError.code；apiKey 不传 logger（redact 兜底） |
| searchNews 未改动 | 代码核对 | ✅ 仅 imports 追加 + 文件尾追加，函数体零 diff |
| 未配 LLM 不发包 | 代码路径核对 | ✅ checkReady 三件套 → llmReady=false → disabled + 去设置；guide/summarize 有 llmReady 守卫 |

## 已知问题 / 技术债
- 已配 LLM 全链路（真实端点引导/汇总）GUI 流待用户 E2E —— headless 无法实跑 Electron GUI + 真实 LLM 端点。
- 组合式/repo 层无单测（非纯函数，依赖 electron 运行时，不在 vitest 范围；规格 §8 未列单测项）。

## 下一步
可交 GLM 审查（03 prompt：`{{unit}}=子阶段4`、`{{计划目录}}=计划与复盘体系实现项目计划`）。
