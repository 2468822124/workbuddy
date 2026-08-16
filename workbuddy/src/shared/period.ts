import type { PlanningLevel } from './types'

// ========================================
// 期键计算（子阶段5）：ISO 周一始周日终 + 月 1 号起始
// 纯函数；全部用 UTC 算术（Date.UTC + getUTC*），
// 规避本地时区漂移（子阶段3 LOW-1 教训）。
// ========================================

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' → UTC 当日 00:00 的 ms（无时区歧义） */
function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** UTC ms → 'YYYY-MM-DD' */
function fromUtcMs(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  return !Number.isNaN(toUtcMs(date))
}

/** 本地今天 'YYYY-MM-DD'（仅非法 date 兜底用，不参与期键主路径） */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** ISO 周数（周一为周首）：该日期所在周的周四所在 ISO 年的周序号 */
export function isoWeekOf(date: string): number {
  const ms = toUtcMs(date)
  const weekday = (new Date(ms).getUTCDay() + 6) % 7 // 周一=0 … 周日=6
  const thursday = new Date(ms - weekday * DAY_MS + 3 * DAY_MS)
  const isoYear = thursday.getUTCFullYear()
  const jan4 = Date.UTC(isoYear, 0, 4)
  const jan4Weekday = (new Date(jan4).getUTCDay() + 6) % 7
  const jan4Monday = jan4 - jan4Weekday * DAY_MS
  return Math.floor((thursday.getTime() - jan4Monday) / (7 * DAY_MS)) + 1
}

/** 本周周一 'YYYY-MM-DD' */
export function getWeekStart(date: string): string {
  const ms = toUtcMs(date)
  const weekday = (new Date(ms).getUTCDay() + 6) % 7 // 周一=0
  return fromUtcMs(ms - weekday * DAY_MS)
}

/** [周一, 周日] */
export function getWeekRange(date: string): [string, string] {
  const start = getWeekStart(date)
  return [start, fromUtcMs(toUtcMs(start) + 6 * DAY_MS)]
}

/** 本月 1 号 'YYYY-MM-DD' */
export function getMonthStart(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return `${y}-${pad2(m)}-01`
}

/** [1号, 月末日] */
export function getMonthRange(date: string): [string, string] {
  const [y, m] = date.split('-').map(Number)
  const nextMonthStart = Date.UTC(y, m, 1) // m 为 1-based，Date.UTC 自动进位
  const end = new Date(nextMonthStart - DAY_MS)
  return [
    `${y}-${pad2(m)}-01`,
    `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`,
  ]
}

/** 期起始：daily→date；weekly→周一；monthly→1 号。date 非法兜底回今天并**按 level 归一化**
 * （用户反馈3.1 根因 C：曾直接返回 todayStr() 未归一化——侧栏进 /planning/weekly 无 date query 时
 *  周六打开 curStart=周六 → 保存 nextStart=周六+7 落在非周一起始，rail 按周一查永远取不到）。 */
export function periodStartFor(level: PlanningLevel, date: string): string {
  if (!isValidDate(date)) return periodStartFor(level, todayStr())
  if (level === 'daily') return date
  if (level === 'weekly') return getWeekStart(date)
  return getMonthStart(date)
}

/** 下一期起始：daily +1 天；weekly +7 天；monthly 进次月 1 号 */
export function nextPeriodStart(level: PlanningLevel, start: string): string {
  if (level === 'daily') return fromUtcMs(toUtcMs(start) + DAY_MS)
  if (level === 'weekly') return fromUtcMs(toUtcMs(start) + 7 * DAY_MS)
  const [y, m] = start.split('-').map(Number)
  const next = new Date(Date.UTC(y, m, 1)) // m 为 1-based → 次月 1 号
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-01`
}

/** 日期加减 n 天（UTC 纯算术）；用于跨期计算（如上期起始 = getWeekStart(addDays(start, -1))） */
export function addDays(date: string, n: number): string {
  return fromUtcMs(toUtcMs(date) + n * DAY_MS)
}

/** 期标签：weekly→`第 N 周 · MM/DD–MM/DD`；monthly→`YYYY 年 M 月`；daily→`YYYY-MM-DD` */
export function periodLabel(level: PlanningLevel, start: string): string {
  if (level === 'daily') return start
  if (level === 'weekly') {
    const [s, e] = getWeekRange(start)
    const mmdd = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`
    return `第 ${isoWeekOf(start)} 周 · ${mmdd(s)}–${mmdd(e)}`
  }
  const [y, m] = start.split('-').map(Number)
  return `${y} 年 ${m} 月`
}
