import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { useApp } from '../store'
import type { Todo, TodoPriority } from '../types'
import { colorOf } from '../lib/palette'
import { dateKey, dueLabel, humanLeft, pad2 } from '../lib/time'
import { Icon, springSnappy, springSoft } from './ui'
import { toast } from '../lib/toast'
import { playChime } from '../lib/notify'

/* ------------------------------------------------------------------ */
/* 自然语言快捷输入                                                     */
/* ------------------------------------------------------------------ */

const WEEK_WORD: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

export function parseQuickInput(input: string, now = new Date()): { title: string; dueAt?: string; priority: TodoPriority } {
  let text = input.trim()
  let priority: TodoPriority = 'normal'
  let due: Date | null = null

  // 优先级
  if (/(^|\s)!(high|高|急)/i.test(text)) {
    priority = 'high'
    text = text.replace(/(^|\s)!(high|高|急)/gi, ' ')
  } else if (/(^|\s)!(low|低)/i.test(text)) {
    priority = 'low'
    text = text.replace(/(^|\s)!(low|低)/gi, ' ')
  }

  const at = (d: Date, h: number, m: number) => {
    const x = new Date(d)
    x.setHours(h, m, 0, 0)
    return x
  }
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // 时间：14:30 / 下午3点 / 晚上8点
  let hour = 23
  let minute = 59
  const tm = /(\d{1,2})[:：](\d{2})/.exec(text)
  if (tm) {
    hour = Number(tm[1])
    minute = Number(tm[2])
    text = text.replace(tm[0], ' ')
  } else {
    const hm = /(上午|早上|中午|下午|晚上|傍晚)?\s*(\d{1,2})\s*[点時时](\s*半|\s*(\d{1,2})\s*分?)?/.exec(text)
    if (hm) {
      hour = Number(hm[2])
      const period = hm[1] ?? ''
      if (/(下午|晚上|傍晚)/.test(period) && hour < 12) hour += 12
      if (/中午/.test(period) && hour < 12) hour = 12
      if (hm[3]?.includes('半')) minute = 30
      else if (hm[4]) minute = Number(hm[4])
      else minute = 0
      text = text.replace(hm[0], ' ')
    }
  }

  // 日期
  const dmy = /(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日号]?/.exec(text)
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (iso) {
    due = at(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])), hour, minute)
    text = text.replace(iso[0], ' ')
  } else if (dmy) {
    const m = Number(dmy[1])
    const d = Number(dmy[2])
    let year = now.getFullYear()
    const cand = new Date(year, m - 1, d)
    if (cand.getTime() < base.getTime() - 86400000 * 30) year += 1
    due = at(new Date(year, m - 1, d), hour, minute)
    text = text.replace(dmy[0], ' ')
  } else if (/今天/.test(text)) {
    due = at(base, hour, minute)
    text = text.replace(/今天/, ' ')
  } else if (/明天|明儿/.test(text)) {
    due = at(new Date(base.getTime() + 86400000), hour, minute)
    text = text.replace(/明天|明儿/, ' ')
  } else if (/后天/.test(text)) {
    due = at(new Date(base.getTime() + 2 * 86400000), hour, minute)
    text = text.replace(/后天/, ' ')
  } else {
    const wd = /(下)?(?:周|星期|礼拜)\s*([一二三四五六日天])/.exec(text)
    if (wd) {
      const target = WEEK_WORD[wd[2]]
      const curWd = now.getDay() === 0 ? 7 : now.getDay()
      let delta = target - curWd
      if (delta <= 0) delta += 7
      if (wd[1]) delta += 7
      due = at(new Date(base.getTime() + delta * 86400000), hour, minute)
      text = text.replace(wd[0], ' ')
    } else if (/(\d+)\s*天后/.test(text)) {
      const n = Number(/(\d+)\s*天后/.exec(text)![1])
      due = at(new Date(base.getTime() + n * 86400000), hour, minute)
      text = text.replace(/(\d+)\s*天后/, ' ')
    }
  }

  const title = text.replace(/\s{2,}/g, ' ').replace(/\s*[,，]\s*$/, '').trim()
  return { title: title || input.trim(), dueAt: due ? due.toISOString() : undefined, priority }
}

/* ------------------------------------------------------------------ */
/* 待办面板                                                            */
/* ------------------------------------------------------------------ */

type FilterKey = 'open' | 'today' | 'week' | 'done'

export function TodoPanel({ compact = false }: { compact?: boolean }) {
  const todos = useApp((s) => s.todos)
  const courses = useApp((s) => s.courses)
  const addTodo = useApp((s) => s.addTodo)
  const toggleTodo = useApp((s) => s.toggleTodo)
  const updateTodo = useApp((s) => s.updateTodo)
  const removeTodo = useApp((s) => s.removeTodo)
  const clearCompleted = useApp((s) => s.clearCompleted)

  const [filter, setFilter] = useState<FilterKey>('open')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 全局快捷键 Ctrl/⌘+K 聚焦到快速添加
  useEffect(() => {
    const onFocus = () => inputRef.current?.focus()
    window.addEventListener('lumen:focus-todo', onFocus)
    return () => window.removeEventListener('lumen:focus-todo', onFocus)
  }, [])

  const now = new Date()

  const filtered = useMemo(() => {
    const byDue = (a: Todo, b: Todo) => {
      const av = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
      const bv = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
      if (av !== bv) return av - bv
      return a.createdAt.localeCompare(b.createdAt)
    }
    const open = todos.filter((t) => !t.done)
    switch (filter) {
      case 'open':
        return [...open].sort(byDue)
      case 'today': {
        const today = dateKey(now)
        return open
          .filter((t) => (t.dueAt ? dateKey(new Date(t.dueAt)) <= today : false))
          .sort(byDue)
      }
      case 'week': {
        const limit = now.getTime() + 7 * 86400000
        return open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() <= limit).sort(byDue)
      }
      case 'done':
        return [...todos.filter((t) => t.done)].sort((a, b) =>
          (b.completedAt ?? '').localeCompare(a.completedAt ?? ''),
        )
    }
  }, [todos, filter, now])

  const stats = useMemo(() => {
    const open = todos.filter((t) => !t.done)
    const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now.getTime()).length
    const today = open.filter((t) => t.dueAt && dateKey(new Date(t.dueAt)) === dateKey(now)).length
    const next = open
      .filter((t) => t.dueAt && new Date(t.dueAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0]
    return { open: open.length, overdue, today, next }
  }, [todos, now])

  const submit = () => {
    const raw = draft.trim()
    if (!raw) return
    const parsed = parseQuickInput(raw)
    addTodo({ title: parsed.title, dueAt: parsed.dueAt, priority: parsed.priority })
    setDraft('')
    if (parsed.dueAt) {
      const d = new Date(parsed.dueAt)
      toast('已加入待办', { desc: `DDL ${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`, tone: 'success', duration: 2200 })
    }
  }

  return (
    <div className={clsx('flex min-h-0 flex-col', compact ? 'h-full' : '')}>
      {/* 头部 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-bold tracking-[-0.02em]">待办与作业</h2>
            {stats.open > 0 && (
              <span className="rounded-full bg-[#0A84FF]/12 px-2 py-[1px] text-[11px] font-bold text-[#0A84FF]">
                {stats.open} 项未完成
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            {stats.overdue > 0 ? (
              <span className="font-semibold text-[#D62A20]">{stats.overdue} 项已逾期 · </span>
            ) : null}
            {stats.next?.dueAt ? (
              <>
                下一个 DDL：{stats.next.title}（{humanLeft(new Date(stats.next.dueAt).getTime() - now.getTime())}后）
              </>
            ) : (
              '暂无临近截止的任务'
            )}
          </p>
        </div>
        {todos.some((t) => t.done) && (
          <button className="btn btn-ghost h-7 px-2.5 text-[11.5px]" onClick={clearCompleted}>
            清理已完成
          </button>
        )}
      </div>

      {/* 快速添加 */}
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4">
            <Icon name="plus" size={15} />
          </div>
          <input
            ref={inputRef}
            className="field pl-9"
            placeholder="例如：操作系统实验报告 周五 18:00 !high"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </div>
        <button className="btn btn-primary h-9 px-4 text-[12.5px]" onClick={submit}>
          添加
        </button>
      </div>

      {/* 筛选 */}
      <div className="mt-3 flex items-center gap-1">
        {(
          [
            ['open', '全部'],
            ['today', '今天'],
            ['week', '近 7 天'],
            ['done', '已完成'],
          ] as [FilterKey, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={clsx(
              'rounded-full px-3 py-[5px] text-[12px] font-semibold transition-colors',
              filter === k ? 'bg-ink text-white' : 'bg-slate-900/[0.05] text-ink-3 hover:bg-slate-900/[0.09]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className={clsx('scroll-y mt-2 min-h-0 flex-1 pr-1', compact ? '' : 'max-h-[320px]')}>
        <AnimatePresence initial={false}>
          {filtered.map((t) => {
            const due = dueLabel(t.dueAt, now)
            const course = t.courseId ? courses.find((c) => c.id === t.courseId) : undefined
            const color = course ? colorOf(course.color) : null
            const isEditing = editing === t.id
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, x: 24, height: 0 }}
                transition={springSoft}
                className="group overflow-hidden"
              >
                <div className="flex items-start gap-3 border-b border-line px-1 py-2.5">
                  <button
                    className="checkbox mt-[2px]"
                    data-done={t.done}
                    onClick={() => {
                      const next = !t.done
                      toggleTodo(t.id, next)
                      if (next) playChime('done')
                    }}
                    aria-label="完成"
                  >
                    <motion.svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      initial={false}
                      animate={{ scale: t.done ? 1 : 0.4, opacity: t.done ? 1 : 0 }}
                      transition={springSnappy}
                    >
                      <path d="M2 6.4l2.6 2.6L10 3.4" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </motion.svg>
                  </button>

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        autoFocus
                        className="field"
                        defaultValue={t.title}
                        onBlur={(e) => {
                          updateTodo(t.id, { title: e.target.value.trim() || t.title })
                          setEditing(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                    ) : (
                      <div
                        className={clsx(
                          'cursor-text text-[13.5px] font-semibold leading-5',
                          t.done && 'text-ink-4 line-through',
                        )}
                        onDoubleClick={() => setEditing(t.id)}
                        title="双击重命名"
                      >
                        {t.priority === 'high' && (
                          <span className="mr-1 inline-block align-middle text-[#FF3B30]">
                            <Icon name="flag" size={12} />
                          </span>
                        )}
                        {t.title}
                      </div>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={clsx('text-[11px] font-medium', toneClass(due.tone))}>{due.text}</span>
                      {course && color && (
                        <span
                          className="rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold"
                          style={{ background: color.from, color: color.text }}
                        >
                          {course.name}
                        </span>
                      )}
                      {t.startAt && (
                        <span className="text-[10.5px] text-ink-4">
                          计划 {new Date(t.startAt).getMonth() + 1}/{new Date(t.startAt).getDate()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 快捷操作 */}
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      className="btn btn-ghost h-6 px-2 text-[11px]"
                      onClick={() => {
                        const el = document.getElementById(`due-${t.id}`) as HTMLInputElement | null
                        el?.showPicker?.()
                        el?.focus()
                      }}
                      title="修改 DDL"
                    >
                      <Icon name="clock" size={12} />
                    </button>
                    <button
                      className="btn btn-ghost h-6 px-2 text-[11px]"
                      onClick={() => removeTodo(t.id)}
                      title="删除"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>

                {/* 隐藏的原生日期选择器 */}
                <div className="relative h-0">
                  <input
                    id={`due-${t.id}`}
                    type="datetime-local"
                    className="absolute right-0 top-[-30px] h-7 w-[180px] rounded-lg border border-line bg-white px-2 text-[11px] opacity-0 focus:opacity-100"
                    value={toLocalInput(t.dueAt)}
                    onChange={(e) => {
                      const v = e.target.value
                      updateTodo(t.id, { dueAt: v ? new Date(v).toISOString() : undefined, notified: false })
                    }}
                  />
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="grid place-items-center py-10 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900/5 text-ink-4">
              <Icon name="checkCircle" size={20} />
            </div>
            <div className="mt-2 text-[12.5px] text-ink-3">
              {filter === 'done' ? '还没有已完成的任务' : '太棒了，这里已经清空'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function toneClass(tone: 'over' | 'today' | 'soon' | 'normal' | 'none'): string {
  switch (tone) {
    case 'over':
      return 'text-[#D62A20]'
    case 'today':
      return 'text-[#C2740A]'
    case 'soon':
      return 'text-[#0A84FF]'
    case 'none':
      return 'text-ink-4'
    default:
      return 'text-ink-3'
  }
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
