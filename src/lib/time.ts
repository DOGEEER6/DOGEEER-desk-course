import type { PeriodSlot, Session, Weekday } from '../types'

/** 默认节次时间（东南大学九龙湖校区作息） */
export const DEFAULT_PERIODS: PeriodSlot[] = [
  { index: 1, start: '08:00', end: '08:45' },
  { index: 2, start: '08:50', end: '09:35' },
  { index: 3, start: '09:50', end: '10:35' },
  { index: 4, start: '10:40', end: '11:25' },
  { index: 5, start: '11:30', end: '12:15' },
  { index: 6, start: '14:00', end: '14:45' },
  { index: 7, start: '14:50', end: '15:35' },
  { index: 8, start: '15:50', end: '16:35' },
  { index: 9, start: '16:40', end: '17:25' },
  { index: 10, start: '17:30', end: '18:15' },
  { index: 11, start: '19:00', end: '19:45' },
  { index: 12, start: '19:50', end: '20:35' },
  { index: 13, start: '20:40', end: '21:25' },
]

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function parseHM(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

export function minutesToHM(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseDateKey(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key)
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
}

/** 该日期所在周的周一 */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const wd = x.getDay() === 0 ? 7 : x.getDay()
  x.setDate(x.getDate() - (wd - 1))
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

/** 学期开始日期 → 给定日期所属教学周（第 1 周为含 startDate 的那一周） */
export function weekIndexOf(startDate: string, date: Date): number {
  const startMonday = mondayOf(parseDateKey(startDate))
  const target = mondayOf(date)
  const diff = Math.round((target.getTime() - startMonday.getTime()) / 86400000)
  return Math.floor(diff / 7) + 1
}

/** 第 n 教学周的周一 */
export function mondayOfWeek(startDate: string, week: number): Date {
  return addDays(mondayOf(parseDateKey(startDate)), (week - 1) * 7)
}

export function weekdayOf(d: Date): Weekday {
  const wd = d.getDay()
  return (wd === 0 ? 7 : wd) as Weekday
}

export function sessionCoversWeek(session: Session, week: number): boolean {
  if (!session.weeks || session.weeks.length === 0) return true
  return session.weeks.includes(week)
}

export function weekRangeText(weeks: number[] | undefined): string {
  if (!weeks || weeks.length === 0) return '每周'
  const sorted = [...new Set(weeks)].sort((a, b) => a - b)
  const parts: string[] = []
  let s = sorted[0]
  let p = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === p + 1) {
      p = cur
      continue
    }
    parts.push(s === p ? `${s}` : `${s}-${p}`)
    s = cur
    p = cur
  }
  return `第 ${parts.join('、')} 周`
}

/** 把节次区间解析成分钟区间 */
export function sessionTimeRange(session: Session, periods: PeriodSlot[]) {
  const a = periods.find((p) => p.index === session.startPeriod)
  const b = periods.find((p) => p.index === session.endPeriod)
  const start = parseHM(a?.start ?? '08:00')
  const end = parseHM(b?.end ?? a?.end ?? '08:45')
  return { start, end, startHM: minutesToHM(start), endHM: minutesToHM(end) }
}

export function humanLeft(ms: number): string {
  const abs = Math.abs(ms)
  const mins = Math.floor(abs / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分钟`
}

export function weekdayShort(w: Weekday): string {
  return ['一', '二', '三', '四', '五', '六', '日'][w - 1]
}

/** 相对时间描述，用于 DDL 展示 */
export function dueLabel(dueIso: string | undefined, now = new Date()): {
  text: string
  tone: 'over' | 'today' | 'soon' | 'normal' | 'none'
} {
  if (!dueIso) return { text: '未设 DDL', tone: 'none' }
  const due = new Date(dueIso)
  if (Number.isNaN(due.getTime())) return { text: '未设 DDL', tone: 'none' }
  const diff = due.getTime() - now.getTime()
  if (diff < 0) return { text: `已逾期 ${humanLeft(diff)}`, tone: 'over' }
  const sameDay = dateKey(due) === dateKey(now)
  if (sameDay) return { text: `今天 ${pad2(due.getHours())}:${pad2(due.getMinutes())} 截止`, tone: 'today' }
  if (diff < 86400000) return { text: `明天 ${pad2(due.getHours())}:${pad2(due.getMinutes())} 截止`, tone: 'soon' }
  return {
    text: `${due.getMonth() + 1}月${due.getDate()}日 ${pad2(due.getHours())}:${pad2(due.getMinutes())}`,
    tone: diff < 3 * 86400000 ? 'soon' : 'normal',
  }
}
