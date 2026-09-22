/**
 * 模拟「双击 exe」：不设任何环境变量，工作目录设为 exe 所在目录，
 * 观察进程是否存活、有哪些可见窗口。
 *   node scripts/check-exe.mjs
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const exe = resolve(root, 'src-tauri/target/release/desk-course.exe')
if (!existsSync(exe)) {
  console.error('找不到 exe:', exe)
  process.exit(1)
}

/** 用 tasklist 判断进程是否还在 */
function alive(pid) {
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' })
    return out.includes(String(pid))
  } catch {
    return false
  }
}

/** 用 PowerShell + user32 枚举该进程的可见窗口标题 */
function windows(pid) {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
'@
$t = ${pid}
$acc = @()
$cb = [W.U+EnumWindowsProc]{
  param($h,$l)
  $p=0; [void][W.U]::GetWindowThreadProcessId($h,[ref]$p)
  if ($p -eq $t) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][W.U]::GetWindowText($h,$sb,256)
    $v = [W.U]::IsWindowVisible($h)
    if ($v) { $script:acc += $sb.ToString() }
  }
  return $true
}
[void][W.U]::EnumWindows($cb,[IntPtr]::Zero)
$acc -join ' | '
`
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()
  } catch (e) {
    return `<枚举失败: ${e.message}>`
  }
}

console.log('启动:', exe)
console.log('工作目录: 与 exe 同目录（模拟资源管理器双击）')
const child = spawn(exe, [], { cwd: dirname(exe), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })

let stderr = ''
child.stderr?.on('data', (d) => (stderr += d.toString()))
child.stdout?.on('data', (d) => (stderr += d.toString()))
let exited = null
child.on('exit', (code, signal) => (exited = { code, signal }))

for (const t of [1500, 3000, 5000, 8000]) {
  await new Promise((r) => setTimeout(r, t === 1500 ? 1500 : 2000))
  const isAlive = alive(child.pid)
  console.log(`  +${t}ms  存活=${isAlive}  退出=${exited ? JSON.stringify(exited) : '未退出'}  可见窗口=[${windows(child.pid)}]`)
  if (!isAlive) break
}

if (stderr.trim()) {
  console.log('\n--- 进程输出 ---')
  console.log(stderr.trim().slice(0, 2000))
}

if (alive(child.pid)) {
  console.log('\n结论：进程存活（说明 exe 能正常启动）')
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* ignore */
  }
} else {
  console.log('\n结论：进程已退出 —— 复现了闪退')
}
