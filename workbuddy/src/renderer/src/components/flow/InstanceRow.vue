<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import VoucherPopover from './VoucherPopover.vue'
import { instanceDisplay } from '@/composables/useFlowWeek'
import type { FlowVoucherView, FlowWeekInstance, InstanceCompletion } from '@shared/flowTypes'

const props = defineProps<{
  inst: FlowWeekInstance
  completion: InstanceCompletion
  /** 固定徽标文字（null = 无徽标） */
  badge: string | null
  /** 历史周（weekStart < 本周一）→ 显示转下周 */
  isHistory: boolean
  /** 已存在 active 承接实例（board 逐行透传；服务端派生，见 getWeekBoard） */
  carried: boolean
  /** 本实例凭据（凭据弹层数据源） */
  vouchers: FlowVoucherView[]
}>()

const emit = defineEmits<{
  rename: [id: number, title: string]
  renameGuide: []
  delete: [id: number]
  skip: [id: number]
  carryNext: [id: number]
  complete: [id: number]
  addSession: [id: number]
  voucherDelete: [id: number]
  voucherUpdate: [id: number, data: { occurredAt?: string; note?: string | null }]
}>()

const display = computed(() => instanceDisplay(props.inst, props.completion))

/** R1 Fix2（U-7）：转周入口生命周期——已转出 / 已完成 / 已跳过均不可再转
 * （与服务端 carryInstance 守卫同一事实；点击必被拒的入口不展示，复盘页同法收敛） */
const carryable = computed(
  () => props.isHistory && !props.carried && display.value.state === 'open',
)

const editing = ref(false)
const editTitle = ref('')
const confirm = ref<'skip' | 'delete' | null>(null)
const showVouchers = ref(false)

function startRename(): void {
  if (props.inst.origin === 'fixed') {
    emit('renameGuide')
    return
  }
  editTitle.value = props.inst.title
  editing.value = true
}

function saveRename(): void {
  const t = editTitle.value.trim()
  if (!t) return
  emit('rename', props.inst.id, t)
  editing.value = false
}
</script>

<template>
  <li class="row" :class="[display.state, { locked: inst.origin === 'fixed', carried }]">
    <!-- 完成态（once：✓ 手动完成；multi：场次计数徽章；跳过：免罪灰显） -->
    <button
      v-if="display.state === 'open'"
      class="state-btn"
      :title="inst.kind === 'multi' ? '标记一场完成' : '手动完成'"
      @click="inst.kind === 'multi' ? emit('addSession', inst.id) : emit('complete', inst.id)"
    >
      <AppIcon name="Circle" :size="17" />
    </button>
    <span v-else-if="display.state === 'done'" class="state-check">
      <AppIcon name="Check" :size="14" />
    </span>
    <span v-else class="state-skip" title="已跳过（不计未完成）">
      <AppIcon name="SkipForward" :size="15" />
    </span>

    <div class="row-body">
      <div class="title-line">
        <input
          v-if="editing"
          v-model="editTitle"
          class="input"
          @keyup.enter="saveRename"
          @keyup.esc="editing = false"
        />
        <template v-else>
          <span class="title" :class="{ fixed: inst.origin === 'fixed' }">{{ inst.title }}</span>
          <span v-if="display.badge" class="badge" :class="{ solid: display.state === 'done' }">
            {{ display.badge }}
          </span>
          <span v-if="badge" class="badge fixed-badge">{{ badge }}</span>
          <span v-if="completion.arrangedCount > 0" class="arranged" title="本周已安排">
            <AppIcon name="CalendarDays" :size="13" />{{ completion.arrangedCount }}
          </span>
          <span v-if="display.state === 'skipped'" class="skipped-tag">已跳过</span>
          <span v-if="carried" class="carried-tag">已转下周</span>
        </template>
      </div>
    </div>

    <div class="actions">
      <!-- 凭据入口（done 或 doneCount>0）→ VoucherPopover（R1 撤销 UI） -->
      <button
        v-if="(inst.kind === 'once' && completion.done) || (inst.kind === 'multi' && completion.doneCount > 0)"
        class="icon-btn voucher-btn"
        :class="{ active: showVouchers }"
        :title="`完成凭据 ${vouchers.length} 条，可删可改`"
        @click="showVouchers = !showVouchers"
      >
        <AppIcon name="CalendarCheck" :size="16" />
        <span class="voucher-count">{{ vouchers.length }}</span>
      </button>
      <VoucherPopover
        v-if="showVouchers"
        :vouchers="vouchers"
        :instance-title="inst.title"
        @close="showVouchers = false"
        @remove="emit('voucherDelete', $event)"
        @update="(id, data) => emit('voucherUpdate', id, data)"
      />

      <!-- 跳过（免罪）与删除：行内二次确认 -->
      <template v-if="!confirm">
        <button v-if="inst.origin === 'temp'" class="icon-btn" title="改名" @click="startRename">
          <AppIcon name="Pencil" :size="15" />
        </button>
        <button class="icon-btn" title="跳过本周（不计未完成）" @click="confirm = 'skip'">
          <AppIcon name="SkipForward" :size="15" />
        </button>
        <button v-if="carryable" class="icon-btn" title="转下周（清债）" @click="emit('carryNext', inst.id)">
          <AppIcon name="MoveRight" :size="15" />
        </button>
        <button class="icon-btn danger" title="删除" @click="confirm = 'delete'">
          <AppIcon name="Trash2" :size="15" />
        </button>
      </template>
      <span v-else class="confirm-bar">
        <span class="confirm-text">
          {{ confirm === 'skip' ? '跳过本周？不计未完成' : '删除？安排行随删，凭据保留' }}
        </span>
        <button class="tiny-btn primary" @click="confirm === 'skip' ? emit('skip', inst.id) : emit('delete', inst.id); confirm = null">
          确认
        </button>
        <button class="tiny-btn" @click="confirm = null">取消</button>
      </span>
    </div>
  </li>
</template>

<style scoped>
.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-md);
  transition: background var(--dur-fast);
}
.row:hover { background: var(--bg-hover); }
.row.skipped { opacity: .62; }
.row.skipped .title { text-decoration: line-through; color: var(--text-faint); }
.row.done .title { text-decoration: line-through; color: var(--text-muted); }
/* R1 Fix2（U-7）：已转出行与复盘页同法划线变灰（源实例仍可补录凭据，不改状态） */
.row.carried { opacity: .6; }
.row.carried .title { text-decoration: line-through; color: var(--text-muted); }
.carried-tag {
  font-size: var(--fs-caption); letter-spacing: var(--tracking-wide);
  color: var(--text-muted); background: var(--bg-hover);
  border-radius: var(--r-pill); padding: 2px 8px;
}
.state-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: var(--r-sm);
  border: none; background: transparent; color: var(--border-strong);
  cursor: pointer; flex-shrink: 0;
  transition: all var(--dur-base) var(--ease-out);
}
.state-btn:hover { color: var(--accent); transform: scale(1.08); }
.state-check {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: var(--r-sm);
  background: var(--accent); color: var(--text-on-primary); flex-shrink: 0;
}
.state-skip { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; color: var(--text-faint); flex-shrink: 0; }
.row-body { flex: 1; min-width: 0; }
.title-line { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.title { font-size: var(--fs-body); color: var(--text-strong); }
.title.fixed { font-weight: var(--fw-medium); }
.input {
  font-family: inherit; font-size: var(--fs-body);
  padding: 5px 10px; border-radius: var(--r-sm);
  border: 1px solid var(--accent-ring); background: var(--bg-sunken);
  color: var(--text-base); outline: none; width: 100%;
}
.badge {
  font-size: var(--fs-caption); letter-spacing: var(--tracking-wide);
  color: var(--cat-work); background: var(--cat-work-soft);
  border-radius: var(--r-pill); padding: 2px 9px; font-weight: var(--fw-medium);
}
.badge.solid { color: var(--ok); background: var(--ok-soft); }
.fixed-badge { color: var(--cat-learn); background: var(--cat-learn-soft); }
.arranged {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: var(--fs-caption); color: var(--text-muted);
}
.skipped-tag { font-size: var(--fs-caption); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
.actions { display: flex; align-items: center; gap: var(--s1); position: relative; flex-shrink: 0; }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: var(--r-sm);
  border: none; background: transparent; color: var(--text-muted);
  cursor: pointer; transition: all var(--dur-fast);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--accent); }
.icon-btn.danger:hover { color: var(--danger); background: var(--danger-faint); }
.icon-btn:disabled { opacity: .35; cursor: default; }
.voucher-btn { position: relative; }
.voucher-btn.active { background: var(--accent-soft); color: var(--accent); }
.voucher-count {
  position: absolute; top: -3px; right: -3px;
  min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: var(--r-pill); background: var(--accent); color: var(--text-on-primary);
  font-size: 10px; line-height: 14px; text-align: center;
}
.confirm-bar { display: flex; align-items: center; gap: var(--s1); }
.confirm-text { font-size: var(--fs-caption); color: var(--warn); margin-right: var(--s1); }
.tiny-btn {
  font-family: inherit; font-size: var(--fs-caption);
  color: var(--text-muted); background: var(--bg-surface);
  border: 1px solid var(--border-soft); border-radius: var(--r-sm);
  padding: 3px 10px; cursor: pointer; transition: all var(--dur-fast);
}
.tiny-btn:hover { background: var(--bg-hover); color: var(--accent); }
.tiny-btn.primary { color: var(--text-on-primary); background: var(--accent); border-color: var(--accent); }
.tiny-btn.primary:hover { background: var(--accent-hover); }
</style>
