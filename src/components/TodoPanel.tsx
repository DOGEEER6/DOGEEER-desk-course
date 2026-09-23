import { useEffect, useMemo, useState } from 'react'
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

export function parseQuickInput(
  input: string,
  now = new Date(),
): { title: string; dueAt?: string; priority: TodoPriority } {
  let text = input.trim()
  let priority: TodoPriority = 'normal'
  let due: Date | null = null

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

  const dmy = /(\d{1,2})\s*[月/]\s*(\d{1,2})\s*[日号]?/.exec(text)
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

type FilterKey = 'open' | 'today' | 'week' | 'archive'

/** 完成后的归档延迟：先让用户看到打勾，再收进归档 */
const ARCHIVE_DELAY = 900

export function TodoPanel({
  compact = false,
  collapsed: collapsedProp,
  onToggleCollapse,
}: {
  compact?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const todos = useApp((s) => s.todos)
  const courses = useApp((s) => s.courses)
  const addTodo = useApp((s) => s.addTodo)
  const toggleTodo = useApp((s) => s.toggleTodo)
  const updateTodo = useApp((s) => s.updateTodo)
  const removeTodo = useApp((s) => s.removeTodo)
  const archiveTodo = useApp((s) => s.archiveTodo)
  const restoreTodo = useApp((s) => s.restoreTodo)
  const clearArchived = useApp((s) => s.clearArchived)
  const openTodoDialog = useApp((s) => s.openTodoDialog)

  const [filter, setFilter] = useState<FilterKey>('open')
  const [editing, setEditing] = useState<string | null>(null)
  const [justDone, setJustDone] = useState<Set<string>>(new Set())
  const [collapsedLocal, setCollapsedLocal] = useState(false)
  const collapsed = collapsedProp ?? collapsedLocal
  const toggleCollapse = onToggleCollapse ?? (() => setCollapsedLocal((v) => !v))

  useEffect(() => {
    const onFocus = () => {
      // Ctrl+K：折叠时先展开，再打开添加弹窗
      if (collapsed) toggleCollapse()
      window.setTimeout(() => openTodoDialog(), 60)
    }
    window.addEventListener('lumen:focus-todo', onFocus)
    return () => window.removeEventListener('lumen:focus-todo', onFocus)
  }, [collapsed, toggleCollapse, openTodoDialog])

  const now = new Date()

  /** 统计：归档项不计入未完成 */
  const stats = useMemo(() => {
    const active = todos.filter((t) => !t.archived)
    const open = active.filter((t) => !t.done)
    const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now.getTime()).length
    const next = open
      .filter((t) => t.dueAt && new Date(t.dueAt).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0]
    const archived = todos.filter((t) => t.archived).length
    return { open: open.length, overdue, next, archived }
  }, [todos, now])

  const filtered = useMemo(() => {
    const byDue = (a: Todo, b: Todo) => {
      const av = a.dueAt ? new Date(a.dueAt).getTime() : Infinity
      const bv = b.dueAt ? new Date(b.dueAt).getTime() : Infinity
      if (av !== bv) return av - bv
      return a.createdAt.localeCompare(b.createdAt)
    }
    const active = todos.filter((t) => !t.archived)
    const open = active.filter((t) => !t.done)
    switch (filter) {
      case 'open':
        return [...open].sort(byDue)
      case 'today': {
        const today = dateKey(now)
        return open.filter((t) => (t.dueAt ? dateKey(new Date(t.dueAt)) <= today : false)).sort(byDue)
      }
      case 'week': {
        const limit = now.getTime() + 7 * 86400000
        return open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() <= limit).sort(byDue)
      }
      case 'archive':
        return todos
          .filter((t) => t.archived)
          .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    }
  }, [todos, filter, now])

  /** 勾选 / 取消勾选：勾上后延迟收进归档，并给一次撤销机会 */
  const handleCheck = (t: Todo) => {
    if (t.done) {
      toggleTodo(t.id, false)
      setJustDone((s) => {
        const n = new Set(s)
        n.delete(t.id)
        return n
      })
      return
    }
    toggleTodo(t.id, true)
    playChime('done')
    setJustDone((s) => new Set(s).add(t.id))
    window.setTimeout(() => {
      // 用户可能已经点了「撤销」：那时 done 已被清掉，这里就不能再归档
      const cur = useApp.getState().todos.find((x) => x.id === t.id)
      if (cur?.done && !cur.archived) useApp.getState().archiveTodo(t.id)
      setJustDone((s) => {
        const n = new Set(s)
        n.delete(t.id)
        return n
      })
    }, ARCHIVE_DELAY)
    toast('已完成并归档', {
      desc: t.title,
      tone: 'success',
      duration: 4200,
      action: { label: '撤销', onClick: () => restoreTodo(t.id) },
    })
  }

  const FILTERS: [FilterKey, string][] = [
    ['open', '进行中'],
    ['today', '今天'],
    ['week', '近 7 天'],
    ['archive', '归档'],
  ]

  /** 折叠态：只显示数量 + 下一个 DDL，和「今天没有课」卡片等高 */
  if (collapsed) {
    const next = stats.next
    const due = next?.dueAt ? dueLabel(next.dueAt, now) : null
    return (
      <div className="flex min-h-0 w-full flex-col">
        <button
          className="flex w-full items-center gap-3 rounded-2xl bg-surface-1 px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
          onClick={toggleCollapse}
          data-testid="todo-expand"
          title="展开待办与作业"
        >
          <div className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-[#0A84FF]/12 text-[#0A84FF]">
            <Icon name="checkCircle" size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] font-bold tracking-[-0.01em]">
                {stats.open > 0 ? `${stats.open} 项待办` : '待办已清空'}
              </span>
              {stats.overdue > 0 && (
                <span className="text-[11.5px] font-semibold text-[#D62A20]">{stats.overdue} 项逾期</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
              {next && due ? (
                <>
                  下一个：{next.title} · {due.text}
                </>
              ) : (
                '暂无临近截止的任务'
              )}
            </div>
          </div>
          <Icon name="chevronDown" size={15} className="flex-none text-ink-4" />
        </button>
      </div>
    )
  }

  return (
    <div className={clsx('flex min-h-0 w-full flex-col', compact && 'h-full')}>
      {/* 头部 */}
      <div className="flex-none">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-bold tracking-[-0.02em]">待办与作业</h2>
          {stats.open > 0 && (
            <span className="flex-none rounded-full bg-[#0A84FF]/12 px-2 py-[1px] text-[10.5px] font-bold text-[#0A84FF]">
              {stats.open} 项进行中
            </span>
          )}
          <button
            className="ml-auto grid h-6 w-6 flex-none place-items-center rounded-lg text-ink-4 transition-colors hover:bg-surface-2 hover:text-ink"
            onClick={toggleCollapse}
            title="折叠起来（把空间让给课表）"
            aria-label="折叠"
            data-testid="todo-collapse"
          >
            <Icon name="chevronDown" size={15} className="rotate-180" />
          </button>
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-3">
          {stats.overdue > 0 ? (
            <span className="font-semibold text-[#D62A20]">{stats.overdue} 项逾期 · </span>
          ) : null}
          {stats.next?.dueAt ? (
            <>
              下一个 DDL：{stats.next.title}（{humanLeft(new Date(stats.next.dueAt).getTime() - now.getTime())}后）
            </>
          ) : (
            '暂无临近截止的任务'
          )}
        </p>

        {/* 添加：点开弹窗设置内容 / 日期 / DDL */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            className="btn btn-primary h-9 flex-1 text-[12.5px]"
            onClick={() => openTodoDialog()}
            data-testid="todo-add"
          >
            <Icon name="plus" size={14} />
            添加待办 / 作业
          </button>
          <button
            className="btn btn-ghost h-9 flex-none px-3 text-[12px]"
            onClick={() => {
              setFilter('archive')
            }}
            title="查看归档"
          >
            归档{stats.archived > 0 ? ` ${stats.archived}` : ''}
          </button>
        </div>

        {/* 筛选：容器窄时可横向滚动，避免按钮文字被裁切 */}
        <div className="no-scrollbar -mx-0.5 mt-2.5 flex items-center gap-1 overflow-x-auto px-0.5 pb-0.5">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={clsx(
                'flex-none whitespace-nowrap rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold transition-colors',
                filter === k ? 'bg-ink text-[var(--c-bg-solid)]' : 'bg-surface-1 text-ink-3 hover:bg-surface-2',
              )}
            >
              {label}
              {k === 'archive' && stats.archived > 0 && <span className="ml-1 opacity-70">{stats.archived}</span>}
            </button>
          ))}
          {filter === 'archive' && stats.archived > 0 && (
            <button
              className="ml-auto flex-none whitespace-nowrap rounded-full px-2.5 py-[5px] text-[11.5px] font-semibold text-[#D62A20] hover:bg-[#FF3B30]/10"
              onClick={() => {
                clearArchived()
                toast('已清空归档', { tone: 'info' })
              }}
            >
              清空归档
            </button>
          )}
        </div>
      </div>

      {/* 列表 */}
      <div className="scroll-y mt-1.5 min-h-0 flex-1 pr-1">
        <AnimatePresence initial={false}>
          {filtered.map((t) => {
            const due = dueLabel(t.dueAt, now)
            const course = t.courseId ? courses.find((c) => c.id === t.courseId) : undefined
            const color = course ? colorOf(course.color) : null
            const isEditing = editing === t.id
            const isArchived = !!t.archived
            const pending = justDone.has(t.id)

            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 28, height: 0, marginTop: 0 }}
                transition={springSoft}
                className="group overflow-hidden"
              >
                <div className="flex items-start gap-2.5 border-b border-line py-2.5">
                  {/* 勾选 / 恢复 */}
                  {isArchived ? (
                    <button
                      className="mt-[1px] grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-[#34C759]/20 text-[#1D9E45] transition-transform hover:scale-105 active:scale-90"
                      onClick={() => restoreTodo(t.id)}
                      title="从归档恢复到进行中"
                      aria-label="恢复"
                    >
                      <Icon name="check" size={12} strokeWidth={2.4} />
                    </button>
                  ) : (
                    <button
                      className={clsx('checkbox mt-[1px]', pending && 'ring-2 ring-[#34C759]/35')}
                      data-done={t.done}
                      onClick={() => handleCheck(t)}
                      aria-label={t.done ? '取消完成' : '标记完成'}
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
                        <motion.path
                          d="M2 6.4l2.6 2.6L10 3.4"
                          stroke="#fff"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={false}
                          animate={{ pathLength: t.done ? 1 : 0 }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </motion.svg>
                    </button>
                  )}

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
                          'cursor-text text-[13px] font-semibold leading-5 transition-colors',
                          (t.done || isArchived) && 'text-ink-4 line-through',
                        )}
                        onDoubleClick={() => !isArchived && setEditing(t.id)}
                        title={isArchived ? t.title : '双击重命名'}
                      >
                        {t.priority === 'high' && !isArchived && (
                          <span className="mr-1 inline-block align-middle text-[#FF3B30]">
                            <Icon name="flag" size={12} />
                          </span>
                        )}
                        {t.title}
                      </div>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {isArchived ? (
                        <span className="text-[10.5px] text-ink-4">
                          已完成
                          {t.completedAt
                            ? ` ${new Date(t.completedAt).getMonth() + 1}/${new Date(t.completedAt).getDate()}`
                            : ''}
                        </span>
                      ) : (
                        <span className={clsx('text-[10.5px] font-medium', toneClass(due.tone))}>{due.text}</span>
                      )}
                      {course && color && (
                        <span
                          className="max-w-[140px] truncate rounded-full px-1.5 py-[1px] text-[10px] font-semibold"
                          style={{ background: color.from, color: color.text }}
                        >
                          {course.name}
                        </span>
                      )}
                    </div>

                    {/* 备注详情：直接显示在卡片上，不用再点进去 */}
                    {t.notes && (
                      <div className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-surface-1 px-2 py-1.5 text-[11.5px] leading-[1.5] text-ink-2">
                        {t.notes}
                      </div>
                    )}
                  </div>

                  {/* 行内操作 */}
                  <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    {!isArchived && (
                      <>
                        <button
                          className="btn h-7 w-7 text-ink-4 hover:bg-surface-2 hover:text-[#0A84FF]"
                          title="编辑（内容 / 日期 / DDL / 备注）"
                          data-testid={`todo-edit-${t.id}`}
                          onClick={() => openTodoDialog(t.id)}
                        >
                          <Icon name="note" size={13} />
                        </button>
                        <label
                          className="btn h-7 w-7 cursor-pointer text-ink-4 hover:bg-surface-2 hover:text-[#0A84FF]"
                          title="设置 / 修改 DDL"
                        >
                          <Icon name="clock" size={13} />
                          <input
                            type="datetime-local"
                            className="sr-only"
                            value={toLocalInput(t.dueAt)}
                            onChange={(e) => {
                              const v = e.target.value
                              updateTodo(t.id, {
                                dueAt: v ? new Date(v).toISOString() : undefined,
                                notified: false,
                              })
                            }}
                          />
                        </label>
                        <button
                          className="btn h-7 w-7 text-ink-4 hover:bg-surface-2 hover:text-[#1D9E45]"
                          title="直接归档"
                          onClick={() => archiveTodo(t.id)}
                        >
                          <Icon name="download" size={13} />
                        </button>
                      </>
                    )}
                    <button
                      className="btn h-7 w-7 text-ink-4 hover:bg-[#FF3B30]/10 hover:text-[#D62A20]"
                      title="删除"
                      onClick={() => {
                        removeTodo(t.id)
                        toast('已删除', {
                          tone: 'info',
                          duration: 3200,
                          action: { label: '撤销', onClick: () => addTodo({ ...t, id: t.id }) },
                        })
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="grid place-items-center py-10 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-1 text-ink-4">
              <Icon name={filter === 'archive' ? 'download' : 'checkCircle'} size={20} />
            </div>
            <div className="mt-2 text-[12.5px] text-ink-3">
              {filter === 'archive'
                ? '归档是空的，完成的待办会自动收进这里'
                : filter === 'today'
                  ? '今天没有到期的任务'
                  : filter === 'week'
                    ? '近 7 天没有到期的任务'
                    : '太棒了，这里已经清空'}
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
