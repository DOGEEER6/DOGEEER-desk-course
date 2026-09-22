import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { useApp, currentWeek, dateOfWeekDay } from './store'
import type { Weekday } from './types'
import { useNow, useReminderEngine, useTodayClasses } from './hooks'
import { Timetable } from './components/Timetable'
import { TodayHero, TodayList } from './components/TodayHero'
import { TodoPanel } from './components/TodoPanel'
import { CourseDrawer } from './components/CourseDrawer'
import { SettingsPage } from './components/SettingsPage'
import { ImportDialog, ImportDropOverlay } from './components/ImportDialog'
import { Icon, Overlay, Segmented, ToastHost, springSoft } from './components/ui'
import { TermView } from './components/CalendarViews'
import { AddCourseDialog, DraftTray } from './components/AddCourseDialog'
import { TodoDialog } from './components/TodoDialog'
import { TitleBar } from './components/TitleBar'
import { setTheme, MAIN_THEME_KEY } from './lib/theme'
import { colorOf } from './lib/palette'
import { mondayOfWeek, pad2, weekIndexOf } from './lib/time'
import { toast } from './lib/toast'
import { findCurrentClass } from './hooks'
import { isDesktop, launchedAtStartup, setAutoStart, showMainWindow } from './lib/desktop'
import { parseTimetableFile } from './lib/excel'

type CalView = 'week' | 'term'

export default function App() {
  const now = useNow(1000)
  useReminderEngine()

  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const settings = useApp((s) => s.settings)
  const courses = useApp((s) => s.courses)
  const previewWeek = useApp((s) => s.previewWeek)
  const setPreviewWeek = useApp((s) => s.setPreviewWeek)
  const selectedCourseId = useApp((s) => s.selectedCourseId)
  const selectCourse = useApp((s) => s.selectCourse)
  const addCourse = useApp((s) => s.addCourse)
  const placeDraft = useApp((s) => s.placeDraft)
  const todos = useApp((s) => s.todos)

  const [importOpen, setImportOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [newCourse, setNewCourse] = useState<{ day: Weekday; start: number; end: number } | null>(null)
  const [calView, setCalView] = useState<CalView>('week')
  const [todoCollapsed, setTodoCollapsed] = useState(true)
  const [todoDialogOpen, setTodoDialogOpen] = useState(false)
  const [addCourseOpen, setAddCourseOpen] = useState(false)
  const [trayDrag, setTrayDrag] = useState<{
    courseId: string
    sessionId: string
    label: string
    span: number
  } | null>(null)

  /** 主题：默认深色；设置页可改，改完立即写入并持久化（同时同步浮窗） */
  const settingsTheme = settings.theme ?? 'light'
  useEffect(() => {
    setTheme(settingsTheme, MAIN_THEME_KEY)
  }, [settingsTheme])

  const openTodoCount = useMemo(() => todos.filter((t) => !t.done && !t.archived).length, [todos])

  const realWeek = weekIndexOf(settings.semester.startDate, now)
  const week = previewWeek ?? realWeek
  const totalWeeks = settings.semester.totalWeeks

  /* ---------------- 桌面端：首次运行显示主窗口；默认开启「开机只显示浮窗」 ---------------- */
  useEffect(() => {
    if (!isDesktop()) return
    const KEY = 'lumen-desktop-initialized'
    const initialized = localStorage.getItem(KEY) === '1'
    void (async () => {
      // 0.1.0 之前的版本会把示例 DDL 当成真实数据残留，这里清一次
      const PURGE = 'lumen-purged-demo-ddls-0.1.0'
      if (localStorage.getItem(PURGE) !== '1') {
        localStorage.setItem(PURGE, '1')
        const store = useApp.getState()
        const demoKeywords = ['操作系统实验报告', '线性代数 期中复习', '程序设计实践 A(I) 实验报告', '工科数学分析 第五章习题', '国际交流英语 presentation 选题']
        const kept = store.todos.filter((t) => !demoKeywords.includes(t.title))
        if (kept.length !== store.todos.length) {
          useApp.setState({ todos: kept })
          toast('已清理示例 DDL', { desc: '只保留你自己添加的待办，课表数据未改动', tone: 'info', duration: 4200 })
        }
      }

      // 默认开启开机自启（只显示浮窗），用户可在设置里关掉
      const AKEY = 'lumen-autostart-initialized'
      if (localStorage.getItem(AKEY) !== '1') {
        localStorage.setItem(AKEY, '1')
        const enabled = await setAutoStart(true)
        if (enabled) {
          toast('已开启开机自启', {
            desc: '下次开机只显示桌面浮窗，点「打开完整课表」进入主界面（可在设置里关闭）',
            tone: 'info',
            duration: 6000,
          })
        }
      }

      if (!initialized) {
        localStorage.setItem(KEY, '1')
        await showMainWindow()
        return
      }
      const atStartup = await launchedAtStartup()
      if (!atStartup) await showMainWindow()
    })()
  }, [])

  /* ---------------- 快捷键 ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = /INPUT|TEXTAREA|SELECT/.test(target?.tagName ?? '') || target?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setView('timetable')
        window.dispatchEvent(new CustomEvent('lumen:focus-todo'))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setImportOpen(true)
        return
      }
      if (typing) return
      if (e.key === 'ArrowLeft') setPreviewWeek(Math.max(1, week - 1))
      if (e.key === 'ArrowRight') setPreviewWeek(Math.min(totalWeeks, week + 1))
      if (e.key.toLowerCase() === 't') setPreviewWeek(null)
      if (e.key.toLowerCase() === 'j') setView('timetable')
      if (e.key.toLowerCase() === 'w') setView('today')
      if (e.key.toLowerCase() === 'l') setView('todos')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [week, totalWeeks, setPreviewWeek, setView])

  /* ---------------- 拖入文件导入 ---------------- */
  const handleDroppedFile = useCallback((file: File) => {
    void (async () => {
      try {
        const parsed = await parseTimetableFile(await file.arrayBuffer(), {
          totalWeeks: useApp.getState().settings.semester.totalWeeks,
        })
        if (!parsed.records.length) {
          toast('没有从文件中识别到课程', { tone: 'warn', desc: '可以打开导入面板下载示例模板' })
          return
        }
        const state = useApp.getState()
        let created = 0
        const seen = new Map<string, string>()
        for (const r of parsed.records) {
          const key = `${r.name}||${r.teacher ?? ''}`
          const session = {
            day: r.day,
            startPeriod: r.startPeriod,
            endPeriod: r.endPeriod,
            weeks: r.weeks,
            room: r.room,
            teacher: r.teacher,
          }
          const existing = seen.get(key)
          if (existing) {
            state.addSession(existing, session)
            continue
          }
          const id = state.addCourse({
            name: r.name,
            teacher: r.teacher,
            room: r.room,
            color: useApp.getState().courses.length % 12,
            sessions: [session],
          })
          seen.set(key, id)
          created += 1
        }
        toast('导入完成', {
          desc: `${file.name} · 新增 ${created} 门课、${parsed.records.length} 个时段`,
          tone: 'success',
          duration: 4500,
        })
      } catch (err) {
        toast('解析失败', { desc: String((err as Error).message), tone: 'error' })
      }
    })()
  }, [])

  /* ---------------- 侧栏数据 ---------------- */
  const { list } = useTodayClasses(now)
  const current = findCurrentClass(list, now)
  const next = list.find((x) => x.start.getTime() > now.getTime()) ?? null
  const todayHref = useMemo(() => {
    const wd = now.getDay() === 0 ? 7 : now.getDay()
    return dateOfWeekDay(settings.semester.startDate, Math.max(1, realWeek), wd as Weekday)
  }, [now, settings.semester.startDate, realWeek])

  const weekDates = useMemo(() => {
    const mon = mondayOfWeek(settings.semester.startDate, Math.max(1, week))
    const end = new Date(mon.getTime() + 6 * 86400000)
    return `${mon.getMonth() + 1}/${mon.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`
  }, [settings.semester.startDate, week])

  const handleAddAt = (day: Weekday, startPeriod: number, endPeriod: number) => {
    setNewCourse({ day, start: startPeriod, end: endPeriod })
  }

  return (
    <div className="window-shell">
      <div className="app-bg" />

      <div className="relative flex h-full flex-col">
        <TitleBar now={now} />

        <div className="relative flex min-h-0 flex-1">
          {/* ------------------------- 侧栏 ------------------------- */}
          <aside className="glass z-20 m-3 mr-0 flex w-[224px] flex-none flex-col overflow-hidden rounded-[24px] p-3">
            {/* 日期 */}
            <div className="px-2 pb-2.5">
              <div className="text-[13.5px] font-bold leading-tight tracking-[-0.02em]">
                {now.getMonth() + 1} 月 {now.getDate()} 日
              </div>
              <div className="truncate text-[11px] text-ink-4">
                第 {realWeek} 教学周 · {list.length} 节课
              </div>
            </div>

            {/* 导航 */}
            <nav className="space-y-0.5">
              <NavItem
                active={view === 'timetable'}
                icon="calendar"
                label="课程表"
                hint={`第 ${week} 周`}
                onClick={() => setView('timetable')}
              />
              <NavItem
                active={view === 'today'}
                icon="sun"
                label="今日"
                hint={list.length ? `${list.length} 节课` : '无课'}
                onClick={() => setView('today')}
              />
              <NavItem
                active={view === 'todos'}
                icon="checkCircle"
                label="待办作业"
                hint={String(openTodoCount)}
                onClick={() => setView('todos')}
              />
              <NavItem active={view === 'settings'} icon="settings" label="设置" onClick={() => setView('settings')} />
            </nav>

            <div className="my-2.5 h-px bg-line" />

            {/* 接下来 */}
            <div className="px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-4">
              {current ? '正在上课' : '接下来'}
            </div>
            <div className="scroll-y min-h-0 flex-1 px-0.5">
              {current || next ? (
                <NextCard
                  item={(current ?? next)!}
                  live={!!current}
                  onClick={() => selectCourse((current ?? next)!.courseId)}
                />
              ) : (
                <div className="rounded-2xl bg-surface-1 px-3 py-3 text-[11.5px] leading-5 text-ink-4">
                  今天没有更多课程了。看看待办清单，提前完成一份作业？
                </div>
              )}

              {/* 今天剩下的课 */}
              {list.length > 0 && (
                <div className="mt-3 space-y-1">
                  {list
                    .filter((x) => x.end.getTime() > now.getTime())
                    .slice(0, 6)
                    .map((x) => {
                      const c = courses.find((cc) => cc.id === x.courseId)
                      const col = colorOf(c?.color ?? 0)
                      const isCurrent = current?.sessionId === x.sessionId
                      return (
                        <button
                          key={x.sessionId}
                          onClick={() => selectCourse(x.courseId)}
                          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-1"
                        >
                          <span
                            className="h-6 w-1 flex-none rounded-full"
                            style={{ background: col.solid, opacity: isCurrent ? 1 : 0.55 }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-semibold text-ink-2">{x.name}</span>
                            <span className="tabular block text-[10.5px] text-ink-4">
                              {pad2(x.start.getHours())}:{pad2(x.start.getMinutes())} · {x.room ?? '未填地点'}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="mt-2 space-y-1.5">
              <button className="btn btn-primary h-9 w-full text-[12.5px]" onClick={() => setAddCourseOpen(true)}>
                <Icon name="plus" size={14} />
                添加课程
              </button>
              <button className="btn btn-ghost h-8 w-full text-[11.5px]" onClick={() => setImportOpen(true)}>
                <Icon name="import" size={13} />
                导入课表
              </button>
              <button className="btn btn-ghost h-8 w-full text-[11.5px]" onClick={() => setJumpOpen(true)}>
                <Icon name="search" size={13} />
                跳转到周次…
              </button>
            </div>
          </aside>

          {/* ------------------------- 主区域 ------------------------- */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col p-3 pl-3">
            <AnimatePresence mode="wait">
              {/* ============ 课程表（周 / 月 / 学期） ============ */}
              {view === 'timetable' && (
                <motion.div
                  key="timetable"
                  className="flex min-h-0 flex-1 flex-col gap-2.5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={springSoft}
                >
                  {calView === 'week' && (
                    <div className="flex flex-none items-stretch gap-2.5">
                      <TodayHero now={now} onOpenCourse={selectCourse} />
                      <div
                        className={clsx(
                          'glass flex flex-none flex-col rounded-[24px] p-3.5 transition-[width] duration-300',
                          todoCollapsed ? 'w-[300px]' : 'w-[392px]',
                        )}
                      >
                        <TodoPanel
                          compact
                          collapsed={todoCollapsed}
                          onToggleCollapse={() => setTodoCollapsed((v) => !v)}
                          onAddClick={() => setTodoDialogOpen(true)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] p-3">
                    {/* 未排课时段托盘 */}
                    {calView === 'week' && (
                      <DraftTray
                        onOpenCourse={selectCourse}
                        onDragStart={({ courseId, sessionId, label }) => {
                          const c = courses.find((x) => x.id === courseId)
                          const s = c?.sessions.find((x) => x.id === sessionId)
                          const span = s ? Math.max(1, s.endPeriod - s.startPeriod + 1) : 1
                          setTrayDrag({ courseId, sessionId, label, span })
                        }}
                      />
                    )}

                    {/* 工具条 */}
                    <div className="flex flex-none items-center justify-between gap-3 pb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            className="btn h-8 w-8 bg-surface-2 text-ink-2 disabled:opacity-30"
                            disabled={calView === 'term' || week <= 1}
                            onClick={() => setPreviewWeek(Math.max(1, week - 1))}
                            aria-label="上一周"
                          >
                            <Icon name="chevronLeft" size={15} />
                          </button>
                          <button
                            className="btn h-8 w-8 bg-surface-2 text-ink-2 disabled:opacity-30"
                            disabled={calView === 'term' || week >= totalWeeks}
                            onClick={() => setPreviewWeek(Math.min(totalWeeks, week + 1))}
                            aria-label="下一周"
                          >
                            <Icon name="chevronRight" size={15} />
                          </button>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[14px] font-bold tracking-[-0.02em]">
                              第 {week} 教学周
                            </span>
                            {previewWeek != null && previewWeek !== realWeek && (
                              <span className="rounded-full bg-[#FF9F0A]/16 px-2 py-[1px] text-[10.5px] font-bold text-[#96590A]">
                                预览中
                              </span>
                            )}
                          </div>
                          <div className="tabular text-[11px] text-ink-4">{weekDates}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {previewWeek != null && previewWeek !== realWeek && (
                          <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => setPreviewWeek(null)}>
                            回到本周
                          </button>
                        )}
                        <Segmented<CalView>
                          value={calView}
                          onChange={setCalView}
                          options={[
                            { value: 'week', label: '周视图' },
                            { value: 'term', label: '学期视图' },
                          ]}
                        />
                      </div>
                    </div>

                    {calView === 'week' && (
                      <Timetable
                        week={Math.max(1, week)}
                        showWeekend={settings.showWeekend}
                        onOpenCourse={selectCourse}
                        onAddAt={handleAddAt}
                        incomingDraft={trayDrag}
                        onDraftPlaced={(courseId, sessionId, day, startPeriod, endPeriod) => {
                          placeDraft(courseId, sessionId, { day, startPeriod, endPeriod })
                          setTrayDrag(null)
                          toast('已排课', {
                            desc: `周${'一二三四五六日'[day - 1]} 第 ${startPeriod}${
                              endPeriod !== startPeriod ? `-${endPeriod}` : ''
                            } 节`,
                            tone: 'success',
                            duration: 2600,
                          })
                        }}
                      />
                    )}
                    {calView === 'term' && (
                      <TermView
                        onOpenCourse={selectCourse}
                        onPickWeek={(w) => {
                          setPreviewWeek(w === realWeek ? null : w)
                          setCalView('week')
                        }}
                      />
                    )}
                  </div>
                </motion.div>
              )}

            {/* ============ 今日 ============ */}
            {view === 'today' && (
              <motion.div
                key="today"
                className="flex min-h-0 flex-1 gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={springSoft}
              >
                <div className="glass flex min-h-0 flex-1 flex-col rounded-[24px] p-5">
                  <div className="flex flex-none items-center justify-between pb-3">
                    <div>
                      <h2 className="text-[18px] font-bold tracking-[-0.02em]">
                        {todayHref.getMonth() + 1} 月 {todayHref.getDate()} 日
                      </h2>
                      <p className="mt-0.5 text-[12px] text-ink-3">
                        第 {realWeek} 教学周 · {list.length} 节课
                      </p>
                    </div>
                    <div className="tabular text-[28px] font-bold leading-none tracking-[-0.02em] text-ink-2">
                      {pad2(now.getHours())}:{pad2(now.getMinutes())}
                      <span className="ml-1 text-[14px] text-ink-4">{pad2(now.getSeconds())}</span>
                    </div>
                  </div>
                  <TodayList now={now} onOpenCourse={selectCourse} />
                </div>
                <div className="glass flex w-[420px] flex-none flex-col rounded-[24px] p-5">
                  <TodoPanel compact onAddClick={() => setTodoDialogOpen(true)} />
                </div>
              </motion.div>
            )}

            {/* ============ 待办 ============ */}
            {view === 'todos' && (
              <motion.div
                key="todos"
                className="glass flex min-h-0 flex-1 flex-col rounded-[24px] p-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={springSoft}
              >
                <TodoPanel onAddClick={() => setTodoDialogOpen(true)} />
              </motion.div>
            )}

            {/* ============ 设置 ============ */}
            {view === 'settings' && (
              <motion.div
                key="settings"
                className="flex min-h-0 flex-1 flex-col"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={springSoft}
              >
                <SettingsPage onOpenImport={() => setImportOpen(true)} />
              </motion.div>
            )}
          </AnimatePresence>
          </main>
        </div>
      </div>

      {/* ------------------------- 浮层 ------------------------- */}
      <Overlay open={!!selectedCourseId} onClose={() => selectCourse(null)} align="right">
        <CourseDrawer courseId={selectedCourseId} onClose={() => selectCourse(null)} />
      </Overlay>

      <Overlay open={importOpen} onClose={() => setImportOpen(false)} align="center">
        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      </Overlay>

      <NewCourseDialog
        target={newCourse}
        onClose={() => setNewCourse(null)}
        onCreate={(name, color) => {
          if (!newCourse) return
          const id = addCourse({
            name,
            color,
            sessions: [
              {
                day: newCourse.day,
                startPeriod: newCourse.start,
                endPeriod: newCourse.end,
                weeks: [],
              },
            ],
          })
          setNewCourse(null)
          selectCourse(id)
          toast('课程已创建', { desc: '在详情面板里可以继续补充教师、地点与周次', tone: 'success' })
        }}
      />

      <WeekJumpDialog
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        current={week}
        total={totalWeeks}
        onPick={(w) => {
          setPreviewWeek(w === realWeek ? null : w)
          setJumpOpen(false)
          setView('timetable')
        }}
      />

      <TodoDialog open={todoDialogOpen} onClose={() => setTodoDialogOpen(false)} />

      <AddCourseDialog
        open={addCourseOpen}
        onClose={() => setAddCourseOpen(false)}
        onCreated={(id) => {
          setView('timetable')
          setCalView('week')
          // 不自动打开详情，让用户直接看到「未排课时段」托盘并拖放
          void id
        }}
      />

      <ImportDropOverlay onFile={handleDroppedFile} />
      <ToastHost />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 小部件                                                              */
/* ------------------------------------------------------------------ */

function NavItem({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean
  icon: 'calendar' | 'sun' | 'checkCircle' | 'settings'
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-left transition-colors',
        active ? 'text-ink' : 'text-ink-3 hover:bg-surface-1',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 rounded-2xl bg-glass-thin shadow-[var(--sh-soft)]"
          transition={springSoft}
        />
      )}
      <span className={clsx('relative z-[1]', active ? 'text-[#0A84FF]' : 'text-ink-4')}>
        <Icon name={icon} size={17} />
      </span>
      <span className="relative z-[1] flex-1 text-[13px] font-semibold">{label}</span>
      {hint && (
        <span
          className={clsx(
            'tabular relative z-[1] text-[10.5px] font-semibold',
            active ? 'text-ink-3' : 'text-ink-4',
          )}
        >
          {hint}
        </span>
      )}
    </button>
  )
}

function NextCard({
  item,
  live,
  onClick,
}: {
  item: { courseId: string; name: string; room?: string; teacher?: string; start: Date; end: Date; startPeriod: number }
  live: boolean
  onClick: () => void
}) {
  const courses = useApp((s) => s.courses)
  const course = courses.find((c) => c.id === item.courseId)
  const color = colorOf(course?.color ?? 0)
  const mins = Math.round((item.start.getTime() - Date.now()) / 60000)
  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden rounded-[20px] p-3 text-left transition-transform hover:scale-[1.015]"
      style={{ background: `linear-gradient(150deg, ${color.from}, ${color.to})`, border: `1px solid ${color.ring}` }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: color.text }}>
        {live ? (
          <>
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#FF3B30]" />
            进行中
          </>
        ) : (
          <>{mins > 0 ? `${mins} 分钟后` : '即将开始'}</>
        )}
      </div>
      <div className="mt-1 truncate text-[14.5px] font-bold" style={{ color: color.text }}>
        {item.name}
      </div>
      <div className="tabular mt-1 text-[11px]" style={{ color: color.text, opacity: 0.75 }}>
        {pad2(item.start.getHours())}:{pad2(item.start.getMinutes())}–{pad2(item.end.getHours())}:
        {pad2(item.end.getMinutes())}
        {item.room ? ` · ${item.room}` : ''}
      </div>
    </button>
  )
}

function NewCourseDialog({
  target,
  onClose,
  onCreate,
}: {
  target: { day: Weekday; start: number; end: number } | null
  onClose: () => void
  onCreate: (name: string, color: number) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(0)

  useEffect(() => {
    if (target) {
      setName('')
      setColor(Math.floor(Math.random() * 12))
    }
  }, [target])

  if (!target) return null
  const c = colorOf(color)
  return (
    <Overlay open onClose={onClose} align="center">
      <div className="w-[420px] max-w-[92vw] overflow-hidden rounded-[26px] border border-glass-line bg-glass p-5 shadow-[var(--shadow-float)] backdrop-blur-2xl">
        <h3 className="text-[16px] font-bold tracking-[-0.02em]">新建课程</h3>
        <p className="mt-0.5 text-[12px] text-ink-3">
          周{'一二三四五六日'[target.day - 1]} · 第 {target.start}
          {target.end !== target.start ? `-${target.end}` : ''} 节
        </p>
        <input
          autoFocus
          className="field mt-4 text-[14px]"
          placeholder="课程名称，回车创建"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onCreate(name.trim(), color)
          }}
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 12 }, (_, i) => {
            const col = colorOf(i)
            return (
              <button
                key={i}
                className={clsx(
                  'h-6 w-6 rounded-full transition-transform',
                  color === i ? 'scale-110 ring-2 ring-offset-1 ring-ink-4' : 'hover:scale-110',
                )}
                style={{ background: col.solid }}
                onClick={() => setColor(i)}
                aria-label={col.name}
              />
            )
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-ghost h-9 px-4 text-[12.5px]" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary h-9 px-5 text-[12.5px] disabled:opacity-40"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), color)}
            style={{ background: `linear-gradient(180deg, ${c.solid}, ${c.solid})` }}
          >
            创建
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function WeekJumpDialog({
  open,
  onClose,
  current,
  total,
  onPick,
}: {
  open: boolean
  onClose: () => void
  current: number
  total: number
  onPick: (w: number) => void
}) {
  const settings = useApp((s) => s.settings)
  const [value, setValue] = useState(String(current))
  useEffect(() => setValue(String(current)), [current, open])
  return (
    <Overlay open={open} onClose={onClose} align="center">
      <div className="w-[420px] max-w-[92vw] rounded-[26px] border border-glass-line bg-glass p-5 shadow-[var(--shadow-float)] backdrop-blur-2xl">
        <h3 className="text-[16px] font-bold tracking-[-0.02em]">跳转到教学周</h3>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {Array.from({ length: total }, (_, i) => i + 1).map((w) => (
            <button
              key={w}
              onClick={() => onPick(w)}
              className={clsx(
                'tabular rounded-xl py-2 text-[12.5px] font-semibold transition-colors',
                w === current ? 'bg-[#0A84FF] text-white' : 'bg-surface-2 text-ink-2 hover:bg-surface-3',
              )}
            >
              {w}
              <span className="mt-0.5 block text-[9.5px] font-normal opacity-70">
                {mondayOfWeek(settings.semester.startDate, w).getMonth() + 1}/
                {mondayOfWeek(settings.semester.startDate, w).getDate()}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            className="field w-[100px]"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            className="btn btn-primary h-9 px-4 text-[12.5px]"
            onClick={() => {
              const n = Math.max(1, Math.min(total, Number(value) || 1))
              onPick(n)
            }}
          >
            跳转
          </button>
          <button className="btn btn-ghost h-9 px-4 text-[12.5px]" onClick={() => onPick(currentWeek({ settings, previewWeek: null }))}>
            回到本周
          </button>
        </div>
      </div>
    </Overlay>
  )
}
