/**
 * 枚举 desk-course 进程的所有顶层窗口（标题 / 位置 / 尺寸 / 扩展样式），
 * 用来确认浮窗是否吸附到右上角、是否鼠标穿透（WS_EX_TRANSPARENT 0x20）。
 *   node scripts/window-report.mjs
 */
import { execFileSync } from 'node:child_process'

const ps = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Namespace Wr -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
public struct RECT { public int L, T, R, B; }
'@
$procs = @(Get-Process desk-course)
if ($procs.Count -eq 0) { Write-Output 'NO_PROCESS'; exit }
$script:ids = @($procs | ForEach-Object { [int]$_.Id })
$script:rows = New-Object System.Collections.ArrayList
$cb = [Wr.U+EnumWindowsProc] {
  param($h, $l)
  $p = [uint32]0
  [void][Wr.U]::GetWindowThreadProcessId($h, [ref]$p)
  if ($script:ids -contains [int]$p) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][Wr.U]::GetWindowText($h, $sb, 256)
    $r = New-Object Wr.U+RECT
    [void][Wr.U]::GetWindowRect($h, [ref]$r)
    $ex = [Wr.U]::GetWindowLong($h, -20)
    [void]$script:rows.Add([pscustomobject]@{
      title = $sb.ToString(); visible = [Wr.U]::IsWindowVisible($h)
      x = $r.L; y = $r.T; w = ($r.R - $r.L); h = ($r.B - $r.T); ex = $ex
    })
  }
  return $true
}
[void][Wr.U]::EnumWindows($cb, [IntPtr]::Zero)
Add-Type -AssemblyName System.Windows.Forms
$screens = @()
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  $screens += [pscustomobject]@{ device = $s.DeviceName; x = $s.WorkingArea.X; y = $s.WorkingArea.Y; w = $s.WorkingArea.Width; h = $s.WorkingArea.Height }
}
[pscustomobject]@{ windows = $script:rows; screens = $screens } | ConvertTo-Json -Depth 4 -Compress
`

const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()
if (out === 'NO_PROCESS') {
  console.log('进程未运行')
  process.exit(0)
}
const data = JSON.parse(out)
const screens = Array.isArray(data.screens) ? data.screens : [data.screens]
for (const s of screens) console.log(`屏幕 ${s.device}  工作区 ${s.x},${s.y} ${s.w}x${s.h}`)
const rows = Array.isArray(data.windows) ? data.windows : [data.windows]
for (const win of rows) {
  const flags = []
  if (win.ex & 0x8) flags.push('TOPMOST')
  if (win.ex & 0x20) flags.push('鼠标穿透')
  if (win.ex & 0x80) flags.push('不占任务栏')
  if (win.ex & 0x80000) flags.push('LAYERED')
  const right = screens[0] ? screens[0].x + screens[0].w - (win.x + win.w) : null
  console.log(
    `窗口 "${win.title || '(无题)'}" 可见=${win.visible} 位置=${win.x},${win.y} 尺寸=${win.w}x${win.h}` +
      (right != null ? ` 距右边=${right} 距顶=${win.y}` : '') +
      (flags.length ? ` [${flags.join(' ')}]` : ''),
  )
}
