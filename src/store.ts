import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  AppSettings,
  Course,
  CourseInput,
  ImportReport,
  PeriodSlot,
  Session,
  Todo,
  Weekday,
} from './types'
import { DEFAULT_PERIODS, mondayOf, dateKey, addDays, weekIndexOf, parseDateKey } from './lib/time'

export type ViewKey = 'timetable' | 'today' | 'todos' | 'settings'

/** 新建 / 更新时段时的宽松入参 */
export type SessionInput = Partial<Session> & Pick<Session, 'day' | 'startPeriod' | 'endPeriod'>

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/**
 * 「这节课已上完」的标记键。
 *
 * 必须带上日期：同一个 session 覆盖很多周，如果只用 courseId+sessionId，
 * 勾一次就会把之后的每一周都变成已完成。带上日期后每个「课次」独立，
 * 下周同一节课自然是未完成状态。
 */
export function classDoneKey(courseId: string, sessionId: string, date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? date.slice(0, 10) : dateKey(date)
  return `${d}|${courseId}|${sessionId}`
}

/** 保留多少天的「已上完」记录（更早的自动清理，避免 localStorage 无限增长） */
export const CLASS_DONE_KEEP_DAYS = 21

/** 默认学期开始：本周周一 */
function defaultSemesterStart(): string {
  return dateKey(mondayOf(new Date()))
}

export const defaultSettings: AppSettings = {
  semester: { startDate: defaultSemesterStart(), totalWeeks: 16 },
  reminders: {
    enabled: true,
    leadMinutes: 15,
    inApp: true,
    system: true,
    sound: true,
  },
  showWeekend: false,
  tickSeconds: 30,
  /** 浮窗默认「在桌面上即可」，不抢占最前 */
  miniAlwaysOnTop: false,
  /** 默认浅色 */
  theme: 'light',
}

interface AppState {
  courses: Course[]
  todos: Todo[]
  periods: PeriodSlot[]
  settings: AppSettings
  lastImport?: ImportReport
  /**
   * 已上完的课次：key = `YYYY-MM-DD|courseId|sessionId`（见 classDoneKey）。
   * 必须持久化，否则重启后会全部变回未完成。
   */
  doneClasses: Record<string, true>

  // ---- UI（不持久化） ----
  view: ViewKey
  /** 当前预览的周次；null 表示跟随今天 */
  previewWeek: number | null
  selectedCourseId: string | null
  dragging: boolean

  // ---- actions ----
  setView: (v: ViewKey) => void
  setPreviewWeek: (w: number | null) => void
  selectCourse: (id: string | null) => void
  setDragging: (v: boolean) => void

  addCourse: (c: CourseInput) => string
  updateCourse: (id: string, patch: Partial<Course>) => void
  removeCourse: (id: string) => void
  mergeCourse: (course: Partial<Course> & { name: string }, session: SessionInput) => 'created' | 'updated'

  addSession: (courseId: string, s: SessionInput) => string
  updateSession: (courseId: string, sessionId: string, patch: Partial<Session>) => void
  removeSession: (courseId: string, sessionId: string) => void
  /** 拖动 / 拉伸后落位（自动合并同一门课的重复时段） */
  placeSession: (
    courseId: string,
    sessionId: string,
    pos: { day: Weekday; startPeriod: number; endPeriod: number },
  ) => void
  /** 把「未排课时段」拖到课表上：清掉 draft 标记并落到目标位置 */
  placeDraft: (
    courseId: string,
    sessionId: string,
    pos: { day: Weekday; startPeriod: number; endPeriod: number },
  ) => void
  addTodo: (t: Partial<Todo> & { title: string }) => string
  updateTodo: (id: string, patch: Partial<Todo>) => void
  toggleTodo: (id: string, done?: boolean) => void
  removeTodo: (id: string) => void
  /** 归档一条待办（完成后进入归档） */
  archiveTodo: (id: string) => void
  /** 从归档恢复 */
  restoreTodo: (id: string) => void
  /** 清空归档 */
  clearArchived: () => void
  clearCompleted: () => void

  /** 勾选 / 取消「这节课已上完」（按日期记录的课次） */
  toggleClassDone: (courseId: string, sessionId: string, date?: Date | string) => void
  /** 设置某一课次的完成状态（幂等，跨窗口同步时更安全） */
  setClassDone: (courseId: string, sessionId: string, done: boolean, date?: Date | string) => void
  /** 丢弃超过 CLASS_DONE_KEEP_DAYS 天的旧记录 */
  pruneClassDone: () => void
  /**
   * 启动自愈（幂等）：
   *  1. 把「已完成但未归档」的待办补归档 —— 勾选后要等 900ms 才归档，
   *     如果这期间退出了应用，就会留下 done=true 且 archived=false 的孤儿待办，
   *     而进行中列表过滤 !done、归档列表过滤 archived，两边都看不到它。
   *  2. 清理过期的「已上完」记录。
   */
  normalizeOnStartup: () => void

  setPeriods: (p: PeriodSlot[]) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateReminders: (patch: Partial<AppSettings['reminders']>) => void
  setSemester: (patch: Partial<AppSettings['semester']>) => void

  replaceAll: (data: {
    courses: CourseInput[]
    todos: Todo[]
    periods?: PeriodSlot[]
    settings?: AppSettings
    doneClasses?: Record<string, true>
  }) => void
  setImportReport: (r: ImportReport) => void
  resetAll: () => void

  /* ---- 弹窗状态（浮窗也要能唤起编辑，所以放 store） ---- */
  /** open=true 且无 todoId 表示新建；有 todoId 表示编辑 */
  todoDialog: { open: boolean; todoId?: string }
  openTodoDialog: (todoId?: string) => void
  closeTodoDialog: () => void
}

function normalizeSession(s: SessionInput): Session {
  const startPeriod = Math.max(1, Math.round(s.startPeriod ?? 1))
  const endPeriod = Math.max(startPeriod, Math.round(s.endPeriod ?? startPeriod))
  return {
    id: s.id ?? uid('ses'),
    day: (s.day ?? 1) as Weekday,
    startPeriod,
    endPeriod,
    weeks: [...new Set(s.weeks ?? [])].sort((a, b) => a - b),
    room: s.room,
    teacher: s.teacher,
    note: s.note,
    remind: s.remind ?? true,
    draft: s.draft ?? false,
  }
}
function normalizeCourse(c: CourseInput): Course {
  return {
    id: c.id ?? uid('crs'),
    name: c.name.trim(),
    teacher: c.teacher,
    room: c.room,
    color: c.color ?? 0,
    sessions: (c.sessions ?? []).map(normalizeSession),
    notes: c.notes ?? '',
    assignments: c.assignments ?? [],
    credit: c.credit,
    archived: c.archived ?? false,
  }
}

/** 主窗口与浮窗共用的 localStorage key */
export const PERSIST_KEY = 'lumen-course-v1'

/** 真正落盘的那部分状态 */
interface PersistedState {
  courses: Course[]
  todos: Todo[]
  periods: PeriodSlot[]
  settings: AppSettings
  lastImport?: ImportReport
  doneClasses: Record<string, true>
}

/**
 * 最近一次读到的原始字符串。
 *
 * 两个 WebView 各有一份独立 store，靠轮询把对方写的数据拉过来。
 * 如果每次轮询都无条件 rehydrate，zustand 会生成新对象 → 主界面每 2.5 秒
 * 整体重渲染一次（动画、滚动都会被打断）。比较原始字符串后，
 * 只有「确实被另一个窗口改过」时才 rehydrate。
 */
let lastRaw: string | null | undefined

const sharedStorage = createJSONStorage<PersistedState>(() => ({
  getItem: (name: string) => {
    const v = localStorage.getItem(name)
    if (name === PERSIST_KEY) lastRaw = v
    return v
  },
  setItem: (name: string, value: string) => {
    localStorage.setItem(name, value)
    if (name === PERSIST_KEY) lastRaw = value
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name)
    if (name === PERSIST_KEY) lastRaw = null
  },
}))

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      courses: [],
      todos: [],
      periods: DEFAULT_PERIODS,
      settings: defaultSettings,
      lastImport: undefined,
      doneClasses: {},

      view: 'timetable',
      previewWeek: null,
      selectedCourseId: null,
      dragging: false,

      setView: (v) => set({ view: v }),
      setPreviewWeek: (w) => set({ previewWeek: w }),
      selectCourse: (id) => set({ selectedCourseId: id }),
      setDragging: (v) => set({ dragging: v }),

      addCourse: (c) => {
        const course = normalizeCourse({ color: get().courses.length % 12, ...c })
        set((s) => ({ courses: [...s.courses, course] }))
        return course.id
      },

      updateCourse: (id, patch) =>
        set((s) => ({
          courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      removeCourse: (id) =>
        set((s) => ({
          courses: s.courses.filter((c) => c.id !== id),
          todos: s.todos.map((t) => (t.courseId === id ? { ...t, courseId: undefined } : t)),
          selectedCourseId: s.selectedCourseId === id ? null : s.selectedCourseId,
        })),

      mergeCourse: (partial, session) => {
        const state = get()
        const normalized = normalizeSession(session)
        const key = partial.name.trim()
        const existing =
          state.courses.find((c) => c.name === key && (c.teacher ?? '') === (partial.teacher ?? '')) ??
          state.courses.find((c) => c.name === key)
        if (existing) {
          const dup = existing.sessions.some(
            (s) =>
              s.day === normalized.day &&
              s.startPeriod === normalized.startPeriod &&
              s.endPeriod === normalized.endPeriod &&
              (s.weeks ?? []).join(',') === normalized.weeks.join(','),
          )
          if (!dup) {
            set((s) => ({
              courses: s.courses.map((c) =>
                c.id === existing.id
                  ? {
                      ...c,
                      sessions: [...c.sessions, normalized],
                      teacher: c.teacher || partial.teacher,
                      room: c.room || partial.room,
                    }
                  : c,
              ),
            }))
          }
          return 'updated'
        }
        const course = normalizeCourse({
          ...partial,
          color: state.courses.length % 12,
          sessions: [normalizeSession(session)],
        })
        set((s) => ({ courses: [...s.courses, course] }))
        return 'created'
      },

      addSession: (courseId, s) => {
        const session = normalizeSession(s)
        set((st) => ({
          courses: st.courses.map((c) =>
            c.id === courseId ? { ...c, sessions: [...c.sessions, session] } : c,
          ),
        }))
        return session.id
      },

      updateSession: (courseId, sessionId, patch) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  sessions: c.sessions.map((x) =>
                    x.id === sessionId ? normalizeSession({ ...x, ...patch }) : x,
                  ),
                }
              : c,
          ),
        })),

      removeSession: (courseId, sessionId) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId ? { ...c, sessions: c.sessions.filter((x) => x.id !== sessionId) } : c,
          ),
        })),

      placeSession: (courseId, sessionId, pos) =>
        set((s) => ({
          courses: s.courses.map((c) => {
            if (c.id !== courseId) return c
            const target = c.sessions.find((x) => x.id === sessionId)
            if (!target || !target.id) return c
            const moved = normalizeSession({
              ...target,
              day: pos.day,
              startPeriod: pos.startPeriod,
              endPeriod: pos.endPeriod,
            })
            // 合并：同一天、同一节次区间、同一周次集合 → 去重
            const rest = c.sessions.filter((x) => x.id !== sessionId)
            const dupIdx = rest.findIndex(
              (x) =>
                x.day === moved.day &&
                x.startPeriod === moved.startPeriod &&
                x.endPeriod === moved.endPeriod &&
                x.weeks.join(',') === moved.weeks.join(','),
            )
            if (dupIdx >= 0) {
              const kept = {
                ...rest[dupIdx],
                weeks: [...new Set([...rest[dupIdx].weeks, ...moved.weeks])].sort((a, b) => a - b),
                room: rest[dupIdx].room || moved.room,
                teacher: rest[dupIdx].teacher || moved.teacher,
              }
              const next = rest.slice()
              next[dupIdx] = kept
              return { ...c, sessions: next }
            }
            return { ...c, sessions: [...rest, moved] }
          }),
        })),

      placeDraft: (courseId, sessionId, pos) =>
        set((s) => ({
          courses: s.courses.map((c) =>
            c.id === courseId
              ? {
                  ...c,
                  sessions: c.sessions.map((x) =>
                    x.id === sessionId
                      ? normalizeSession({
                          ...x,
                          day: pos.day,
                          startPeriod: pos.startPeriod,
                          endPeriod: pos.endPeriod,
                          draft: false,
                        })
                      : x,
                  ),
                }
              : c,
          ),
        })),

      addTodo: (t) => {
        const todo: Todo = {
          id: t.id ?? uid('td'),
          title: t.title.trim(),
          done: t.done ?? false,
          startAt: t.startAt,
          dueAt: t.dueAt,
          priority: t.priority ?? 'normal',
          courseId: t.courseId,
          notes: t.notes,
          estimate: t.estimate,
          createdAt: t.createdAt ?? new Date().toISOString(),
          completedAt: t.completedAt,
          notified: t.notified ?? false,
          archived: t.archived ?? false,
        }
        set((s) => ({ todos: [todo, ...s.todos] }))
        return todo.id
      },

      updateTodo: (id, patch) =>
        set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      toggleTodo: (id, done) =>
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.id !== id) return t
            const next = done ?? !t.done
            return { ...t, done: next, completedAt: next ? new Date().toISOString() : undefined }
          }),
        })),

      archiveTodo: (id) =>
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === id ? { ...t, archived: true, done: true, completedAt: t.completedAt ?? new Date().toISOString() } : t,
          ),
        })),

      /**
       * 从归档恢复到「进行中」。
       *
       * 必须同时清掉 done：只看 archived=false 的话，todo 会变成
       * 「已完成但未归档」，而进行中列表过滤 !done、归档列表过滤 archived，
       * 两边都不显示 —— 点一下「恢复」待办就凭空消失了。
       */
      restoreTodo: (id) =>
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === id ? { ...t, archived: false, done: false, completedAt: undefined } : t,
          ),
        })),

      clearArchived: () => set((s) => ({ todos: s.todos.filter((t) => !t.archived) })),

      removeTodo: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),

      clearCompleted: () => set((s) => ({ todos: s.todos.filter((t) => !(t.done && t.archived)) })),

      setClassDone: (courseId, sessionId, done, date) =>
        set((s) => {
          const key = classDoneKey(courseId, sessionId, date)
          const has = !!s.doneClasses[key]
          if (has === done) return s
          const next = { ...s.doneClasses }
          if (done) next[key] = true
          else delete next[key]
          return { doneClasses: next }
        }),

      toggleClassDone: (courseId, sessionId, date) =>
        set((s) => {
          const key = classDoneKey(courseId, sessionId, date)
          const next = { ...s.doneClasses }
          if (next[key]) delete next[key]
          else next[key] = true
          return { doneClasses: next }
        }),

      pruneClassDone: () =>
        set((s) => {
          const keys = Object.keys(s.doneClasses)
          if (keys.length === 0) return s
          const cutoff = dateKey(addDays(new Date(), -CLASS_DONE_KEEP_DAYS))
          const kept = keys.filter((k) => k.slice(0, 10) >= cutoff)
          if (kept.length === keys.length) return s
          const next: Record<string, true> = {}
          for (const k of kept) next[k] = true
          return { doneClasses: next }
        }),

      normalizeOnStartup: () =>
        set((s) => {
          const todos = s.todos.map((t) =>
            t.done && !t.archived
              ? { ...t, archived: true, completedAt: t.completedAt ?? new Date().toISOString() }
              : t,
          )
          const todosChanged = todos.some((t, i) => t !== s.todos[i])
          const cutoff = dateKey(addDays(new Date(), -CLASS_DONE_KEEP_DAYS))
          const keys = Object.keys(s.doneClasses)
          const kept = keys.filter((k) => k.slice(0, 10) >= cutoff)
          if (!todosChanged && kept.length === keys.length) return s
          const doneClasses: Record<string, true> = {}
          for (const k of kept) doneClasses[k] = true
          return { todos, doneClasses }
        }),

      setPeriods: (p) => set({ periods: [...p].sort((a, b) => a.index - b.index) }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      updateReminders: (patch) =>
        set((s) => ({ settings: { ...s.settings, reminders: { ...s.settings.reminders, ...patch } } })),

      setSemester: (patch) =>
        set((s) => ({ settings: { ...s.settings, semester: { ...s.settings.semester, ...patch } } })),

      replaceAll: (data) =>
        set((s) => ({
          courses: data.courses.map((c) => normalizeCourse(c)),
          todos: data.todos ?? [],
          periods: data.periods && data.periods.length ? data.periods : DEFAULT_PERIODS,
          settings: data.settings ? { ...defaultSettings, ...data.settings } : defaultSettings,
          // 备份里带了就一起恢复，没带（旧版本备份）就保留现有记录
          doneClasses: data.doneClasses ?? s.doneClasses,
          selectedCourseId: null,
        })),

      setImportReport: (r) => set({ lastImport: r }),

      todoDialog: { open: false },
      openTodoDialog: (todoId) => set({ todoDialog: { open: true, todoId } }),
      closeTodoDialog: () => set({ todoDialog: { open: false } }),

      resetAll: () =>
        set({
          courses: [],
          todos: [],
          periods: DEFAULT_PERIODS,
          settings: { ...defaultSettings, semester: { startDate: defaultSemesterStart(), totalWeeks: 16 } },
          lastImport: undefined,
          doneClasses: {},
          selectedCourseId: null,
          previewWeek: null,
        }),
    }),
    {
      name: PERSIST_KEY,
      version: 1,
      storage: sharedStorage,
      partialize: (s): PersistedState => ({
        courses: s.courses,
        todos: s.todos,
        periods: s.periods,
        settings: s.settings,
        lastImport: s.lastImport,
        doneClasses: s.doneClasses,
      }),
    },
  ),
)

/** 当前教学周（跟随系统日期，除非用户预览了别的周） */
export function currentWeek(state: Pick<AppState, 'settings' | 'previewWeek'>): number {
  if (state.previewWeek != null) return state.previewWeek
  return weekIndexOf(state.settings.semester.startDate, new Date())
}

/** 某周某天的日期 */
export function dateOfWeekDay(startDate: string, week: number, day: Weekday): Date {
  return addDays(mondayOf(parseDateKey(startDate)), (week - 1) * 7 + (day - 1))
}

export type { AppState }


/* ------------------------------------------------------------------ */
/* 跨窗口数据同步                                                      */
/* ------------------------------------------------------------------ */

/**
 * 重新从 localStorage 读取持久化状态。
 *
 * 主窗口与浮窗是两个 WebView，各自有独立的 zustand 实例：
 * 一边写 localStorage 时，另一边的内存状态不会自动更新
 * （所以之前"改了待办，浮窗没反应"，反过来 "浮窗勾了课，
 *  主窗口一操作就把勾覆盖掉了"）。两边都必须在 storage 事件 /
 * 获得焦点 / 定时轮询时调用它把数据拉过来。
 *
 * 默认只在原始字符串真的变了才 rehydrate，避免每 2.5 秒
 * 无意义地重建一次状态（会让主界面整体重渲染）。
 */
export function rehydrateFromStorage(force = false): void {
  try {
    if (!force) {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (raw === lastRaw) return
      lastRaw = raw
    }
    const api = useApp as unknown as { persist?: { rehydrate?: () => Promise<void> | void } }
    if (api.persist?.rehydrate) void api.persist.rehydrate()
  } catch {
    /* ignore */
  }
}
