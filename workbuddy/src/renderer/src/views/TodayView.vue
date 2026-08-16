<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useToday } from '@/composables/useToday'
import HotspotChat from '@/components/HotspotChat.vue'
import AppIcon from '@/components/AppIcon.vue'
import BaseCard from '@/components/BaseCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import { addDays, getWeekStart, getMonthStart } from '@shared/period'
import type { TodoParentTask } from '@shared/types'

const router = useRouter()
const {
  todayTodos, overdueTodos, newsItems, newsOk,
  nickname, doneCount, total,
  toggleTodo, rescheduleTodo, quickCreate, refreshNews,
} = useToday()

/** 周期提醒待办 → 对应规划页（子阶段5：周统筹/月指导直达）。 */
function reminderPath(content: string): string | null {
  if (content.startsWith('📌 做周统筹')) return '/planning/weekly'
  if (content.startsWith('📌 做月指导')) return '/planning/monthly'
  return null
}

/** v0.2修复计划·§3.5：来源 tag → 上级任务所在计划页。
 *  规划页编辑器展示「下一期」计划（nextStart），故 date 偏移到任务所在期 P 的上一期，
 *  使目标任务落在 planDraft 供 focus 定位；无 planDate（边界）→ 只带 focus。 */
function goParentTask(pt: TodoParentTask) {
  let prev = ''
  if (pt.planDate) {
    prev =
      pt.level === 'daily' ? addDays(pt.planDate, -1)
      : pt.level === 'weekly' ? getWeekStart(addDays(pt.planDate, -1))
      : getMonthStart(addDays(pt.planDate, -1))
  }
  const q = prev ? `?date=${prev}&focus=${pt.tid}` : `?focus=${pt.tid}`
  router.push(`/planning/${pt.level}${q}`)
}

const quickText = ref('')

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早安'
  if (h < 18) return '午安'
  return '晚安'
})

const dateLabel = computed(() => {
  const d = new Date()
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${days[d.getDay()]}`
})

function onAddTodo(e: KeyboardEvent) {
  if (e.key === 'Enter' && quickText.value.trim()) {
    quickCreate(quickText.value)
    quickText.value = ''
  }
}

function openLink(url: string) {
  window.open(url, '_blank')
}

function greetEmoji() {
  const h = new Date().getHours()
  if (h < 6 || h >= 21) return '🌙'
  if (h < 12) return '☀'
  return '☀'
}
</script>

<template>
  <div class="bento">
    <!-- Hero -->
    <section class="b-hero hero">
      <div>
        <div class="hero-eyebrow">{{ greeting }} · GOOD MORNING</div>
        <h1>{{ greeting }}，<span class="hero-name">{{ nickname }}</span> {{ greetEmoji() }}</h1>
        <p v-if="overdueTodos.length || todayTodos.length">
          今天有 <b>{{ overdueTodos.length }} 件交接事项</b>
          <template v-if="todayTodos.length"> 和 <b>{{ todayTodos.length }} 项待办</b></template> 等你处理，慢慢来。
        </p>
        <p v-else>今天是新的一天，从一份计划开始吧。</p>
        <div class="date"><AppIcon name="Calendar" :size="15" />{{ dateLabel }}</div>
      </div>
      <div class="hero-cta">
        <button class="btn btn-ghost" @click="refreshNews"><AppIcon name="RefreshCw" :size="17" />刷新热点</button>
        <button class="btn btn-primary" @click="quickText && quickCreate(quickText) || ($refs.quickInput as HTMLInputElement)?.focus()">
          <AppIcon name="Plus" :size="17" />新待办
        </button>
      </div>
    </section>

    <!-- 今日待办 -->
    <section class="b-todo">
      <BaseCard>
        <div class="card-head">
          <div class="ico"><AppIcon name="CheckSquare" :size="18" /></div>
          <div><h2>今日待办</h2><div class="sub">已完成 {{ doneCount }} / {{ total }}</div></div>
          <div class="spacer" />
          <span class="plan-link" @click="router.push('/planning/daily')">📝 今日计划</span>
          <span class="chip">{{ doneCount }} / {{ total }}</span>
        </div>
        <div class="todo-list">
          <div v-if="todayTodos.length === 0" class="empty-hint">还没有今日待办 · 在下方快速添加</div>
          <div
            v-for="t in todayTodos" :key="t.id"
            class="todo-row" :class="{ done: t.status === 'done' }"
            @click="toggleTodo(t.id)"
          >
            <div class="check"><AppIcon name="Check" :size="13" /></div>
            <div class="todo-text">{{ t.content }}</div>
            <!-- F3.2-2 + v0.2修复计划·§3.5：出处标注 tag；parentTask 可点击跳转（上级已删 → 置灰不可点） -->
            <span
              v-if="t.sourceLabel"
              class="tag tag-work"
              :class="{ 'tag-src-link': t.parentTask && !t.parentTask.invalid, 'tag-src-dead': t.parentTask?.invalid || t.sourceLabel === '来源已删' }"
              :title="t.parentTask ? (t.parentTask.invalid ? '上级任务已删除' : '查看来源任务') : (t.sourceLabel === '来源已删' ? '来源任务已删除' : undefined)"
              @click.stop="t.parentTask && !t.parentTask.invalid && goParentTask(t.parentTask)"
            >{{ t.sourceLabel }}</span>
            <span v-if="reminderPath(t.content)" class="rem-go" @click.stop="router.push(reminderPath(t.content)!)">前往</span>
          </div>
        </div>
        <div class="add-row">
          <AppIcon name="Plus" :size="16" />
          <input
            ref="quickInput"
            v-model="quickText"
            class="add-input"
            placeholder="添加待办…"
            @keydown.enter="onAddTodo"
          />
        </div>
      </BaseCard>
    </section>

    <!-- 今日热点 -->
    <section class="b-hot">
      <BaseCard>
        <div class="card-head">
          <div class="ico"><AppIcon name="Newspaper" :size="18" /></div>
          <div><h2>今日热点</h2><div class="sub">Agent 已为你抓取 {{ newsItems.length }} 条</div></div>
          <div class="spacer" />
          <button class="icon-btn" @click="refreshNews"><AppIcon name="RefreshCw" :size="16" /></button>
        </div>
        <div class="news-list">
          <div v-if="!newsOk" class="news-retry" @click="refreshNews">暂无更新，点击重试</div>
          <div v-else-if="newsItems.length === 0" class="news-retry">Agent 正在拉取热点…</div>
          <div
            v-for="n in newsItems" :key="n.id"
            class="news-row" @click="openLink(n.link)"
          >
            <div class="src" :style="{ color: 'var(--accent)' }"><AppIcon name="Circle" :size="8" />{{ n.source }}</div>
            <div class="news-body">
              <div class="news-title">{{ n.title }}</div>
              <div v-if="n.publishedAt" class="news-meta">{{ n.publishedAt.slice(0, 10) }}</div>
            </div>
          </div>
        </div>
        <HotspotChat />
      </BaseCard>
    </section>

    <!-- 交接事项 -->
    <section class="b-hand">
      <BaseCard>
        <div class="card-head">
          <div class="ico"><AppIcon name="Inbox" :size="18" /></div>
          <div><h2>交接事项</h2><div class="sub">来自之前的 {{ overdueTodos.length }} 件未完成</div></div>
          <div class="spacer" />
        </div>
        <div v-if="overdueTodos.length === 0" class="empty-hint">没有待处理的交接事项 🎉</div>
        <div class="hand-list">
          <div v-for="t in overdueTodos" :key="t.id" class="hand-row">
            <div class="hand-when">{{ t.planDate ?? '更早' }}</div>
            <div class="hand-text">{{ t.content }}</div>
            <!-- F3.2-2 + v0.2修复计划·§3.5：出处标注 tag（顺延·{date} / 手动·{date} 等；parentTask 可点击跳转） -->
            <span
              v-if="t.sourceLabel"
              class="tag tag-work"
              :class="{ 'tag-src-link': t.parentTask && !t.parentTask.invalid, 'tag-src-dead': t.parentTask?.invalid || t.sourceLabel === '来源已删' }"
              :title="t.parentTask ? (t.parentTask.invalid ? '上级任务已删除' : '查看来源任务') : (t.sourceLabel === '来源已删' ? '来源任务已删除' : undefined)"
              @click.stop="t.parentTask && !t.parentTask.invalid && goParentTask(t.parentTask)"
            >{{ t.sourceLabel }}</span>
            <div class="hand-act" @click="rescheduleTodo(t.id)"><AppIcon name="CornerUpRight" :size="13" />加入今日</div>
          </div>
        </div>
      </BaseCard>
    </section>

    <!-- 今日灵感（空状态） -->
    <section class="b-idea">
      <BaseCard>
        <div class="card-head">
          <div class="ico" style="background:var(--cat-read-soft);color:var(--cat-read)"><AppIcon name="Lightbulb" :size="18" /></div>
          <div><h2>今日灵感</h2></div>
        </div>
        <EmptyState icon="Lightbulb" title="灵感速记即将上线" description="碎片想法，一闪而过。全局快捷键随时捕捉。" kbd="Ctrl + Shift + N" />
      </BaseCard>
    </section>
  </div>
</template>

<style scoped>
/* Bento grid */
.bento {
  display: grid;
  gap: var(--s5);
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: minmax(150px, auto);
  grid-template-areas:
    "hero hero hero hero"
    "todo todo hot hot"
    "todo todo hot hot"
    "hand hand idea idea";
}
.b-hero { grid-area: hero }
.b-todo { grid-area: todo }
.b-hot { grid-area: hot }
.b-hand { grid-area: hand }
.b-idea { grid-area: idea }

/* Hero */
.hero {
  background: linear-gradient(135deg, var(--hero-bg-start), var(--hero-bg-end));
  border: 1px solid var(--border-soft);
  border-radius: var(--r-2xl);
  padding: var(--s8) clamp(var(--s6), 3vw, var(--s10));
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s6);
  flex-wrap: wrap;
}
.hero::after {
  content: "";
  position: absolute;
  right: -60px;
  top: -60px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-soft), transparent 70%);
  opacity: .7;
}
.hero-eyebrow {
  font-size: 12px;
  letter-spacing: var(--tracking-xwide);
  text-transform: uppercase;
  color: var(--accent);
  font-weight: var(--fw-semibold);
}
.hero h1 {
  font-size: clamp(24px, 2.4vw, 30px);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
  letter-spacing: var(--tracking-tight);
  margin-top: var(--s2);
  line-height: var(--lh-tight);
}
.hero-name { border-bottom: 1.5px dashed transparent; padding: 0 2px; }
.hero p { color: var(--text-muted); margin-top: var(--s2); font-size: var(--fs-body); }
.hero p b { color: var(--accent); font-weight: var(--fw-semibold); }
.hero .date { display: inline-flex; align-items: center; gap: var(--s2); margin-top: var(--s4); font-size: var(--fs-small); color: var(--text-faint); }
.hero-cta { position: relative; z-index: 1; display: flex; gap: var(--s3); }

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
  font-family: inherit;
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  border-radius: var(--r-md);
  padding: 10px 16px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.btn-primary { background: var(--accent); color: var(--text-on-primary); box-shadow: var(--shadow-xs); }
.btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
.btn-ghost { background: transparent; color: var(--text-base); border-color: var(--border); }
.btn-ghost:hover { background: var(--bg-hover); }

/* Card internals */
.card-head {
  display: flex;
  align-items: center;
  gap: var(--s3);
  margin-bottom: var(--s5);
}
.ico {
  width: 34px;
  height: 34px;
  border-radius: var(--r-md);
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}
h2 { font-size: 16px; font-weight: var(--fw-semibold); color: var(--text-strong); letter-spacing: .01em; }
.sub { font-size: var(--fs-caption); color: var(--text-faint); margin-top: 1px; }
.spacer { flex: 1 }
.chip {
  font-size: 11px;
  font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-wide);
  padding: 3px 10px;
  border-radius: var(--r-pill);
  background: var(--accent-soft);
  color: var(--accent);
}
.plan-link {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--accent);
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--dur-base);
}
.plan-link:hover { color: var(--accent-press); }
.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  display: grid;
  place-items: center;
  color: var(--text-faint);
  cursor: pointer;
  border: none;
  background: transparent;
  transition: all var(--dur-base);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--accent); }

/* Todo rows */
.todo-list { display: flex; flex-direction: column; gap: var(--s1); flex: 1; }
.todo-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 9px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background var(--dur-base);
}
.todo-row:hover { background: var(--bg-hover); }
.check {
  width: 20px;
  height: 20px;
  border-radius: var(--r-sm);
  border: 1.8px solid var(--border);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  transition: all var(--dur-base);
  background: var(--bg-surface);
  color: var(--text-on-primary);
}
.todo-row.done .check { background: var(--accent); border-color: var(--accent); }
.todo-row.done .check :deep(svg) { opacity: 1; transform: scale(1); }
.check :deep(svg) { opacity: 0; transform: scale(.4); transition: all var(--dur-base); width: 13px; height: 13px; }
.todo-text { font-size: var(--fs-body); color: var(--text-base); transition: all var(--dur-base); flex: 1; min-width: 0; }
.todo-row.done .todo-text { color: var(--text-faint); text-decoration: line-through; text-decoration-color: var(--text-faint); }
.tag { font-size: 11px; font-weight: var(--fw-medium); padding: 2px 9px; border-radius: var(--r-pill); letter-spacing: .02em; flex-shrink: 0; }
.tag-work { background: var(--cat-work-soft); color: var(--cat-work); }
.tag-src-link { cursor: pointer; border: 1px solid var(--accent-ring); transition: all var(--dur-base); }
.tag-src-link:hover { background: var(--accent); color: var(--text-on-primary); }
.tag-src-dead { background: var(--bg-sunken); color: var(--text-faint); text-decoration: line-through; cursor: default; }
.add-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  margin-top: var(--s4);
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--bg-sunken);
  border: 1px dashed var(--border);
}
.add-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--fs-small);
  color: var(--text-base);
  outline: none;
}
.add-input::placeholder { color: var(--text-faint); }

/* News */
.news-list { display: flex; flex-direction: column; gap: var(--s2); flex: 1; overflow: hidden; }
.news-row {
  display: flex;
  gap: var(--s3);
  padding: 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: all var(--dur-base);
}
.news-row:hover { background: var(--bg-hover); transform: translateX(2px); }
.src { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: var(--fw-semibold); flex-shrink: 0; padding-top: 2px; width: 64px; }
.news-body { min-width: 0; flex: 1; }
.news-title {
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  color: var(--text-strong);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.news-meta { font-size: 11px; color: var(--text-faint); margin-top: 3px; }
.news-retry {
  text-align: center;
  color: var(--text-faint);
  font-size: var(--fs-small);
  padding: var(--s4);
  cursor: pointer;
}
.news-retry:hover { color: var(--accent); }

/* Chat bar (disabled placeholder) */
.chat-bar {
  margin-top: var(--s4);
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 9px 14px;
  border-radius: var(--r-pill);
  background: var(--bg-sunken);
  border: 1px solid var(--border-soft);
  font-size: var(--fs-small);
  transition: all var(--dur-base);
}
.chat-bar.disabled { color: var(--text-disabled); cursor: not-allowed; }
.chat-bar.disabled :deep(svg) { color: var(--text-disabled); }
.kbd { margin-left: auto; font-size: 11px; color: var(--text-faint); }

/* Handover */
.hand-list { display: flex; flex-direction: column; gap: var(--s2); }
.hand-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--bg-sunken);
  border: 1px solid var(--border-soft);
}
.hand-when { font-size: 11px; color: var(--warn); font-weight: var(--fw-semibold); flex-shrink: 0; width: 48px; }
.hand-text { font-size: var(--fs-small); color: var(--text-base); flex: 1; min-width: 0; }
.hand-act {
  font-size: var(--fs-caption);
  color: var(--accent);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.hand-act:hover { color: var(--accent-press); }
.empty-hint { text-align: center; color: var(--text-faint); padding: var(--s8); font-size: var(--fs-small); }

.rem-go {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--accent);
  padding: 3px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--accent-ring);
  background: var(--accent-soft);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--dur-base);
}
.rem-go:hover { background: var(--accent); color: var(--text-on-primary); }

/* Responsive */
@media (max-width: 980px) {
  .bento { grid-template-columns: repeat(2, 1fr); grid-template-areas: "hero hero" "todo todo" "hot hot" "hand hand" "idea idea"; }
}
@media (max-width: 720px) {
  .bento { grid-template-columns: 1fr; grid-template-areas: "hero" "todo" "hot" "hand" "idea"; }
  .hero { flex-direction: column; align-items: flex-start; }
}
</style>
