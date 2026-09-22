import { useEffect, useState } from 'react'
import { useApp } from '../store'
import type { TodoPriority } from '../types'
import { colorOf } from '../lib/palette'
import { Icon, Overlay } from './ui'
import { toast } from '../lib/toast'
import { pad2, parseDateKey, dateKey } from '../lib/time'

/** Date → <input type="datetime-local"> 的值 */
function toLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function todayLocal(hour = 18): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return toLocal(d)
}

/**
 * 待办 / 作业的**新建与编辑**共用同一个选项卡。
 * 由 store 的 todoDialog 控制打开（浮窗也能唤起）。
 */
export function TodoDialog({ presetCourseId }: { presetCourseId?: string }) {
  const dialog = useApp((s) => s.todoDialog)
  const close = useApp((s) => s.closeTodoDialog)
  const courses = useApp((s) => s.courses)
  const todos = useApp((s) => s.todos)
  const addTodo = useApp((s) => s.addTodo)
  const updateTodo = useApp((s) => s.updateTodo)
  const removeTodo = useApp((s) => s.removeTodo)

  const editing = dialog.open && dialog.todoId ? todos.find((t) => t.id === dialog.todoId) : undefined
  const open = dialog.open

  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('normal')
  const [startAt, setStartAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  /* 每次打开都按当前是「新建」还是「编辑」填充表单 */
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    if (editing) {
      setTitle(editing.title)
      setCourseId(editing.courseId ?? '')
      setPriority(editing.priority)
      setStartAt(editing.startAt ? toLocal(new Date(editing.startAt)) : '')
      setDueAt(editing.dueAt ? toLocal(new Date(editing.dueAt)) : '')
      setNotes(editing.notes ?? '')
    } else {
      setTitle('')
      setCourseId(presetCourseId ?? '')
      setPriority('normal')
      setStartAt('')
      setDueAt(todayLocal(18))
      setNotes('')
    }
  }, [open, editing?.id, presetCourseId]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const t = title.trim()
    if (!t) {
      toast('请填写待办内容', { tone: 'warn' })
      return
    }
    const payload = {
      title: t,
      courseId: courseId || undefined,
      priority,
      startAt: startAt ? new Date(startAt).toISOString() : undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      notes: notes.trim() || undefined,
      notified: false,
    }
    if (editing) {
      updateTodo(editing.id, payload)
      toast('已保存修改', { desc: t, tone: 'success', duration: 2400 })
    } else {
      addTodo(payload)
      toast('已加入待办', {
        desc: dueAt
          ? `截止 ${new Date(dueAt).getMonth() + 1}月${new Date(dueAt).getDate()}日 ${pad2(new Date(dueAt).getHours())}:${pad2(new Date(dueAt).getMinutes())}`
          : undefined,
        tone: 'success',
        duration: 2800,
      })
    }
    close()
  }

  if (!open) return null

  return (
    <Overlay open onClose={close} align="center">
      <div className="w-[560px] max-w-[94vw] overflow-hidden rounded-[26px] border border-glass-line bg-glass shadow-[var(--shadow-float)] backdrop-blur-2xl">
        {/* 头部 */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-gradient-to-br from-[#3AA0FF] to-[#0A84FF] text-white">
            <Icon name={editing ? 'note' : 'plus'} size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15.5px] font-bold tracking-[-0.02em]">
              {editing ? '编辑待办 / 作业' : '添加待办 / 作业'}
            </h3>
            <p className="text-[11.5px] text-ink-3">
              {editing ? '改完点保存，浮窗会同步更新' : '设置内容、排期与 DDL，都会同步到浮窗'}
            </p>
          </div>
          <button className="btn h-8 w-8 bg-surface-2 text-ink-2" onClick={close} aria-label="关闭">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">
              内容 <span className="text-[#FF3B30]">*</span>
            </span>
            <input
              autoFocus
              className="field text-[14px]"
              placeholder="例如：操作系统实验报告"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              data-testid="todo-title"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">关联课程</span>
              <select className="field" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">不关联</option>
                {courses
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">优先级</span>
              <div className="flex gap-1.5">
                {(
                  [
                    ['low', '低'],
                    ['normal', '普通'],
                    ['high', '重要'],
                  ] as [TodoPriority, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    className="flex-1 rounded-xl py-2 text-[12px] font-semibold transition-colors"
                    style={{
                      background:
                        priority === k
                          ? k === 'high'
                            ? '#FF3B30'
                            : k === 'low'
                              ? 'var(--c-surface-3)'
                              : '#0A84FF'
                          : 'var(--c-surface-1)',
                      color: priority === k ? (k === 'low' ? 'var(--color-ink-2)' : '#fff') : 'var(--color-ink-3)',
                    }}
                    onClick={() => setPriority(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">计划开始（排期）</span>
              <input
                type="datetime-local"
                className="field"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">截止时间 DDL</span>
              <input
                type="datetime-local"
                className="field"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                data-testid="todo-due"
              />
            </label>
          </div>

          {/* 快捷 DDL */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['今天 18:00', todayLocal(18)],
                ['今天 23:59', (() => { const d = new Date(); d.setHours(23, 59, 0, 0); return toLocal(d) })()],
                ['明天 18:00', (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return toLocal(d) })()],
                ['本周末', (() => { const d = new Date(); const wd = d.getDay() === 0 ? 7 : d.getDay(); d.setDate(d.getDate() + (7 - wd)); d.setHours(23, 59, 0, 0); return toLocal(d) })()],
                ['下周同一天', (() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(18, 0, 0, 0); return toLocal(d) })()],
              ] as [string, string][]
            ).map(([label, value]) => (
              <button
                key={label}
                className="btn h-7 bg-surface-1 px-2.5 text-[11px] text-ink-3 hover:bg-surface-2"
                onClick={() => setDueAt(value)}
              >
                {label}
              </button>
            ))}
            <button
              className="btn h-7 bg-surface-1 px-2.5 text-[11px] text-ink-3 hover:bg-surface-2"
              onClick={() => setDueAt('')}
            >
              不设 DDL
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-3">备注详情</span>
            <textarea
              className="field min-h-[72px] resize-none"
              placeholder="选填：要求、提交方式、参考资料…（会显示在待办卡片与浮窗里）"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="todo-notes"
            />
          </label>

          {courseId && (
            <div className="flex items-center gap-2 rounded-xl bg-surface-1 px-3 py-2 text-[11.5px] text-ink-3">
              <span
                className="h-3 w-1 flex-none rounded-full"
                style={{ background: colorOf(courses.find((c) => c.id === courseId)?.color ?? 0).solid }}
              />
              将关联到「{courses.find((c) => c.id === courseId)?.name}」，并出现在浮窗里这门课的作业清单中
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          {editing ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-ink-2">确定删除？</span>
                <button
                  className="btn h-8 px-3 text-[12px] text-white"
                  style={{ background: '#FF3B30' }}
                  onClick={() => {
                    removeTodo(editing.id)
                    close()
                    toast('已删除', { tone: 'info', duration: 2400 })
                  }}
                >
                  删除
                </button>
                <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => setConfirmDelete(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button
                className="btn h-8 px-3 text-[12px] text-[#D62A20] hover:bg-[#FF3B30]/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Icon name="trash" size={13} />
                删除这条
              </button>
            )
          ) : (
            <span className="text-[11.5px] text-ink-4">
              {dueAt ? `DDL ${dateKey(parseDateKey(dueAt.slice(0, 10)))} ${dueAt.slice(11, 16)}` : '未设置 DDL'}
            </span>
          )}

          <div className="flex gap-2">
            <button className="btn btn-ghost h-9 px-4 text-[12.5px]" onClick={close}>
              取消
            </button>
            <button
              className="btn btn-primary h-9 px-5 text-[12.5px] disabled:opacity-40"
              disabled={!title.trim()}
              onClick={submit}
              data-testid="todo-save"
            >
              {editing ? '保存修改' : '添加'}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}
