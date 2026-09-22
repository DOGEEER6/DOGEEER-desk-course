/** 领域模型定义 */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
}

export const WEEKDAY_FULL: Record<Weekday, string> = {
  1: '星期一',
  2: '星期二',
  3: '星期三',
  4: '星期四',
  5: '星期五',
  6: '星期六',
  7: '星期日',
}

/** 节次时间配置 */
export interface PeriodSlot {
  /** 节次序号，从 1 开始 */
  index: number
  start: string // "08:00"
  end: string // "08:45"
}

/** 一周中的一次上课安排（连续节次为一个区间） */
export interface Session {
  id: string
  day: Weekday
  /** 起始节次（含） */
  startPeriod: number
  /** 结束节次（含） */
  endPeriod: number
  /** 生效周次，例如 [1..16]；空数组代表每周 */
  weeks: number[]
  room?: string
  teacher?: string
  /** 单双周等备注，例如 "单周" */
  note?: string
  /** 该时段是否启用上课提醒 */
  remind?: boolean
}

/** 课程 */
export interface Course {
  id: string
  name: string
  teacher?: string
  room?: string
  /** 颜色索引，指向 COURSE_PALETTE */
  color: number
  /** 上课时段（读取时一定是补全过的完整 Session） */
  sessions: Session[]
  /** 课程备忘录（富文本纯文本） */
  notes?: string
  /** 关联的作业 / 任务 id */
  assignments?: string[]
  /** 学分等附加信息 */
  credit?: string
  archived?: boolean
}

/** 写入课程时的宽松入参：时段可以缺 id / weeks，store 会自动补全 */
export type CourseInput = Omit<Partial<Course>, 'sessions'> & {
  name: string
  sessions?: (Partial<Session> & Pick<Session, 'day' | 'startPeriod' | 'endPeriod'>)[]
}

export type TodoPriority = 'low' | 'normal' | 'high'

/** 待办 / 作业 */
export interface Todo {
  id: string
  title: string
  done: boolean
  /** 计划开始 / 排期时间，ISO 字符串 */
  startAt?: string
  /** 截止时间 DDL，ISO 字符串 */
  dueAt?: string
  priority: TodoPriority
  /** 关联课程 */
  courseId?: string
  notes?: string
  /** 预估耗时（分钟） */
  estimate?: number
  createdAt: string
  completedAt?: string
  /** 是否已提醒 */
  notified?: boolean
}

/** 周次范围，用于学期设置里的"教学周" */
export interface SemesterConfig {
  /** 第 1 教学周的周一，YYYY-MM-DD */
  startDate: string
  /** 总教学周数 */
  totalWeeks: number
}

export interface ReminderConfig {
  enabled: boolean
  /** 提前多少分钟提醒 */
  leadMinutes: number
  /** 应用内弹窗 */
  inApp: boolean
  /** 系统通知 */
  system: boolean
  /** 声音 */
  sound: boolean
}

export interface AppSettings {
  semester: SemesterConfig
  reminders: ReminderConfig
  /** 是否显示周末 */
  showWeekend: boolean
  /** 提醒检查间隔（秒） */
  tickSeconds: number
}

export interface ImportReportRow {
  line: number
  raw: string
  status: 'ok' | 'warn' | 'error'
  message: string
}

export interface ImportReport {
  fileName: string
  at: string
  rows: ImportReportRow[]
  created: number
  updated: number
  skipped: number
}

/** Excel 解析出的中间记录 */
export interface ParsedRecord {
  name: string
  day: Weekday
  startPeriod: number
  endPeriod: number
  weeks: number[]
  room?: string
  teacher?: string
  note?: string
}
