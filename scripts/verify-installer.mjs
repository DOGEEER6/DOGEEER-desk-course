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
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
/** 卸载注册项（reg.exe 路径形式，供 reg export / reg import 用） */
const UNINST_REG = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DOGEEER课表'
const UNINST_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DOGEEER课表'
/** 卸载注册项的整键备份文件（用 reg export/import 才能原样恢复，包括键是否存在） */
const UNINST_BAK = join(root, 'node_modules', '.cache', 'dogeeer-uninstall-key.reg')
/**
 * NSIS 安装器把「上次装到哪」记在这个键里（${MANUPRODUCTKEY}）。
 * 如果测试装到临时目录后不恢复它，**下一次真实安装会被装到那个临时目录**，
 * 用户正常的安装路径就被测试污染了 —— 之前真的踩过这个坑。
 */
const INSTDIR_KEY = 'HKCU:\\Software\\lumen\\DOGEEER课表'
const START_MENU = join(
  process.env.APPDATA ?? '',
  'Microsoft\\Windows\\Start Menu\\Programs\\DOGEEER课表.lnk',
)
const DESKTOP_LNK = join(process.env.USERPROFILE ?? '', 'Desktop\\DOGEEER课表.lnk')
/** 测试会覆盖/删除这些快捷方式，测完按备份还原 */
const SHORTCUTS = [START_MENU, DESKTOP_LNK].map((p) => ({ path: p, bak: `${p}.verifybak` }))

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
/* 整键导出：测试的卸载程序会把这个键删掉，而 Set-ItemProperty 无法凭空建键，
   所以只能用 reg import 原样导回来。 */
if (existsSync(UNINST_BAK)) rmSync(UNINST_BAK, { force: true })
if (hadUninst) ps(`reg export "${UNINST_REG}" "${UNINST_BAK}" /y`)
const hadLnk = existsSync(START_MENU)
const hadInstDir = ps(`Test-Path '${INSTDIR_KEY}'`) === 'True'
const snapInstDir = hadInstDir ? ps(`(Get-ItemProperty '${INSTDIR_KEY}').'(default)'`) : ''
/* 先备份快捷方式：卸载程序会把它们删掉 */
for (const lnk of SHORTCUTS) {
  if (existsSync(lnk.bak)) rmSync(lnk.bak, { force: true })
  if (existsSync(lnk.path)) copyFileSync(lnk.path, lnk.bak)
}
console.log(`  Run 项: ${hadRun ? snapRun : '（无）'}`)
console.log(`  卸载项: ${hadUninst ? snapUninst : '（无）'}`)
console.log(`  安装目录记忆: ${hadInstDir ? snapInstDir : '（无）'}`)
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
/* 快捷方式：卸载程序会把它删掉，所以测试前先拷出来，测完再放回去 */
for (const lnk of SHORTCUTS) {
  if (existsSync(lnk.bak)) {
    if (existsSync(lnk.path)) rmSync(lnk.path, { force: true })
    copyFileSync(lnk.bak, lnk.path)
    rmSync(lnk.bak, { force: true })
    console.log(`  已恢复快捷方式 → ${lnk.path}`)
  } else if (existsSync(lnk.path)) {
    rmSync(lnk.path, { force: true })
    console.log(`  已删除测试留下的快捷方式 ${lnk.path}`)
  }
}

if (!hadUninst && ps(`Test-Path '${UNINST_KEY}'`) === 'True') {
  ps(`Remove-Item '${UNINST_KEY}' -Recurse -Force`)
  console.log('  已删除测试留下的卸载注册项')
} else if (hadUninst && existsSync(UNINST_BAK)) {
  ps(`reg import "${UNINST_BAK}"`)
  rmSync(UNINST_BAK, { force: true })
  const back = ps(`(Get-ItemProperty '${UNINST_KEY}' -ErrorAction SilentlyContinue).InstallLocation`)
  if (back) console.log(`  已恢复卸载注册项 → ${back}`)
  else {
    console.log('  ⚠ 卸载注册项恢复失败，请重跑一次安装包修复')
    fail.push('卸载注册项恢复')
  }
}

if (hadRun) {
  ps(`Set-ItemProperty '${RUN_KEY}' -Name 'DOGEEER课表' -Value '${snapRun}'`)
  console.log(`  已恢复开机自启 → ${snapRun}`)
} else {
  ps(`Remove-ItemProperty '${RUN_KEY}' -Name 'DOGEEER课表' -ErrorAction SilentlyContinue`)
  console.log('  用户本来没有开机自启，已清掉测试写入的项')
}

if (hadInstDir && snapInstDir) {
  ps(`Set-ItemProperty '${INSTDIR_KEY}' -Name '(default)' -Value '${snapInstDir}'`)
  console.log(`  已恢复安装目录记忆 → ${snapInstDir}`)
} else if (ps(`Test-Path '${INSTDIR_KEY}'`) === 'True') {
  ps(`Remove-Item '${INSTDIR_KEY}' -Recurse -Force`)
  console.log('  用户本来没装过，已删掉测试写入的安装目录记忆')
}

console.log(`\n${fail.length ? `❌ ${fail.length} 项失败` : '✅ 安装包冒烟测试通过'}`)
process.exit(fail.length ? 1 : 0)
