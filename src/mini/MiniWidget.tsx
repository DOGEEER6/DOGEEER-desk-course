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
import {
  hideCurrentWindow,
  isDesktop,
  miniWorkAreaHeight,
  requestInitialSnap,
  setMiniClickThrough,
  setMiniLocked,
  setMiniSize,
  showMainWindow,
} from '../lib/desktop'
import { playChime } from '../lib/notify'
import { applyTheme, MINI_THEME_KEY } from '../lib/theme'

/* ---------------- 窗口位置/大小持久化 ---------------- */

const GEOM_KEY = 'lumen-mini-geom-v2'
/** 浮窗固定宽度；高度按内容自适应 */
const MINI_WIDTH = 400
const MINI_MIN_HEIGHT = 200
const TOP_GAP = 16

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
  sessionId: string
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
  const toggleTodo = useApp((s) => s.toggleTodo)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [doneClasses, setDoneClasses] = useState<Set<string>>(new Set())
  const [justDone, setJustDone] = useState<Set<string>>(new Set())
  const restored = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  /** 勾掉一节课（表示已上完） */
  const toggleClassDone = (courseId: string, sessionId: string) => {
    const key = `${courseId}-${sessionId}`
    setDoneClasses((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** 勾掉一条作业：先显示打勾，再收进归档（与主界面一致） */
  const checkTodo = (id: string, done: boolean) => {
    if (done) {
      toggleTodo(id, false)
      return
    }
    toggleTodo(id, true)
    playChime('done')
    setJustDone((s) => new Set(s).add(id))
    window.setTimeout(() => {
      useApp.getState().archiveTodo(id)
      setJustDone((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }, 900)
  }

  const week = weekIndexOf(settings.semester.startDate, now)
  const weekday = (now.getDay() === 0 ? 7 : now.getDay()) as Weekday

  /* 恢复窗口位置与大小 + 应用固定偏好（只做一次） */
  useEffect(() => {
    if (!isDesktop() || restored.current) return
    restored.current = true
    const win = geoWindow()
    if (!win) return

    void (async () => {
      const g = readGeom()
      if (g) {
        // 用户之前拖过：恢复尺寸（位置保持不变）
        await setMiniSize(MINI_WIDTH, Math.max(MINI_MIN_HEIGHT, g.h))
      } else {
        // 首次运行 / 没拖过：交给 Rust 在启动完成后延迟贴到右上角
        // （前端贴完会被 Windows 的默认定位覆盖）
        await new Promise((r) => window.setTimeout(r, 300))
        const measured = rootRef.current?.scrollHeight
        const h = Math.max(MINI_MIN_HEIGHT, Math.min(900, Math.ceil(measured ?? 420)))
        await requestInitialSnap(true, h)
      }
      await setMiniLocked(!!useApp.getState().settings.miniAlwaysOnTop)
      await setMiniClickThrough(!!useApp.getState().settings.miniAlwaysOnTop)
    })()

    let unMoved: (() => void) | undefined
    let unResized: (() => void) | undefined
    // 只有用户自己拖过窗口，才认为「位置是用户定的」。
    // 否则启动阶段的高度自适应会被当成用户操作，把默认位置也存下来，
    // 下次启动就会走「恢复位置」分支、永远贴不到右上角。
    let userMoved = false
    const markMoved = () => {
      userMoved = true
    }
    const onHeaderDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('.drag-handle')) markMoved()
    }
    window.addEventListener('pointerdown', onHeaderDown)

    const persist = async () => {
      if (!userMoved) return
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
      window.removeEventListener('pointerdown', onHeaderDown)
    }
  }, [])

  /* 高度自适应 + 贴边。
     重要：Windows 在窗口尺寸变化后会把窗口挪到默认位置，
     所以必须在「尺寸稳定」之后再贴右上角，否则贴完又会被挪走。 */
  useEffect(() => {
    if (!isDesktop() || miniPinned) return
    const el = rootRef.current
    if (!el) return
    let raf = 0
    let settleTimer = 0
    let limit = 900
    let lastSize = 0

    const snapNow = () => {
      if (readGeom()) return
      const h = Math.ceil(el.scrollHeight)
      const target = Math.max(MINI_MIN_HEIGHT, Math.min(limit - TOP_GAP * 2, h))
      lastSize = target
      // 后端负责首次贴边；这里只在后端不可用时兜底（浏览器预览）
      void setMiniSize(MINI_WIDTH, target)
      void requestInitialSnap(false, target)
    }

    /** 尺寸变化后防抖：安静 900ms 再贴边 */
    const scheduleSnap = () => {
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(snapNow, 900)
    }

    const apply = () => {
      const h = Math.ceil(el.scrollHeight)
      const maxH = limit - TOP_GAP * 2
      const target = Math.max(MINI_MIN_HEIGHT, Math.min(maxH, h))
      if (Math.abs(target - lastSize) >= 6) {
        lastSize = target
        void setMiniSize(MINI_WIDTH, target)
      }
      scheduleSnap()
    }
    const schedule = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(apply)
    }

    void miniWorkAreaHeight().then((h) => {
      limit = h
      schedule()
    })

    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    schedule()
    return () => {
      ro.disconnect()
      window.clearTimeout(settleTimer)
      window.cancelAnimationFrame(raf)
    }
  }, [miniPinned, expanded])

  /* 固定后鼠标穿透到桌面 */
  useEffect(() => {
    if (!isDesktop()) return
    void setMiniClickThrough(!!miniPinned)
  }, [miniPinned])

  /* 主界面切换深浅色时同步（跨窗口用 storage 事件 + 重新聚焦时兜底） */
  useEffect(() => {
    const readTheme = () => {
      try {
        const v = localStorage.getItem(MINI_THEME_KEY)
        if (v === 'light' || v === 'dark' || v === 'system') applyTheme(v)
      } catch {
        /* ignore */
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === MINI_THEME_KEY || e.key === null) readTheme()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', readTheme)
    const timer = window.setInterval(readTheme, 4000)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', readTheme)
      window.clearInterval(timer)
    }
  }, [])

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
          sessionId: s.id,
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
    /* 卡片留出 1px 让位给 Windows 自绘窗口边缘，避免出现一圈灰描边 */
    <div ref={rootRef} className="relative w-full overflow-hidden rounded-[9px]">
      <div className="frost frost-card relative flex w-full flex-col overflow-hidden rounded-[8px]">
        {/* 顶部高光，深色桌面上更立体 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0))' }}
        />

        {/* 头部：自带一层局部模糊 + 未固定时可拖动 */}
        <header
          className={clsx(
            'mini-panel-header relative z-[1] flex flex-none items-center gap-3 px-4 pb-2.5 pt-3.5',
            miniPinned ? 'lock-handle' : 'drag-handle',
          )}
        >
          <div className="grid h-9 w-9 flex-none place-items-center rounded-[11px] bg-gradient-to-br from-[#3AA0FF] to-[#0A84FF] text-white shadow-[0_6px_14px_-6px_rgba(10,132,255,0.95)]">
            <Icon name="calendar" size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] font-extrabold leading-tight tracking-[-0.01em]">DOGEEER</span>
              <span className="truncate text-[12px] font-medium text-ink-3">
                {now.getMonth() + 1} 月 {now.getDate()} 日 · {WEEKDAY_FULL[weekday]}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] leading-tight text-ink-4">
              第 {week} 教学周 · 今天 {rows.length} 节课
              {miniPinned ? ' · 已固定' : ''}
            </div>
          </div>
          <div className="tabular flex-none text-right">
            <div className="text-[17px] font-bold leading-none tracking-[-0.02em]">
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
        <div className="scroll-y relative z-[1] flex min-h-0 flex-1 flex-col px-3 pb-1">
          {rows.length === 0 && (
            <div className="grid flex-1 place-items-center py-10 text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-ink-4">
                  <Icon name="sun" size={21} />
                </div>
                <div className="mt-3 text-[13.5px] font-semibold text-ink-2">今天没有课</div>
                <div className="mt-1 text-[11.5px] text-ink-4">
                  {openCount > 0 ? `还有 ${openCount} 项待办可以做` : '好好休息'}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {rows.map((r) => {
              const color = colorOf(r.course.color)
              const isCurrent = current?.course.id === r.course.id && current?.startPeriod === r.startPeriod
              const key = `${r.course.id}-${r.startPeriod}`
              const isOpen = expanded === key
              const classDone = doneClasses.has(`${r.course.id}-${r.sessionId}`)
              const undone = r.todos.filter((t) => !t.done)
              return (
                <div
                  key={key}
                  className="overflow-hidden rounded-[16px] border"
                  style={{
                    background: isCurrent
                      ? `linear-gradient(150deg, ${color.solid}, ${color.solid})`
                      : `linear-gradient(150deg, ${color.from}, ${color.to})`,
                    borderColor: isCurrent ? 'transparent' : color.ring,
                    color: isCurrent ? '#fff' : color.text,
                  }}
                >
                  <div className="flex items-center">
                    {/* 完成勾选（表示这节课已上完） */}
                    <button
                      className="no-drag ml-3 grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-2 transition-all active:scale-90"
                      style={{
                        borderColor: classDone ? 'transparent' : isCurrent ? 'rgba(255,255,255,0.85)' : color.ring,
                        background: classDone ? '#34C759' : isCurrent ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)',
                      }}
                      data-testid={`mini-done-${r.course.id}-${r.startPeriod}`}
                      onClick={() => toggleClassDone(r.course.id, r.sessionId)}
                      title={classDone ? '取消「已上完」标记' : '标记这节课已上完'}
                      aria-label={classDone ? '取消已完成' : '标记已完成'}
                    >
                      <motion.svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        initial={false}
                        animate={{ scale: classDone ? 1 : 0.3, opacity: classDone ? 1 : 0 }}
                        transition={springSnappy}
                      >
                        <path d="M2 6.4l2.6 2.6L10 3.4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </motion.svg>
                    </button>

                    <button
                      className="no-drag flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                      data-testid={`mini-course-${r.course.id}-${r.startPeriod}`}
                      onClick={() => setExpanded(isOpen ? null : key)}
                    >
                      <div className="tabular w-[46px] flex-none">
                        <div className="text-[13px] font-bold leading-tight">
                          {pad2(Math.floor(r.startMin / 60))}:{pad2(r.startMin % 60)}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-tight opacity-70">
                          {pad2(Math.floor(r.endMin / 60))}:{pad2(r.endMin % 60)}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              'truncate text-[14.5px] font-bold leading-tight',
                              classDone && 'line-through opacity-60',
                            )}
                          >
                            {r.course.name}
                          </span>
                          {isCurrent && (
                            <span className="live-dot inline-block h-2 w-2 flex-none rounded-full bg-[#FF3B30]" />
                          )}
                          {!isCurrent && undone.length > 0 && (
                            <span className="flex-none rounded-full bg-surface-3 px-2 py-[1px] text-[11px] font-bold">
                              {undone.length} 项作业
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2.5 text-[11.5px] opacity-75">
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
                        <Icon name="chevronDown" size={15} />
                      </motion.span>
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={springSoft}
                        className="overflow-hidden"
                      >
                        <div className="no-drag px-3 pb-3">
                          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] opacity-85">
                            <span className="tabular flex items-center gap-1">
                              <Icon name="clock" size={12} />
                              {pad2(Math.floor(r.startMin / 60))}:{pad2(r.startMin % 60)}–
                              {pad2(Math.floor(r.endMin / 60))}:{pad2(r.endMin % 60)}
                            </span>
                            {r.room && (
                              <span className="flex items-center gap-1">
                                <Icon name="pin" size={12} />
                                {r.room}
                              </span>
                            )}
                            {r.teacher && (
                              <span className="flex items-center gap-1">
                                <Icon name="user" size={12} />
                                {r.teacher}
                              </span>
                            )}
                          </div>

                          <div className="mini-panel mt-2.5 rounded-[12px] p-3 text-ink">
                            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-4">
                              <Icon name="flag" size={12} />
                              作业 / DDL
                            </div>
                            {r.todos.length === 0 ? (
                              <div className="text-[12px] text-ink-4">这门课还没有作业</div>
                            ) : (
                              <ul className="space-y-2">
                                {r.todos.slice(0, 5).map((t) => {
                                  const d = dueLabel(t.dueAt, now)
                                  const pending = justDone.has(t.id)
                                  return (
                                    <li key={t.id} className="flex items-start gap-2.5">
                                      <button
                                        className={clsx(
                                          'mt-[1px] grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px] transition-all active:scale-90',
                                          t.done ? 'border-transparent bg-[#34C759]' : 'border-ink-4/60 hover:border-[#0A84FF]',
                                          pending && 'ring-2 ring-[#34C759]/40',
                                        )}
                                        data-testid={`mini-todo-${t.id}`}
                                        onClick={() => checkTodo(t.id, t.done)}
                                        title={t.done ? '取消完成' : '标记完成'}
                                        aria-label={t.done ? '取消完成' : '标记完成'}
                                      >
                                        <motion.svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 12 12"
                                          fill="none"
                                          initial={false}
                                          animate={{ scale: t.done ? 1 : 0.3, opacity: t.done ? 1 : 0 }}
                                          transition={springSnappy}
                                        >
                                          <path
                                            d="M2 6.4l2.6 2.6L10 3.4"
                                            stroke="#fff"
                                            strokeWidth="2.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </motion.svg>
                                      </button>
                                      <span className="min-w-0 flex-1">
                                        <span
                                          className={clsx(
                                            'block text-[12.5px] font-medium leading-snug',
                                            t.done && 'text-ink-4 line-through',
                                          )}
                                        >
                                          {t.title}
                                        </span>
                                        {!t.done && (
                                          <span
                                            className={clsx(
                                              'mt-0.5 block text-[11px] leading-tight',
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
                                  <li className="text-[11px] text-ink-4">…还有 {r.todos.length - 5} 项</li>
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
            <div className="mini-panel mt-3 rounded-[16px] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-4">
                <Icon name="flag" size={11} />
                近期待办
              </div>
              <ul className="space-y-2">
                {upcoming.overdue.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <button
                      className={clsx(
                        'grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px] transition-all active:scale-90',
                        t.done ? 'border-transparent bg-[#34C759]' : 'border-ink-4/60 hover:border-[#0A84FF]',
                        justDone.has(t.id) && 'ring-2 ring-[#34C759]/40',
                      )}
                      data-testid={`mini-todo-global-${t.id}`}
                      onClick={() => checkTodo(t.id, t.done)}
                      aria-label={t.done ? '取消完成' : '标记完成'}
                    >
                      <motion.svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        initial={false}
                        animate={{ scale: t.done ? 1 : 0.3, opacity: t.done ? 1 : 0 }}
                        transition={springSnappy}
                      >
                        <path d="M2 6.4l2.6 2.6L10 3.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </motion.svg>
                    </button>
                    <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                    <span className="flex-none text-[11px] font-semibold text-[#D62A20]">已逾期</span>
                  </li>
                ))}
                {upcoming.soon.map((t) => {
                  const d = dueLabel(t.dueAt, now)
                  return (
                    <li key={t.id} className="flex items-center gap-2.5 text-[12.5px]">
                      <button
                        className={clsx(
                          'grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px] transition-all active:scale-90',
                          t.done ? 'border-transparent bg-[#34C759]' : 'border-ink-4/60 hover:border-[#0A84FF]',
                          justDone.has(t.id) && 'ring-2 ring-[#34C759]/40',
                        )}
                        data-testid={`mini-todo-global-${t.id}`}
                        onClick={() => checkTodo(t.id, t.done)}
                        aria-label={t.done ? '取消完成' : '标记完成'}
                      >
                        <motion.svg
                          width="10"
                          height="10"
                          viewBox="0 0 12 12"
                          fill="none"
                          initial={false}
                          animate={{ scale: t.done ? 1 : 0.3, opacity: t.done ? 1 : 0 }}
                          transition={springSnappy}
                        >
                          <path d="M2 6.4l2.6 2.6L10 3.4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </motion.svg>
                      </button>
                      <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                      <span
                        className={clsx(
                          'flex-none text-[11px]',
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
            <div className="mt-2.5 px-1 text-[11px] text-ink-4">
              下一节：{next.course.name} · {pad2(Math.floor(next.startMin / 60))}:{pad2(next.startMin % 60)}
              {next.room ? ` · ${next.room}` : ''}
            </div>
          )}
          <div className="h-2" />
        </div>

        {/* 底部操作栏：同样加模糊，文字不糊在桌面上 */}
        <footer className="no-drag mini-panel-footer relative z-[1] flex flex-none items-center gap-2.5 px-3.5 py-2.5">
          <span className="flex-1 text-[11px] text-ink-4">
            {openCount > 0 ? `${openCount} 项待办未完成` : '待办已清空 🎉'}
          </span>
          <button className="btn btn-primary h-8 px-3.5 text-[12px]" onClick={() => void showMainWindow()}>
            <Icon name="calendar" size={13} />
            打开完整课表
          </button>
        </footer>
      </div>
    </div>
  )
}
