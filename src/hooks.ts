import { useEffect, useRef, useState } from 'react'
import { useApp, dateOfWeekDay } from './store'
import { isWindowFocused, notify, playChime } from './lib/notify'
import { toast } from './lib/toast'
import { WEEKDAY_LABELS } from './types'
import type { Weekday } from './types'
import {
  humanLeft,
  parseHM,
  sessionCoversWeek,
  sessionTimeRange,
  weekIndexOf,
} from './lib/time'

/** 每 N 秒刷新一次的“当前时间” */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export interface UpcomingClass {
  courseId: string
  sessionId: string
  name: string
  room?: string
  teacher?: string
  day: number
  startPeriod: number
  endPeriod: number
  /** 今天的上课时间 */
  start: Date
  end: Date
  minutesUntil: number
}

/** 计算「今天」剩余与已开始的课程 */
export function useTodayClasses(now: Date) {
  const courses = useApp((s) => s.courses)
  const periods = useApp((s) => s.periods)
  const settings = useApp((s) => s.settings)

  const week = weekIndexOf(settings.semester.startDate, now)
  const weekday = now.getDay() === 0 ? 7 : now.getDay()

  const list: UpcomingClass[] = []
  for (const c of courses) {
    for (const s of c.sessions) {
      if (s.day !== weekday) continue
      if (!sessionCoversWeek(s, week)) continue
      const range = sessionTimeRange(s, periods)
      const start = new Date(now)
      start.setHours(Math.floor(range.start / 60), range.start % 60, 0, 0)
      const end = new Date(now)
      end.setHours(Math.floor(range.end / 60), range.end % 60, 0, 0)
      list.push({
        courseId: c.id,
        sessionId: s.id,
        name: c.name,
        room: s.room ?? c.room,
        teacher: s.teacher ?? c.teacher,
        day: s.day,
        startPeriod: s.startPeriod,
        endPeriod: s.endPeriod,
        start,
        end,
        minutesUntil: Math.round((start.getTime() - now.getTime()) / 60000),
      })
    }
  }
  list.sort((a, b) => a.start.getTime() - b.start.getTime())
  return { list, week, weekday }
}

/** 当前是否在某一节课内 */
export function findCurrentClass(list: UpcomingClass[], now: Date) {
  return list.find((x) => now >= x.start && now <= x.end) ?? null
}

/* ------------------------------------------------------------------ */
/* 提醒引擎                                                            */
/* ------------------------------------------------------------------ */

const firedKeys = new Set<string>()
let firedDay = ''

function firedKey(kind: string, id: string, extra = '') {
  return `${kind}:${id}:${extra}`
}

/** 跨天时清空已提醒记录，避免 Set 无限增长 */
function rollDay(now: Date) {
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  if (day !== firedDay) {
    firedDay = day
    firedKeys.clear()
  }
}

/**
 * 每 tickSeconds 检查一次：
 *  1. 即将开课（提前 N 分钟）→ 应用内横幅 + 系统通知 + 提示音
 *  2. 待办 DDL 临期 / 逾期 → 提醒
 */
export function useReminderEngine() {
  const settings = useApp((s) => s.settings)
  const courses = useApp((s) => s.courses)
  const todos = useApp((s) => s.todos)
  const periods = useApp((s) => s.periods)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      const cfg = useApp.getState().settings.reminders
      if (!cfg.enabled) return
      const now = new Date()
      rollDay(now)
      const week = weekIndexOf(useApp.getState().settings.semester.startDate, now)
      const weekday = now.getDay() === 0 ? 7 : now.getDay()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`

      // ---- 开课提醒 ----
      for (const c of courses) {
        if (c.archived) continue
        for (const s of c.sessions) {
          if (s.day !== weekday) continue
          if (s.remind === false) continue
          if (!sessionCoversWeek(s, week)) continue
          const first = periods.find((p) => p.index === s.startPeriod)
          if (!first) continue
          const startMin = parseHM(first.start)
          const delta = startMin - nowMin
          if (delta < 0 || delta > cfg.leadMinutes) continue
          const key = firedKey('class', `${c.id}/${s.id}`, `${todayKey}/${s.startPeriod}`)
          if (firedKeys.has(key)) continue
          firedKeys.add(key)

          const when = delta <= 0 ? '现在开始上课' : `${delta} 分钟后上课`
          const where = s.room ?? c.room ?? '未填地点'
          if (cfg.sound) playChime('bell')
          if (cfg.inApp) {
            toast(`⏰ ${c.name}`, {
              desc: `${when} · 第 ${s.startPeriod}-${s.endPeriod} 节 · ${where}`,
              tone: 'warn',
              duration: 12000,
              action: { label: '查看课程', onClick: () => useApp.getState().selectCourse(c.id) },
            })
          }
          const focused = await isWindowFocused()
          if (cfg.system && (!focused || !cfg.inApp)) {
            void notify(`${c.name} · ${when}`, `第 ${s.startPeriod}-${s.endPeriod} 节 · ${where}`)
          }
        }
      }

      // ---- DDL 提醒 ----
      for (const t of todos) {
        if (t.done || t.archived || !t.dueAt) continue
        const due = new Date(t.dueAt)
        if (Number.isNaN(due.getTime())) continue
        const ms = due.getTime() - now.getTime()
        const hours = ms / 3600000
        // 只提醒「刚到期」的：逾期超过 12 小时就不再打扰
        if (ms < -12 * 3600000) continue
        const stage = ms < 0 ? 'over' : hours <= 1 ? 'h1' : hours <= 24 ? 'h24' : null
        if (!stage) continue
        const key = firedKey('todo', t.id, stage)
        if (firedKeys.has(key)) continue
        firedKeys.add(key)
        if (cfg.sound) playChime('bell')
        if (cfg.inApp) {
          toast(`📌 ${t.title}`, {
            desc: ms < 0 ? `已逾期 ${humanLeft(ms)}` : `${humanLeft(ms)}后到期`,
            tone: ms < 0 ? 'error' : 'warn',
            duration: 12000,
          })
        }
        const focused = await isWindowFocused()
        if (cfg.system && (!focused || !cfg.inApp)) {
          void notify(
            ms < 0 ? `已逾期：${t.title}` : `即将到期：${t.title}`,
            `${due.getMonth() + 1}月${due.getDate()}日 ${String(due.getHours()).padStart(2, '0')}:${String(
              due.getMinutes(),
            ).padStart(2, '0')} 截止`,
          )
        }
      }
    }

    void tick()
    const ms = Math.max(10, settings.tickSeconds) * 1000
    const timer = window.setInterval(() => {
      if (!cancelled) void tick()
    }, ms)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [settings.tickSeconds, settings.reminders, courses, todos, periods])
}

/* ------------------------------------------------------------------ */
/* 今日课程日期                                                        */
/* ------------------------------------------------------------------ */

export function useTodayLabel(now: Date) {
  const settings = useApp((s) => s.settings)
  const week = weekIndexOf(settings.semester.startDate, now)
  const weekday = (now.getDay() === 0 ? 7 : now.getDay()) as Weekday
  const date = dateOfWeekDay(settings.semester.startDate, Math.max(1, week), weekday)
  return {
    week,
    weekday,
    date,
    text: `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAY_LABELS[weekday]}`,
  }
}

/** 用于动画的「刚变化」标记 */
export function useFlashOnChange<T>(value: T, ms = 800): boolean {
  const [flash, setFlash] = useState(false)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setFlash(true)
    const t = window.setTimeout(() => setFlash(false), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return flash
}
