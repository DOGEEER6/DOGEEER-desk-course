/**
 * 安装包冒烟测试：静默安装到临时目录 → 检查 WebView2Loader.dll 是否随包安装
 * → 实际启动 exe 确认能建出窗口 → 卸载并清理。
 *
 *   node scripts/verify-installer.mjs
 *
 * 这个脚本是为了防止「装完报找不到 webview2loader.dll」再次回归：
 * 免安装版的 exe 旁边本来就有这个 DLL，所以只有真装一次才能发现问题。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
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

console.log(`安装包: ${setup}`)
console.log(`目标目录: ${dest}\n`)

// 先清理上一次 + 结束可能在跑的实例
spawnSync('taskkill', ['/IM', 'desk-course.exe', '/F'], { stdio: 'ignore' })
rmSync(dest, { recursive: true, force: true })

console.log('静默安装…')
const inst = spawnSync(setup, ['/S', `/D=${dest}`], { stdio: 'ignore' })
ok('安装程序执行成功', inst.status === 0, `exit=${inst.status}`)

await new Promise((r) => setTimeout(r, 2500))

const exe = join(dest, 'desk-course.exe')
const loader = join(dest, 'WebView2Loader.dll')
ok('主程序已安装', existsSync(exe))
ok('WebView2Loader.dll 随包安装', existsSync(loader), loader)

const files = existsSync(dest) ? readdirSync(dest) : []
console.log(`  安装目录: ${files.join(', ')}\n`)

if (existsSync(exe)) {
  console.log('启动安装后的 exe…')
  const out = execFileSync('node', [join(root, 'scripts/run-exe.mjs'), exe], { encoding: 'utf8' })
  console.log(`  ${out.trim()}`)
  ok('安装后能启动并建出窗口', /alive=True/.test(out) && /DOGEEER 课表/.test(out), out.trim().slice(0, 90))
}

// 卸载
const uninst = join(dest, 'uninstall.exe')
if (existsSync(uninst)) {
  spawnSync(uninst, ['/S'], { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 2000))
}
rmSync(dest, { recursive: true, force: true })

console.log(`\n${fail.length ? `❌ ${fail.length} 项失败` : '✅ 安装包冒烟测试通过'}`)
process.exit(fail.length ? 1 : 0)
