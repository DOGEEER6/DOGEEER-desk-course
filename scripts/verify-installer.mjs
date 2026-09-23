/**
 * 安装包冒烟测试：静默安装到临时目录 → 检查 WebView2Loader.dll 是否随包安装
 * → 实际启动 exe 确认能建出窗口 → 卸载并清理。
 *
 *   node scripts/verify-installer.mjs
 *
 * 为什么要这个脚本：免安装版的 exe 旁边本来就有 WebView2Loader.dll，
 * 只有真的装一次才能发现「装完报找不到 webview2loader.dll」这类问题。
 *
 * ⚠ 重要：Tauri 的 NSIS 安装器装完会写入系统启动项（Run 键）、开始菜单快捷方式
 * 和卸载注册项。把测试装到临时目录会**覆盖用户真实安装的这些项**，
 * 所以脚本结束时会按快照恢复 —— 不要让测试残留污染用户的系统。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const UNINST_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DOGEEER课表'
const START_MENU = join(
  process.env.APPDATA ?? '',
  'Microsoft\\Windows\\Start Menu\\Programs\\DOGEEER课表.lnk',
)

const setupDir = join(root, 'src-tauri/target/release/bundle/nsis')
if (!existsSync(setupDir)) {
  console.error('还没有安装包，先跑 npm run app:build')
  process.exit(1)
}
const setup = join(
  setupDir,
  readdirSync(setupDir).find((f) => f.endsWith('.exe')) ?? '',
)
if (!existsSync(setup)) {
  console.error('找不到安装包 exe')
  process.exit(1)
}

const dest = join(process.env.TEMP ?? '/tmp', 'dogeeer_installer_check')
const fail = []
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) fail.push(name)
}

const ps = (cmd) =>
  spawnSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).stdout.trim()

/* ---------- 0. 记录用户已有安装痕迹，测完恢复 ---------- */
console.log('备份用户已有的安装痕迹…')
const snapRun = ps(
  `(Get-ItemProperty '${RUN_KEY}' -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object { $_.Name -eq 'DOGEEER课表' } | ForEach-Object { $_.Value }`,
)
const hadRun = snapRun !== ''
const hadUninst = ps(`Test-Path '${UNINST_KEY}'`) === 'True'
const snapUninst = hadUninst ? ps(`(Get-ItemProperty '${UNINST_KEY}').InstallLocation`) : ''
const hadLnk = existsSync(START_MENU)
console.log(`  Run 项: ${hadRun ? snapRun : '（无）'}`)
console.log(`  卸载项: ${hadUninst ? snapUninst : '（无）'}`)
console.log(`  开始菜单: ${hadLnk ? START_MENU : '（无）'}\n`)

console.log(`安装包: ${setup}`)
console.log(`目标目录: ${dest}\n`)

spawnSync('taskkill', ['/IM', 'desk-course.exe', '/F'], { stdio: 'ignore' })
rmSync(dest, { recursive: true, force: true })

/* ---------- 1. 安装 ---------- */
console.log('静默安装…')
const inst = spawnSync(setup, ['/S', `/D=${dest}`], { stdio: 'ignore' })
ok('安装程序执行成功', inst.status === 0, `exit=${inst.status}`)
await new Promise((r) => setTimeout(r, 2500))

const exe = join(dest, 'desk-course.exe')
const loader = join(dest, 'WebView2Loader.dll')
ok('主程序已安装', existsSync(exe))
ok('WebView2Loader.dll 随包安装', existsSync(loader), loader)
console.log(`  安装目录: ${(existsSync(dest) ? readdirSync(dest) : []).join(', ')}\n`)

/* ---------- 2. 启动验证 ---------- */
if (existsSync(exe)) {
  console.log('启动安装后的 exe…')
  const out = execFileSync('node', [join(root, 'scripts/run-exe.mjs'), exe], { encoding: 'utf8' })
  console.log(`  ${out.trim()}`)
  ok(
    '安装后能启动并建出窗口',
    /alive=True/.test(out) && /DOGEEER 课表/.test(out),
    out.trim().slice(0, 90),
  )
}

/* ---------- 3. 卸载 ---------- */
const uninst = join(dest, 'uninstall.exe')
if (existsSync(uninst)) {
  spawnSync(uninst, ['/S'], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 2500))
}
spawnSync('taskkill', ['/IM', 'desk-course.exe', '/F'], { stdio: 'ignore' })
rmSync(dest, { recursive: true, force: true })

/* ---------- 4. 恢复用户原有的安装痕迹 ---------- */
console.log('\n恢复用户原有的安装痕迹…')
if (hadLnk && !existsSync(START_MENU)) {
  console.log('  ⚠ 用户原有的开始菜单快捷方式被卸载程序删除了，需要重装软件恢复')
} else if (!hadLnk && existsSync(START_MENU)) {
  rmSync(START_MENU, { force: true })
  console.log('  已删除测试留下的开始菜单快捷方式')
}

if (!hadUninst && ps(`Test-Path '${UNINST_KEY}'`) === 'True') {
  ps(`Remove-Item '${UNINST_KEY}' -Recurse -Force`)
  console.log('  已删除测试留下的卸载注册项')
} else if (hadUninst && snapUninst) {
  ps(`Set-ItemProperty '${UNINST_KEY}' -Name InstallLocation -Value '${snapUninst}'`)
  ps(`Set-ItemProperty '${UNINST_KEY}' -Name UninstallString -Value '"${snapUninst}\\uninstall.exe"'`)
  console.log(`  已恢复卸载注册项 → ${snapUninst}`)
}

if (hadRun) {
  ps(`Set-ItemProperty '${RUN_KEY}' -Name 'DOGEEER课表' -Value '${snapRun}'`)
  console.log(`  已恢复开机自启 → ${snapRun}`)
} else {
  ps(`Remove-ItemProperty '${RUN_KEY}' -Name 'DOGEEER课表' -ErrorAction SilentlyContinue`)
  console.log('  用户本来没有开机自启，已清掉测试写入的项')
}

console.log(`\n${fail.length ? `❌ ${fail.length} 项失败` : '✅ 安装包冒烟测试通过'}`)
process.exit(fail.length ? 1 : 0)
