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
