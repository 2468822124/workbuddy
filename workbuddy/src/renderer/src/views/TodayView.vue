<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useToday } from '@/composables/useToday'
import HotspotChat from '@/components/HotspotChat.vue'
import AppIcon from '@/components/AppIcon.vue'
import BaseCard from '@/components/BaseCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import DayEntryList from '@/components/flow/DayEntryList.vue'

const router = useRouter()
const {
  entries, summary, newsItems, newsOk,
  nickname, error, info, todayStr,
  addManual, toggleEntry, removeEntry, updateEntryNote,
  updateEntryTitle, moveEntry, skipEntry,
  setInfo, refreshNews,
} = useToday()

const listRef = ref<InstanceType<typeof DayEntryList> | null>(null)

/** 阶段4：今日页 → 日规划页（同一批 flow_day_entries 的深度排程视图） */
function goDayPlanning() {
  router.push('/flow/day?date=today')
}

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早安'
  if (h < 18) return '午安'
  return '晚安'
})

/** F3：英文副标按时段动态（与中文问候一致，不再固定 GOOD MORNING） */
const greetingEn = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return 'STILL AWAKE'
  if (h < 12) return 'GOOD MORNING'
  if (h < 18) return 'GOOD AFTERNOON'
  return 'GOOD EVENING'
})

const dateLabel = computed(() => {
  const d = new Date()
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${days[d.getDay()]}`
})

function openLink(url: string) {
  window.open(url, '_blank')
}

function greetEmoji() {
  const h = new Date().getHours()
  return h < 6 || h >= 21 ? '🌙' : '☀'
}
</script>

<template>
  <div class="bento">
    <!-- Hero -->
    <section class="b-hero hero">
      <div>
        <div class="hero-eyebrow">{{ greeting }} · {{ greetingEn }}</div>
        <h1>{{ greeting }}，<span class="hero-name">{{ nickname }}</span> {{ greetEmoji() }}</h1>
        <p v-if="summary.total">
          今天有 <b>{{ summary.total }} 项任务</b>
          <template v-if="summary.deferredCount">，另有 <b>{{ summary.deferredCount }} 项顺延</b></template> 等你处理，慢慢来。
        </p>
        <p v-else>今天是新的一天，从一份计划开始吧。</p>
        <div class="date"><AppIcon name="Calendar" :size="15" />{{ dateLabel }}</div>
      </div>
      <div class="hero-cta">
        <button class="btn btn-ghost" @click="refreshNews"><AppIcon name="RefreshCw" :size="17" />刷新热点</button>
        <button class="btn btn-primary" @click="listRef?.openAdd()">
          <AppIcon name="Plus" :size="17" />新待办
        </button>
      </div>
    </section>

    <!-- 今日总览（flow 任务区：manual / rail / habit / template / project / reminder 四渠道同实体） -->
    <section class="b-todo">
      <!-- 反馈条：动作失败/成功一律可见（禁静默） -->
      <div v-if="error" class="banner err"><AppIcon name="AlertCircle" :size="14" />{{ error }}</div>
      <div v-else-if="info" class="banner ok"><AppIcon name="Check" :size="14" />{{ info }}</div>
      <DayEntryList
        ref="listRef"
        :entries="entries"
        :min-date="todayStr()"
        title="今日总览"
        empty-title="今天还没有任务"
        empty-hint="手动添加 / 从项目加入 / 提醒打卡"
        @add="addManual"
        @toggle="toggleEntry"
        @remove="removeEntry"
        @move="(id, d) => moveEntry(id, d)"
        @skip="skipEntry"
        @rename="(id, t) => updateEntryTitle(id, t)"
        @rename-guide="() => setInfo('锁定行不可改名，请在源头周任务处修改')"
        @update-note="(id, n) => updateEntryNote(id, n)"
      >
        <template #head-extra>
          <span class="plan-link" @click="goDayPlanning">
            <AppIcon name="CalendarDays" :size="14" />去日规划
          </span>
        </template>
      </DayEntryList>
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
/* Bento grid（阶段4：任务区并入 flow 总览，交接事项卡移除；灵感区横贯） */
.bento {
  display: grid;
  gap: var(--s5);
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: minmax(150px, auto);
  grid-template-areas:
    "hero hero hero hero"
    "todo todo hot hot"
    "todo todo hot hot"
    "idea idea idea idea";
}
.b-hero { grid-area: hero }
.b-todo { grid-area: todo }
.b-hot { grid-area: hot }
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

/* 动作反馈条（今日页任务区；可见可恢复） */
.banner {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s4);
  border-radius: var(--r-md);
  font-size: var(--fs-small);
  margin-bottom: var(--s3);
}
.banner.err { background: var(--danger-faint); color: var(--danger); }
.banner.ok { background: var(--ok-soft); color: var(--ok); }

/* Card internals（热点/灵感卡） */
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
.plan-link {
  display: inline-flex;
  align-items: center;
  gap: var(--s1);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: var(--r-pill);
  padding: 3px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--dur-base);
}
.plan-link:hover { background: var(--accent); color: var(--text-on-primary); }
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

/* Responsive */
@media (max-width: 980px) {
  .bento { grid-template-columns: repeat(2, 1fr); grid-template-areas: "hero hero" "todo todo" "hot hot" "idea idea"; }
}
@media (max-width: 720px) {
  .bento { grid-template-columns: 1fr; grid-template-areas: "hero" "todo" "hot" "idea"; }
  .hero { flex-direction: column; align-items: flex-start; }
}
</style>
