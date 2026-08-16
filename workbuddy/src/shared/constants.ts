export const APP_NAME = 'WorkBuddy'

export const DEFAULT_RSS_SOURCES = [
  { id: '36kr', name: '36氪', type: 'rss', url: 'https://36kr.com/feed' },
  { id: 'sspai', name: '少数派', type: 'rss', url: 'https://sspai.com/feed' },
  { id: 'v2ex', name: 'V2EX', type: 'rss', url: 'https://www.v2ex.com/index.xml' },
]

export const MORNING_WINDOW = { start: '06:00', end: '09:00' }

// Phase 5: conversational hotspot search (LLM)
export const LLM_NEWS_CONTEXT_LIMIT = 15
export const LLM_CHAT_MAX_TOKENS = 600
export const LLM_CHAT_TIMEOUT_MS = 30_000
export const LLM_QUERY_MAX_CHARS = 200
export const LLM_REFS_MAX = 5

// 子阶段4：计划/复盘 LLM 增强护栏（前台用户触发，成本护栏）
export const LLM_GUIDE_MAX_TOKENS = 800   // 引导提问输出上限
export const LLM_DRAFT_MAX_TOKENS = 1000  // 复盘草稿输出上限
export const LLM_TODO_LIMIT = 50          // 注入上下文的待办条数上限
export const LLM_TODO_CHARS = 80          // 单条待办 content 在 prompt 内的截断长度
export const LLM_PROJECT_LIMIT = 10       // 注入上下文的项目条数上限
export const LLM_GUIDE_ITEMS_MAX = 8      // 返回引导条目上限

// 子阶段5：周/月结构化复盘护栏（多 section Markdown，输出/上下文三重截断）
export const LLM_WEEK_REVIEW_MAX_TOKENS = 1600  // 周复盘输出上限
export const LLM_MONTH_REVIEW_MAX_TOKENS = 1600 // 月复盘输出上限
export const LLM_REVIEW_TODO_LIMIT = 80         // 注入上下文的周/月范围任务条数上限
export const LLM_REVIEW_TODO_CHARS = 60         // 单条任务 content 在周/月复盘 prompt 内截断
export const LLM_REVIEW_SUB_LIMIT = 8           // 注入的下级复盘条数上限（周←日复盘；月←周复盘）
export const LLM_REVIEW_SUB_CHARS = 400         // 单条下级复盘摘要截断
