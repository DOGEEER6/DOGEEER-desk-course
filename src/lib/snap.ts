/**
 * 课表拖拽吸附算法（纯函数，便于单元测试）
 */
import type { Session, Weekday } from '../types'

export type DragMode = 'move' | 'resize-start' | 'resize-end'

export interface SnapInput {
  mode: DragMode
  /** 被拖动的原始时段 */
  session: Pick<Session, 'day' | 'startPeriod' | 'endPeriod'>
  /** 指针位移（px） */
  dx: number
  dy: number
  /** 网格几何 */
  colWidth: number
  rowHeight: number
  /** 可见的星期列（按顺序） */
  days: Weekday[]
  totalPeriods: number
  /** 超过多少像素才算拖动 */
  threshold?: number
}

export interface SnapResult {
  day: Weekday
  startPeriod: number
  endPeriod: number
}

/** 判断是否已构成拖动（用于区分「点击打开详情」） */
export function isDragGesture(dx: number, dy: number, threshold = 5): boolean {
  return Math.hypot(dx, dy) > threshold
}

/**
 * 把拖动位移吸附到节次网格：
 *  - move：整块平移，保持时长不变，超出边界时整体回弹
 *  - resize-end：只改结束节次，不小于起始节次，不超过总节次
 *  - resize-start：只改起始节次，不大于结束节次，不小于 1
 */
export function snapDrag(input: SnapInput): SnapResult {
  const { mode, session, dx, dy, colWidth, rowHeight, days, totalPeriods } = input
  const span = session.endPeriod - session.startPeriod + 1
  const w = Math.max(1, colWidth)
  const h = Math.max(1, rowHeight)

  // ---- 星期（横向）----
  const originIdx = Math.max(0, days.indexOf(session.day))
  const dayIdxRaw = mode === 'move' ? originIdx + Math.round(dx / w) : originIdx
  const dayIdx = Math.max(0, Math.min(days.length - 1, dayIdxRaw))
  const day = days[dayIdx] ?? session.day

  // ---- 节次（纵向）----
  const rowDelta = Math.round(dy / h)
  let startPeriod = session.startPeriod
  let endPeriod = session.endPeriod

  if (mode === 'move') {
    startPeriod = session.startPeriod + rowDelta
    endPeriod = startPeriod + span - 1
    if (startPeriod < 1) {
      startPeriod = 1
      endPeriod = Math.min(totalPeriods, span)
    }
    if (endPeriod > totalPeriods) {
      endPeriod = totalPeriods
      startPeriod = Math.max(1, totalPeriods - span + 1)
    }
  } else if (mode === 'resize-end') {
    endPeriod = Math.max(session.startPeriod, Math.min(totalPeriods, session.endPeriod + rowDelta))
  } else {
    startPeriod = Math.min(session.endPeriod, Math.max(1, session.startPeriod + rowDelta))
  }

  return { day, startPeriod, endPeriod }
}

/** 网格几何：按容器宽度/高度与行列数换算单格尺寸 */
export function gridMetrics(
  rect: { width: number; height: number },
  dayCount: number,
  periodCount: number,
  rowHeight: number,
): { colWidth: number; rowHeight: number } {
  return {
    colWidth: rect.width / Math.max(1, dayCount),
    rowHeight: rowHeight || rect.height / Math.max(1, periodCount),
  }
}
