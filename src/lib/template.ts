/** 示例模板与数据导出 */
import * as XLSX from 'xlsx'
import type { Course, PeriodSlot, Todo } from '../types'
import { DEFAULT_PERIODS, weekRangeText } from './time'
import { dateKey } from './time'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** 生成并下载示例课表模板（两种格式各一个 sheet） */
export function downloadTemplate(periods: PeriodSlot[] = DEFAULT_PERIODS) {
  const wb = XLSX.utils.book_new()

  // ---- Sheet1：网格表 ----
  const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
  const grid: string[][] = [['星期\n节次', ...days]]
  const demo = [
    { name: '高等数学', teacher: '张老师', room: '教学楼A101', day: 1, s: 1, e: 2, weeks: '1-16' },
    { name: '大学英语', teacher: '李老师', room: '外语楼203', day: 3, s: 3, e: 4, weeks: '1-16' },
    { name: '程序设计', teacher: '王老师', room: '计算机楼508', day: 5, s: 6, e: 8, weeks: '1-12' },
  ]
  for (const p of periods) {
    const row: string[] = [`${p.index}\n${p.start}-${p.end}`]
    for (let d = 1; d <= 7; d++) {
      const hit = demo.find((x) => x.day === d && x.s === p.index)
      row.push(hit ? `${hit.name}\n${hit.teacher}（${hit.weeks}）\n${hit.room}` : '')
    }
    grid.push(row)
  }
  const ws1 = XLSX.utils.aoa_to_sheet(grid)
  ws1['!cols'] = [{ wch: 12 }, ...days.map(() => ({ wch: 18 }))]
  XLSX.utils.book_append_sheet(wb, ws1, '课程表')
  // 合并演示单元格
  ws1['!merges'] = [
    XLSX.utils.decode_range('B2:B3'),
    XLSX.utils.decode_range('D4:D5'),
    XLSX.utils.decode_range('F7:F9'),
  ]

  // ---- Sheet2：扁平清单 ----
  const flat = [
    ['课程名称', '星期', '节次', '上课时间', '地点', '教师', '周次'],
    ['高等数学', '星期一', '1-2节', '08:00-09:35', '教学楼A101', '张老师', '1-16周'],
    ['大学英语', '星期三', '3-4节', '09:50-11:25', '外语楼203', '李老师', '1-16周'],
    ['程序设计', '星期五', '6-8节', '14:00-16:35', '计算机楼508', '王老师', '1-12周'],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(flat)
  ws2['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws2, '课程清单')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  download(new Blob([out], { type: 'application/octet-stream' }), 'DOGEEER课程表模板.xlsx')
}

/* ------------------------------------------------------------------ */
/* 数据导出 / 导入                                                     */
/* ------------------------------------------------------------------ */

export interface BackupFile {
  app: 'lumen-course'
  version: 1
  exportedAt: string
  courses: Course[]
  todos: Todo[]
  periods: PeriodSlot[]
  settings: unknown
  /** 「已上完」的课次记录（旧备份可能没有这个字段） */
  doneClasses?: Record<string, true>
}

export function exportBackup(data: Omit<BackupFile, 'app' | 'version' | 'exportedAt'>) {
  const payload: BackupFile = {
    app: 'lumen-course',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  }
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `DOGEEER课程表备份-${dateKey(new Date())}.json`,
  )
}

export function readBackup(text: string): BackupFile {
  const parsed = JSON.parse(text) as BackupFile
  if (parsed?.app !== 'lumen-course' || !Array.isArray(parsed.courses)) {
    throw new Error('不是有效的 DOGEEER 课程表备份文件')
  }
  return parsed
}

/** 导出一份可读的周课表 CSV（给同学 / 打印用） */
export function exportWeekCsv(courses: Course[], periods: PeriodSlot[], week: number) {
  const rows: string[][] = [['节次', '时间', '周一', '周二', '周三', '周四', '周五', '周六', '周日']]
  for (const p of periods) {
    const row: string[] = [String(p.index), `${p.start}-${p.end}`]
    for (let d = 1; d <= 7; d++) {
      const hits: string[] = []
      for (const c of courses) {
        for (const s of c.sessions) {
          if (s.day !== d) continue
          if (s.weeks.length && !s.weeks.includes(week)) continue
          if (p.index < s.startPeriod || p.index > s.endPeriod) continue
          hits.push(`${c.name}${s.room ?? c.room ? `@${s.room ?? c.room}` : ''}`)
        }
      }
      row.push([...new Set(hits)].join(' / '))
    }
    rows.push(row)
  }
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `第${week}周`)
  const out = XLSX.write(wb, { bookType: 'csv', type: 'array' }) as ArrayBuffer
  download(new Blob([out], { type: 'text/csv;charset=utf-8' }), `课表-第${week}周.csv`)
}

export { weekRangeText }
