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

async function load(entry, tag = '') {
  const outfile = join(out, `${entry.replace(/[\\/]/g, '_')}${tag}.mjs`)
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

/* ---------------- store.ts：持久化 ----------------
   回归：浮窗里勾掉的「已上完」原来只存在组件 useState 里，重启全部丢失。
   这里用假的 localStorage 直接验证「写入 → 重新加载模块 → 状态还在」。 */
console.log('\n[store 持久化]')
{
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  }
  globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {} }

  const KEY = 'lumen-course-v1'
  const readState = () => {
    try {
      return JSON.parse(mem.get(KEY) ?? 'null')?.state ?? null
    } catch {
      return null
    }
  }

  const s1 = await load('src/store.ts')
  const first = s1.useApp.getState()
  check('初始「已上完」为空', Object.keys(first.doneClasses).length === 0)

  const d1 = new Date(2026, 2, 2) // 2026-03-02
  const d2 = new Date(2026, 2, 9) // 下一周
  first.toggleClassDone('crs_a', 'ses_1', d1)
  const k1 = s1.classDoneKey('crs_a', 'ses_1', d1)
  check('键 = 日期|课程|课次', k1 === '2026-03-02|crs_a|ses_1', k1)
  check('同课次不同日期 → 不同键', s1.classDoneKey('crs_a', 'ses_1', d2) !== k1)
  check('勾选后立即写入 localStorage', !!readState()?.doneClasses?.[k1], JSON.stringify(readState()?.doneClasses))

  // 重新加载模块 = 重启应用（同一个 localStorage）
  const s2 = await load('src/store.ts', '_restart')
  const reopened = s2.useApp.getState()
  check('重启后勾选状态仍在', reopened.doneClasses[k1] === true, JSON.stringify(reopened.doneClasses))
  check('重启后其它字段也在', Array.isArray(reopened.courses) && !!reopened.settings)

  // 取消勾选也要落盘
  reopened.toggleClassDone('crs_a', 'ses_1', d1)
  check('取消勾选后从存储里移除', !readState()?.doneClasses?.[k1])

  // 跨窗口：另一个窗口写了新值，rehydrate 必须能拉过来
  const remoteKey = '2026-03-02|crs_b|ses_9'
  mem.set(KEY, JSON.stringify({ state: { ...readState(), doneClasses: { [remoteKey]: true } }, version: 1 }))
  s2.rehydrateFromStorage(true)
  check('rehydrate 拉到另一个窗口写入的勾选', s2.useApp.getState().doneClasses[remoteKey] === true)

  // 过期清理：只保留最近三周
  const st = s2.useApp.getState()
  st.toggleClassDone('crs_c', 'ses_3', new Date())
  st.toggleClassDone('crs_c', 'ses_4', new Date(2000, 0, 1))
  s2.useApp.getState().pruneClassDone()
  const after = readState()?.doneClasses ?? {}
  check('过期记录被清理', after['2000-01-01|crs_c|ses_4'] === undefined, JSON.stringify(Object.keys(after)))
  check('近期记录被保留', !!after[s2.classDoneKey('crs_c', 'ses_3')])

  /* ---- 待办：归档 / 恢复 / 撤销的状态机 ----
     进行中列表过滤 !done，归档列表过滤 archived。
     只要出现「done=true 且 archived=false」，待办就会在两个列表里都消失。 */
  const st2 = s2.useApp.getState()
  st2.addTodo({ id: 'td_1', title: '测试待办' })
  const find = () => s2.useApp.getState().todos.find((x) => x.id === 'td_1')
  check('新建待办默认未完成未归档', find().done === false && find().archived === false)
  s2.useApp.getState().archiveTodo('td_1')
  check('归档后 done 与 archived 都为真', find().done === true && find().archived === true)
  s2.useApp.getState().restoreTodo('td_1')
  const t1 = find()
  check('恢复归档后 archived=false', t1.archived === false)
  check('恢复归档后 done 也被清掉', t1.done === false, `done=${t1.done}`)

  // 退出时卡在「已完成但还没归档」→ 启动自愈必须补归档
  s2.useApp.getState().toggleTodo('td_1', true)
  s2.useApp.getState().normalizeOnStartup()
  const t2 = find()
  check('孤儿「已完成」被启动自愈归档', t2.archived === true && t2.done === true)

  // 撤销：勾选后立刻恢复，延迟归档不能再把它收走
  s2.useApp.getState().restoreTodo('td_1')
  const t3 = find()
  check('撤销后回到未完成未归档（延迟归档被拦下）', t3.done === false && t3.archived === false)
}

console.log(`\n${failures.length ? `❌ ${failures.length} 项失败` : '✅ 全部通过'}`)
process.exit(failures.length ? 1 : 0)
