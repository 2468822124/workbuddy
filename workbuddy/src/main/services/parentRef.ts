/**
 * v0.2修复计划·参照完整性：todo.parentTaskRef（JSON 字符串）解析/构造。
 * 纯函数，无 DB/无副作用。格式 `{"parentPlanId":string|null,"parentTaskId":string}`。
 */

export interface ParentTaskRef {
  parentPlanId: string | null
  parentTaskId: string
}

/** 构造 parentTaskRef JSON 字符串。 */
export function makeParentTaskRef(parentPlanId: string | null, parentTaskId: string): string {
  return JSON.stringify({ parentPlanId: parentPlanId ?? null, parentTaskId })
}

/**
 * 解析 parentTaskRef。非法/空 → null（不抛）。
 * parentTaskId 必须为非空字符串，且按规格为 hex tid 或 todo id（留宽，仅形状校验）。
 */
export function parseParentTaskRef(raw: string | null | undefined): ParentTaskRef | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { parentPlanId?: unknown; parentTaskId?: unknown }
    if (typeof v.parentTaskId !== 'string' || !v.parentTaskId) return null
    return {
      parentPlanId: typeof v.parentPlanId === 'string' ? v.parentPlanId : null,
      parentTaskId: v.parentTaskId,
    }
  } catch {
    return null
  }
}
