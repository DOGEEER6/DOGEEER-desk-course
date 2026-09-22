/**
 * 解析器自测：把 src/lib 下的 TS 用 esbuild 转译后直接跑真实课表。
 *   node scripts/selftest.mjs "D:/path/to/课表.xlsx"
 */
import { build } from 'esbuild'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
// 放在项目内，保证 node 能解析到 xlsx 依赖
const out = join(root, 'node_modules', '.cache', 'lumen-selftest')
mkdirSync(out, { recursive: true })

async function load(entry) {
  const outfile = join(out, `${entry.replace(/[\\/]/g, '_')}.mjs`)
  await build({
    entryPoints: [resolve(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: ['xlsx'],
    logLevel: 'warning',
  })
  return import(pathToFileURL(outfile).href)
}

const failures = []
function check(name, cond, extra = '') {
  const ok = !!cond
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures.push(name)
}

/* ---------------- time.ts ---------------- */
const time = await load('src/lib/time.ts')
const { parseWeeks, parsePeriods } = await load('src/lib/excel.ts')

console.log('\n[parsePeriods]')
check('1-2节 -> 1..2', JSON.stringify(parsePeriods('1-2节')) === '{"start":1,"end":2}')
check('第6-8节 -> 6..8', JSON.stringify(parsePeriods('第6-8节')) === '{"start":6,"end":8}')
check('3,4 -> 3..4', JSON.stringify(parsePeriods('3,4')) === '{"start":3,"end":4}')
check('11 -> 11..11', JSON.stringify(parsePeriods('11')) === '{"start":11,"end":11}')
check('无意义文本 -> null', parsePeriods('地点') === null)

console.log('\n[parseWeeks]')
const w = (s) => JSON.stringify(parseWeeks(s, 20))
check('1-16周 -> 16 周', w('1-16周') === JSON.stringify(Array.from({ length: 16 }, (_, i) => i + 1)))
check('1-4', w('1-4') === '[1,2,3,4]')
check('1,3,5', w('1,3,5') === '[1,3,5]')
check('第3-5周', w('第3-5周') === '[3,4,5]')
check('6-7', w('6-7') === '[6,7]')
check('每周 -> null', parseWeeks('每周', 20) === null)
check('无 -> null', parseWeeks('', 20) === null)
const odd = parseWeeks('1-8周(单)', 20)
check('1-8周(单) -> 全奇数', JSON.stringify(odd) === '[1,3,5,7]', JSON.stringify(odd))

console.log('\n[weekIndexOf / mondayOfWeek]')
// 2026-09-07 是周一
check('开学周本身是第 1 周', time.weekIndexOf('2026-09-07', new Date(2026, 8, 7)) === 1)
check('同周周日仍是第 1 周', time.weekIndexOf('2026-09-07', new Date(2026, 8, 13)) === 1)
check('下周一是第 2 周', time.weekIndexOf('2026-09-07', new Date(2026, 8, 14)) === 2)
check('上周日是第 0 周', time.weekIndexOf('2026-09-07', new Date(2026, 8, 6)) === 0)
check(
  'mondayOfWeek(3) = 2026-09-21',
  time.dateKey(time.mondayOfWeek('2026-09-07', 3)) === '2026-09-21',
)
check('dateOfWeekDay 周三', time.dateKey(time.mondayOfWeek('2026-09-07', 2)) === '2026-09-14')

console.log('\n[dueLabel]')
const dl = time.dueLabel(new Date(2026, 8, 10, 18, 0).toISOString(), new Date(2026, 8, 10, 9, 0))
check('今天截止', dl.tone === 'today', dl.text)

/* ---------------- snap.ts ---------------- */
const snap = await load('src/lib/snap.ts')
const DAYS = [1, 2, 3, 4, 5]
const base = {
  session: { day: 2, startPeriod: 3, endPeriod: 4 },
  colWidth: 100,
  rowHeight: 68,
  days: DAYS,
  totalPeriods: 13,
}
const S = (o) => snap.snapDrag({ mode: 'move', dx: 0, dy: 0, ...base, ...o })

console.log('\n[snapDrag / move]')
check('不动 → 原地', JSON.stringify(S({})) === '{"day":2,"startPeriod":3,"endPeriod":4}')
check('右移一格 → 周三', S({ dx: 100 }).day === 3)
check('右移不到半格 → 仍是周二', S({ dx: 40 }).day === 2)
check('右移超过一格半 → 周四', S({ dx: 160 }).day === 4)
check('下移一格 → 4-5 节', JSON.stringify([S({ dy: 68 }).startPeriod, S({ dy: 68 }).endPeriod]) === '[4,5]')
check('时长保持不变', S({ dy: 68 }).endPeriod - S({ dy: 68 }).startPeriod === 1)
check('上移超过顶部 → 夹到 1-2 节', JSON.stringify([S({ dy: -680 }).startPeriod, S({ dy: -680 }).endPeriod]) === '[1,2]')
check(
  '下移超过底部 → 夹到 12-13 节',
  JSON.stringify([S({ dy: 9999 }).startPeriod, S({ dy: 9999 }).endPeriod]) === '[12,13]',
)
check('左移超过第一列 → 夹到周一且保留节次', JSON.stringify([S({ dx: -999 }).day, S({ dx: -999 }).startPeriod]) === '[1,3]')
check('右移超过最后一列 → 夹到周五', S({ dx: 9999 }).day === 5)

console.log('\n[snapDrag / resize]')
check(
  '向下拉长一格 → 3-5 节',
  JSON.stringify([S({ mode: 'resize-end', dy: 68 }).startPeriod, S({ mode: 'resize-end', dy: 68 }).endPeriod]) === '[3,5]',
)
check('向下缩短一格 → 3-3 节', JSON.stringify([S({ mode: 'resize-end', dy: -68 }).endPeriod]) === '[3]')
check(
  '结束节次不会小于起始节次',
  S({ mode: 'resize-end', dy: -999 }).endPeriod === 3,
)
check('结束节次不会超过总节次', S({ mode: 'resize-end', dy: 999 }).endPeriod === 13)
check(
  '向上拉长一格 → 2-4 节',
  JSON.stringify([S({ mode: 'resize-start', dy: -68 }).startPeriod, S({ mode: 'resize-start', dy: -68 }).endPeriod]) === '[2,4]',
)
check('起始节次不会大于结束节次', S({ mode: 'resize-start', dy: 999 }).startPeriod === 4)
check('起始节次不会小于 1', S({ mode: 'resize-start', dy: -999 }).startPeriod === 1)
check('拉伸不改星期', S({ mode: 'resize-end', dx: 500 }).day === 2)

console.log('\n[isDragGesture]')
check('微小抖动不算拖动', snap.isDragGesture(2, 2) === false)
check('明显位移算拖动', snap.isDragGesture(9, 0) === true)

/* ---------------- 合并策略：同名同时段 ---------------- */
console.log('\n[合并策略：同名同时段]')
const XLSX = await import('xlsx')
const parser = await load('src/lib/excel.ts')
{
  // 网格表：线性代数 周二 1-2 节 张老师（1-16）；清单表同名同时段但没写教师
  const grid = [
    ['星期\n节次', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    ['1\n08:00-08:45', '', '线性代数\n张老师（1-16）\nA101', '', '', '', '', ''],
    ['2\n08:50-09:35', '', '', '', '', '', '', ''],
  ]
  const wb = XLSX.utils.book_new()
  const wsG = XLSX.utils.aoa_to_sheet(grid)
  // 合并 B2:B3 → 表示第 1-2 节连堂（真实教务表格就是这么标的）
  wsG['!merges'] = [XLSX.utils.decode_range('C2:C3')]
  XLSX.utils.book_append_sheet(wb, wsG, '课程表')
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['课程名称', '星期', '节次', '地点'],
      ['线性代数', '星期二', '1-2节', 'A101'],
    ]),
    '课程清单',
  )
  const res = await parser.parseTimetableFile(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), {
    totalWeeks: 20,
  })
  const las = res.records.filter((r) => r.name === '线性代数')
  check('清单表没写教师 → 与网格表合并为 1 条', las.length === 1, `实际 ${las.length} 条`)
}
{
  // 同一时段两位老师各带部分周次 → 必须保留两条
  const grid = [
    ['星期\n节次', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    ['1\n08:00-08:45', '', '线性代数\n张老师（1-8）\nA101', '', '', '', '', ''],
    ['2\n08:50-09:35', '', '', '', '', '', '', ''],
  ]
  const wb = XLSX.utils.book_new()
  const wsG2 = XLSX.utils.aoa_to_sheet(grid)
  wsG2['!merges'] = [XLSX.utils.decode_range('C2:C3')]
  XLSX.utils.book_append_sheet(wb, wsG2, '课程表')
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['课程名称', '星期', '节次', '地点', '教师'],
      ['线性代数', '星期二', '1-2节', 'A101', '李老师'],
    ]),
    '课程清单',
  )
  const res = await parser.parseTimetableFile(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), {
    totalWeeks: 20,
  })
  const las = res.records.filter((r) => r.name === '线性代数')
  check(
    '两位老师各带部分周次 → 保留 2 条',
    las.length === 2,
    las.map((r) => r.teacher ?? '-').join(' , '),
  )
}

/* ---------------- excel.ts ---------------- */
const file = process.argv[2]
if (file) {
  console.log(`\n[parseTimetableFile] ${file}`)
  const { parseTimetableFile } = await load('src/lib/excel.ts')
  const buf = readFileSync(resolve(file))
  const res = await parseTimetableFile(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    { totalWeeks: 20 },
  )
  console.log(`  detected=${res.detected} records=${res.records.length} sheets=${res.sheets.join('|')}`)
  for (const r of res.records) {
    console.log(
      `   · 周${r.day} ${r.startPeriod}-${r.endPeriod}节 ${r.name} | ${r.teacher ?? '-'} | ${r.room ?? '-'} | ${
        r.weeks.length ? `${r.weeks[0]}-${r.weeks.at(-1)}(${r.weeks.length}周)` : '每周'
      }`,
    )
  }
  for (const i of res.issues) console.log(`   ! [${i.sheet}] ${i.message}`)
  check('解析出课程', res.records.length > 0)
  check('识别到周次信息', res.records.some((r) => r.weeks.length > 0))
  check('没有缺星期的记录', res.records.every((r) => r.day >= 1 && r.day <= 7))
  check('节次区间合法', res.records.every((r) => r.startPeriod >= 1 && r.endPeriod >= r.startPeriod))
} else {
  console.log('\n(未提供 xlsx 路径，跳过文件解析测试)')
}

console.log(`\n${failures.length ? `❌ ${failures.length} 项失败` : '✅ 全部通过'}`)
process.exit(failures.length ? 1 : 0)
