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
