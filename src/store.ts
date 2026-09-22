import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
}

interface AppState {
  courses: Course[]
  todos: Todo[]
  periods: PeriodSlot[]
  settings: AppSettings
  lastImport?: ImportReport

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
  addTodo: (t: Partial<Todo> & { title: string }) => string
  updateTodo: (id: string, patch: Partial<Todo>) => void
  toggleTodo: (id: string, done?: boolean) => void
  removeTodo: (id: string) => void
  clearCompleted: () => void

  setPeriods: (p: PeriodSlot[]) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateReminders: (patch: Partial<AppSettings['reminders']>) => void
  setSemester: (patch: Partial<AppSettings['semester']>) => void

  replaceAll: (data: {
    courses: CourseInput[]
    todos: Todo[]
    periods?: PeriodSlot[]
    settings?: AppSettings
  }) => void
  setImportReport: (r: ImportReport) => void
  resetAll: () => void
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

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      courses: [],
      todos: [],
      periods: DEFAULT_PERIODS,
      settings: defaultSettings,
      lastImport: undefined,

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

      removeTodo: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),

      clearCompleted: () => set((s) => ({ todos: s.todos.filter((t) => !t.done) })),

      setPeriods: (p) => set({ periods: [...p].sort((a, b) => a.index - b.index) }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      updateReminders: (patch) =>
        set((s) => ({ settings: { ...s.settings, reminders: { ...s.settings.reminders, ...patch } } })),

      setSemester: (patch) =>
        set((s) => ({ settings: { ...s.settings, semester: { ...s.settings.semester, ...patch } } })),

      replaceAll: (data) =>
        set(() => ({
          courses: data.courses.map((c) => normalizeCourse(c)),
          todos: data.todos ?? [],
          periods: data.periods && data.periods.length ? data.periods : DEFAULT_PERIODS,
          settings: data.settings ? { ...defaultSettings, ...data.settings } : defaultSettings,
          selectedCourseId: null,
        })),

      setImportReport: (r) => set({ lastImport: r }),

      resetAll: () =>
        set({
          courses: [],
          todos: [],
          periods: DEFAULT_PERIODS,
          settings: { ...defaultSettings, semester: { startDate: defaultSemesterStart(), totalWeeks: 16 } },
          lastImport: undefined,
          selectedCourseId: null,
          previewWeek: null,
        }),
    }),
    {
      name: 'lumen-course-v1',
      version: 1,
      partialize: (s) => ({
        courses: s.courses,
        todos: s.todos,
        periods: s.periods,
        settings: s.settings,
        lastImport: s.lastImport,
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
