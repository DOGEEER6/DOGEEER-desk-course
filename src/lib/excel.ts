/**
 * 课表 Excel 解析器
 *
 * 支持两类常见格式：
 *  A. 网格表（国内高校教务系统 / WPS 导出的"课程表"）
 *     第 1 行是星期表头，第 1 列是节次 + 时间，合并单元格表示连续节次。
 *     单元格文本形如：
 *        线性代数
 *        郝朝鹏（1-16）
 *        公共学院8108
 *  B. 扁平清单表
 *     表头含「课程名称 / 星期 / 节次 / 上课时间 / 地点」等列，一行一节课。
 *
 * 周次解析：1-16、1-16周、1,3,5、第1-8周、1-16周(单)、单周、双周、每周
 */
import * as XLSX from 'xlsx'
import type { ParsedRecord, Weekday } from '../types'
import { DEFAULT_PERIODS, parseHM } from './time'

export interface ParseIssue {
  sheet: string
  cell?: string
  level: 'warn' | 'error'
  message: string
  raw?: string
}

export interface ParseResult {
  records: ParsedRecord[]
  issues: ParseIssue[]
  sheets: string[]
  detected: 'grid' | 'flat' | 'none'
  /** 从表头里猜出来的星期列名，便于诊断 */
  meta: Record<string, string>
}

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */

const FULLWIDTH_MAP: Record<string, string> = {
  '（': '(',
  '）': ')',
  '，': ',',
  '、': ',',
  '；': ';',
  '：': ':',
  '－': '-',
  '—': '-',
  '～': '~',
  '　': ' ',
}

function normalizeText(input: unknown): string {
  if (input == null) return ''
  let s = String(input)
  s = s.replace(/[（） ，、；：－—～　]/g, (c) => FULLWIDTH_MAP[c] ?? c)
  return s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim()
}

function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return normalizeText(v)
  if (typeof v === 'number' || typeof v === 'boolean') return normalizeText(v)
  if (v instanceof Date) return normalizeText(`${v.getFullYear()}-${v.getMonth() + 1}-${v.getDate()}`)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    // 富文本单元格（WPS 会给不同片段上色）
    if (Array.isArray(o.richText)) {
      return normalizeText((o.richText as { text?: string }[]).map((r) => r?.text ?? '').join(''))
    }
    if (typeof o.text === 'string') return normalizeText(o.text)
    if (typeof o.w === 'string') return normalizeText(o.w)
    if (o.v != null) return cellText(o.v)
  }
  return normalizeText(v)
}

const WEEKDAY_PATTERNS: { day: Weekday; re: RegExp }[] = [
  { day: 1, re: /(星期|周|礼拜)\s*[一1]/ },
  { day: 2, re: /(星期|周|礼拜)\s*[二2]/ },
  { day: 3, re: /(星期|周|礼拜)\s*[三3]/ },
  { day: 4, re: /(星期|周|礼拜)\s*[四4]/ },
  { day: 5, re: /(星期|周|礼拜)\s*[五5]/ },
  { day: 6, re: /(星期|周|礼拜)\s*[六6]/ },
  { day: 7, re: /(星期|周|礼拜)\s*[日天7]/ },
]

function detectWeekday(text: string): Weekday | null {
  for (const { day, re } of WEEKDAY_PATTERNS) if (re.test(text)) return day
  return null
}

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18,
  十九: 19, 二十: 20,
}

function toNumber(token: string): number | null {
  const t = token.trim()
  if (/^\d+$/.test(t)) return Number(t)
  if (CN_NUM[t] != null) return CN_NUM[t]
  return null
}

/** 解析节次描述，例如 "1-2节" / "3,4" / "第6-8节" / "1至2" */
export function parsePeriods(text: string): { start: number; end: number } | null {
  const t = normalizeText(text).replace(/第|节|课/g, '')
  const range = /(\d+|[一二三四五六七八九十]+)\s*[-~至]\s*(\d+|[一二三四五六七八九十]+)/.exec(t)
  if (range) {
    const a = toNumber(range[1])
    const b = toNumber(range[2])
    if (a != null && b != null) return { start: Math.min(a, b), end: Math.max(a, b) }
  }
  // 逗号列举
  const list = t.split(/[,;]/).map((x) => toNumber(x)).filter((x): x is number => x != null)
  if (list.length) return { start: Math.min(...list), end: Math.max(...list) }
  const single = /^(\d+|[一二三四五六七八九十]+)$/.exec(t)
  if (single) {
    const a = toNumber(single[1])
    if (a != null) return { start: a, end: a }
  }
  return null
}

/** 通过时间来推测节次（“08:00-09:35” → 1-2 节） */
export function periodsFromTime(text: string, periods = DEFAULT_PERIODS): { start: number; end: number } | null {
  const times = normalizeText(text).match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/)
  if (!times) return null
  const s = parseHM(times[1])
  const e = parseHM(times[2])
  let start: number | null = null
  let end: number | null = null
  for (const p of periods) {
    const ps = parseHM(p.start)
    const pe = parseHM(p.end)
    if (start == null && ps <= s && pe >= s) start = p.index
    if (pe <= e && (end == null || p.index > end)) end = p.index
    if (end == null && ps <= e && pe >= e) end = p.index
  }
  if (start == null) {
    // 容错：取最近的节次
    let best = Infinity
    for (const p of periods) {
      const d = Math.abs(parseHM(p.start) - s)
      if (d < best) {
        best = d
        start = p.index
      }
    }
  }
  if (end == null) end = start
  if (start == null || end == null) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

/** 解析周次：返回 [1..16] 这样的数组；无法识别返回 null（表示每周） */
export function parseWeeks(text: string, totalWeeks = 24): number[] | null {
  const raw = normalizeText(text)
  if (!raw) return null
  const odd =
    /(^|[^单])单周|\(单\)|（单）|\s单$|单个?周|奇数周/.test(raw) || /周\s*[（(]\s*单\s*[)）]/.test(raw)
  const even = /双周|\(双\)|（双）|\s双$|偶数周/.test(raw)
  const body = raw
    .replace(/[第周星期()（）]/g, ' ')
    .replace(/单双|单周|双周|每周|共|单|双/g, ' ')
    .trim()
  const set = new Set<number>()
  const segRe = /(\d+)\s*[-~至]\s*(\d+)|(\d+)/g
  let m: RegExpExecArray | null
  while ((m = segRe.exec(body))) {
    if (m[1] != null && m[2] != null) {
      const a = Number(m[1])
      const b = Number(m[2])
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= totalWeeks + 8) set.add(i)
    } else if (m[3] != null) {
      const a = Number(m[3])
      if (a >= 1 && a <= totalWeeks + 8) set.add(a)
    }
  }
  let weeks = [...set].sort((a, b) => a - b)
  if (odd) weeks = weeks.filter((w) => w % 2 === 1)
  if (even) weeks = weeks.filter((w) => w % 2 === 0)
  if (weeks.length === 0 && (odd || even)) {
    const max = totalWeeks
    for (let i = 1; i <= max; i++) if ((odd && i % 2 === 1) || (even && i % 2 === 0)) weeks.push(i)
  }
  return weeks.length ? weeks : null
}

/* ------------------------------------------------------------------ */
/* 单元格文本 → 课程信息                                                */
/* ------------------------------------------------------------------ */

/** 这些值等价于「没填」 */
const PLACEHOLDER = /^(无|没有|暂无|待定|未定|—+|-+|--+|N\/?A|null|空|网课|线上|慕课|MOOC)$/i

function clean(v: string | undefined): string | undefined {
  if (!v) return undefined
  const t = normalizeText(v)
  if (!t || PLACEHOLDER.test(t)) return undefined
  return t
}

interface CellParsed {
  name: string
  teacher?: string
  room?: string
  weeks: number[] | null
  note?: string
}

/** 解析 "课程名\n教师（1-16）\n地点" 这类块 */
export function parseCourseCell(text: string, totalWeeks: number): CellParsed | null {
  const lines = normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return null

  const name = clean(lines[0])
  if (!name) return null
  // “说明：…”“备注”“网课”之类直接跳过
  if (/^(说明|备注|注意)[:：]/.test(name)) return null
  if (/^(网课|线上|慕课|MOOC)/i.test(name)) return null

  let found: number[] | null = null
  /** 文本里出现过任何「周」相关字样（含"每周"） */
  let hasWeekInfo = false
  let note: string | undefined
  const extras: string[] = []

  for (const line of lines.slice(1)) {
    const paren = /[（(]([^()（）]*)[)）]/.exec(line)
    const w = parseWeeks(line, totalWeeks)
    const weekWord = /周/.test(line)
    if (weekWord) hasWeekInfo = true
    if (paren && /周/.test(paren[1])) hasWeekInfo = true

    if (w) {
      if (!found) found = w
      const marker = paren?.[1] ?? ''
      if (/(^|[^单])单周|\(单\)|\s单$|单个?周|奇数周/.test(marker) || /(^|[^单])单周|\(单\)|\s单$/.test(line)) {
        note = '单周'
      } else if (/双周|\(双\)|\s双$|偶数周/.test(marker) || /双周|\(双\)|\s双$/.test(line)) {
        note = '双周'
      }
    }

    let rest = line
    if (paren) rest = line.replace(paren[0], '').trim()
    // 去掉可能残留的 “1-16周”“每周”
    rest = rest.replace(/\d+\s*[-~至]?\s*\d*\s*周/g, '').replace(/每周|单周|双周/g, '').trim()
    if (rest) extras.push(rest)
  }

  // 单元格里只写了“每周”之类的说明 → 视为没有具体周次；完全没提周次 → 保持 null（由调用方决定）
  const weeks: number[] | null = found ?? (hasWeekInfo ? [] : null)

  let teacher: string | undefined
  let room: string | undefined

  // 有多行附加信息时，最后一行通常是地点
  if (extras.length >= 2) {
    teacher = clean(extras[0])
    room = clean(extras[extras.length - 1])
  } else if (extras.length === 1) {
    const only = extras[0]
    if (looksLikeRoom(only)) room = clean(only)
    else teacher = clean(only)
  }

  return { name, teacher, room, weeks, note }
}

function looksLikeRoom(text: string): boolean {
  if (/(楼|教室|室|馆|区|校区|院|中心|报告厅|操场|体育馆|实验室|机房)/.test(text)) return true
  // “公共学院8108”、“教1-101”
  if (/[\u4e00-\u9fa5]{2,}\s*[A-Za-z]?\d{3,4}/.test(text)) return true
  return false
}

/** 一个单元格可能塞了多门课（跨周分别上课） */
function splitMultiCourse(text: string): string[] {
  const t = normalizeText(text)
  if (!t) return []
  const byBlank = t.split(/\n{2,}/).filter(Boolean)
  if (byBlank.length > 1) return byBlank
  const bySemi = t.split(/\s*[;；]\s*/).filter(Boolean)
  if (bySemi.length > 1) return bySemi
  return [t]
}

/* ------------------------------------------------------------------ */
/* 主流程                                                             */
/* ------------------------------------------------------------------ */

export async function parseTimetableFile(
  data: ArrayBuffer,
  opts: { totalWeeks?: number } = {},
): Promise<ParseResult> {
  const totalWeeks = opts.totalWeeks ?? 20
  const wb = XLSX.read(data, { type: 'array', cellDates: true, cellText: false, cellFormula: false })
  const issues: ParseIssue[] = []
  const records: ParsedRecord[] = []
  const meta: Record<string, string> = {}

  let detected: ParseResult['detected'] = 'none'

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws || !ws['!ref']) continue
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    })
    if (!grid.length) continue

    const flat = tryFlatSheet(grid, sheetName, totalWeeks, issues, meta)
    if (flat.length) {
      detected = detected === 'none' ? 'flat' : detected
      records.push(...flat)
      continue
    }
    const g = tryGridSheet(ws, grid, sheetName, totalWeeks, issues)
    if (g.length) {
      detected = detected === 'none' ? 'grid' : detected
      records.push(...g)
      continue
    }
    issues.push({ sheet: sheetName, level: 'warn', message: '未识别为课表格式，已跳过' })
  }

  // 合并重复记录（同课同时段同周次即视为同一条，地点/教师互补）
  const merged = new Map<string, ParsedRecord>()
  for (const r of records) {
    const key = `${r.name}|${r.day}|${r.startPeriod}|${r.endPeriod}|${r.weeks.join(',')}`
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, r)
      continue
    }
    merged.set(key, {
      ...prev,
      room: prev.room ?? r.room,
      teacher: prev.teacher ?? r.teacher,
      note: prev.note ?? r.note,
    })
  }

  // 二次去重：按「课程 + 星期 + 节次」汇总（不含教师）。
  // 场景：网格表写「线性代数 张老师（1-16）」，清单表写「线性代数 / 1-2节 / A101」但没写教师，
  //      两者去重键不同、会各留一条。这里统一成一条：有明确周次的优先，
  //      教师/地点从互补的记录里补全；只有两边都写了不同教师时才保留两条。
  const firstPass = [...merged.values()]
  const bySlotNoTeacher = new Map<string, ParsedRecord[]>()
  for (const r of firstPass) {
    const k = `${r.name}|${r.day}|${r.startPeriod}|${r.endPeriod}`
    const arr = bySlotNoTeacher.get(k) ?? []
    arr.push(r)
    bySlotNoTeacher.set(k, arr)
  }
  const final: ParsedRecord[] = []
  for (const arr of bySlotNoTeacher.values()) {
    if (arr.length === 1) {
      final.push(arr[0])
      continue
    }
    const withWeeks = arr.filter((x) => x.weeks.length > 0)
    const weekly = arr.filter((x) => x.weeks.length === 0)
    if (withWeeks.length > 0) {
      // 有周次的都留下（可能有多位老师各带部分周次）
      for (const a of withWeeks) {
        for (const b of arr) {
          a.room = a.room ?? b.room
          a.teacher = a.teacher ?? b.teacher
        }
      }
      final.push(...withWeeks)
      // 无周次的只有「教师不一致」才作为独立安排保留
      for (const wk of weekly) {
        const differs = withWeeks.every((x) => {
          const a = (x.teacher ?? '').trim()
          const b = (wk.teacher ?? '').trim()
          return a !== '' && b !== '' && a !== b
        })
        if (differs) final.push(wk)
      }
    } else {
      final.push(...weekly)
    }
  }

  return {
    records: final.sort(
      (a, b) => a.day - b.day || a.startPeriod - b.startPeriod || a.name.localeCompare(b.name),
    ),
    issues,
    sheets: wb.SheetNames,
    detected,
    meta,
  }
}

/* ---------------- 扁平清单表 ---------------- */

const FLAT_KEYS = {
  name: /课程名称|课程名|科目|教学班/,
  day: /星期|周几|上课日/,
  period: /节次|节数|课节/,
  time: /上课时间|时间/,
  room: /地点|教室|上课地点|场地|教室名称/,
  teacher: /教师|老师|任课/,
  weeks: /周次|教学周|起止周/,
} as const

function findHeaderRow(grid: unknown[][]): { row: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    const row = grid[r] ?? []
    const cols: Record<string, number> = {}
    row.forEach((cell, c) => {
      const t = cellText(cell)
      if (!t) return
      for (const [key, re] of Object.entries(FLAT_KEYS)) {
        if (cols[key] == null && re.test(t)) cols[key] = c
      }
    })
    if (cols.name != null && (cols.day != null || cols.time != null || cols.period != null)) {
      return { row: r, cols }
    }
  }
  return null
}

function tryFlatSheet(
  grid: unknown[][],
  sheetName: string,
  totalWeeks: number,
  issues: ParseIssue[],
  meta: Record<string, string>,
): ParsedRecord[] {
  const header = findHeaderRow(grid)
  if (!header) return []
  const { row: headerRow, cols } = header
  meta[sheetName] = Object.entries(cols)
    .map(([k, v]) => `${k}=第${v + 1}列`)
    .join(', ')

  const out: ParsedRecord[] = []
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const name = cellText(row[cols.name])
    if (!name) continue
    if (/^(合计|备注|说明)/.test(name)) continue

    const day = cols.day != null ? detectWeekday(cellText(row[cols.day])) : null
    let period = cols.period != null ? parsePeriods(cellText(row[cols.period])) : null
    if (!period && cols.time != null) period = periodsFromTime(cellText(row[cols.time]), DEFAULT_PERIODS)

    const weeksCell = cols.weeks != null ? cellText(row[cols.weeks]) : ''
    const weeks = parseWeeks(weeksCell, totalWeeks) ?? []
    const room = clean(cols.room != null ? cellText(row[cols.room]) : undefined)
    const teacher = clean(cols.teacher != null ? cellText(row[cols.teacher]) : undefined)
    const note = /单周/.test(weeksCell) ? '单周' : /双周/.test(weeksCell) ? '双周' : undefined

    if (day == null || !period) {
      // 尝试从整行里兜底识别
      const joined = row.map(cellText).join(' ')
      const d2 = day ?? detectWeekday(joined)
      const p2 = period ?? parsePeriods(joined) ?? periodsFromTime(joined, DEFAULT_PERIODS)
      if (d2 == null || !p2) {
        issues.push({
          sheet: sheetName,
          level: 'warn',
          message: `第 ${r + 1} 行无法确定上课时间，已跳过`,
          raw: joined.slice(0, 80),
        })
        continue
      }
      out.push({
        name,
        day: d2,
        startPeriod: p2.start,
        endPeriod: p2.end,
        weeks,
        room,
        teacher,
        note,
      })
      continue
    }

    out.push({
      name,
      day,
      startPeriod: period.start,
      endPeriod: period.end,
      weeks,
      room,
      teacher,
      note,
    })
  }
  return out
}

/* ---------------- 网格表 ---------------- */

function decodeCell(ws: XLSX.WorkSheet, r: number, c: number): string {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = ws[addr] as XLSX.CellObject | undefined
  if (!cell) return ''
  if (cell.t === 's' && typeof cell.v === 'string') return normalizeText(cell.v)
  return cellText(cell.v)
}

/** 找出合并区域的“左上角”，其余位置返回 null */
function buildMergeIndex(ws: XLSX.WorkSheet) {
  const anchor = new Map<string, { r: number; c: number }>()
  const covered = new Set<string>()
  const merges = ws['!merges'] ?? []
  for (const m of merges) {
    anchor.set(`${m.s.r},${m.s.c}`, { r: m.s.r, c: m.s.c })
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const k = `${r},${c}`
        if (r === m.s.r && c === m.s.c) continue
        covered.add(k)
        anchor.set(k, { r: m.s.r, c: m.s.c })
      }
    }
  }
  return { anchor, covered }
}

function tryGridSheet(
  ws: XLSX.WorkSheet,
  grid: unknown[][],
  sheetName: string,
  totalWeeks: number,
  issues: ParseIssue[],
): ParsedRecord[] {
  const { anchor, covered } = buildMergeIndex(ws)
  const maxRow = grid.length
  const maxCol = Math.max(...grid.map((r) => (r?.length ?? 0)), 0)
  if (!maxRow || !maxCol) return []

  // 1) 找星期表头：某一行里至少出现 3 个星期列
  let headerRow = -1
  let dayOfCol = new Map<number, Weekday>()
  for (let r = 0; r < Math.min(maxRow, 10); r++) {
    const map = new Map<number, Weekday>()
    for (let c = 0; c < maxCol; c++) {
      const d = detectWeekday(decodeCell(ws, r, c))
      if (d != null) map.set(c, d)
    }
    if (map.size >= 3) {
      headerRow = r
      dayOfCol = map
      break
    }
  }
  // 网格表必须至少有两列星期，否则会把「课程清单」的“星期”列误判成网格
  if (headerRow < 0 || dayOfCol.size < 2) return []

  // 2) 逐行找节次
  const periodOfRow = new Map<number, { start: number; end: number }>()
  for (let r = headerRow + 1; r < maxRow; r++) {
    const label = decodeCell(ws, r, 0) || decodeCell(ws, r, 1)
    const p = parsePeriods(label.split('\n')[0] ?? label)
    const pt = periodsFromTime(label, DEFAULT_PERIODS)
    const resolved = p ?? pt
    if (resolved) periodOfRow.set(r, resolved)
  }

  // 行跨度：合并单元格可能覆盖多行，用列 0 的取值行判断
  const out: ParsedRecord[] = []
  const rows = [...periodOfRow.keys()].sort((a, b) => a - b)

  for (const [c, day] of dayOfCol) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      // 只在合并区域左上角处理一次
      const key = `${r},${c}`
      const a = anchor.get(key)
      if (covered.has(key) && a && !(a.r === r && a.c === c)) continue
      const text = decodeCell(ws, r, c)
      if (!text) continue

      // 该合并区域覆盖的节次区间
      const region = (ws['!merges'] ?? []).find((m) => m.s.r === r && m.s.c === c)
      const endRow = region ? region.e.r : r
      const startPeriod = periodOfRow.get(r)!.start
      let endPeriod = periodOfRow.get(r)!.end
      for (let rr = r; rr <= Math.min(endRow, maxRow - 1); rr++) {
        const p = periodOfRow.get(rr)
        if (p) endPeriod = Math.max(endPeriod, p.end)
      }

      for (const chunk of splitMultiCourse(text)) {
        const parsed = parseCourseCell(chunk, totalWeeks)
        if (!parsed) continue
        out.push({
          name: parsed.name,
          day,
          startPeriod,
          endPeriod: Math.max(startPeriod, endPeriod),
          weeks: parsed.weeks ?? [],
          room: parsed.room,
          teacher: parsed.teacher,
          note: parsed.note,
        })
      }
    }
  }

  if (!out.length) return []
  issues.push({
    sheet: sheetName,
    level: 'warn',
    message: `按网格表解析：星期表头在第 ${headerRow + 1} 行，识别到 ${out.length} 个上课时段`,
  })
  return out
}

/** 从文本文件（csv/txt）解析，方便用户手改 */
export async function parseTextTimetable(text: string, totalWeeks = 20): Promise<ParseResult> {
  const wb = XLSX.read(text, { type: 'string' })
  const first = wb.Sheets[wb.SheetNames[0]]
  const csv = XLSX.utils.sheet_to_csv(first)
  const buf = new TextEncoder().encode(csv).buffer
  return parseTimetableFile(buf as ArrayBuffer, { totalWeeks })
}
