import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { useApp } from '../store'
import type { Session, Weekday } from '../types'
import { COURSE_PALETTE, colorOf } from '../lib/palette'
import { sessionTimeRange, weekRangeText } from '../lib/time'
import { Icon, Segmented, springSoft } from './ui'

type Tab = 'info' | 'notes' | 'work'

export function CourseDrawer({
  courseId,
  onClose,
}: {
  courseId: string | null
  onClose: () => void
}) {
  const course = useApp((s) => s.courses.find((c) => c.id === courseId) ?? null)
  const periods = useApp((s) => s.periods)
  const updateCourse = useApp((s) => s.updateCourse)
  const removeCourse = useApp((s) => s.removeCourse)
  const updateSession = useApp((s) => s.updateSession)
  const removeSession = useApp((s) => s.removeSession)
  const addSession = useApp((s) => s.addSession)
  const addTodo = useApp((s) => s.addTodo)
  const todos = useApp((s) => s.todos)
  const toggleTodo = useApp((s) => s.toggleTodo)

  const [tab, setTab] = useState<Tab>('info')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newWork, setNewWork] = useState('')

  useEffect(() => {
    if (!course) return
    setName(course.name)
    setNotes(course.notes ?? '')
    setConfirmDelete(false)
    setTab('info')
  }, [course?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 备忘录自动保存（防抖）
  useEffect(() => {
    if (!course) return
    if ((course.notes ?? '') === notes) return
    const t = window.setTimeout(() => updateCourse(course.id, { notes }), 500)
    return () => window.clearTimeout(t)
  }, [notes, course, updateCourse])

  const related = useMemo(
    () => (course ? todos.filter((t) => t.courseId === course.id) : []),
    [todos, course],
  )

  if (!course) return null
  const color = colorOf(course.color)

  return (
    <div className="glass flex h-full w-[420px] max-w-[92vw] flex-col overflow-hidden rounded-l-[26px] border-r-0">
      {/* 头部 */}
      <div
        className="relative flex-none px-6 pb-5 pt-6"
        style={{ background: `linear-gradient(150deg, ${color.from}, ${color.to})` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <input
              className="w-full truncate border-none bg-transparent text-[21px] font-bold tracking-[-0.02em] outline-none"
              style={{ color: color.text }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const v = name.trim()
                if (v && v !== course.name) updateCourse(course.id, { name: v })
                else setName(course.name)
              }}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium" style={{ color: color.text, opacity: 0.78 }}>
              {course.teacher && (
                <span className="flex items-center gap-1">
                  <Icon name="user" size={12} />
                  {course.teacher}
                </span>
              )}
              {course.room && (
                <span className="flex items-center gap-1">
                  <Icon name="pin" size={12} />
                  {course.room}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Icon name="calendar" size={12} />
                {course.sessions.length} 个时段
              </span>
            </div>
          </div>
          <button className="btn h-8 w-8 flex-none bg-white/70 text-ink-2" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={15} />
          </button>
        </div>

        {/* 配色 */}
        <div className="mt-4 flex items-center gap-1.5">
          {COURSE_PALETTE.map((c, i) => (
            <button
              key={c.name}
              className={clsx(
                'h-5 w-5 rounded-full transition-transform',
                course.color === i ? 'scale-110 ring-2 ring-white/90' : 'hover:scale-110',
              )}
              style={{ background: c.solid, opacity: course.color === i ? 1 : 0.7 }}
              onClick={() => updateCourse(course.id, { color: i })}
              aria-label={c.name}
            />
          ))}
        </div>
      </div>

      {/* 标签 */}
      <div className="flex-none border-b border-line px-6 py-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'info', label: '课程详情' },
            { value: 'notes', label: '备忘录' },
            { value: 'work', label: '作业' },
          ]}
        />
      </div>

      {/* 内容 */}
      <div className="scroll-y min-h-0 flex-1 px-6 py-4">
        {tab === 'info' && (
          <div className="space-y-4">
            <section>
              <SectionTitle icon="clock">上课时段</SectionTitle>
              <div className="mt-2 space-y-2">
                {course.sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    periods={periods}
                    onPatch={(p) => updateSession(course.id, s.id, p)}
                    onRemove={() => removeSession(course.id, s.id)}
                  />
                ))}
                <button
                  className="btn btn-ghost h-9 w-full text-[12.5px]"
                  onClick={() =>
                    addSession(course.id, {
                      day: (course.sessions.at(-1)?.day ?? 1) as Weekday,
                      startPeriod: course.sessions.at(-1)?.startPeriod ?? 1,
                      endPeriod: course.sessions.at(-1)?.endPeriod ?? 1,
                    })
                  }
                >
                  <Icon name="plus" size={14} />
                  添加时段
                </button>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Field label="教师">
                <input
                  className="field"
                  defaultValue={course.teacher ?? ''}
                  placeholder="未填写"
                  onBlur={(e) => updateCourse(course.id, { teacher: e.target.value.trim() || undefined })}
                />
              </Field>
              <Field label="地点">
                <input
                  className="field"
                  defaultValue={course.room ?? ''}
                  placeholder="未填写"
                  onBlur={(e) => updateCourse(course.id, { room: e.target.value.trim() || undefined })}
                />
              </Field>
              <Field label="学分">
                <input
                  className="field"
                  defaultValue={course.credit ?? ''}
                  placeholder="如 3.0"
                  onBlur={(e) => updateCourse(course.id, { credit: e.target.value.trim() || undefined })}
                />
              </Field>
            </section>

            <section className="rounded-2xl bg-slate-900/[0.03] p-3 text-[11.5px] leading-5 text-ink-3">
              提示：在课表里直接拖动课程卡片可以移动；拖动卡片上下边缘可以拉长 / 缩短，松开即自动吸附到节次。
            </section>
          </div>
        )}

        {tab === 'notes' && (
          <div className="flex h-full flex-col">
            <SectionTitle icon="note">课程备忘录</SectionTitle>
            <textarea
              className="field mt-2 min-h-[260px] flex-1 resize-none leading-6"
              placeholder="记录考点、老师口头通知、复习进度…（自动保存）"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}

        {tab === 'work' && (
          <div className="space-y-3">
            <SectionTitle icon="flag">本课作业 / 任务</SectionTitle>
            <div className="flex gap-2">
              <input
                className="field"
                placeholder="输入作业名称，回车添加到待办"
                value={newWork}
                onChange={(e) => setNewWork(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const v = newWork.trim()
                  if (!v) return
                  addTodo({ title: v, courseId: course.id })
                  setNewWork('')
                }}
              />
              <button
                className="btn btn-primary h-9 px-3 text-[12.5px]"
                onClick={() => {
                  const v = newWork.trim()
                  if (!v) return
                  addTodo({ title: v, courseId: course.id })
                  setNewWork('')
                }}
              >
                添加
              </button>
            </div>

            {related.length === 0 ? (
              <div className="rounded-2xl bg-slate-900/[0.03] p-4 text-center text-[12px] text-ink-3">
                还没有关联的作业，添加后会出现在右侧待办清单
              </div>
            ) : (
              <div className="space-y-1.5">
                {related.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-xl bg-slate-900/[0.03] px-3 py-2">
                    <button
                      className="checkbox"
                      data-done={t.done}
                      onClick={() => toggleTodo(t.id)}
                      aria-label="完成"
                    >
                      <motion.svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        initial={false}
                        animate={{ scale: t.done ? 1 : 0.4, opacity: t.done ? 1 : 0 }}
                      >
                        <path d="M2 6.4l2.6 2.6L10 3.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
                      </motion.svg>
                    </button>
                    <span className={clsx('flex-1 text-[13px]', t.done && 'text-ink-4 line-through')}>{t.title}</span>
                    {t.dueAt && (
                      <span className="text-[11px] text-ink-3">
                        {new Date(t.dueAt).getMonth() + 1}/{new Date(t.dueAt).getDate()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="flex-none border-t border-line px-6 py-3">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[12.5px] text-ink-2">确定删除整门课程？</span>
            <button
              className="btn h-8 px-3 text-[12.5px] text-white"
              style={{ background: '#FF3B30' }}
              onClick={() => {
                removeCourse(course.id)
                onClose()
              }}
            >
              删除
            </button>
            <button className="btn btn-ghost h-8 px-3 text-[12.5px]" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
          </div>
        ) : (
          <button
            className="btn h-9 w-full text-[12.5px] text-[#D62A20] hover:bg-[#FF3B30]/10"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" size={14} />
            删除课程
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SectionTitle({ icon, children }: { icon: 'clock' | 'note' | 'flag'; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-ink-4">
      <Icon name={icon} size={13} />
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">{label}</span>
      {children}
    </label>
  )
}

function SessionRow({
  session,
  periods,
  onPatch,
  onRemove,
}: {
  session: Session
  periods: { index: number; start: string; end: string }[]
  onPatch: (p: Partial<Session>) => void
  onRemove: () => void
}) {
  const range = sessionTimeRange(session, periods)
  return (
    <div className="rounded-2xl border border-line bg-white/60 p-3">
      <div className="flex items-center gap-2">
        <select
          className="field h-8 w-[86px] flex-none py-0"
          value={session.day}
          onChange={(e) => onPatch({ day: Number(e.target.value) as Weekday })}
        >
          {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-[12px] text-ink-3">
          <input
            type="number"
            min={1}
            max={periods.length}
            className="field h-8 w-[54px] px-2 py-0 text-center"
            value={session.startPeriod}
            onChange={(e) => onPatch({ startPeriod: Number(e.target.value) })}
          />
          <span>-</span>
          <input
            type="number"
            min={1}
            max={periods.length}
            className="field h-8 w-[54px] px-2 py-0 text-center"
            value={session.endPeriod}
            onChange={(e) => onPatch({ endPeriod: Number(e.target.value) })}
          />
          <span>节</span>
        </div>
        <span className="tabular ml-auto text-[11.5px] text-ink-4">
          {range.startHM}-{range.endHM}
        </span>
        <button className="btn h-7 w-7 text-ink-4 hover:text-[#D62A20]" onClick={onRemove} aria-label="删除时段">
          <Icon name="trash" size={13} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          className="field h-8 flex-1 py-0"
          placeholder="地点"
          defaultValue={session.room ?? ''}
          onBlur={(e) => onPatch({ room: e.target.value.trim() || undefined })}
        />
        <input
          className="field h-8 flex-1 py-0"
          placeholder="教师"
          defaultValue={session.teacher ?? ''}
          onBlur={(e) => onPatch({ teacher: e.target.value.trim() || undefined })}
        />
      </div>
      <WeekPicker weeks={session.weeks} onChange={(weeks) => onPatch({ weeks })} />
      <label className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-3">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[#0A84FF]"
          checked={session.remind !== false}
          onChange={(e) => onPatch({ remind: e.target.checked })}
        />
        该时段提醒
      </label>
    </div>
  )
}

function WeekPicker({ weeks, onChange }: { weeks: number[]; onChange: (w: number[]) => void }) {
  const total = 20
  const [open, setOpen] = useState(false)
  const all = weeks.length === 0
  return (
    <div className="mt-2">
      <button
        className="btn h-7 bg-slate-900/[0.05] px-2.5 text-[11.5px] font-semibold text-ink-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="calendar" size={12} />
        {weekRangeText(weeks)}
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={springSoft}
          className="overflow-hidden"
        >
          <div className="mt-2 grid grid-cols-10 gap-1">
            {Array.from({ length: total }, (_, i) => i + 1).map((w) => {
              const on = all || weeks.includes(w)
              return (
                <button
                  key={w}
                  className={clsx(
                    'tabular h-7 rounded-lg text-[11px] font-semibold transition-colors',
                    on ? 'bg-[#0A84FF] text-white' : 'bg-slate-900/[0.05] text-ink-3 hover:bg-slate-900/[0.1]',
                  )}
                  onClick={() => {
                    if (all) {
                      onChange([w])
                      return
                    }
                    const set = new Set(weeks)
                    if (set.has(w)) set.delete(w)
                    else set.add(w)
                    onChange([...set].sort((a, b) => a - b))
                  }}
                >
                  {w}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex gap-2 text-[11.5px]">
            <button className="btn h-7 bg-slate-900/[0.05] px-2.5" onClick={() => onChange([])}>
              每周
            </button>
            <button
              className="btn h-7 bg-slate-900/[0.05] px-2.5"
              onClick={() => onChange(Array.from({ length: total }, (_, i) => i + 1).filter((w) => w % 2 === 1))}
            >
              单周
            </button>
            <button
              className="btn h-7 bg-slate-900/[0.05] px-2.5"
              onClick={() => onChange(Array.from({ length: total }, (_, i) => i + 1).filter((w) => w % 2 === 0))}
            >
              双周
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
