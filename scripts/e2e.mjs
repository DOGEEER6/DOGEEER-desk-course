/**
 * 用 CDP 对正在运行的 dev server 做端到端验收：
 *  - 注入真实课表数据（走 store 的 replaceAll）
 *  - 检查课表卡片、待办清单、课程抽屉是否正常渲染
 *  - 截图留档
 *
 *   node scripts/e2e.mjs [xlsx路径] [截图目录]
 */
import { build } from 'esbuild'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const cache = join(root, 'node_modules', '.cache', 'lumen-selftest')
mkdirSync(cache, { recursive: true })

const xlsxPath = process.argv[2] ?? 'D:\\dsh\\_seu_timetable.xlsx'
const shotDir = resolve(process.argv[3] ?? join(root, 'node_modules', '.cache', 'shots'))
mkdirSync(shotDir, { recursive: true })

/** CDP 端口：默认 9333（Edge 预览），传入 Tauri/WebView2 的端口可以验收真实桌面应用 */
const PORT = Number(process.env.LUMEN_CDP_PORT ?? process.argv[4] ?? 9333)
/** 目标页面 URL 片段，用来在多个 page target 里挑选目标 */
const TARGET_HINT = process.env.LUMEN_TARGET ?? '5183'

/* ---------- 1. 解析课表（复用应用内解析器） ---------- */
const outfile = join(cache, 'excel.mjs')
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
/** 原始 xlsx 的 base64，用于在页面里构造 File 走一遍真实的导入面板流程 */
const xlsxBase64 = buf.toString('base64')

/* ---------- 2. 转成 store 的课程结构 ---------- */
const palette = 12
const courses = []
const idx = new Map()
for (const r of parsed.records) {
  const key = r.name
  if (!idx.has(key)) {
    idx.set(key, courses.length)
    courses.push({
      id: `crs_${courses.length}`,
      name: r.name,
      teacher: r.teacher,
      room: r.room,
      color: courses.length % palette,
      sessions: [],
      notes:
        r.name.includes('数学')
          ? '第一章：极限与连续\n第二章：导数与微分\n\n考试重点：洛必达法则、泰勒展开'
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
    note: r.note,
    remind: true,
  })
}

const today = new Date()
const monday = new Date(today)
const wd = monday.getDay() === 0 ? 7 : monday.getDay()
monday.setDate(monday.getDate() - (wd - 1))
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const todos = [
  {
    id: 'td_1',
    title: '工科数学分析 第五章习题',
    done: false,
    dueAt: new Date(today.getTime() + 5 * 3600e3).toISOString(),
    priority: 'high',
    courseId: courses.find((c) => c.name.includes('数学'))?.id,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'td_2',
    title: '程序设计实践 A(I) 实验报告',
    done: false,
    dueAt: new Date(today.getTime() + 2 * 86400e3).toISOString(),
    priority: 'normal',
    courseId: courses.find((c) => c.name.includes('程序设计'))?.id,
    startAt: new Date(today.getTime() + 86400e3).toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'td_3',
    title: '线性代数 期中复习',
    done: false,
    dueAt: new Date(today.getTime() - 3 * 3600e3).toISOString(),
    priority: 'high',
    courseId: courses.find((c) => c.name.includes('线性代数'))?.id,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'td_4',
    title: '国际交流英语 presentation 选题',
    done: true,
    dueAt: new Date(today.getTime() + 86400e3).toISOString(),
    priority: 'low',
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
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
      reminders: { enabled: true, leadMinutes: 15, inApp: true, system: true, sound: true },
      showWeekend: true,
      tickSeconds: 30,
    },
  },
  version: 1,
}

/* ---------- 3. CDP ---------- */
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const wantsMini = TARGET_HINT.includes('mini')
const page =
  targets.find((t) => t.type === 'page' && t.url.includes(TARGET_HINT) && (wantsMini ? t.url.includes('mini') : !t.url.includes('mini'))) ??
  targets.find((t) => t.type === 'page' && t.url.includes('mini') === wantsMini)
if (!page) {
  console.error(
    `找不到目标页面（port=${PORT}, hint=${TARGET_HINT}）。浏览器预览请用 --remote-debugging-port=9333 启动 Edge；` +
      `桌面应用请先设置 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9444`,
  )
  process.exit(1)
}
console.log('目标页面:', page.url, `(port=${PORT})`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
function send(method, params = {}) {
  const id = ++msgId
  return new Promise((res) => {
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  // 包一层 IIFE，避免多次求值时 const 重复声明；调用方用 return 返回值
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.result?.exceptionDetails) {
    throw new Error(JSON.stringify(r.result.exceptionDetails))
  }
  return r.result?.result?.value
}

/** 用真实输入事件点击元素（比合成 PointerEvent 更接近用户操作） */
async function clickSelector(selector, index = 0) {
  const box = await evaluate(`
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return null;
    // 关键：先把元素滚进视口，否则 CDP 的坐标点击会被丢弃
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    await new Promise(r => setTimeout(r, 350));
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 20)) };
  `)
  if (!box) throw new Error(`元素不存在: ${selector}`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type,
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
      buttons: type === 'mousePressed' ? 1 : 0,
    })
    await new Promise((r) => setTimeout(r, 70))
  }
  return box
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const file = join(shotDir, `${name}.png`)
  writeFileSync(file, Buffer.from(r.result.data, 'base64'))
  console.log(`  截图 ${file}`)
}

async function waitReady(timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await evaluate(`return document.readyState === 'complete' && !!document.getElementById('root')`)
      if (ok) return true
    } catch {
      /* 导航中，继续等 */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.bringToFront')
try {
  await send('Input.setIgnoreInputEvents', { ignore: false })
} catch {
  /* 可选命令 */
}

/* ---------- 4. 注入数据并刷新 ---------- */
await send('Page.navigate', { url: page.url })
const ready = await waitReady()
console.log(`页面就绪: ${ready}`)
await new Promise((r) => setTimeout(r, 1200))

const json = JSON.stringify(payload)
await evaluate(`localStorage.setItem('lumen-course-v1', ${JSON.stringify(json)}); return 'ok'`)
await send('Page.reload', { ignoreCache: false })
await waitReady()
await new Promise((r) => setTimeout(r, 2200))

const checks = []
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ` — ${extra}` : ''}`)
  checks.push({ name, ok: !!cond, extra })
}

/* ---------- 5. 断言 ---------- */
const cardCount = await evaluate(`return document.querySelectorAll('.tt-card').length`)
check('课表渲染出课程卡片', cardCount > 0, `cards=${cardCount}`)

const courseNames = await evaluate(
  `return Array.from(document.querySelectorAll('.tt-card')).map(e => e.textContent.slice(0, 8))`,
)
check('卡片含课程名', Array.isArray(courseNames) && courseNames.length > 0, JSON.stringify(courseNames).slice(0, 120))

const visibleText = await evaluate(`return document.body.innerText`)
check('侧栏显示第 1 教学周', /第 1 教学周/.test(visibleText))
check('待办面板显示 DDL 状态', /逾期|截止|项未完成/.test(visibleText))
check('统计出未完成数量', /项进行中|项未完成/.test(visibleText))
check('今日 Hero 正常', /下一节课|正在上课|今天没有课/.test(visibleText))

await shot('01-timetable')

// 切换周次
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); return 'ok'`)
await new Promise((r) => setTimeout(r, 900))
const week2Text = await evaluate(`return document.body.innerText`)
check('方向键可切到第 2 周', /第 2 教学周/.test(week2Text))
const cardCount2 = await evaluate(`return document.querySelectorAll('.tt-card').length`)
check('第 2 周卡片数量与周次相关', cardCount2 > 0, `cards=${cardCount2}`)
await shot('02-week2')

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' })); return 'ok'`)
await new Promise((r) => setTimeout(r, 700))

// 打开课程详情（真实鼠标事件）
await clickSelector('.tt-card', 0)
await new Promise((r) => setTimeout(r, 1000))
const drawerText = await evaluate(`return document.body.innerText`)
check('点击课程打开详情抽屉', /课程详情/.test(drawerText) && /上课时段/.test(drawerText))
check('抽屉含备忘录/作业标签', /备忘录/.test(drawerText) && /作业/.test(drawerText))
await shot('03-course-drawer')

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'ok'`)
await new Promise((r) => setTimeout(r, 700))

// 拖动课程卡片：验证吸附落位
const beforeDrag = await evaluate(`
  const s = JSON.parse(localStorage.getItem('lumen-course-v1'));
  return JSON.stringify(s.state.courses.map(c => c.sessions.map(x => [x.day, x.startPeriod, x.endPeriod])).flat());
`)
const cardBox = await evaluate(`
  const el = document.querySelector('.tt-card');
  el.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 350));
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 20)) };
`)
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardBox.x, y: cardBox.y })
await send('Input.dispatchMouseEvent', {
  type: 'mousePressed', x: cardBox.x, y: cardBox.y, button: 'left', clickCount: 1, buttons: 1,
})
for (const step of [1, 2, 3]) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: cardBox.x + (270 / 3) * step,
    y: cardBox.y + (68 / 3) * step,
    button: 'left',
    buttons: 1,
  })
  await new Promise((r) => setTimeout(r, 90))
}
const dragGuide = await evaluate(`return !!document.querySelector('.snap-guide')`)
check('拖动时显示吸附辅助框', dragGuide)
await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased', x: cardBox.x + 270, y: cardBox.y + 68, button: 'left', buttons: 0,
})
await new Promise((r) => setTimeout(r, 1000))
const afterDrag = await evaluate(`
  const s = JSON.parse(localStorage.getItem('lumen-course-v1'));
  return JSON.stringify(s.state.courses.map(c => c.sessions.map(x => [x.day, x.startPeriod, x.endPeriod])).flat());
`)
check('拖动后课程时段发生吸附落位', beforeDrag !== afterDrag, `${beforeDrag} -> ${afterDrag}`.slice(0, 220))
await shot('03b-after-drag')

// 恢复干净数据再继续后续断言
await evaluate(`localStorage.setItem('lumen-course-v1', ${JSON.stringify(json)}); return 'ok'`)
await send('Page.reload', { ignoreCache: false })
await new Promise((r) => setTimeout(r, 3200))

// 自然语言添加待办
const focused = await evaluate(`
  const inputs = Array.from(document.querySelectorAll('input.field'));
  const i = inputs.find(x => (x.placeholder || '').includes('操作系统实验报告'));
  if (!i) return 'no-input';
  i.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(i, '操作系统实验报告 周五 18:00 !high');
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
`)
check('找到待办快速输入框', focused === 'ok', String(focused))
await new Promise((r) => setTimeout(r, 400))
await evaluate(`
  const inputs = Array.from(document.querySelectorAll('input.field'));
  const i = inputs.find(x => (x.placeholder || '').includes('操作系统实验报告'));
  i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 1000))
const afterAdd = await evaluate(`return document.body.innerText`)
check('自然语言速记成功加入待办', /操作系统实验报告/.test(afterAdd))
check('解析出 DDL 并高亮', /截止|逾期/.test(afterAdd))
await shot('04-todo-added')

// 设置页
await evaluate(`
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '设置')?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 900))
const settingsText = await evaluate(`return document.body.innerText`)
check('设置页可打开', /学期与周次/.test(settingsText) && /开课提醒/.test(settingsText))
check('设置页含节次时间配置', /节次时间/.test(settingsText))
check('设置页含数据导入', /导入 Excel 课表/.test(settingsText))
await shot('05-settings')

// 今日页
await evaluate(`
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().startsWith('今日'))?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 900))
await shot('06-today')

// 导入面板端到端（覆盖与原生拖放共用的解析 + 合并逻辑）
await evaluate(`
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('导入课表'))?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 900))
const importOpen = await evaluate(`return /导入课表/.test(document.body.innerText) && /拖到这里/.test(document.body.innerText)`)
check('导入面板可打开', importOpen)
const injected = await evaluate(`
  const input = document.querySelector('input[type=file]');
  if (!input) return 'no-input';
  const b64 = ${JSON.stringify(xlsxBase64)};
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], '课表.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
`)
check('已把课表文件交给导入面板', injected === 'ok', String(injected))
await new Promise((r) => setTimeout(r, 2500))
const previewText = await evaluate(`return document.body.innerText`)
check('解析出课程预览', /识别方式/.test(previewText) && /个上课时段/.test(previewText))
check('预览里能看到真实课程', /线性代数/.test(previewText) || /工科数学分析/.test(previewText))
await shot('07-import-preview')
await evaluate(`
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '确认导入');
  btn?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 2500))
const afterImport = await evaluate(`const s = JSON.parse(localStorage.getItem('lumen-course-v1')); return s.state.courses.length`)
check('确认导入后课程写入本地', afterImport > 0, `courses=${afterImport}`)
// 回到课表视图确认卡片渲染
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); return 'ok'`)
await new Promise((r) => setTimeout(r, 1200))
check('导入后出现课程卡片', (await evaluate(`return document.querySelectorAll('.tt-card').length`)) > 0)
await shot('08-import-done')

// 视图切换：周 / 月 / 学期
const segLabels = await evaluate(`return Array.from(document.querySelectorAll('.segmented button')).map(b => b.textContent.trim())`)
check('存在周/月/学期三种视图', JSON.stringify(segLabels) === JSON.stringify(['周视图', '月视图', '学期视图']), JSON.stringify(segLabels))

const clickSeg = (label) =>
  evaluate(`
    Array.from(document.querySelectorAll('.segmented button')).find(b => b.textContent.trim() === ${JSON.stringify(label)})?.click();
    return 'ok';
  `)

await clickSeg('月视图')
await new Promise((r) => setTimeout(r, 1000))
check('月视图渲染', (await evaluate(`return document.querySelectorAll('.month-cell').length`)) >= 5)
check('月视图显示课程', /节课/.test(await evaluate(`return document.body.innerText`)))
await shot('09-month')

await clickSeg('学期视图')
await new Promise((r) => setTimeout(r, 1200))
const termText = await evaluate(`return document.body.innerText`)
check('学期视图渲染', /全学期一览/.test(termText) && /课程清单/.test(termText))
check('学期视图含学期进度', /学期进度/.test(termText))
await shot('10-term')

await clickSeg('周视图')
await new Promise((r) => setTimeout(r, 800))
check('切回周视图', (await evaluate(`return document.querySelectorAll('.tt-card').length`)) > 0)

// 待办：勾选 → 完成 → 自动归档
const todoBefore = await evaluate(`
  const s = JSON.parse(localStorage.getItem('lumen-course-v1'));
  return JSON.stringify({ open: s.state.todos.filter(t => !t.archived && !t.done).length, arch: s.state.todos.filter(t => t.archived).length });
`)
await evaluate(`
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().startsWith('进行中'))?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 700))
const checked = await evaluate(`
  const b = document.querySelector('.checkbox');
  if (!b) return 'none';
  b.click();
  return 'ok';
`)
check('可以勾选待办', checked === 'ok', String(checked))
await new Promise((r) => setTimeout(r, 1800))
const todoAfter = await evaluate(`
  const s = JSON.parse(localStorage.getItem('lumen-course-v1'));
  return JSON.stringify({ open: s.state.todos.filter(t => !t.archived && !t.done).length, arch: s.state.todos.filter(t => t.archived).length });
`)
const before = JSON.parse(todoBefore)
const after = JSON.parse(todoAfter)
check('勾选后自动归档', after.arch !== before.arch, `${todoBefore} -> ${todoAfter}`)
check('未完成数量减少', after.open < before.open, `${todoBefore} -> ${todoAfter}`)
await shot('11-todo-archive')

await evaluate(`
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().startsWith('归档'))?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 900))
check('归档页可查看已完成', /已完成/.test(await evaluate(`return document.body.innerText`)))
await shot('12-archive-tab')

// 主题切换
const setTheme = (mode) =>
  evaluate(`
    const raw = JSON.parse(localStorage.getItem('lumen-course-v1'));
    raw.state.settings.theme = ${JSON.stringify(mode)};
    localStorage.setItem('lumen-course-v1', JSON.stringify(raw));
    return 'ok';
  `)
await setTheme('dark')
await send('Page.reload', { ignoreCache: false })
await waitReady()
await new Promise((r) => setTimeout(r, 2200))
check('深色主题生效', (await evaluate(`return document.documentElement.dataset.theme`)) === 'dark')
check('深色下文字色变浅', (await evaluate(`return getComputedStyle(document.body).color`)) !== 'rgb(11, 18, 32)')
await shot('13-dark')
await setTheme('light')
await send('Page.reload', { ignoreCache: false })
await waitReady()
await new Promise((r) => setTimeout(r, 2200))
check('浅色主题生效', (await evaluate(`return document.documentElement.dataset.theme`)) === 'light')
await shot('14-light')
await setTheme('system')

// 自定义标题栏（桌面端）
if (TARGET_HINT.includes('tauri')) {
  check('自绘标题栏存在', await evaluate(`return !!document.querySelector('.titlebar')`))
  check('窗口外壳有圆角', (await evaluate(`return getComputedStyle(document.querySelector('.window-shell')).borderRadius`)) !== '0px')
  const btns = await evaluate(`return Array.from(document.querySelectorAll('.titlebar-btn')).map(b => b.title)`)
  check('标题栏含最小化/最大化/关闭', JSON.stringify(btns).includes('最小化') && JSON.stringify(btns).includes('关闭'), JSON.stringify(btns))
}

// 添加课程 → 未排课托盘 → 拖到课表上排课
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); return 'ok'`)
await new Promise((r) => setTimeout(r, 800))
await evaluate(`
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '添加课程')?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 1000))
const dlgText = await evaluate(`return document.body.innerText`)
check('添加课程表单可打开', /添加课程/.test(dlgText) && /上课周次/.test(dlgText) && /上课时段/.test(dlgText))

const filled = await evaluate(`
  const inp = document.querySelector('input[placeholder="例如：操作系统"]');
  if (!inp) return 'no-input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '编译原理');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
`)
check('可填写课程名称', filled === 'ok', String(filled))

// 在预览网格里拖选一个时段
const previewBox = await evaluate(`
  const grid = document.querySelector('.grid.grid-cols-7.gap-1.rounded-2xl');
  if (!grid) return null;
  const r = grid.getBoundingClientRect();
  const colW = r.width / 7;
  const rowH = r.height / 13;
  return { x: Math.round(r.left + colW * 2.5), y: Math.round(r.top + rowH * 3.5), rowH: Math.round(rowH) };
`)
check('时段选择网格存在', !!previewBox)
if (previewBox) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: previewBox.x, y: previewBox.y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: previewBox.x, y: previewBox.y, button: 'left', clickCount: 1, buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: previewBox.x, y: previewBox.y + previewBox.rowH, button: 'left', buttons: 1 })
  await new Promise((r) => setTimeout(r, 200))
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: previewBox.x, y: previewBox.y + previewBox.rowH, button: 'left', buttons: 0 })
}
await new Promise((r) => setTimeout(r, 700))
check('可拖动选择上课时段', /周[一二三四五六日]\s*第\s*\d+-\d+\s*节/.test(await evaluate(`return document.body.innerText`)))
await shot('15-add-course-form')

await evaluate(`
  Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '创建课程')?.click();
  return 'ok';
`)
await new Promise((r) => setTimeout(r, 1500))
check('创建后出现未排课托盘', /未排课时段/.test(await evaluate(`return document.body.innerText`)))
check(
  '新课程已写入且时段为未排课',
  await evaluate(`
    const s = JSON.parse(localStorage.getItem('lumen-course-v1'));
    const c = s.state.courses.find(x => x.name === '编译原理');
    return !!c && c.sessions.length === 1 && c.sessions[0].draft === true;
  `),
)
await shot('16-draft-tray')

// 把托盘里的课程拖到课表上
const beforePlace = await evaluate(`
  const s = JSON.parse(localStorage.getItem('lumen-course-v1'));
  const c = s.state.courses.find(x => x.name === '编译原理');
  return JSON.stringify(c.sessions.map(x => ({ day: x.day, sp: x.startPeriod, ep: x.endPeriod, draft: x.draft })));
`)
const dropGeo = await evaluate(`
  const chip = document.querySelector('[data-testid^="draft-"]');
  const axis = Array.from(document.querySelectorAll('div')).find(d => d.className.includes('w-[54px]'));
  if (!chip || !axis) return null;
  const cr = chip.getBoundingClientRect();
  const hr = axis.parentElement.getBoundingClientRect();
  return {
    chip: [Math.round(cr.left + cr.width / 2), Math.round(cr.top + cr.height / 2)],
    grid: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width)],
  };
`)
check('托盘条目可定位', !!dropGeo)
if (dropGeo) {
  const [cx, cy] = dropGeo.chip
  const [gx, gy, gw] = dropGeo.grid
  const tx = Math.round(gx + (gw / 5) * 3.5)
  const ty = Math.round(gy + 68 * 1.5)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1, buttons: 1 })
  await new Promise((r) => setTimeout(r, 130))
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round((cx + tx) / 2), y: Math.round((cy + ty) / 2), button: 'left', buttons: 1 })
  await new Promise((r) => setTimeout(r, 110))
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty, button: 'left', buttons: 1 })
  await new Promise((r) => setTimeout(r, 220))
  check('拖动时显示落位预览', /→ 周/.test(await evaluate(`return document.body.innerText`)))
  await shot('17-drop-preview')
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', buttons: 0 })
  await new Promise((r) => setTimeout(r, 1400))
}
const afterPlace = await evaluate(`
  const s = JSON.parse(localStorage.getItem('lumen-course-v1'));
  const c = s.state.courses.find(x => x.name === '编译原理');
  return JSON.stringify(c.sessions.map(x => ({ day: x.day, sp: x.startPeriod, ep: x.endPeriod, draft: x.draft })));
`)
check('拖放后排课成功', beforePlace !== afterPlace && /"draft":false/.test(afterPlace), `${beforePlace} -> ${afterPlace}`)
check(
  '托盘已清空',
  (await evaluate(`return document.querySelectorAll('[data-testid^="draft-"]').length`)) === 0,
)
check('新课出现在课表上', /编译原理/.test(await evaluate(`return document.body.innerText`)))
await shot('18-dropped')

const consoleErrors = await evaluate(`return window.__lumenErrors ? window.__lumenErrors.length : 0`)
check('无未捕获错误标记', consoleErrors === 0, `errors=${consoleErrors}`)

ws.close()
const failed = checks.filter((c) => !c.ok)
console.log(`\n${failed.length ? `❌ ${failed.length} 项失败` : '✅ 全部通过'}`)
process.exit(failed.length ? 1 : 0)
