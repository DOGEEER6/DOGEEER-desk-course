/**
 * 课表一致性校验：把 Excel 解析出来的每一条记录,
 * 与实际排进课表（localStorage 里的 courses/sessions）的数据逐条比对。
 *
 *   node scripts/verify-schedule.mjs [xlsx路径] [CDP端口] [目标URL片段]
 *
 * 校验维度：课程名 / 星期 / 起止节次 / 周次集 / 地点
 */
import { build } from 'esbuild'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const cache = join(root, 'node_modules', '.cache', 'lumen-selftest')
mkdirSync(cache, { recursive: true })

const xlsxPath = process.argv[2] ?? 'D:\\dsh\\_seu_timetable.xlsx'
const PORT = Number(process.env.LUMEN_CDP_PORT ?? process.argv[3] ?? 9333)
const TARGET_HINT = process.env.LUMEN_TARGET ?? process.argv[4] ?? 'tauri.localhost'

/* ---------- 1. 解析 Excel ---------- */
const outfile = join(cache, 'excel-verify.mjs')
await build({
  entryPoints: [resolve(root, 'src/lib/excel.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['xlsx'],
  logLevel: 'warning',
})
const { parseTimetableFile } = await import(pathToFileURL(outfile).href)
const buf = readFileSync(xlsxPath)
const parsed = await parseTimetableFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
  totalWeeks: 24,
})

/** 解析结果 → 可比对的键 */
const norm = (r) => ({
  name: r.name.trim(),
  day: r.day,
  startPeriod: r.startPeriod,
  endPeriod: r.endPeriod,
  weeks: [...new Set(r.weeks)].sort((a, b) => a - b).join(','),
  room: (r.room ?? '').trim(),
})

const expectMap = new Map()
for (const r of parsed.records) {
  const k = norm(r)
  const key = `${k.name}|${k.day}|${k.startPeriod}-${k.endPeriod}|${k.weeks}`
  expectMap.set(key, { ...k, hits: (expectMap.get(key)?.hits ?? 0) + 1 })
}

/* ---------- 2. 读取应用内的实际排课 ---------- */
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page =
  targets.find((t) => t.type === 'page' && t.url.includes(TARGET_HINT) && !t.url.includes('mini')) ??
  targets.find((t) => t.type === 'page')
if (!page) {
  console.error(`找不到目标页面（port=${PORT}）`)
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let id = 0
const pend = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id
    pend.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300))
  return r.result?.result?.value
}
await send('Runtime.enable')

const raw = await evaluate(`return localStorage.getItem('lumen-course-v1')`)
if (!raw) {
  console.error('应用里没有课程数据（先导入一次课表）')
  process.exit(1)
}
const store = JSON.parse(raw)
const courses = store.state.courses

/** 应用内的实际时段 → 可比对的键 */
const actualMap = new Map()
for (const c of courses) {
  for (const s of c.sessions) {
    if (s.draft) continue // 未排课的不参与
    const weeks = [...new Set(s.weeks ?? [])].sort((a, b) => a - b).join(',')
    const key = `${c.name.trim()}|${s.day}|${s.startPeriod}-${s.endPeriod}|${weeks}`
    actualMap.set(key, {
      name: c.name.trim(),
      day: s.day,
      startPeriod: s.startPeriod,
      endPeriod: s.endPeriod,
      weeks,
      room: (s.room ?? c.room ?? '').trim(),
    })
  }
}

/* ---------- 3. 逐条比对 ---------- */
const missing = [] // 表格里有、课表里没有
const extra = [] // 课表里有、表格里没有
const roomMismatch = [] // 时段对上了但地点不一致

for (const [key, e] of expectMap) {
  const a = actualMap.get(key)
  if (!a) {
    missing.push(e)
    continue
  }
  if (e.room && a.room && e.room !== a.room) {
    roomMismatch.push({ key, expect: e.room, actual: a.room })
  }
}
for (const [key, a] of actualMap) {
  if (!expectMap.has(key)) extra.push(a)
}

/* ---------- 4. 报告 ---------- */
const DAY = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
const fmt = (x) =>
  `${DAY[x.day]} 第${x.startPeriod}-${x.endPeriod}节  ${x.name}  [${
    x.weeks ? `第 ${x.weeks} 周` : '每周'
  }]${x.room ? ` @${x.room}` : ''}`

console.log(`\n表格解析：${parsed.records.length} 条时段，去重后 ${expectMap.size} 个唯一「课程+时间+周次」`)
console.log(`课表实际：${courses.length} 门课，${actualMap.size} 个已排时段（不含未排课托盘）\n`)

let fail = 0
if (missing.length) {
  fail += missing.length
  console.log(`❌ 表格里有、课表里缺失（${missing.length}）：`)
  for (const m of missing) console.log(`   · ${fmt(m)}`)
} else {
  console.log('✅ 表格里每一条时段都能在课表中找到')
}

if (extra.length) {
  fail += extra.length
  console.log(`\n⚠️  课表里有、表格里没有（${extra.length}）——可能是手动添加或拖拽调整过的：`)
  for (const x of extra) console.log(`   · ${fmt(x)}`)
} else {
  console.log('✅ 课表里没有多余的时段')
}

if (roomMismatch.length) {
  console.log(`\n⚠️  地点不一致（${roomMismatch.length}）：`)
  for (const m of roomMismatch) console.log(`   · ${m.key}\n       表格=${m.expect}  课表=${m.actual}`)
} else {
  console.log('✅ 地点全部一致')
}

console.log(
  `\n汇总：缺失 ${missing.length} · 多余 ${extra.length} · 地点不符 ${roomMismatch.length} —— ${
    fail === 0 ? '与表格一致 ✅' : '存在差异，请核对 ⚠️'
  }`,
)
ws.close()
process.exit(0)
