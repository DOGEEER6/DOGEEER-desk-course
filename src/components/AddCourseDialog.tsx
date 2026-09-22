import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { useApp } from '../store'
import type { Weekday } from '../types'
import { COURSE_PALETTE, colorOf } from '../lib/palette'
import { pad2 } from '../lib/time'
import { Icon, Overlay, springSoft } from './ui'
import { toast } from '../lib/toast'

/** 起止节次 + 星期，允许同时挂到多个星期 */
export interface DraftSlot {
  day: Weekday
  startPeriod: number
  endPeriod: number
}

export interface CourseDraft {
  name: string
  teacher?: string
  room?: string
  credit?: string
  color: number
  weeks: number[]
  /** 0 = 每周 */
  slots: DraftSlot[]
}

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/**
 * 添加课程：填名称 / 教师 / 地点 / 周次 / 节次 / 配色，
 * 确认后课程进入「未排课」托盘，由用户拖到课表合适位置。
 */
export function AddCourseDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (courseId: string) => void
}) {
  const periods = useApp((s) => s.periods)
  const settings = useApp((s) => s.settings)
  const addCourse = useApp((s) => s.addCourse)
  const totalWeeks = Math.max(1, settings.semester.totalWeeks)

  const [name, setName] = useState('')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')
  const [credit, setCredit] = useState('')
  const [color, setColor] = useState(0)
  const [weeks, setWeeks] = useState<number[]>([])
  const [draft, setDraft] = useState<DraftSlot | null>(null)
  const [dragSel, setDragSel] = useState<{ day: Weekday; anchor: number; tip: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  /** 打开时重置 */
  useEffect(() => {
    if (!open) return
    setName('')
    setTeacher('')
    setRoom('')
    setCredit('')
    setColor(Math.floor(Math.random() * COURSE_PALETTE.length))
    setWeeks([])
    setDraft(null)
    setDragSel(null)
  }, [open])

  /** 在预览网格里按下并拖动选择时段 */
  const dayFromEvent = (clientX: number): Weekday | null => {
    const host = gridRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    const idx = Math.floor(((clientX - rect.left) / rect.width) * 7)
    if (idx < 0 || idx > 6) return null
    return (idx + 1) as Weekday
  }
  const periodFromEvent = (clientY: number): number | null => {
    const host = gridRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    const rowH = rect.height / periods.length
    const idx = Math.floor((clientY - rect.top) / rowH)
    if (idx < 0 || idx >= periods.length) return null
    return periods[idx].index
  }

  useEffect(() => {
    if (!dragSel) return
    const onMove = (e: PointerEvent) => {
      const p = periodFromEvent(e.clientY)
      if (p == null) return
      setDragSel((d) => (d ? { ...d, tip: p } : d))
    }
    const onUp = () => {
      setDragSel((d) => {
        if (d) {
          setDraft({
            day: d.day,
            startPeriod: Math.min(d.anchor, d.tip),
            endPeriod: Math.max(d.anchor, d.tip),
          })
        }
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragSel, periods])

  const weeksText = useMemo(() => {
    if (weeks.length === 0) return `每周（1-${totalWeeks}）`
    const sorted = [...weeks].sort((a, b) => a - b)
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
  }, [weeks, totalWeeks])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('请先填写课程名称', { tone: 'warn' })
      return
    }
    const slots: DraftSlot[] = draft ? [draft] : []
    const id = addCourse({
      name: trimmed,
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      credit: credit.trim() || undefined,
      color,
      sessions: slots.map((s) => ({
        day: s.day,
        startPeriod: s.startPeriod,
        endPeriod: s.endPeriod,
        weeks,
        draft: true,
      })),
      notes: '',
    })
    toast('课程已创建', {
      desc: draft
        ? '已放入「未排课时段」，把它拖到课表上即可排好'
        : '还没有排时间，从「未排课时段」拖到课表上即可',
      tone: 'success',
      duration: 5000,
    })
    onCreated(id)
    onClose()
  }

  if (!open) return null
  const c = colorOf(color)

  return (
    <Overlay open onClose={onClose} align="center">
      <div className="flex max-h-[92vh] w-[760px] max-w-[94vw] flex-col overflow-hidden rounded-[26px] border border-glass-line bg-glass shadow-[var(--sh-float)] backdrop-blur-2xl">
        {/* 头部 */}
        <div className="flex flex-none items-center gap-3 border-b border-line px-5 py-3.5">
          <div
            className="grid h-9 w-9 flex-none place-items-center rounded-xl text-white"
            style={{ background: c.solid }}
          >
            <Icon name="plus" size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15.5px] font-bold tracking-[-0.02em]">添加课程</h3>
            <p className="text-[11.5px] text-ink-3">
              填好信息后，把课程拖到课表的任意位置即可完成排课
            </p>
          </div>
          <button className="btn h-8 w-8 bg-surface-2 text-ink-2" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="scroll-y flex min-h-0 flex-1 gap-5 p-5">
          {/* 左：表单 */}
          <div className="w-[300px] flex-none space-y-3.5">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">
                课程名称 <span className="text-[#FF3B30]">*</span>
              </span>
              <input
                autoFocus
                className="field text-[14px]"
                placeholder="例如：操作系统"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">教师</span>
                <input className="field" placeholder="选填" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">地点</span>
                <input className="field" placeholder="选填" value={room} onChange={(e) => setRoom(e.target.value)} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">学分</span>
              <input className="field" placeholder="选填，如 3.0" value={credit} onChange={(e) => setCredit(e.target.value)} />
            </label>

            {/* 配色 */}
            <div>
              <span className="mb-1.5 block text-[11.5px] font-semibold text-ink-3">卡片配色</span>
              <div className="flex flex-wrap gap-1.5">
                {COURSE_PALETTE.map((p, i) => (
                  <button
                    key={p.name}
                    className={clsx(
                      'h-6 w-6 rounded-full transition-transform',
                      color === i ? 'scale-110 ring-2 ring-ink-4 ring-offset-1 ring-offset-transparent' : 'hover:scale-110',
                    )}
                    style={{ background: p.solid, opacity: color === i ? 1 : 0.72 }}
                    onClick={() => setColor(i)}
                    aria-label={p.name}
                  />
                ))}
              </div>
            </div>

            {/* 周次 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-ink-3">上课周次</span>
                <span className="text-[10.5px] text-ink-4">{weeksText}</span>
              </div>
              <div className="grid grid-cols-8 gap-1">
                <button
                  className={clsx(
                    'tabular col-span-2 rounded-lg py-1.5 text-[11px] font-semibold transition-colors',
                    weeks.length === 0 ? 'bg-[#0A84FF] text-white' : 'bg-surface-1 text-ink-3 hover:bg-surface-2',
                  )}
                  onClick={() => setWeeks([])}
                >
                  每周
                </button>
                {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => {
                  const on = weeks.includes(w)
                  return (
                    <button
                      key={w}
                      className={clsx(
                        'tabular rounded-lg py-1.5 text-[11px] font-semibold transition-colors',
                        on ? 'bg-[#0A84FF] text-white' : 'bg-surface-1 text-ink-3 hover:bg-surface-2',
                      )}
                      onClick={() =>
                        setWeeks((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w].sort((a, b) => a - b)))
                      }
                    >
                      {w}
                    </button>
                  )
                })}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  className="btn h-7 bg-surface-1 px-2.5 text-[11px]"
                  onClick={() => setWeeks(Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => w % 2 === 1))}
                >
                  单周
                </button>
                <button
                  className="btn h-7 bg-surface-1 px-2.5 text-[11px]"
                  onClick={() => setWeeks(Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => w % 2 === 0))}
                >
                  双周
                </button>
              </div>
            </div>
          </div>

          {/* 右：时段选择 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-ink-3">
                上课时段
                <span className="ml-2 font-normal text-ink-4">在右侧网格里按住拖动选择，也可以先跳过</span>
              </span>
              {draft && (
                <span className="rounded-full bg-[#0A84FF]/12 px-2 py-[2px] text-[10.5px] font-bold text-[#0A84FF]">
                  周{DAY_LABELS[draft.day - 1]} 第 {draft.startPeriod}-{draft.endPeriod} 节
                </span>
              )}
            </div>

            <div className="flex min-h-0 flex-1 gap-2">
              {/* 节次轴 */}
              <div className="flex w-[46px] flex-none flex-col pt-[22px]">
                {periods.map((p) => (
                  <div
                    key={p.index}
                    className="flex flex-1 flex-col items-end justify-center pr-1.5"
                    style={{ minHeight: 22 }}
                  >
                    <span className="tabular text-[10.5px] font-semibold text-ink-3">{p.index}</span>
                    <span className="tabular text-[9px] text-ink-4">{p.start}</span>
                  </div>
                ))}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                {/* 星期表头 */}
                <div className="grid flex-none grid-cols-7 gap-1 pb-1">
                  {DAY_LABELS.map((d) => (
                    <div key={d} className="text-center text-[11px] font-semibold text-ink-3">
                      周{d}
                    </div>
                  ))}
                </div>

                {/* 网格 */}
                <div
                  ref={gridRef}
                  className="scroll-y relative grid min-h-0 flex-1 grid-cols-7 gap-1 rounded-2xl bg-surface-1 p-1.5"
                  style={{ touchAction: 'none' }}
                >
                  {periods.map((p) => (
                    <div key={p.index} className="col-span-7 grid grid-cols-7 gap-1">
                      {DAY_LABELS.map((_, di) => {
                        const day = (di + 1) as Weekday
                        const inDraft =
                          draft && draft.day === day && p.index >= draft.startPeriod && p.index <= draft.endPeriod
                        const inDrag =
                          dragSel && dragSel.day === day && p.index >= Math.min(dragSel.anchor, dragSel.tip) && p.index <= Math.max(dragSel.anchor, dragSel.tip)
                        return (
                          <div
                            key={di}
                            className={clsx(
                              'rounded-lg transition-colors',
                              inDraft || inDrag ? '' : 'bg-surface-2 hover:bg-surface-3',
                            )}
                            style={{
                              minHeight: 22,
                              background: inDraft || inDrag ? c.solid : undefined,
                              opacity: inDraft || inDrag ? 0.85 : undefined,
                              cursor: 'crosshair',
                            }}
                            onPointerDown={(e) => {
                              const day2 = dayFromEvent(e.clientX) ?? day
                              const per = periodFromEvent(e.clientY) ?? p.index
                              setDraft(null)
                              setDragSel({ day: day2, anchor: per, tip: per })
                            }}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-4">
              <Icon name="grip" size={12} />
              提示：确认后会进入课表上方的「未排课时段」，拖到课表任意位置即可自动吸附
              {draft && (
                <button className="btn ml-auto h-7 bg-surface-1 px-2.5 text-[11px]" onClick={() => setDraft(null)}>
                  清除时段
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex flex-none items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <span className="text-[11.5px] text-ink-4">
            {draft ? `将创建 1 个时段：周${DAY_LABELS[draft.day - 1]} 第 ${draft.startPeriod}-${draft.endPeriod} 节` : '未选择时段，创建后可拖放排课'}
          </span>
          <div className="flex gap-2">
            <button className="btn btn-ghost h-9 px-4 text-[12.5px]" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary h-9 px-5 text-[12.5px] disabled:opacity-40" disabled={!name.trim()} onClick={submit}>
              创建课程
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/**
 * 未排课时段托盘：展示所有 draft 状态的时段，可拖到课表上。
 */
export function DraftTray({
  onOpenCourse,
  onDragStart,
}: {
  onOpenCourse: (courseId: string) => void
  onDragStart: (payload: { courseId: string; sessionId: string; label: string }) => void
}) {
  const courses = useApp((s) => s.courses)
  const removeSession = useApp((s) => s.removeSession)

  const drafts = useMemo(() => {
    const out: { courseId: string; sessionId: string; name: string; color: number; weeks: number[]; startPeriod: number; endPeriod: number }[] = []
    for (const c of courses) {
      if (c.archived) continue
      for (const s of c.sessions) {
        if (!s.draft) continue
        out.push({
          courseId: c.id,
          sessionId: s.id,
          name: c.name,
          color: c.color,
          weeks: s.weeks,
          startPeriod: s.startPeriod,
          endPeriod: s.endPeriod,
        })
      }
    }
    return out
  }, [courses])

  if (drafts.length === 0) return null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={springSoft}
      className="mb-2 flex-none overflow-hidden rounded-2xl border border-dashed border-[#0A84FF]/45 bg-[#0A84FF]/[0.06] px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <Icon name="grip" size={13} className="flex-none text-[#0A84FF]" />
        <span className="flex-none text-[11.5px] font-bold text-[#0A84FF]">未排课时段</span>
        <span className="flex-none text-[11px] text-ink-3">把这些课程拖到下面的课表上，或点右侧 ✕ 删除</span>
      </div>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
        {drafts.map((d) => {
          const color = colorOf(d.color)
          return (
            <div
              key={d.sessionId}
              className="group flex flex-none cursor-grab items-center gap-2 rounded-xl border px-2.5 py-1.5 active:cursor-grabbing"
              style={{
                background: `linear-gradient(150deg, ${color.from}, ${color.to})`,
                borderColor: color.ring,
                color: color.text,
              }}
              data-testid={`draft-${d.sessionId}`}
              onPointerDown={(e) => {
                onDragStart({
                  courseId: d.courseId,
                  sessionId: d.sessionId,
                  label: d.name,
                })
                // 把指针位置一并传出去，方便课表侧立即进入拖动态
                ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
              }}
              onDoubleClick={() => onOpenCourse(d.courseId)}
              title="拖到课表上排课，双击打开课程详情"
            >
              <span className="h-4 w-1 flex-none rounded-full" style={{ background: color.solid }} />
              <span className="text-[12px] font-semibold">{d.name}</span>
              <span className="tabular text-[10px] opacity-70">
                {d.startPeriod === d.endPeriod ? `${d.startPeriod} 节` : `${d.startPeriod}-${d.endPeriod} 节`}
              </span>
              <button
                className="grid h-4 w-4 flex-none place-items-center rounded-full opacity-0 transition-opacity hover:bg-black/15 group-hover:opacity-100"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeSession(d.courseId, d.sessionId)}
                title="删除这个未排课时段"
                aria-label="删除"
              >
                <Icon name="close" size={9} />
              </button>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

export { pad2 }
