import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from './useApi'
import { periodStartFor } from '@shared/period'
import type { PlanGuideItem, PlanningLevel } from '@shared/types'

// 三级 → plan/review 类型；级联关系：daily←weekly（本周）；weekly←monthly（本月）；monthly 无上级
export const LEVEL_TO_PLAN_TYPE: Record<PlanningLevel, string> = {
  daily: 'daily_plan',
  weekly: 'weekly_plan',
  monthly: 'monthly_plan',
}
export const LEVEL_TO_REVIEW_TYPE: Record<PlanningLevel, string> = {
  daily: 'daily_review',
  weekly: 'weekly_review',
  monthly: 'monthly_review',
}
const PARENT_LEVEL: Record<PlanningLevel, PlanningLevel | null> = {
  daily: 'weekly',
  weekly: 'monthly',
  monthly: null,
}

// 任务行（去重/段内定位/草稿文本集用；含内联隐形 tid）
// 注意：与主进程 planParser 的 TASK_LINE_RE **不同形**——本正则 bullet 未被捕获，
// 捕获组 = 组1缩进/组2勾选态/组3文本（m[4] 不存在）。改动组索引前先 node 实跑验证。
const TASK_LINE_RE = /^(\s*)[-*]\s+\[\s?([ xX])\s?\]\s+(.+?)(?:\s*<!--\s*tid:[0-9a-f]+(?:\s+parent:[0-9a-f]+)?\s*-->)?\s*$/

/** 去行尾内联 tid 注释（比较/去重用，隐形标识不入文本语义）。 */
function stripTidComment(text: string): string {
  return text.replace(/\s*<!--\s*tid:[0-9a-f]+(?:\s+parent:[0-9a-f]+)?\s*-->\s*$/, '').trim()
}

/** F3-1.3-A：从编辑中计划内容提取任务文本集（`- [ ]`/`- [x]` 行，已剥 tid）。rail 隐藏源（派生，非会话态）。 */
export function extractTaskTexts(content: string): Set<string> {
  const s = new Set<string>()
  if (!content) return s
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(TASK_LINE_RE)
    // m[3]=text（本正则 3 组：1缩进/2勾选态/3文本；勿用 m[4]，不存在）
    if (m) s.add(stripTidComment(m[3]))
  }
  return s
}

/**
 * 计划草稿是否已含同名任务（按剥离 tid 注释的文本比对，隐形标识不入语义）。
 * 纯函数，导出供单测（P1-① 去重防回归）。
 */
export function taskExistsInDraft(draft: string, text: string): boolean {
  const target = text.trim()
  return draft.split(/\r?\n/).some(line => {
    const m = line.match(TASK_LINE_RE)
    // m[3]=text（本正则 3 组，同 extractTaskTexts）
    return !!m && stripTidComment(m[3]) === target
  })
}

/**
 * 子阶段5：规划三级统一组合式（合并扩展子阶段4 usePlanGuide + useReviewSummary）。
 * - 规划区 guide：日/周/月通用（子阶段4 引导式提问，LLM 可选，未配置时降级提示）。
 * - 复盘区 summarize：按 level 分派——daily 确定性轻量（本地统计，不调 AI）；
 *   weekly/monthly 调 review:summarizeWeekly/Monthly（主进程聚合 + LLM → Markdown）。
 * - 级联：loadParentTasks 取上级 plan 任务（含 consumed 状态）；pickTask 插入本级 + 回写上级。
 * - 不持有 editContent / 已存 plan/review（view 拥有）；草稿经纯函数 applyXxx 交回 view。
 */
export function usePlanning(level: PlanningLevel) {
  const api = useApi()
  const router = useRouter()

  const llmReady = ref(false)

  // 规划区（AI 引导）
  const guideItems = ref<PlanGuideItem[]>([])
  const guideLoading = ref(false)
  const guideError = ref<{ code: string; message: string } | null>(null)

  // 复盘区（生成草稿；daily 为确定性统计 Markdown，周/月为 LLM Markdown）
  const reviewContent = ref('')
  const reviewLoading = ref(false)
  const reviewError = ref<{ code: string; message: string } | null>(null)

  // 级联（上级 plan 任务 + 上级 planId；pickTask 预关联用；tid 惰性分配，未分配为 null）
  // 第二轮实测·问题①：scheduledInPeriod=本期已安排（后端扫描子级计划 parent:{tid}；rail 全期隐藏）
  const parentTasks = ref<{ text: string; consumed: boolean; tid: string | null; scheduledInPeriod: boolean }[]>([])
  const parentPlanId = ref<string | null>(null)
  const parentTasksLoading = ref(false)

  async function checkReady() {
    const [b, m, k] = await Promise.all([
      api.settings.get('llmBaseUrl'),
      api.settings.get('llmModel'),
      api.settings.get('llmApiKey'),
    ])
    llmReady.value = !!(
      b.ok &&
      b.data.value.trim() &&
      m.ok &&
      m.data.value.trim() &&
      k.ok &&
      k.data.value.trim()
    )
  }

  /** 未配 LLM 时的非阻塞引导：跳设置页（不弹模态窗）。 */
  async function goSettings() {
    await router.push('/settings')
  }

  async function guide(templateId: string, filled: string) {
    if (guideLoading.value) return
    if (!llmReady.value) {
      guideError.value = { code: 'LLM_NOT_CONFIGURED', message: '未配置 AI，请先前往设置' }
      return
    }
    guideLoading.value = true
    guideError.value = null
    guideItems.value = []
    const r = await api.plans.guideQuestion({ templateId, filled })
    guideLoading.value = false
    if (r.ok) {
      guideItems.value = r.data.items
    } else {
      guideError.value = r.error
    }
  }

  /** 纯函数回填：替换首个 {{placeholder}}；不存在则末尾追加。返回新字符串（view 赋给 editContent）。 */
  function applySuggestion(item: PlanGuideItem, currentContent: string): string {
    const token = `{{${item.placeholder}}}`
    const idx = currentContent.indexOf(token)
    if (idx !== -1) {
      return currentContent.slice(0, idx) + item.suggestion + currentContent.slice(idx + token.length)
    }
    return currentContent + `\n- ${item.suggestion}`
  }

  function clearGuide() {
    guideItems.value = []
    guideError.value = null
  }

  /** daily 确定性轻量回顾：今日完成统计 + 已完成/未完成列表（不调 AI）。 */
  async function summarizeDaily(periodStart: string): Promise<string> {
    const [todosR, planR] = await Promise.all([
      api.todos.today(periodStart),
      api.plans.byDate(periodStart),
    ])
    const todos = todosR.ok ? todosR.data : []
    const done = todos.filter(t => t.status === 'done')
    const open = todos.filter(t => t.status === 'todo')
    const total = todos.length
    const pct = total === 0 ? 0 : Math.round((done.length / total) * 100)
    const planText = planR.ok && planR.data?.content ? planR.data.content.trim() : ''
    const lines: string[] = []
    lines.push('## ◎ 今日回顾（确定性生成）')
    lines.push('')
    lines.push(`**完成统计**：${done.length} / ${total}（${pct}%）`)
    if (planText) {
      lines.push('')
      lines.push('**今日计划**')
      lines.push('')
      lines.push(planText)
    }
    lines.push('')
    lines.push('### ✅ 已完成')
    if (done.length) {
      for (const t of done) lines.push(`- ${t.content}`)
    } else {
      lines.push('- （无）')
    }
    lines.push('')
    lines.push('### ⬜ 未完成')
    if (open.length) {
      for (const t of open) lines.push(`- ${t.content}`)
    } else {
      lines.push('- （无）')
    }
    return lines.join('\n')
  }

  /** 按 level 分派生成复盘草稿：daily 确定性；weekly/monthly 走 LLM。 */
  async function summarize(periodStart: string) {
    if (reviewLoading.value) return
    if (level === 'daily') {
      reviewLoading.value = true
      reviewError.value = null
      try {
        reviewContent.value = await summarizeDaily(periodStart)
      } catch (e: unknown) {
        reviewError.value = { code: 'INTERNAL', message: (e as Error).message }
      } finally {
        reviewLoading.value = false
      }
      return
    }
    if (!llmReady.value) {
      reviewError.value = { code: 'LLM_NOT_CONFIGURED', message: '未配置 AI，请先前往设置' }
      return
    }
    reviewLoading.value = true
    reviewError.value = null
    const r =
      level === 'weekly'
        ? await api.reviews.summarizeWeekly({ date: periodStart })
        : await api.reviews.summarizeMonthly({ date: periodStart })
    reviewLoading.value = false
    if (r.ok) {
      reviewContent.value = r.data.content
    } else {
      reviewError.value = r.error
    }
  }

  /** 重新生成：清空旧草稿再调 summarize。 */
  async function regenerate(periodStart: string) {
    reviewContent.value = ''
    await summarize(periodStart)
  }

  function clearReview() {
    reviewContent.value = ''
    reviewError.value = null
  }

  /** 级联：取上级 plan 任务（daily→planStart 所在周 weekly_plan；weekly→planStart 所在月 monthly_plan）。
   *  planStart 为**当前查看期**起始（PlanningView 传 curStart，用户反馈3.1 F3-1.1：业务规则
   *  「本周周任务 = 查看日所在周」，非规划期 nextStart——跨周边界基准错则 rail 空）；
   *  上级期起始由 periodStartFor 换算。 */
  async function loadParentTasks(planStart: string) {
    parentTasksLoading.value = true
    try {
      const parentLevel = PARENT_LEVEL[level]
      if (!parentLevel) {
        parentTasks.value = []
        parentPlanId.value = null
        return
      }
      const parentStart = periodStartFor(parentLevel, planStart)
      const r = await api.plans.listTasksByPeriod({ type: LEVEL_TO_PLAN_TYPE[parentLevel], date: parentStart })
      if (r.ok) {
        parentTasks.value = r.data.tasks
        parentPlanId.value = r.data.planId
      } else {
        parentTasks.value = []
        parentPlanId.value = null
      }
    } finally {
      parentTasksLoading.value = false
    }
  }

  /** 任务行插入「任务」段（标题含「任务」的 `##` 段）：
   *  段内末个任务行之后（或段尾/下一 `##` 前）；无「任务」段 → 末尾追加 + warn（模板被改/删段容错）。
   *  F3-1.3-B：点选任务依次流入「任务清单/本周任务/本月任务」段，非备注段。 */
  function insertTaskLine(content: string, taskLine: string): string {
    const lines = content.split(/\r?\n/)
    const sectionAt = lines.findIndex(l => /^#{2,}\s/.test(l) && l.includes('任务'))
    if (sectionAt === -1) {
      console.warn(`[pickTask] 未找到「任务」段，任务已追加至末尾：${taskLine}`)
      return content.replace(/\s*$/, '') + (content ? '\n' : '') + taskLine + '\n'
    }
    let lastTaskAt = -1
    let sectionEnd = lines.length
    for (let i = sectionAt + 1; i < lines.length; i++) {
      if (/^#{2,}\s/.test(lines[i])) {
        sectionEnd = i
        break
      }
      if (TASK_LINE_RE.test(lines[i])) lastTaskAt = i
    }
    const insertAt = lastTaskAt !== -1 ? lastTaskAt + 1 : sectionEnd
    const next = lines.slice()
    next.splice(insertAt, 0, taskLine)
    return next.join('\n')
  }

  /** 点选下沉（v0.2修复计划·§3.4）：上级任务插入本级 content，行内带隐形 tid 关联
   *  `- [ ] {text} <!-- tid:{child} parent:{parentTid} -->`。
   *  - 主进程 plan:prepareTaskLink：惰性确保 parent tid（缺失分配并写回父计划 content）+ 分配 child tid。
   *  - prepareTaskLink 失败（任务行已勾选/已删）→ 降级：按文本插裸行（无关联，不崩）。
   *  - 行内去重按剥离 tid 的文本（隐形标识不入比较语义）。
   *  不再 eager markTaskConsumed（F3-1.2 方案 C：消耗跟随 todo 完成，非选取）。
   *  插入「任务」段（F3-1.3-B）；rail 隐藏由 planDraft 派生（F3-1.3-A，见 extractTaskTexts）。
   *  返回 `{ content, picked }`：picked=false = 计划内已存在同名任务（正确去重，
   *  调用方给 UX 提示，杜绝"点选取无反应"的静默困惑）。 */
  async function pickTask(
    task: { text: string; tid: string | null },
    currentContent: string,
    planStart: string,
  ): Promise<{ content: string; picked: boolean }> {
    const taskText = task.text.trim()
    const exists = taskExistsInDraft(currentContent, taskText)
    let next = currentContent
    if (!exists) {
      if (parentPlanId.value) {
        const r = await api.plans.prepareTaskLink({
          parentPlanId: parentPlanId.value,
          taskText,
          taskTid: task.tid ?? undefined,
        })
        if (r.ok) {
          next = insertTaskLine(currentContent, `- [ ] ${r.data.taskText} <!-- tid:${r.data.childTid} parent:${r.data.parentTid} -->`)
        } else {
          console.warn(`[pickTask] prepareTaskLink 失败，降级按文本插入：${r.error.code}`)
          next = insertTaskLine(currentContent, `- [ ] ${taskText}`)
        }
      } else {
        // 无上级 plan（边界：级联未加载）→ 裸行插入
        next = insertTaskLine(currentContent, `- [ ] ${taskText}`)
      }
    }
    await loadParentTasks(planStart)
    return { content: next, picked: !exists }
  }

  onMounted(checkReady)

  return {
    llmReady,
    goSettings,
    // 规划区
    guideItems,
    guideLoading,
    guideError,
    guide,
    applySuggestion,
    clearGuide,
    // 复盘区
    reviewContent,
    reviewLoading,
    reviewError,
    summarize,
    regenerate,
    clearReview,
    // 级联
    parentTasks,
    parentPlanId,
    parentTasksLoading,
    loadParentTasks,
    pickTask,
  }
}
