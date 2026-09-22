import { useMemo } from 'react'
import clsx from 'clsx'
import { useApp, dateOfWeekDay } from '../store'
import type { Course, Weekday } from '../types'
import { WEEKDAY_LABELS } from '../types'
import { colorOf } from '../lib/palette'
import { dateKey, parseHM, sessionCoversWeek } from '../lib/time'
import { Icon } from './ui'

/* ================================================================== */
/* 月视图                                                             */
/* ================================================================== */

export function MonthView({
  week,
  showWeekend,
  onOpenCourse,
}: {
  week: number
  showWeekend: boolean
  onOpenCourse: (courseId: string) => void
}) {
  const courses = useApp((s) => s.courses)
  const periods = useApp((s) => s.periods)
  const settings = useApp((s) => s.settings)
  const todayKey = dateKey(new Date())
  const days: Weekday[] = showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]

  /** 该教学周每天要上的课 */
  const byDay = useMemo(() => {
    const map = new Map<Weekday, { course: Course; startPeriod: number; endPeriod: number; startHM: string }[]>()
    for (const d of days) map.set(d, [])
    for (const c of courses) {
      if (c.archived) continue
      for (const s of c.sessions) {
        if (!days.includes(s.day)) continue
        if (!sessionCoversWeek(s, week)) continue
        map.get(s.day)!.push({
          course: c,
          startPeriod: s.startPeriod,
          endPeriod: s.endPeriod,
          startHM: periods.find((p) => p.index === s.startPeriod)?.start ?? '',
        })
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => parseHM(a.startHM) - parseHM(b.startHM))
    return map
  }, [courses, days, week, periods])

  const weekMinutes = useMemo(() => {
    let total = 0
    for (const arr of byDay.values()) {
      for (const x of arr) {
        const a = periods.find((p) => p.index === x.startPeriod)
        const b = periods.find((p) => p.index === x.endPeriod)
        if (a && b) total += parseHM(b.end) - parseHM(a.start)
      }
    }
    return total
  }, [byDay, periods])

  const totalSessions = [...byDay.values()].reduce((a, b) => a + b.length, 0)

  return (
    <div className="scroll-y min-h-0 flex-1 pr-1">
      <div className="mb-2 flex items-center gap-3 text-[11.5px] text-ink-3">
        <span className="font-semibold text-ink-2">第 {week} 教学周</span>
        <span>{totalSessions} 节课</span>
        <span>
          共 {Math.floor(weekMinutes / 60)} 小时 {weekMinutes % 60} 分
        </span>
      </div>

      <div className={clsx('grid gap-2', showWeekend ? 'grid-cols-7' : 'grid-cols-5')}>
        {days.map((d) => {
          const date = dateOfWeekDay(settings.semester.startDate, Math.max(1, week), d)
          const isToday = dateKey(date) === todayKey
          const items = byDay.get(d) ?? []
          return (
            <div
              key={d}
              className="month-cell flex min-h-[240px] flex-col gap-1.5 p-2"
              data-today={isToday}
            >
              <div className="flex items-baseline justify-between px-0.5">
                <span className={clsx('text-[12px] font-bold', isToday ? 'text-[#0A84FF]' : 'text-ink-2')}>
                  {WEEKDAY_LABELS[d]}
                </span>
                <span className={clsx('tabular text-[11px]', isToday ? 'text-[#0A84FF]' : 'text-ink-4')}>
                  {date.getMonth() + 1}/{date.getDate()}
                </span>
              </div>

              {items.length === 0 ? (
                <div className="grid flex-1 place-items-center text-[10.5px] text-ink-4">无课</div>
              ) : (
                <div className="space-y-1">
                  {items.map((x, i) => {
                    const color = colorOf(x.course.color)
                    return (
                      <button
                        key={`${x.course.id}-${x.startPeriod}-${i}`}
                        onClick={() => onOpenCourse(x.course.id)}
                        className="w-full overflow-hidden rounded-[10px] border px-1.5 py-1 text-left transition-transform hover:scale-[1.02]"
                        style={{
                          background: `linear-gradient(150deg, ${color.from}, ${color.to})`,
                          borderColor: color.ring,
                          color: color.text,
                        }}
                        title={`${x.course.name} · 第 ${x.startPeriod}-${x.endPeriod} 节`}
                      >
                        <div className="tabular text-[9.5px] font-bold opacity-75">
                          {x.startHM} · {x.startPeriod}
                          {x.endPeriod !== x.startPeriod ? `-${x.endPeriod}` : ''}节
                        </div>
                        <div className="truncate text-[11px] font-semibold leading-tight">{x.course.name}</div>
                        {(x.course.room || x.course.teacher) && (
                          <div className="truncate text-[9.5px] opacity-70">{x.course.room ?? x.course.teacher}</div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ================================================================== */
/* 学期视图                                                           */
/* ================================================================== */

export function TermView({
  onOpenCourse,
  onPickWeek,
}: {
  onOpenCourse: (courseId: string) => void
  onPickWeek: (week: number) => void
}) {
  const courses = useApp((s) => s.courses)
  const settings = useApp((s) => s.settings)
  const totalWeeks = Math.max(1, settings.semester.totalWeeks)
  const days: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
  const todayKey = dateKey(new Date())

  /** week -> day -> 课程 */
  const matrix = useMemo(() => {
    const grid: { course: Course; startPeriod: number; endPeriod: number }[][][] = []
    for (let w = 1; w <= totalWeeks; w++) {
      const row: { course: Course; startPeriod: number; endPeriod: number }[][] = []
      for (let d = 1; d <= 7; d++) row.push([])
      for (const c of courses) {
        if (c.archived) continue
        for (const s of c.sessions) {
          if (!sessionCoversWeek(s, w)) continue
          row[s.day - 1].push({ course: c, startPeriod: s.startPeriod, endPeriod: s.endPeriod })
        }
      }
      grid.push(row)
    }
    return grid
  }, [courses, totalWeeks])

  /** 每周的课时数，用于热力条 */
  const perWeek = useMemo(
    () => matrix.map((row) => row.reduce((acc, arr) => acc + arr.length, 0)),
    [matrix],
  )
  const maxPerWeek = Math.max(1, ...perWeek)

  /** 每门课的总时段数 */
  const courseStats = useMemo(() => {
    const stats = courses
      .filter((c) => !c.archived)
      .map((c) => ({
        course: c,
        sessions: c.sessions.length,
        weeks: new Set(c.sessions.flatMap((s) => (s.weeks.length ? s.weeks : []))).size,
      }))
    return stats.sort((a, b) => b.sessions - a.sessions)
  }, [courses])

  const currentWeek = useMemo(() => {
    const now = new Date()
    const monday = new Date(now)
    const wd = monday.getDay() === 0 ? 7 : monday.getDay()
    monday.setDate(monday.getDate() - (wd - 1))
    const start = new Date(settings.semester.startDate)
    const startMonday = new Date(start)
    const swd = startMonday.getDay() === 0 ? 7 : startMonday.getDay()
    startMonday.setDate(startMonday.getDate() - (swd - 1))
    return Math.floor((monday.getTime() - startMonday.getTime()) / (7 * 86400000)) + 1
  }, [settings.semester.startDate])

  return (
    <div className="scroll-y min-h-0 flex-1 pr-1">
      <div className="grid grid-cols-[1fr_248px] gap-3">
        {/* 周 × 星期 矩阵 */}
        <div className="glass rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12.5px] font-bold">全学期一览</h3>
            <span className="text-[11px] text-ink-4">点击某一周可跳到周视图 · 点击课程块看详情</span>
          </div>

          {/* 星期表头 */}
          <div className="mb-1 grid grid-cols-[36px_1fr_repeat(7,minmax(0,1fr))] gap-1 px-0.5">
            <span />
            <span className="text-[10px] font-semibold text-ink-4">周</span>
            {days.map((d) => (
              <span key={d} className="text-center text-[10.5px] font-semibold text-ink-3">
                {WEEKDAY_LABELS[d]}
              </span>
            ))}
          </div>

          <div className="space-y-1">
            {matrix.map((row, wi) => {
              const w = wi + 1
              const isNow = w === currentWeek
              return (
                <div
                  key={w}
                  className={clsx(
                    'grid grid-cols-[36px_1fr_repeat(7,minmax(0,1fr))] items-center gap-1 rounded-xl px-0.5 py-0.5',
                    isNow && 'bg-[#0A84FF]/[0.08]',
                  )}
                >
                  <button
                    className={clsx(
                      'tabular rounded-lg py-1 text-[11px] font-bold transition-colors',
                      isNow ? 'bg-[#0A84FF] text-white' : 'text-ink-3 hover:bg-surface-2',
                    )}
                    onClick={() => onPickWeek(w)}
                    title={`跳到第 ${w} 周`}
                  >
                    {w}
                  </button>

                  {/* 热力条 */}
                  <div className="mx-1 h-1.5 overflow-hidden rounded-full bg-surface-1">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#3AA0FF] to-[#0A84FF]"
                      style={{ width: `${(perWeek[wi] / maxPerWeek) * 100}%` }}
                    />
                  </div>

                  {row.map((arr, di) => (
                    <div key={di} className="flex min-h-[22px] items-center justify-center gap-0.5">
                      {arr.slice(0, 5).map((x, i) => {
                        const color = colorOf(x.course.color)
                        return (
                          <button
                            key={`${x.course.id}-${i}`}
                            onClick={() => onOpenCourse(x.course.id)}
                            className="h-[14px] w-[7px] flex-none rounded-full transition-transform hover:scale-y-150"
                            style={{ background: color.solid }}
                            title={`${x.course.name} · ${WEEKDAY_LABELS[days[di]]} 第 ${x.startPeriod}-${x.endPeriod} 节`}
                          />
                        )
                      })}
                      {arr.length > 5 && <span className="text-[9px] text-ink-4">+{arr.length - 5}</span>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* 课程统计 */}
        <div className="space-y-3">
          <div className="glass rounded-2xl p-3">
            <h3 className="mb-2 text-[12.5px] font-bold">课程清单</h3>
            {courseStats.length === 0 ? (
              <div className="py-6 text-center text-[11.5px] text-ink-4">还没有课程</div>
            ) : (
              <div className="space-y-1.5">
                {courseStats.map(({ course, sessions, weeks }) => {
                  const color = colorOf(course.color)
                  return (
                    <button
                      key={course.id}
                      onClick={() => onOpenCourse(course.id)}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-1"
                    >
                      <span className="h-6 w-1.5 flex-none rounded-full" style={{ background: color.solid }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold">{course.name}</span>
                        <span className="block text-[10px] text-ink-4">
                          {sessions} 个时段{weeks > 0 ? ` · 覆盖 ${weeks} 周` : ' · 每周'}
                          {course.teacher ? ` · ${course.teacher}` : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-3">
            <h3 className="mb-2 text-[12.5px] font-bold">学期进度</h3>
            <div className="flex items-baseline gap-2">
              <span className="tabular text-[26px] font-bold leading-none text-ink">{currentWeek}</span>
              <span className="text-[11.5px] text-ink-3">/ {totalWeeks} 周</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3AA0FF] to-[#0A84FF] transition-[width] duration-500"
                style={{ width: `${Math.min(100, (currentWeek / totalWeeks) * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10.5px] text-ink-4">
              <Icon name="calendar" size={11} />
              开学 {settings.semester.startDate}
            </div>
            <div className="mt-1 text-[10.5px] text-ink-4">
              今天 {todayKey.split('-')[1]}/{todayKey.split('-')[2]} · 共 {courses.length} 门课
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
