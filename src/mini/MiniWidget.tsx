/**
 * 极简桌面浮窗（DOGEEER 今日）
 *
 *  - 只显示「今天」：今日课程 + 全部作业 DDL 汇总
 *  - 点击课程卡片展开教师 / 地点 / 该课作业与截止时间
 *  - 默认可被普通窗口覆盖（不置顶），可在设置里「固定在桌面最前」
 *  - 记住位置与大小；不透明毛玻璃卡片，适配深色桌面
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useApp } from '../store'
import type { Course, Todo, Weekday } from '../types'
import { WEEKDAY_FULL } from '../types'
import { colorOf } from '../lib/palette'
import { dueLabel, pad2, sessionCoversWeek, weekIndexOf } from '../lib/time'
import { Icon, springSnappy, springSoft } from '../components/ui'
import { useNow } from '../hooks'
import { hideCurrentWindow, isDesktop, setMiniAlwaysOnTop, showMainWindow } from '../lib/desktop'

/* ---------------- 窗口位置/大小持久化 ---------------- */

const GEOM_KEY = 'lumen-mini-geom'

interface MiniGeom {
  x: number
  y: number
  w: number
  h: number
}

interface GeoWindow {
  outerPosition?: () => Promise<{ x: number; y: number }>
  outerSize?: () => Promise<{ width: number; height: number }>
  setPosition?: (p: { x: number; y: number }) => Promise<void>
  setSize?: (s: { width: number; height: number }) => Promise<void>
  onMoved?: (cb: () => void) => Promise<() => void>
  onResized?: (cb: () => void) => Promise<() => void>
}

function geoWindow(): GeoWindow | undefined {
  const g = (window as unknown as { __TAURI__?: { window?: { getCurrentWindow?: () => GeoWindow } } }).__TAURI__
  return g?.window?.getCurrentWindow?.()
}

function readGeom(): MiniGeom | null {
  try {
    const raw = localStorage.getItem(GEOM_KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as MiniGeom
    if ([g.x, g.y, g.w, g.h].every((n) => typeof n === 'number' && Number.isFinite(n))) return g
  } catch {
    /* ignore */
  }
  return null
}

function saveGeom(g: MiniGeom) {
  try {
    localStorage.setItem(GEOM_KEY, JSON.stringify(g))
  } catch {
    /* ignore */
  }
}

/* ---------------- 组件 ---------------- */

interface Row {
  course: Course
  startPeriod: number
  endPeriod: number
  startMin: number
  endMin: number
  room?: string
  teacher?: string
  todos: Todo[]
}

export default function MiniWidget() {
  const now = useNow(15000)
  const courses = useApp((s) => s.courses)
  const todos = useApp((s) => s.todos)
  const periods = useApp((s) => s.periods)
  const settings = useApp((s) => s.settings)
  const miniPinned = useApp((s) => s.settings.miniAlwaysOnTop)
  const [expanded, setExpanded] = useState<string | null>(null)
  const restored = useRef(false)

  const week = weekIndexOf(settings.semester.startDate, now)
  const weekday = (now.getDay() === 0 ? 7 : now.getDay()) as Weekday

  /* 恢复窗口位置与大小 + 应用置顶偏好（只做一次） */
  useEffect(() => {
    if (!isDesktop() || restored.current) return
    restored.current = true
    const win = geoWindow()
    if (!win) return

    const g = readGeom()
    if (g) {
      void win.setPosition?.({ x: g.x, y: g.y })
      void win.setSize?.({ width: g.w, height: g.h })
    }
    void setMiniAlwaysOnTop(!!useApp.getState().settings.miniAlwaysOnTop)

    let unMoved: (() => void) | undefined
    let unResized: (() => void) | undefined
    const persist = async () => {
      try {
        const [pos, size] = await Promise.all([win.outerPosition?.(), win.outerSize?.()])
        if (pos && size) saveGeom({ x: pos.x, y: pos.y, w: size.width, h: size.height })
      } catch {
        /* ignore */
      }
    }
    void win.onMoved?.(() => void persist()).then((fn) => {
      unMoved = fn
    })
    void win.onResized?.(() => void persist()).then((fn) => {
      unResized = fn
    })
    return () => {
      unMoved?.()
      unResized?.()
    }
  }, [])

  /* 用户切换「固定」时同步到窗口 */
  useEffect(() => {
    if (!isDesktop()) return
    void setMiniAlwaysOnTop(!!miniPinned)
  }, [miniPinned])

  /* ---- 今日课程 ---- */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const c of courses) {
      if (c.archived) continue
      for (const s of c.sessions) {
        if (s.day !== weekday) continue
        if (!sessionCoversWeek(s, week)) continue
        const a = periods.find((p) => p.index === s.startPeriod)
        const b = periods.find((p) => p.index === s.endPeriod)
        const toMin = (hm?: string) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(hm ?? '')
          return m ? Number(m[1]) * 60 + Number(m[2]) : 0
        }
        out.push({
          course: c,
          startPeriod: s.startPeriod,
          endPeriod: s.endPeriod,
          startMin: toMin(a?.start),
          endMin: toMin(b?.end ?? a?.end),
          room: s.room ?? c.room,
          teacher: s.teacher ?? c.teacher,
          todos: todos.filter((t) => t.courseId === c.id && !t.archived),
        })
      }
    }
    return out.sort((x, y) => x.startMin - y.startMin)
  }, [courses, todos, periods, weekday, week])

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const current = rows.find((r) => nowMin >= r.startMin && nowMin <= r.endMin) ?? null
  const next = rows.find((r) => r.startMin > nowMin) ?? null

  /* ---- 全局 DDL ---- */
  const openTodos = useMemo(() => todos.filter((t) => !t.done && !t.archived), [todos])
  const upcoming = useMemo(() => {
    const withDue = openTodos.filter((t) => t.dueAt)
    const overdue = withDue.filter((t) => new Date(t.dueAt!).getTime() < now.getTime())
    const soon = withDue
      .filter((t) => new Date(t.dueAt!).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    return { overdue, soon: soon.slice(0, 3) }
  }, [openTodos, now])

  const openCount = openTodos.length
  const hasDdlSection = upcoming.overdue.length > 0 || upcoming.soon.length > 0

  return (
    /* 窗口本身有系统圆角，卡片铺满即可 */
    <div className="relative h-full w-full overflow-hidden">
      <div className="frost frost-card relative flex h-full w-full flex-col overflow-hidden rounded-[12px]">
        {/* 顶部高光，深色桌面上更立体 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0))' }}
        />

        {/* 头部：可拖动 */}
        <header className="drag-handle relative z-[1] flex flex-none items-center gap-2.5 px-3.5 pb-2 pt-2.5">
          <div className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-gradient-to-br from-[#3AA0FF] to-[#0A84FF] text-white shadow-[0_5px_12px_-5px_rgba(10,132,255,0.95)]">
            <Icon name="calendar" size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-extrabold leading-tight tracking-[-0.01em]">DOGEEER</span>
              <span className="truncate text-[11.5px] font-medium text-ink-3">
                {now.getMonth() + 1} 月 {now.getDate()} 日 · {WEEKDAY_FULL[weekday]}
              </span>
            </div>
            <div className="truncate text-[10.5px] leading-tight text-ink-4">
              第 {week} 教学周 · 今天 {rows.length} 节课
              {miniPinned ? ' · 已固定' : ''}
            </div>
          </div>
          <div className="tabular flex-none text-right">
            <div className="text-[16px] font-bold leading-none tracking-[-0.02em]">
              {pad2(now.getHours())}:{pad2(now.getMinutes())}
            </div>
          </div>
          <button
            className="no-drag btn h-7 w-7 flex-none text-ink-4 hover:bg-surface-2 hover:text-ink"
            onClick={() => void hideCurrentWindow()}
            title="隐藏浮窗"
            aria-label="隐藏浮窗"
          >
            <Icon name="close" size={12} />
          </button>
        </header>

        {/* 主体 */}
        <div className="scroll-y relative z-[1] flex min-h-0 flex-1 flex-col px-2.5 pb-1">
          {rows.length === 0 && (
            <div className="grid flex-1 place-items-center py-10 text-center">
              <div>
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-surface-2 text-ink-4">
                  <Icon name="sun" size={19} />
                </div>
                <div className="mt-2 text-[12.5px] font-semibold text-ink-2">今天没有课</div>
                <div className="mt-0.5 text-[11px] text-ink-4">
                  {openCount > 0 ? `还有 ${openCount} 项待办可以做` : '好好休息'}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {rows.map((r) => {
              const color = colorOf(r.course.color)
              const isCurrent = current?.course.id === r.course.id && current?.startPeriod === r.startPeriod
              const isPast = r.endMin < nowMin
              const key = `${r.course.id}-${r.startPeriod}`
              const isOpen = expanded === key
              const undone = r.todos.filter((t) => !t.done)
              return (
                <div
                  key={key}
                  className={clsx(
                    'overflow-hidden rounded-[14px] border transition-opacity',
                    isPast && !isCurrent && 'opacity-50',
                  )}
                  style={{
                    background: isCurrent
                      ? `linear-gradient(150deg, ${color.solid}, ${color.to})`
                      : `linear-gradient(150deg, ${color.from}, ${color.to})`,
                    borderColor: isCurrent ? 'transparent' : color.ring,
                    color: isCurrent ? '#fff' : color.text,
                  }}
                >
                  <button
                    className="no-drag flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                    data-testid={`mini-course-${r.course.id}-${r.startPeriod}`}
                    onClick={() => setExpanded(isOpen ? null : key)}
                  >
                    <div className="tabular w-[38px] flex-none">
                      <div className="text-[11px] font-bold leading-tight">
                        {pad2(Math.floor(r.startMin / 60))}:{pad2(r.startMin % 60)}
                      </div>
                      <div className="text-[9.5px] leading-tight opacity-70">
                        {pad2(Math.floor(r.endMin / 60))}:{pad2(r.endMin % 60)}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-bold leading-tight">{r.course.name}</span>
                        {isCurrent && (
                          <span className="live-dot inline-block h-1.5 w-1.5 flex-none rounded-full bg-[#FF3B30]" />
                        )}
                        {!isCurrent && undone.length > 0 && (
                          <span className="flex-none rounded-full bg-surface-3 px-1.5 text-[9.5px] font-bold">
                            {undone.length} 项作业
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] opacity-75">
                        {r.room && <span className="truncate">{r.room}</span>}
                        <span className="tabular flex-none">
                          第 {r.startPeriod}
                          {r.endPeriod !== r.startPeriod ? `-${r.endPeriod}` : ''} 节
                        </span>
                      </div>
                    </div>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={springSnappy}
                      className="flex-none opacity-60"
                    >
                      <Icon name="chevronDown" size={13} />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={springSoft}
                        className="overflow-hidden"
                      >
                        <div className="no-drag px-2.5 pb-2">
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] opacity-85">
                            <span className="tabular flex items-center gap-1">
                              <Icon name="clock" size={10} />
                              {pad2(Math.floor(r.startMin / 60))}:{pad2(r.startMin % 60)}–
                              {pad2(Math.floor(r.endMin / 60))}:{pad2(r.endMin % 60)}
                            </span>
                            {r.room && (
                              <span className="flex items-center gap-1">
                                <Icon name="pin" size={10} />
                                {r.room}
                              </span>
                            )}
                            {r.teacher && (
                              <span className="flex items-center gap-1">
                                <Icon name="user" size={10} />
                                {r.teacher}
                              </span>
                            )}
                          </div>

                          <div className="mt-1.5 rounded-[10px] bg-surface-1 p-2 text-ink">
                            <div className="mb-1 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-ink-4">
                              <Icon name="flag" size={10} />
                              作业 / DDL
                            </div>
                            {r.todos.length === 0 ? (
                              <div className="text-[10.5px] text-ink-4">这门课还没有作业</div>
                            ) : (
                              <ul className="space-y-1">
                                {r.todos.slice(0, 5).map((t) => {
                                  const d = dueLabel(t.dueAt, now)
                                  return (
                                    <li key={t.id} className="flex items-start gap-1.5">
                                      <span
                                        className={clsx(
                                          'mt-[5px] h-1.5 w-1.5 flex-none rounded-full',
                                          t.done
                                            ? 'bg-[#34C759]'
                                            : d.tone === 'over'
                                              ? 'bg-[#FF3B30]'
                                              : d.tone === 'today'
                                                ? 'bg-[#FF9F0A]'
                                                : 'bg-[#0A84FF]',
                                        )}
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span
                                          className={clsx(
                                            'block text-[11px] font-medium leading-tight',
                                            t.done && 'text-ink-4 line-through',
                                          )}
                                        >
                                          {t.title}
                                        </span>
                                        {!t.done && (
                                          <span
                                            className={clsx(
                                              'block text-[9.5px] leading-tight',
                                              d.tone === 'over'
                                                ? 'text-[#D62A20]'
                                                : d.tone === 'today'
                                                  ? 'text-[#C2740A]'
                                                  : 'text-ink-4',
                                            )}
                                          >
                                            {d.text}
                                          </span>
                                        )}
                                      </span>
                                    </li>
                                  )
                                })}
                                {r.todos.length > 5 && (
                                  <li className="text-[9.5px] text-ink-4">…还有 {r.todos.length - 5} 项</li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          {/* 今日 DDL 汇总 */}
          {hasDdlSection && (
            <div className="mt-2.5 rounded-[14px] border border-line bg-surface-1 p-2.5">
              <div className="mb-1.5 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-ink-4">
                <Icon name="flag" size={10} />
                近期待办
              </div>
              <ul className="space-y-1">
                {upcoming.overdue.map((t) => (
                  <li key={t.id} className="flex items-center gap-1.5 text-[11px]">
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#FF3B30]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                    <span className="flex-none text-[9.5px] font-semibold text-[#D62A20]">已逾期</span>
                  </li>
                ))}
                {upcoming.soon.map((t) => {
                  const d = dueLabel(t.dueAt, now)
                  return (
                    <li key={t.id} className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className={clsx(
                          'h-1.5 w-1.5 flex-none rounded-full',
                          d.tone === 'today' ? 'bg-[#FF9F0A]' : 'bg-[#0A84FF]',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                      <span
                        className={clsx(
                          'flex-none text-[9.5px]',
                          d.tone === 'today' ? 'text-[#C2740A]' : 'text-ink-4',
                        )}
                      >
                        {d.text}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {next && (
            <div className="mt-2 px-1 text-[10.5px] text-ink-4">
              下一节：{next.course.name} · {pad2(Math.floor(next.startMin / 60))}:{pad2(next.startMin % 60)}
              {next.room ? ` · ${next.room}` : ''}
            </div>
          )}
          <div className="h-2" />
        </div>

        {/* 底部 */}
        <footer className="no-drag relative z-[1] flex flex-none items-center gap-2 border-t border-line px-3 py-2">
          <span className="flex-1 text-[10.5px] text-ink-4">
            {openCount > 0 ? `${openCount} 项待办未完成` : '待办已清空 🎉'}
          </span>
          <button className="btn btn-primary h-7 px-3 text-[11.5px]" onClick={() => void showMainWindow()}>
            <Icon name="calendar" size={12} />
            打开完整课表
          </button>
        </footer>
      </div>
    </div>
  )
}
