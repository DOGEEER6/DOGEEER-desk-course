import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useApp, dateOfWeekDay } from '../store'
import type { Course, Session, Weekday } from '../types'
import { WEEKDAY_LABELS } from '../types'
import { colorOf } from '../lib/palette'
import { parseHM, sessionCoversWeek, weekRangeText } from '../lib/time'
import { isDragGesture, snapDrag } from '../lib/snap'
import { Icon, springSnappy } from './ui'
import { motion } from 'framer-motion'

const PERIOD_H = 68
const COL_W = 132

type DragMode = 'move' | 'resize-start' | 'resize-end'

interface DragState {
  mode: DragMode
  courseId: string
  session: Session
  startX: number
  startY: number
  dx: number
  dy: number
  target: { day: Weekday; startPeriod: number; endPeriod: number }
  moved: boolean
}

export interface TimetableProps {
  week: number
  showWeekend: boolean
  onOpenCourse: (courseId: string) => void
  onAddAt?: (day: Weekday, startPeriod: number, endPeriod: number) => void
}

export function Timetable({ week, showWeekend, onOpenCourse, onAddAt }: TimetableProps) {
  const courses = useApp((s) => s.courses)
  const periods = useApp((s) => s.periods)
  const settings = useApp((s) => s.settings)
  const setDragging = useApp((s) => s.setDragging)
  const placeSession = useApp((s) => s.placeSession)

  const days = showWeekend ? ([1, 2, 3, 4, 5, 6, 7] as Weekday[]) : ([1, 2, 3, 4, 5] as Weekday[])
  const [drag, setDrag] = useState<DragState | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const startDate = settings.semester.startDate
  const totalPeriods = periods.length || 13

  /* ---------------- 拖动逻辑 ---------------- */

  const beginDrag = (
    e: React.PointerEvent,
    course: Course,
    session: Session,
    mode: DragMode,
  ) => {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDrag({
      mode,
      courseId: course.id,
      session,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      target: { day: session.day, startPeriod: session.startPeriod, endPeriod: session.endPeriod },
      moved: false,
    })
  }

  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      const host = gridRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const moved = drag.moved || isDragGesture(dx, dy)

      const next = snapDrag({
        mode: drag.mode,
        session: drag.session,
        dx: drag.mode === 'move' ? dx : 0,
        dy,
        colWidth: rect.width / days.length,
        rowHeight: PERIOD_H,
        days,
        totalPeriods,
      })

      setDrag((d) => (d ? { ...d, dx, dy, moved, target: next } : d))
    }

    const onUp = () => {
      setDrag((d) => {
        if (!d) return null
        if (d.moved) {
          const t = d.target
          const changed =
            t.day !== d.session.day ||
            t.startPeriod !== d.session.startPeriod ||
            t.endPeriod !== d.session.endPeriod
          if (changed) {
            placeSession(d.courseId, d.session.id, t)
          }
        } else {
          onOpenCourse(d.courseId)
        }
        return null
      })
      setDragging(false)
      document.body.removeAttribute('data-dragging')
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    setDragging(true)
    document.body.setAttribute('data-dragging', 'true')
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.removeAttribute('data-dragging')
    }
  }, [drag, days, placeSession, setDragging, totalPeriods, onOpenCourse])

  /* ---------------- 当前时间线 ---------------- */

  const nowMin = useNowMinutes()
  const nowTop = useMemo(() => {
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i]
      const s = parseHM(p.start)
      const e = parseHM(p.end)
      if (nowMin >= s && nowMin <= e) {
        return (i + (nowMin - s) / Math.max(1, e - s)) * PERIOD_H
      }
    }
    return null
  }, [nowMin, periods])

  /* ---------------- 卡片数据 ---------------- */

  const cards = useMemo(() => {
    const out: { course: Course; session: Session }[] = []
    for (const c of courses) {
      if (c.archived) continue
      for (const s of c.sessions) {
        if (!sessionCoversWeek(s, week)) continue
        if (!days.includes(s.day)) continue
        out.push({ course: c, session: s })
      }
    }
    return out
  }, [courses, week, days])

  const hiddenThisWeek = useMemo(() => {
    let n = 0
    for (const c of courses) for (const s of c.sessions) if (!sessionCoversWeek(s, week)) n++
    return n
  }, [courses, week])

  const todayIdx = (() => {
    const d = new Date()
    const wd = d.getDay() === 0 ? 7 : d.getDay()
    const idx = days.indexOf(wd as Weekday)
    // 只有查看的是本周时才高亮
    const isCurrentWeek = useApp.getState().previewWeek == null
    return isCurrentWeek ? idx : -1
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 星期表头 */}
      <div className="sticky top-0 z-20 flex pr-1">
        <div className="w-[54px] flex-none" />
        <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
          {days.map((d) => {
            const date = dateOfWeekDay(startDate, Math.max(1, week), d)
            const isToday = todayIdx >= 0 && days[todayIdx] === d
            return (
              <div
                key={d}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-2xl py-2 transition-colors',
                  isToday ? 'bg-[#0A84FF] text-white shadow-[0_8px_20px_-10px_rgba(10,132,255,0.9)]' : 'text-ink-3',
                )}
              >
                <span className="text-[12.5px] font-semibold">{WEEKDAY_LABELS[d]}</span>
                <span className={clsx('tabular text-[11.5px]', isToday ? 'text-white/85' : 'text-ink-4')}>
                  {date.getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 网格主体 */}
      <div className="scroll-y mt-2 min-h-0 flex-1 pr-1">
        <div ref={gridRef} className="relative flex">
          {/* 节次轴 */}
          <div className="w-[54px] flex-none">
            {periods.map((p) => (
              <div key={p.index} className="flex flex-col items-end justify-center pr-2.5" style={{ height: PERIOD_H }}>
                <span className="tabular text-[12.5px] font-semibold text-ink-2">{p.index}</span>
                <span className="tabular text-[10px] leading-4 text-ink-4">{p.start}</span>
                <span className="tabular text-[10px] leading-4 text-ink-4">{p.end}</span>
              </div>
            ))}
          </div>

          {/* 课程区 */}
          <div className="relative flex-1">
            {/* 背景格 */}
            <div className="absolute inset-0 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
              {days.map((d) => (
                <div key={d} className="flex flex-col gap-1.5">
                  {periods.map((p) => (
                    <button
                      key={p.index}
                      type="button"
                      onDoubleClick={() => onAddAt?.(d, p.index, p.index)}
                      className={clsx(
                        'w-full rounded-[14px] border border-dashed border-transparent transition-colors',
                        todayIdx >= 0 && days[todayIdx] === d ? 'bg-[#0A84FF]/[0.045]' : 'bg-surface-1',
                        'hover:border-[#0A84FF]/35 hover:bg-[#0A84FF]/[0.07]',
                      )}
                      style={{ height: PERIOD_H - 6 }}
                      title="双击新建课程"
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* 吸附提示 */}
            {drag?.moved && (
              <motion.div
                layout
                className="snap-guide"
                transition={springSnappy}
                style={{
                  left: `calc(${((drag.target.day - 1) / days.length) * 100}% + 3px)`,
                  width: `calc(${(1 / days.length) * 100}% - 6px)`,
                  top: (drag.target.startPeriod - 1) * PERIOD_H + 3,
                  height: (drag.target.endPeriod - drag.target.startPeriod + 1) * PERIOD_H - 6,
                }}
              />
            )}

            {/* 课程卡片 */}
            {cards.map(({ course, session }) => {
              const isDragging = drag?.moved && drag.session.id === session.id
              const target = isDragging ? drag!.target : null

              const col = target ? target.day : session.day
              const top = target ? target.startPeriod : session.startPeriod
              const bottom = target ? target.endPeriod : session.endPeriod

              const baseLeft = `calc(${((col - 1) / days.length) * 100}% + 3px)`
              const baseWidth = `calc(${(1 / days.length) * 100}% - 6px)`
              const baseTop = (top - 1) * PERIOD_H + 3
              const baseHeight = (bottom - top + 1) * PERIOD_H - 6

              const color = colorOf(course.color)

              // 拖动 / 拉伸时的实时位移
              let transform: string | undefined
              let height = baseHeight
              let topPx = baseTop
              if (isDragging && drag) {
                if (drag.mode === 'move') {
                  transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(1.02)`
                } else if (drag.mode === 'resize-end') {
                  height = Math.max(PERIOD_H - 6, (drag.session.endPeriod - drag.session.startPeriod + 1) * PERIOD_H - 6 + drag.dy)
                } else {
                  const shift = Math.min(
                    drag.dy,
                    (drag.session.endPeriod - drag.session.startPeriod) * PERIOD_H,
                  )
                  topPx = baseTop + shift
                  height = Math.max(PERIOD_H - 6, (drag.session.endPeriod - drag.session.startPeriod + 1) * PERIOD_H - 6 - shift)
                }
              }

              return (
                <div
                  key={`${course.id}-${session.id}`}
                  className="tt-card absolute select-none"
                  data-dragging={isDragging}
                  data-dim={drag?.moved && !isDragging ? 'true' : 'false'}
                  data-now={isSameNow(session, nowMin, periods) ? 'true' : 'false'}
                  style={{
                    left: baseLeft,
                    width: baseWidth,
                    top: topPx,
                    height,
                    transform,
                    zIndex: isDragging ? 40 : 5,
                    background: `linear-gradient(160deg, ${color.from}, ${color.to})`,
                    borderColor: color.ring,
                    color: color.text,
                    cursor: 'grab',
                    transition: isDragging ? 'none' : 'top .22s cubic-bezier(.22,1,.36,1), height .22s cubic-bezier(.22,1,.36,1), left .22s cubic-bezier(.22,1,.36,1)',
                  }}
                  onPointerDown={(e) => beginDrag(e, course, session, 'move')}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    onOpenCourse(course.id)
                  }}
                >
                  <div className="flex h-full flex-col overflow-hidden">
                    <div className="line-clamp-2 text-[12.5px] font-semibold leading-[1.24]">{course.name}</div>
                    <div className="mt-1 space-y-0.5 text-[10.5px] leading-[1.35] opacity-80">
                      {(session.room ?? course.room) && (
                        <div className="flex items-center gap-1 truncate">
                          <Icon name="pin" size={10} />
                          <span className="truncate">{session.room ?? course.room}</span>
                        </div>
                      )}
                      {(session.teacher ?? course.teacher) && (
                        <div className="flex items-center gap-1 truncate">
                          <Icon name="user" size={10} />
                          <span className="truncate">{session.teacher ?? course.teacher}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-auto flex items-center gap-1 pt-1 text-[9.5px] font-medium opacity-65">
                      <Icon name="clock" size={9} />
                      <span className="truncate">{weekRangeText(session.weeks)}</span>
                    </div>
                  </div>

                  {/* 顶部拉伸把手 */}
                  <div
                    className="resize-handle top"
                    onPointerDown={(e) => beginDrag(e, course, session, 'resize-start')}
                  />
                  <div
                    className="resize-handle bottom"
                    onPointerDown={(e) => beginDrag(e, course, session, 'resize-end')}
                  />
                </div>
              )
            })}

            {/* 当前时间线 */}
            {nowTop != null && todayIdx >= 0 && (
              <div
                className="now-line"
                style={{
                  top: nowTop,
                  left: `calc(${(todayIdx / days.length) * 100}% )`,
                  width: `calc(${(1 / days.length) * 100}%)`,
                }}
              />
            )}
          </div>
        </div>

        {cards.length === 0 && (
          <div className="grid place-items-center py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-ink-4">
              <Icon name="calendar" size={22} />
            </div>
            <div className="mt-3 text-[14px] font-semibold text-ink-2">这一周还没有课程</div>
            <div className="mt-1 text-[12px] text-ink-4">
              导入 Excel 课表，或双击空白格手动添加
            </div>
          </div>
        )}

        {hiddenThisWeek > 0 && cards.length > 0 && (
          <div className="px-2 pb-4 pt-3 text-center text-[11px] text-ink-4">
            另有 {hiddenThisWeek} 个时段不在第 {week} 周上课
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function useNowMinutes(): number {
  const [m, setM] = useState(() => new Date().getHours() * 60 + new Date().getMinutes())
  useEffect(() => {
    const t = window.setInterval(() => {
      const d = new Date()
      setM(d.getHours() * 60 + d.getMinutes())
    }, 30000)
    return () => window.clearInterval(t)
  }, [])
  return m
}

function isSameNow(session: Session, nowMin: number, periods: { index: number; start: string; end: string }[]): boolean {
  const a = periods.find((p) => p.index === session.startPeriod)
  const b = periods.find((p) => p.index === session.endPeriod)
  if (!a) return false
  const s = parseHM(a.start)
  const e = parseHM(b?.end ?? a.end)
  return nowMin >= s && nowMin <= e
}

export { COL_W }
