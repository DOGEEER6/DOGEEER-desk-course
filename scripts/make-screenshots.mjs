/**
 * 生成 README 用的截图：注入真实课表 → 逐个界面截图 → 输出到 docs/screenshots
 *
 *   node scripts/make-screenshots.mjs [xlsx路径]
 *
 * 需要先启动 dev server（npm run dev，端口 5183），并让 Edge 以
 * --remote-debugging-port=9333 打开该页面。
 */
import { build } from 'esbuild'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const cache = join(root, 'node_modules/.cache/lumen-selftest')
const outDir = join(root, 'docs/screenshots')
mkdirSync(cache, { recursive: true })
mkdirSync(outDir, { recursive: true })

const xlsxPath = process.argv[2] ?? 'D:\\dsh\\_seu_timetable.xlsx'
const PORT = Number(process.env.LUMEN_CDP_PORT ?? 9333)
/** 截图宽度（高度按视口比例自动） */
const VIEW = { width: 1440, height: 900 }

/* ---------- 1. 解析课表，构造要注入的数据 ---------- */
const outfile = join(cache, 'excel-shot.mjs')
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
  totalWeeks: 20,
})
console.log(`解析到 ${parsed.records.length} 个时段`)

const courses = []
const idx = new Map()
for (const r of parsed.records) {
  const key = `${r.name}||${r.teacher ?? ''}`
  if (!idx.has(key)) {
    idx.set(key, courses.length)
    courses.push({
      id: `crs_${courses.length}`,
      name: r.name,
      teacher: r.teacher,
      room: r.room,
      color: courses.length % 12,
      sessions: [],
      notes: r.name.includes('数学')
        ? '期中范围：第 1-5 章\n重点：洛必达法则、泰勒展开、定积分换元'
        : '',
    })
  }
  courses[idx.get(key)].sessions.push({
    id: `ses_${courses.length}_${courses[idx.get(key)].sessions.length}`,
    day: r.day,
    startPeriod: r.startPeriod,
    endPeriod: r.endPeriod,
    weeks: r.weeks,
    room: r.room,
    teacher: r.teacher,
    remind: true,
  })
}

const today = new Date()
const monday = new Date(today)
const wd = monday.getDay() === 0 ? 7 : monday.getDay()
monday.setDate(monday.getDate() - (wd - 1))
const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const todos = [
  {
    id: 'td_shot_1',
    title: '工科数学分析 第五章习题',
    done: false,
    dueAt: new Date(today.getTime() + 5 * 3600e3).toISOString(),
    priority: 'high',
    courseId: courses.find((c) => c.name.includes('数学'))?.id,
    notes: '第 1-8 题，需要写完整推导过程',
    createdAt: today.toISOString(),
  },
  {
    id: 'td_shot_2',
    title: '程序设计实践 A(I) 实验报告',
    done: false,
    dueAt: new Date(today.getTime() + 2 * 86400e3).toISOString(),
    priority: 'normal',
    courseId: courses.find((c) => c.name.includes('程序设计'))?.id,
    startAt: new Date(today.getTime() + 86400e3).toISOString(),
    notes: '附录要贴运行截图与测试用例',
    createdAt: today.toISOString(),
  },
  {
    id: 'td_shot_3',
    title: '国际交流英语 presentation 选题',
    done: false,
    dueAt: new Date(today.getTime() + 4 * 86400e3).toISOString(),
    priority: 'low',
    courseId: courses.find((c) => c.name.includes('国际交流'))?.id,
    createdAt: today.toISOString(),
  },
  {
    id: 'td_shot_4',
    title: '军事理论 课程论文',
    done: true,
    archived: true,
    dueAt: new Date(today.getTime() - 86400e3).toISOString(),
    priority: 'normal',
    completedAt: today.toISOString(),
    createdAt: today.toISOString(),
  },
]

const payload = {
  state: {
    courses,
    todos,
    periods: [
      { index: 1, start: '08:00', end: '08:45' },
      { index: 2, start: '08:50', end: '09:35' },
      { index: 3, start: '09:50', end: '10:35' },
      { index: 4, start: '10:40', end: '11:25' },
      { index: 5, start: '11:30', end: '12:15' },
      { index: 6, start: '14:00', end: '14:45' },
      { index: 7, start: '14:50', end: '15:35' },
      { index: 8, start: '15:50', end: '16:35' },
      { index: 9, start: '16:40', end: '17:25' },
      { index: 10, start: '17:30', end: '18:15' },
      { index: 11, start: '19:00', end: '19:45' },
      { index: 12, start: '19:50', end: '20:35' },
      { index: 13, start: '20:40', end: '21:25' },
    ],
    settings: {
      semester: { startDate: key(monday), totalWeeks: 16 },
      // 截图时关掉提醒：否则启动瞬间弹出的横幅会挡住待办卡片
      reminders: { enabled: false, leadMinutes: 15, inApp: false, system: false, sound: false },
      showWeekend: false,
      tickSeconds: 30,
      miniAlwaysOnTop: false,
      theme: 'light',
    },
  },
  version: 1,
}

/* ---------- 2. CDP ---------- */
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page =
  targets.find((t) => t.type === 'page' && t.url.includes('5183') && !t.url.includes('mini')) ??
  targets.find((t) => t.type === 'page' && !t.url.includes('mini'))
if (!page) {
  console.error(`找不到页面（port=${PORT}）。先跑 npm run dev 并用 Edge 打开 127.0.0.1:5183`)
  process.exit(1)
}
const miniTarget = targets.find((t) => t.type === 'page' && t.url.includes('mini'))

function attach(target) {
  return new Promise(async (res, rej) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    ws.onopen = () => {
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
        new Promise((r) => {
          const i = ++id
          pend.set(i, r)
          ws.send(JSON.stringify({ id: i, method, params }))
        })
      const evaluate = async (expr) => {
        const r = await send('Runtime.evaluate', {
          expression: `(async () => { ${expr} })()`,
          awaitPromise: true,
          returnByValue: true,
        })
        if (r.result?.exceptionDetails) {
          throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200))
        }
        return r.result?.result?.value
      }
      res({ ws, send, evaluate })
    }
    ws.onerror = rej
  })
}
const P = await attach(page)
console.log('目标页面:', page.url)

await P.send('Page.enable')
await P.send('Runtime.enable')
await P.send('Page.bringToFront')
// 固定视口，保证截图尺寸一致
await P.send('Emulation.setDeviceMetricsOverride', {
  width: VIEW.width,
  height: VIEW.height,
  deviceScaleFactor: 2,
  mobile: false,
})

await P.evaluate(
  `localStorage.setItem('lumen-course-v1', ${JSON.stringify(JSON.stringify(payload))});
   localStorage.setItem('lumen-theme', 'light');
   return 'ok';`,
)
await P.send('Page.reload', { ignoreCache: false })
await new Promise((r) => setTimeout(r, 4000))

const shot = async (name) => {
  const r = await P.send('Page.captureScreenshot', { format: 'png' })
  const file = join(outDir, `${name}.png`)
  writeFileSync(file, Buffer.from(r.result.data, 'base64'))
  console.log(`  ✓ ${name}.png`)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = (text) =>
  P.evaluate(
    `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes(${JSON.stringify(text)}))?.click(); return 'ok';`,
  )
const clickTestId = (id) => P.evaluate(`document.querySelector('[data-testid="${id}"]')?.click(); return 'ok';`)

/* ---- 1. 主界面：周视图（待办折叠态） ---- */
await P.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); return 'ok';`)
await wait(900)
await shot('01-首页-周视图')

/* ---- 2. 待办展开 ---- */
await clickTestId('todo-expand')
await wait(900)
await shot('02-首页-待办展开')
await clickTestId('todo-collapse')
await wait(700)

/* ---- 3. 课程详情抽屉（备忘录） ---- */
await P.evaluate(`
  const el = document.querySelector('.tt-card');
  el.scrollIntoView({ block: 'center' });
  return 'ok';
`)
await wait(500)
const box = await P.evaluate(`
  const el = document.querySelector('.tt-card');
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 20) };
`)
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
  await P.send('Input.dispatchMouseEvent', {
    type,
    x: box.x,
    y: box.y,
    button: 'left',
    clickCount: 1,
    buttons: type === 'mousePressed' ? 1 : 0,
  })
  await wait(90)
}
await wait(1300)
await shot('03-课程详情-备忘录')

/* ---- 4. 课程详情：作业 ---- */
await clickText('作业')
await wait(900)
await shot('04-课程详情-作业')
await P.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'ok';`)
await wait(800)

/* ---- 5. 添加课程 ---- */
await clickText('添加课程')
await wait(1200)
await shot('05-添加课程')
await P.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'ok';`)
await wait(700)

/* ---- 6. 添加待办 ---- */
await clickTestId('todo-add')
await wait(1100)
await shot('06-添加待办')
await P.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'ok';`)
await wait(700)

/* ---- 7. 学期视图 ---- */
await clickText('学期视图')
await wait(1300)
await shot('07-学期视图')
await clickText('周视图')
await wait(800)

/* ---- 8. 导入课表面板 ---- */
await clickText('导入课表')
await wait(1100)
await shot('08-导入课表')
await P.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'ok';`)
await wait(700)

/* ---- 9. 设置页 ---- */
await clickText('设置')
await wait(1100)
await shot('09-设置')
await P.evaluate(`
  const sc = document.querySelector('main .scroll-y');
  if (sc) sc.scrollTop = 520;
  return 'ok';
`)
await wait(700)
await shot('10-设置-桌面浮窗与数据')
await P.evaluate(`
  const sc = document.querySelector('main .scroll-y');
  if (sc) sc.scrollTop = 0;
  return 'ok';
`)

/* ---- 10. 深色主题 ---- */
await P.evaluate(`
  const raw = JSON.parse(localStorage.getItem('lumen-course-v1'));
  raw.state.settings.theme = 'dark';
  localStorage.setItem('lumen-course-v1', JSON.stringify(raw));
  localStorage.setItem('lumen-theme', 'dark');
  return 'ok';
`)
await P.send('Page.reload', { ignoreCache: false })
await wait(4000)
await P.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); return 'ok';`)
await wait(900)
await shot('11-深色主题-周视图')

/* ---- 11. 浮窗（浅色 / 深色） ---- */
if (miniTarget) {
  const M = await attach(miniTarget)
  await M.send('Page.enable')
  await M.send('Runtime.enable')
  await M.send('Emulation.setDeviceMetricsOverride', {
    width: 400,
    height: 620,
    deviceScaleFactor: 2,
    mobile: false,
  })
  await M.send('Page.reload', { ignoreCache: false })
  await wait(3000)
  await M.evaluate(`
    const b = document.querySelector('[data-testid^="mini-course-"]');
    if (b) b.click();
    return 'ok';
  `)
  await wait(1200)
  const darkShot = await M.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, '13-浮窗-深色.png'), Buffer.from(darkShot.result.data, 'base64'))
  console.log('  ✓ 13-浮窗-深色.png')

  await M.evaluate(`document.documentElement.dataset.theme = 'light'; return 'ok';`)
  await wait(800)
  const lightShot = await M.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, '12-浮窗-浅色.png'), Buffer.from(lightShot.result.data, 'base64'))
  console.log('  ✓ 12-浮窗-浅色.png')
  M.ws.close()
}

P.ws.close()
console.log(`\n截图已输出到 ${outDir}`)
process.exit(0)
