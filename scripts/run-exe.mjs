/**
 * 启动一个 exe 并报告它是否存活、有哪些可见窗口。
 * 用来验证「安装后的 exe 能否正常启动」。
 *   node scripts/run-exe.mjs "C:/path/to/desk-course.exe"
 */
import { execFileSync } from 'node:child_process'

const exe = process.argv[2]
if (!exe) {
  console.error('用法: node scripts/run-exe.mjs <exe 路径>')
  process.exit(1)
}

const ps = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Namespace Wi -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
'@
$script:titles = @()
$script:ids = @()
$cb = [Wi.U+EnumWindowsProc] {
  param($h, $l)
  $p = [uint32]0
  [void][Wi.U]::GetWindowThreadProcessId($h, [ref]$p)
  if ($script:ids -contains [int]$p) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][Wi.U]::GetWindowText($h, $sb, 256)
    if ([Wi.U]::IsWindowVisible($h)) { $script:titles += $sb.ToString() }
  }
  return $true
}
$proc = Start-Process -FilePath $env:EXE_PATH -PassThru
$script:ids = @([int]$proc.Id)
Start-Sleep -Seconds 9
$alive = -not $proc.HasExited
[void][Wi.U]::EnumWindows($cb, [IntPtr]::Zero)
Write-Output ("alive={0}; windows={1}" -f $alive, ($script:titles -join ' | '))
if ($alive) { Stop-Process -Id $proc.Id -Force }
`

const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], {
  encoding: 'utf8',
  env: { ...process.env, EXE_PATH: exe },
})
console.log(out.trim())
