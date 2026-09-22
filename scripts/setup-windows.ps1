# 一键配置 Windows 下的 Tauri 构建环境（国内网络）
#
#   powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
#
# 做四件事：
#   1. 检查 rustup / Rust GNU 工具链
#   2. 检查 MSYS2 与 MinGW-w64（提供 dlltool 等构建期工具）
#   3. 写入 src-tauri/.cargo/config.toml（rsproxy 镜像 + rust-lld 链接器）
#   4. 打印可用的构建命令
#
# 说明：本机实测 static.crates.io 只有 ~1KB/s，MSYS2 的 gcc 也无法正常链接
#       （collect2 返回 53/123），因此这里统一走「rsproxy 镜像 + rust-lld」。

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$tauriDir = Join-Path $root 'src-tauri'

function Info($m) { Write-Host "  $m" -ForegroundColor Gray }
function Ok($m) { Write-Host "  √ $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  × $m" -ForegroundColor Red }

Write-Host "`n[1/4] Rust 工具链" -ForegroundColor Cyan
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
if (Test-Path $cargo) {
    $ver = & $cargo --version 2>$null
    Ok "$ver"
    $host_ = & (Join-Path $env:USERPROFILE '.cargo\bin\rustc.exe') -vV 2>$null | Select-String '^host:'
    if ($host_ -match 'windows-gnu') { Ok "target: $host_" }
    else { Warn "target 不是 windows-gnu：$host_" }
} else {
    Fail '未找到 cargo'
    Info '请先安装 rustup（默认 host 选 x86_64-pc-windows-gnu）：'
    Info '  winget install Rustlang.Rustup'
    Info '  或 https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-gnu/rustup-init.exe'
}

Write-Host "`n[2/4] MSYS2 / MinGW-w64" -ForegroundColor Cyan
$dlltool = 'C:\msys64\mingw64\bin\dlltool.exe'
if (Test-Path $dlltool) {
    Ok "dlltool: $dlltool"
} else {
    Fail '未找到 C:\msys64\mingw64\bin\dlltool.exe'
    Info '请安装 MSYS2 后执行：'
    Info '  C:\msys64\usr\bin\bash.exe -lc "pacman -Sy --noconfirm --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-binutils"'
}

Write-Host "`n[3/4] Cargo 配置" -ForegroundColor Cyan
$configPath = Join-Path $tauriDir '.cargo\config.toml'
if (Test-Path $configPath) {
    $content = Get-Content $configPath -Raw
    if ($content -match 'rsproxy') { Ok '已使用 rsproxy 镜像' } else { Warn '未配置国内 crates 镜像，构建可能极慢' }
    if ($content -match 'rust-lld') { Ok '已使用 rust-lld 链接器' } else { Warn '未使用 rust-lld，MSYS2 gcc 可能链接失败' }
    if ($content -match 'C:/msys64/mingw64/lib') { Ok '已指定 MinGW 库目录' } else { Warn '未指定 MinGW 库目录' }
} else {
    Fail "缺少 $configPath"
}

Write-Host "`n[4/4] 构建命令" -ForegroundColor Cyan
Info '开发模式（热更新）：  npm run app:dev'
Info '打包安装程序：        npm run app:build'
Info '仅构建前端：          npm run build'
Info ''
Info '若 app:dev / app:build 报 dlltool not found，请把 C:\msys64\mingw64\bin 加入 PATH：'
Info '  $env:Path = "C:\msys64\mingw64\bin;$env:Path"'
Write-Host ''
