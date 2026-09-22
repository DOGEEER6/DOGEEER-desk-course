import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useApp } from '../store'
import { DEFAULT_PERIODS } from '../lib/time'
import { downloadTemplate, exportBackup, exportWeekCsv, readBackup } from '../lib/template'
import { Icon, Segmented, Switch } from './ui'
import { toast } from '../lib/toast'
import { ensurePermission, playChime, type PermissionState, isTauri } from '../lib/notify'
import { currentWeek } from '../store'
import {
  getAutoStart,
  hideMainWindow,
  isDesktop,
  setAutoStart,
  setMiniAlwaysOnTop,
  showMiniWindow,
} from '../lib/desktop'
import { setTheme, type ThemeMode } from '../lib/theme'

export function SettingsPage({ onOpenImport }: { onOpenImport: () => void }) {
  const settings = useApp((s) => s.settings)
  const periods = useApp((s) => s.periods)
  const courses = useApp((s) => s.courses)
  const todos = useApp((s) => s.todos)
  const updateSettings = useApp((s) => s.updateSettings)
  const updateReminders = useApp((s) => s.updateReminders)
  const setSemester = useApp((s) => s.setSemester)
  const setPeriods = useApp((s) => s.setPeriods)
  const replaceAll = useApp((s) => s.replaceAll)
  const resetAll = useApp((s) => s.resetAll)
  const lastImport = useApp((s) => s.lastImport)

  const [perm, setPerm] = useState<PermissionState | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [autoStart, setAutoStartState] = useState<boolean | null>(null)
  const [miniOnTop, setMiniOnTopState] = useState(!!settings.miniAlwaysOnTop)
  const week = currentWeek({ settings, previewWeek: null })

  useEffect(() => {
    if (!isDesktop()) return
    void getAutoStart().then((v) => setAutoStartState(v ?? false))
  }, [])

  const semesterProgress = useMemo(() => {
    const total = settings.semester.totalWeeks
    const done = Math.min(total, Math.max(0, week))
    return { total, done, percent: total ? (done / total) * 100 : 0 }
  }, [settings.semester.totalWeeks, week])

  const checkPermission = async () => {
    const p = await ensurePermission()
    setPerm(p)
    if (p === 'granted') {
      playChime('bell')
      toast('系统通知已开启', { tone: 'success' })
    } else if (p === 'denied') {
      toast('系统通知被拒绝', {
        desc: '请在 Windows「设置 → 系统 → 通知」里允许本应用发送通知',
        tone: 'warn',
        duration: 6000,
      })
    } else if (p === 'unsupported') {
      toast('当前环境不支持系统通知', { desc: '应用内提醒仍然可用', tone: 'info' })
    }
  }

  return (
    <div className="scroll-y min-h-0 flex-1 pr-1">
      <div className="grid grid-cols-2 gap-4">
        {/* 学期 */}
        <Card title="学期与周次" icon="calendar">
          <Row label="开学第一周的周一">
            <input
              type="date"
              className="field w-[160px]"
              value={settings.semester.startDate}
              onChange={(e) => setSemester({ startDate: e.target.value })}
            />
          </Row>
          <Row label="总教学周数">
            <input
              type="number"
              min={1}
              max={30}
              className="field w-[90px]"
              value={settings.semester.totalWeeks}
              onChange={(e) => setSemester({ totalWeeks: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Row>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11.5px] text-ink-3">
              <span>
                现在是第 <b className="text-ink">{week}</b> 教学周
              </span>
              <span className="tabular">
                {semesterProgress.done}/{semesterProgress.total}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3AA0FF] to-[#0A84FF] transition-[width] duration-500"
                style={{ width: `${semesterProgress.percent}%` }}
              />
            </div>
          </div>
          <Row label="显示周六、周日" className="mt-3">
            <Switch checked={settings.showWeekend} onChange={(v) => updateSettings({ showWeekend: v })} />
          </Row>
        </Card>

        {/* 提醒 */}
        <Card title="开课提醒" icon="bell">
          <Row label="启用提醒">
            <Switch
              checked={settings.reminders.enabled}
              onChange={(v) => updateReminders({ enabled: v })}
            />
          </Row>
          <Row label="提前时间" className="mt-2">
            <div className="flex items-center gap-2">
              <Segmented<string>
                value={[5, 10, 15, 30].includes(settings.reminders.leadMinutes) ? String(settings.reminders.leadMinutes) : 'custom'}
                onChange={(v) => v !== 'custom' && updateReminders({ leadMinutes: Number(v) })}
                options={[
                  { value: '5', label: '5分' },
                  { value: '10', label: '10分' },
                  { value: '15', label: '15分' },
                  { value: '30', label: '30分' },
                  { value: 'custom', label: '自定义' },
                ]}
              />
              <input
                type="number"
                min={1}
                max={180}
                className="field w-[72px]"
                value={settings.reminders.leadMinutes}
                onChange={(e) => updateReminders({ leadMinutes: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
          </Row>
          <Row label="应用内弹窗" className="mt-2">
            <Switch checked={settings.reminders.inApp} onChange={(v) => updateReminders({ inApp: v })} />
          </Row>
          <Row label="系统通知" className="mt-2">
            <Switch checked={settings.reminders.system} onChange={(v) => updateReminders({ system: v })} />
          </Row>
          <Row label="提示音" className="mt-2">
            <Switch checked={settings.reminders.sound} onChange={(v) => updateReminders({ sound: v })} />
          </Row>
          <div className="mt-3 flex items-center gap-2">
            <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={checkPermission}>
              <Icon name="bell" size={13} />
              检查通知权限
            </button>
            <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => playChime('bell')}>
              试听提示音
            </button>
            {perm && (
              <span
                className={clsx(
                  'text-[11.5px] font-semibold',
                  perm === 'granted' ? 'text-[#1D9E45]' : perm === 'denied' ? 'text-[#D62A20]' : 'text-ink-3',
                )}
              >
                {perm === 'granted' ? '已授权' : perm === 'denied' ? '已拒绝' : perm === 'unsupported' ? '不支持' : '未决定'}
              </span>
            )}
          </div>
          {!isTauri() && (
            <div className="mt-2 text-[11px] leading-5 text-ink-4">
              当前运行在浏览器预览模式；打包为桌面应用后可发送系统级通知。
            </div>
          )}
        </Card>

        {/* 桌面浮窗 */}
        <Card title="桌面浮窗" icon="pin" className="col-span-2">
          <p className="-mt-1 mb-3 text-[11.5px] leading-5 text-ink-3">
            浮窗常驻桌面，只显示<b>今天</b>的课程与作业 DDL：点击课程可展开查看详情，点右下角按钮打开完整课表。
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-3">
              <Switch
                checked={autoStart ?? false}
                disabled={!isDesktop()}
                onChange={async (v) => {
                  const r = await setAutoStart(v)
                  if (r == null) {
                    toast('需要桌面版才能设置开机自启', { tone: 'warn' })
                    return
                  }
                  setAutoStartState(v)
                  toast(v ? '已开启开机自启' : '已关闭开机自启', {
                    desc: v ? '下次开机只显示浮窗，点「打开完整课表」进入主界面' : undefined,
                    tone: 'success',
                  })
                }}
              />
              <span>
                <span className="block text-[12.5px] font-semibold">开机自启（只显示浮窗）</span>
                <span className="text-[11px] text-ink-3">
                  {isDesktop()
                    ? autoStart == null
                      ? '读取中…'
                      : autoStart
                        ? '已写入系统启动项'
                        : '未开启'
                    : '浏览器预览模式不可用'}
                </span>
              </span>
            </label>

            <label className="flex items-center gap-3">
              <Switch
                checked={miniOnTop}
                disabled={!isDesktop()}
                onChange={async (v) => {
                  setMiniOnTopState(v)
                  updateSettings({ miniAlwaysOnTop: v })
                  await setMiniAlwaysOnTop(v)
                  toast(v ? '浮窗已固定在桌面最前' : '浮窗已取消固定', {
                    desc: v ? '浮窗会盖在其他窗口上方' : '浮窗在桌面上，可被其他窗口覆盖',
                    tone: 'success',
                    duration: 2600,
                  })
                }}
              />
              <span>
                <span className="block text-[12.5px] font-semibold">固定在桌面最前</span>
                <span className="text-[11px] text-ink-3">
                  关闭时浮窗就在桌面上，可被其他窗口盖住（默认）
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <button
                className="btn btn-ghost h-8 px-3 text-[12px]"
                onClick={async () => {
                  const r = await showMiniWindow()
                  if (r == null) toast('浏览器预览下没有浮窗', { tone: 'info' })
                }}
              >
                <Icon name="pin" size={13} />
                显示浮窗
              </button>
              <button
                className="btn btn-ghost h-8 px-3 text-[12px]"
                onClick={async () => {
                  const r = await hideMainWindow()
                  if (r == null) toast('浏览器预览下无法隐藏窗口', { tone: 'info' })
                }}
              >
                <Icon name="list" size={13} />
                收起为浮窗
              </button>
            </div>
          </div>
        </Card>

        {/* 外观 */}
        <Card title="外观" icon="sparkle">
          <Row label="主题">
            <Segmented<ThemeMode>
              value={settings.theme ?? 'system'}
              onChange={(v) => {
                setTheme(v)
                updateSettings({ theme: v })
              }}
              options={[
                { value: 'system', label: '跟随系统' },
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
              ]}
            />
          </Row>
          <p className="mt-2 text-[11px] leading-5 text-ink-4">
            深色模式适合深色桌面壁纸，浮窗与主界面会一起切换。
          </p>
        </Card>

        {/* 节次时间 */}
        <Card title="节次时间" icon="clock" className="col-span-2">
          <div className="grid grid-cols-4 gap-2">
            {periods.map((p, i) => (
              <div key={p.index} className="rounded-2xl border border-line bg-glass-thin px-3 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[12px] font-bold text-ink-2">第 {p.index} 节</span>
                  <div className="flex gap-1">
                    <button
                      className="btn h-5 w-5 text-ink-4 hover:text-ink-2 disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...periods]
                        ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                        setPeriods(next.map((x, idx) => ({ ...x, index: idx + 1 })))
                      }}
                      aria-label="上移"
                    >
                      <Icon name="chevronDown" size={12} className="rotate-180" />
                    </button>
                    <button
                      className="btn h-5 w-5 text-ink-4 hover:text-ink-2 disabled:opacity-30"
                      disabled={i === periods.length - 1}
                      onClick={() => {
                        const next = [...periods]
                        ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
                        setPeriods(next.map((x, idx) => ({ ...x, index: idx + 1 })))
                      }}
                      aria-label="下移"
                    >
                      <Icon name="chevronDown" size={12} />
                    </button>
                    <button
                      className="btn h-5 w-5 text-ink-4 hover:text-[#D62A20]"
                      onClick={() => setPeriods(periods.filter((x) => x.index !== p.index).map((x, idx) => ({ ...x, index: idx + 1 })))}
                      aria-label="删除"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    className="field h-7 px-2 py-0 text-[11.5px]"
                    value={p.start}
                    onChange={(e) =>
                      setPeriods(periods.map((x) => (x.index === p.index ? { ...x, start: e.target.value } : x)))
                    }
                  />
                  <span className="text-ink-4">–</span>
                  <input
                    type="time"
                    className="field h-7 px-2 py-0 text-[11.5px]"
                    value={p.end}
                    onChange={(e) =>
                      setPeriods(periods.map((x) => (x.index === p.index ? { ...x, end: e.target.value } : x)))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-ghost h-8 px-3 text-[12px]"
              onClick={() => {
                const last = periods.at(-1)
                const next = periods.length + 1
                setPeriods([
                  ...periods,
                  { index: next, start: last?.end ?? '20:40', end: '21:25' },
                ])
              }}
            >
              <Icon name="plus" size={13} />
              增加一节
            </button>
            <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={() => setPeriods(DEFAULT_PERIODS)}>
              恢复默认作息
            </button>
          </div>
        </Card>

        {/* 数据 */}
        <Card title="数据与导入" icon="import" className="col-span-2">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary h-9 px-4 text-[12.5px]" onClick={onOpenImport}>
              <Icon name="import" size={14} />
              导入 Excel 课表
            </button>
            <button className="btn btn-ghost h-9 px-4 text-[12.5px]" onClick={() => downloadTemplate(periods)}>
              <Icon name="download" size={14} />
              下载模板
            </button>
            <button
              className="btn btn-ghost h-9 px-4 text-[12.5px]"
              onClick={() => exportWeekCsv(courses, periods, week)}
            >
              <Icon name="download" size={14} />
              导出本周 CSV
            </button>
            <button
              className="btn btn-ghost h-9 px-4 text-[12.5px]"
              onClick={() => {
                exportBackup({ courses, todos, periods, settings })
                toast('已导出备份', { tone: 'success' })
              }}
            >
              <Icon name="download" size={14} />
              导出完整备份
            </button>
            <label className="btn btn-ghost h-9 cursor-pointer px-4 text-[12.5px]">
              <Icon name="import" size={14} />
              恢复备份
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  try {
                    const data = readBackup(await f.text())
                    replaceAll({
                      courses: data.courses,
                      todos: data.todos,
                      periods: data.periods,
                      settings: data.settings as never,
                    })
                    toast('备份已恢复', { desc: `${data.courses.length} 门课程`, tone: 'success' })
                  } catch (err) {
                    toast('恢复失败', { desc: String((err as Error).message), tone: 'error' })
                  }
                }}
              />
            </label>
            {confirmReset ? (
              <>
                <button
                  className="btn h-9 px-4 text-[12.5px] text-white"
                  style={{ background: '#FF3B30' }}
                  onClick={() => {
                    resetAll()
                    setConfirmReset(false)
                    toast('已清空全部数据', { tone: 'info' })
                  }}
                >
                  确认清空
                </button>
                <button className="btn btn-ghost h-9 px-4 text-[12.5px]" onClick={() => setConfirmReset(false)}>
                  取消
                </button>
              </>
            ) : (
              <button
                className="btn h-9 px-4 text-[12.5px] text-[#D62A20] hover:bg-[#FF3B30]/10"
                onClick={() => setConfirmReset(true)}
              >
                <Icon name="trash" size={14} />
                清空全部数据
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat value={courses.length} label="门课程" />
            <Stat value={courses.reduce((a, c) => a + c.sessions.length, 0)} label="个上课时段" />
            <Stat value={todos.filter((t) => !t.done).length} label="项待办" />
          </div>

          {lastImport && (
            <div className="mt-3 rounded-2xl bg-surface-1 p-3 text-[11.5px] leading-5 text-ink-3">
              <div className="font-semibold text-ink-2">最近一次导入</div>
              <div>
                {lastImport.fileName} · {new Date(lastImport.at).toLocaleString('zh-CN')}
              </div>
              <div>
                新增 {lastImport.created} 条，补充 {lastImport.updated} 条
              </div>
              {lastImport.rows.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer select-none">解析提示（{lastImport.rows.length}）</summary>
                  <ul className="mt-1 space-y-0.5">
                    {lastImport.rows.map((r, i) => (
                      <li key={i}>· {r.message}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Card>

        <Card title="关于" icon="sparkle" className="col-span-2">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#3AA0FF] to-[#0A84FF] text-white">
              <Icon name="calendar" size={22} />
            </div>
            <div>
              <div className="text-[14px] font-bold">Lumen 课程表 <span className="font-normal text-ink-3">v0.1.0</span></div>
              <div className="mt-0.5 text-[11.5px] text-ink-3">
                {isTauri() ? '桌面版' : '浏览器预览版'} · 数据保存在本机，不会上传
              </div>
            </div>
          </div>
          <div className="mt-3 text-[11.5px] leading-5 text-ink-4">
            快捷键：<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> 快速添加待办 · <Kbd>Ctrl</Kbd>+<Kbd>I</Kbd> 导入课表 ·{' '}
            <Kbd>←</Kbd>/<Kbd>→</Kbd> 切换周次 · <Kbd>Esc</Kbd> 关闭面板
            <br />
            课表内：拖动课程卡片可移动，拖动上下边缘可拉长/缩短，双击空白格可新建课程。
          </div>
        </Card>
      </div>
      <div className="h-4" />
    </div>
  )
}

function Card({
  title,
  icon,
  children,
  className,
}: {
  title: string
  icon: 'calendar' | 'bell' | 'clock' | 'import' | 'sparkle' | 'pin'
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={clsx('glass rounded-[22px] p-4', className)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-surface-2 text-ink-3">
          <Icon name={icon} size={13} />
        </span>
        <h3 className="text-[13.5px] font-bold tracking-[-0.01em]">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Row({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={clsx('flex items-center justify-between gap-3', className)}>
      <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-1 py-3">
      <div className="tabular text-[22px] font-bold leading-none text-ink">{value}</div>
      <div className="mt-1 text-[11px] text-ink-3">{label}</div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-glass-thin px-1.5 py-[1px] text-[10.5px] font-semibold text-ink-2">
      {children}
    </kbd>
  )
}
