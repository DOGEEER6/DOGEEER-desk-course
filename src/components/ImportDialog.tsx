import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useApp } from '../store'
import type { Weekday } from '../types'
import { parseTimetableFile, type ParseResult } from '../lib/excel'
import { downloadTemplate } from '../lib/template'
import { WEEKDAY_LABELS } from '../types'
import { Icon, Switch } from './ui'
import { toast } from '../lib/toast'
import { weekRangeText } from '../lib/time'

type Mode = 'replace' | 'append' | 'merge'

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const periods = useApp((s) => s.periods)
  const courses = useApp((s) => s.courses)
  const mergeCourse = useApp((s) => s.mergeCourse)
  const addCourse = useApp((s) => s.addCourse)
  const setImportReport = useApp((s) => s.setImportReport)
  const updateSettings = useApp((s) => s.updateSettings)
  const settings = useApp((s) => s.settings)

  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [mode, setMode] = useState<Mode>(courses.length ? 'merge' : 'replace')
  const [setSemesterStart, setSetSemesterStart] = useState(true)
  const [dropActive, setDropActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFileName('')
    setResult(null)
    setBusy(false)
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const parsed = await parseTimetableFile(buf, { totalWeeks: settings.semester.totalWeeks })
      setResult(parsed)
      if (!parsed.records.length) {
        toast('没有解析到课程', {
          desc: '请检查表格是否包含「星期 / 节次 / 课程名称」等信息，也可以先下载模板对照',
          tone: 'warn',
          duration: 6000,
        })
      }
    } catch (err) {
      toast('解析失败', { desc: String((err as Error)?.message ?? err), tone: 'error', duration: 6000 })
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  const doImport = () => {
    if (!result?.records.length) return
    let created = 0
    let updated = 0

    if (mode === 'replace') {
      // 先清空，再按顺序添加（保持配色稳定）
      useApp.setState({ courses: [] })
    }

    // 保证每门课颜色不同
    let paletteCursor = useApp.getState().courses.length
    const seen = new Map<string, string>()

    for (const r of result.records) {
      const key = `${r.name}||${r.teacher ?? ''}`
      const session = {
        day: r.day,
        startPeriod: r.startPeriod,
        endPeriod: Math.max(r.startPeriod, Math.min(periods.length, r.endPeriod)),
        weeks: r.weeks,
        room: r.room,
        teacher: r.teacher,
        note: r.note,
      }
      if (mode === 'merge' && useApp.getState().courses.length) {
        const res = mergeCourse({ name: r.name, teacher: r.teacher, room: r.room }, session)
        if (res === 'created') created += 1
        else updated += 1
      } else {
        const existingId = seen.get(key)
        if (existingId) {
          useApp.getState().addSession(existingId, session)
          updated += 1
        } else {
          const id = addCourse({
            name: r.name,
            teacher: r.teacher,
            room: r.room,
            color: paletteCursor % 12,
            sessions: [session],
          })
          seen.set(key, id)
          paletteCursor += 1
          created += 1
        }
      }
    }

    setImportReport({
      fileName,
      at: new Date().toISOString(),
      rows: result.issues.map((i) => ({
        line: 0,
        raw: i.raw ?? '',
        status: i.level === 'error' ? 'error' : 'warn',
        message: `${i.sheet ? `[${i.sheet}] ` : ''}${i.message}`,
      })),
      created,
      updated,
      skipped: 0,
    })

    if (setSemesterStart) {
      updateSettings({ semester: { ...settings.semester } })
    }

    toast('导入完成', {
      desc: `新增 ${created} 条、补充 ${updated} 条上课时段`,
      tone: 'success',
      duration: 4200,
    })
    reset()
    onClose()
  }

  if (!open) return null

  return (
    <div className="flex h-full w-[560px] max-w-[94vw] flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white/95 shadow-[var(--shadow-float)] backdrop-blur-2xl">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h3 className="text-[16.5px] font-bold tracking-[-0.02em]">导入课表</h3>
          <p className="mt-0.5 text-[12px] text-ink-3">
            支持教务处 / WPS 导出的 .xlsx、.xls、.csv
          </p>
        </div>
        <button className="btn h-8 w-8 bg-slate-900/5 text-ink-2" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="scroll-y min-h-0 flex-1 px-6 py-5">
        {!result && (
          <>
            {/* 拖放区 */}
            <div
              className={clsx(
                'grid place-items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dropActive ? 'border-[#0A84FF] bg-[#0A84FF]/[0.06]' : 'border-slate-900/12 bg-slate-900/[0.02]',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDropActive(true)
              }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDropActive(false)
                const f = e.dataTransfer.files?.[0]
                if (f) void handleFile(f)
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0A84FF]/12 text-[#0A84FF]">
                <Icon name={busy ? 'sparkle' : 'import'} size={22} />
              </div>
              <div className="mt-3 text-[14px] font-semibold">
                {busy ? '正在解析…' : '把课表文件拖到这里'}
              </div>
              <div className="mt-1 text-[12px] text-ink-3">或点击选择文件</div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                  e.target.value = ''
                }}
              />
            </div>

            <button
              className="btn btn-ghost mt-3 h-9 w-full text-[12.5px]"
              onClick={() => downloadTemplate(periods)}
            >
              <Icon name="download" size={14} />
              下载示例模板（同时也是一份格式说明）
            </button>

            <div className="mt-5 rounded-2xl bg-slate-900/[0.03] p-4 text-[12px] leading-6 text-ink-3">
              <div className="mb-1 font-semibold text-ink-2">能自动识别的内容</div>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>
                  <b>网格表</b>：第 1 行是「星期一…星期日」，第 1 列是节次，合并单元格代表连堂
                </li>
                <li>
                  <b>清单表</b>：表头含「课程名称 / 星期 / 节次 / 地点」任意组合
                </li>
                <li>
                  单元格里的 <code className="rounded bg-white px-1">课程名 / 教师（1-16周） / 地点</code> 会被自动拆开
                </li>
                <li>周次支持 1-16、1,3,5、第1-8周、单周、双周、每周</li>
              </ul>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#34C759]/14 text-[#1D9E45]">
                <Icon name="checkCircle" size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{fileName}</div>
                <div className="text-[11.5px] text-ink-3">
                  识别方式：{result.detected === 'grid' ? '网格课表' : result.detected === 'flat' ? '课程清单' : '未知'} ·
                  共 {result.records.length} 个上课时段 · {new Set(result.records.map((r) => r.name)).size} 门课
                </div>
              </div>
              <button className="btn btn-ghost h-8 px-3 text-[12px]" onClick={reset}>
                重选
              </button>
            </div>

            {/* 预览 */}
            <div className="mt-3 max-h-[240px] overflow-y-auto rounded-2xl border border-line">
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-slate-50 text-ink-3">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">课程</th>
                    <th className="px-2 py-2 text-left font-semibold">时间</th>
                    <th className="px-2 py-2 text-left font-semibold">周次</th>
                    <th className="px-3 py-2 text-left font-semibold">地点</th>
                  </tr>
                </thead>
                <tbody>
                  {result.records.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-1.5 font-medium">{r.name}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-ink-3">
                        {WEEKDAY_LABELS[r.day as Weekday]} {r.startPeriod}-{r.endPeriod} 节
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-ink-3">{weekRangeText(r.weeks)}</td>
                      <td className="px-3 py-1.5 text-ink-3">{r.room ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.issues.length > 0 && (
              <div className="mt-3 rounded-2xl bg-[#FF9F0A]/10 p-3 text-[11.5px] leading-5 text-[#8A5A00]">
                {result.issues.slice(0, 4).map((i, idx) => (
                  <div key={idx}>
                    · {i.sheet ? `[${i.sheet}] ` : ''}
                    {i.message}
                    {i.raw ? `（${i.raw}）` : ''}
                  </div>
                ))}
                {result.issues.length > 4 && <div>…还有 {result.issues.length - 4} 条提示</div>}
              </div>
            )}

            {/* 导入方式 */}
            <div className="mt-4 space-y-2">
              <div className="text-[11.5px] font-bold uppercase tracking-wider text-ink-4">导入方式</div>
              {(
                [
                  ['merge', '合并到现有课表', '同名的课程会自动补充时段，不会覆盖你已改过的内容'],
                  ['replace', '清空后重新导入', '删除现有全部课程，只保留这次导入的结果'],
                  ['append', '作为新课程追加', '同名课程也会新建一份'],
                ] as [Mode, string, string][]
              ).map(([m, title, desc]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={clsx(
                    'flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                    mode === m ? 'border-[#0A84FF]/60 bg-[#0A84FF]/[0.06]' : 'border-line hover:bg-slate-900/[0.03]',
                  )}
                >
                  <span
                    className={clsx(
                      'mt-0.5 grid h-4.5 w-4.5 flex-none place-items-center rounded-full border-2',
                      mode === m ? 'border-[#0A84FF]' : 'border-slate-900/20',
                    )}
                    style={{ width: 18, height: 18 }}
                  >
                    {mode === m && <span className="h-2 w-2 rounded-full bg-[#0A84FF]" />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-4 text-ink-3">{desc}</span>
                  </span>
                </button>
              ))}
            </div>

            <label className="mt-3 flex items-center justify-between rounded-2xl bg-slate-900/[0.03] px-3 py-2.5">
              <span>
                <span className="block text-[12.5px] font-semibold">把第 1 教学周设为本周</span>
                <span className="text-[11px] text-ink-3">否则请在「设置」里填写正确的开学日期</span>
              </span>
              <Switch checked={setSemesterStart} onChange={setSetSemesterStart} />
            </label>
          </>
        )}
      </div>

      {/* 底部 */}
      <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3.5">
        <button className="btn btn-ghost h-9 px-4 text-[12.5px]" onClick={onClose}>
          取消
        </button>
        <button
          className="btn btn-primary h-9 px-5 text-[12.5px] disabled:opacity-40"
          disabled={!result?.records.length}
          onClick={doImport}
        >
          确认导入
        </button>
      </div>
    </div>
  )
}

/**
 * 全窗口拖放导入。
 *
 * 关键：这个遮罩**必须默认不可见且不接收指针事件**，
 * 否则它会盖住整个界面，让课表卡片的点击/拖动全部失效。
 * 只有在真正发生文件拖入（dataTransfer 里带 Files）时才显示并接管事件。
 */
export function ImportDropOverlay({ onFile }: { onFile: (f: File) => void }) {
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    // 通过 dragenter/dragleave 计数判断是否还在窗口内
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      depth.current += 1
      setActive(true)
    }
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onDrop = () => {
      depth.current = 0
      setActive(false)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onDrop)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[80]"
      style={{ pointerEvents: active ? 'auto' : 'none' }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setActive(false)
        const f = e.dataTransfer?.files?.[0]
        if (f) onFile(f)
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 grid place-items-center bg-[#0A84FF]/[0.08] transition-opacity duration-200"
        style={{ opacity: active ? 1 : 0 }}
      >
        <div className="rounded-3xl border-2 border-dashed border-[#0A84FF]/60 bg-white/95 px-8 py-6 text-center shadow-[var(--shadow-float)]">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#0A84FF]/12 text-[#0A84FF]">
            <Icon name="import" size={22} />
          </div>
          <div className="mt-2 text-[14px] font-semibold">松开即可导入课表</div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">支持 .xlsx / .xls / .csv</div>
        </div>
      </div>
    </div>
  )
}

export type { ParsedRecord } from '../types'
