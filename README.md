# DOGEEER 课表

> iOS 风格的 Windows 桌面课程表 + 常驻桌面的今日浮窗 —— Excel 导入、开课提醒、拖动改课、作业与 DDL。

<img src="src-tauri/icons/icon.png" width="88" alt="DOGEEER 课表图标" />

## 功能

| | 能力 |
|---|---|
| 🪟 **桌面浮窗** | 无边框卡片，**就在桌面上**（默认不抢占最前，可在设置里「固定在桌面最前」）。只显示**今天**：今日课程 + 全部作业 DDL 汇总；点击课程卡片展开教师/地点/该课作业与截止时间；点「打开完整课表」进入主界面。记住位置与大小，支持**开机自启（开机只显示浮窗）** |
| 🪟 **原生材质** | 浮窗使用 Windows 11 的 **Mica** 材质 + 更强的毛玻璃，深色桌面上也清晰可读 |
| 📅 **三种课表视图** | **周视图**（可拖动的网格）/ **月视图**（7 列卡片，按天列课）/ **学期视图**（周 × 星期热力矩阵 + 课程清单 + 学期进度），学期视图点某一周可直接跳到周视图 |
| 🪟 **自绘窗口** | 去掉 Windows 原生标题栏，把**最小化 / 最大化 / 关闭**融进页面顶部（整条标题栏可拖动窗口） |
| 🌗 **浅色 / 深色主题** | 跟随系统，也可在设置里手动指定；整套颜色走 CSS 变量，两套主题一起切换 |
| ✅ **待办闭环** | 勾选完成 → 打勾动画 → 自动**归档**；归档页可一键恢复或清空；删除与完成都有**撤销** |
| 📥 **Excel 导入** | 自动识别「网格课表」与「课程清单」两种格式；单元格里 `课程名 / 教师（1-16周） / 地点` 会被自动拆开；周次支持 `1-16`、`1,3,5`、`第1-8周`、`单周`、`双周`、`每周`。课表**按周次区分**，每周显示的内容可以完全不同。也支持把文件直接拖进窗口（桌面端走原生拖放） |
| 🔔 **开课提醒** | 应用内横幅 + 系统通知 + 合成提示音；可设置提前 5/10/15/30 分钟或自定义；作业 DDL 临期与逾期也会提醒（逾期超过 12 小时不再打扰） |
| ✋ **拖动改课** | 直接拖动卡片移动课程；拖动上下边缘拉长/缩短；松开自动吸附到节次网格，并显示吸附辅助框；同一时段重复会按周次自动合并 |
| 📝 **课程详情** | 点击课程打开右侧抽屉：上课时段编辑、周次选择器、教师/地点/学分、11 种 iOS 配色 |
| 🗒 **备忘录** | 每门课独立备忘录，输入停下 0.5 秒自动保存 |
| 🎯 **Todo List（醒目区）** | 主界面顶部右侧常驻面板：进行中统计、逾期高亮、4 种筛选（进行中/今天/近 7 天/归档）、双击重命名、行内改 DDL |
| ⚡ **自然语言速记** | 输入 `操作系统实验报告 周五 18:00 !high` 回车即自动解析出 DDL 与优先级 |
| 🎨 **极简有设计感** | 通透毛玻璃材质、柔和光斑背景、iOS 分段控件与开关、Framer Motion 弹簧动画 |
| 💾 **数据本地化** | 全部数据存本机，支持 JSON 完整备份/恢复、本周课表导出 CSV |

### 界面

- **桌面浮窗（mini 窗口）** —— 无边框 Mica 玻璃卡片，就在桌面上；今日课程 + 近期待办，点卡片展开详情
- **自绘标题栏** —— 品牌 + 实时时钟 + 最小化/最大化/关闭
- **左侧栏** —— 导航 + 实时「正在上课 / 接下来」卡片 + 今日剩余课程
- **顶部左** —— 当前/下一节课大卡片，带秒级倒计时与进度条
- **顶部右** —— 待办作业清单（醒目区域）
- **下方** —— 周 / 月 / 学期三种视图

### 启动行为

| 场景 | 表现 |
|---|---|
| 首次运行 | 自动打开主窗口，并**默认开启开机自启**（只显示浮窗），可用通知里的说明或设置页关闭 |
| 手动打开 | 打开主窗口 |
| 开机自启 | **只显示浮窗**，点「打开完整课表」才进入主界面 |
| 点标题栏关闭 / 浮窗 × | 分别隐藏主窗口 / 浮窗，程序不退出 |

## 快捷键

| 按键 | 作用 |
|---|---|
| `Ctrl` + `K` | 聚焦待办快速输入 |
| `Ctrl` + `I` | 打开导入面板 |
| `←` / `→` | 上一周 / 下一周（预览模式） |
| `T` | 回到本周 |
| `J` / `W` / `L` | 课程表 / 今日 / 待办 |
| `Esc` | 关闭抽屉与弹窗 |

课表内：**拖动卡片**移动，**拖动上下边缘**拉长缩短，**双击空白格**新建课程，**双击卡片**打开详情。

## 技术栈

- **Tauri 2**（Rust）+ **React 19** + **TypeScript** + **Vite 8**
- **Zustand**（+ persist 中间件）管理状态与本地持久化
- **Tailwind CSS v4** + 自定义材质 `/src/index.css`
- **Framer Motion** 负责所有弹簧动画
- **SheetJS (xlsx)** 负责 Excel 解析与模板导出
- **tauri-plugin-notification / autostart / fs** 负责系统通知、开机自启、原生拖放文件读取
- 图标为**脚本生成**（`scripts/gen-icons.mjs`，零依赖纯 Node 实现 PNG/ICO 编码）

> 前端是完全独立的，可直接 `npm run dev` 在浏览器里预览大部分功能（除系统通知、浮窗、原生拖放）。

## 构建产物

| 产物 | 路径 | 大小 |
|---|---|---|
| 安装程序（NSIS，当前用户免管理员） | `src-tauri/target/release/bundle/nsis/DOGEEER课表_0.1.0_x64-setup.exe` | ~1.5 MB |
| 免安装可执行文件 | `src-tauri/target/release/desk-course.exe` | ~4 MB |

> 首次 `npm run app:build` 时 Tauri 会从 GitHub 下载 NSIS（约 2.3MB）。国内网络可能超时，
> 可先用镜像预置到缓存目录，再重新执行打包：
>
> ```powershell
> $zip = "$env:TEMP\nsis-3.11.zip"
> Start-BitsTransfer -Source "https://ghfast.top/https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip" -Destination $zip
> Remove-Item "$env:LOCALAPPDATA\tauri\NSIS" -Recurse -Force -ErrorAction SilentlyContinue
> Expand-Archive $zip -DestinationPath "$env:LOCALAPPDATA\tauri\NSIS" -Force
> ```

## 开发

```bash
npm install
npm run dev          # 浏览器预览 http://127.0.0.1:5183（可验证除系统通知/浮窗外的全部功能）
npm run app:dev      # Tauri 桌面开发模式
npm run app:build    # 打包 NSIS 安装包
npm run build        # 仅构建前端（主窗口 + 浮窗两个入口）

node scripts/selftest.mjs "课表.xlsx"   # 解析器 + 吸附算法自测（35 项）
node scripts/e2e.mjs "课表.xlsx"        # 端到端验收（注入课表 → 断言 → 截图）
```

### Rust 工具链（Windows，国内网络）

本机实测有两个坑，`scripts/setup-windows.ps1` 会自动检查：

1. **`static.crates.io` 下载只有 ~1KB/s** → `src-tauri/.cargo/config.toml` 里把索引与
   crate 文件都切到 `rsproxy.cn` 镜像（切换后 1 分钟内拉完 799 个 crate）。
2. **MSYS2 的 gcc 无法正常链接**（`collect2` 返回 53/123，连 `hello world` 都失败）
   → 改用 Rust 自带的 **`rust-lld`** 作为链接器，并显式指定 MinGW 导入库目录。
   同时 `[lib] crate-type` 去掉了 `cdylib`（GNU 工具链下 DLL 导出符号会超过 65535 上限）。

准备步骤：

```powershell
# 1) Rust（GNU 工具链，免装庞大的 MSVC Build Tools）
winget install Rustlang.Rustup
rustup default stable-x86_64-pc-windows-gnu

# 2) MSYS2 + MinGW（只需 dlltool/ar 等构建期工具）
#    安装 MSYS2 后：
C:\msys64\usr\bin\bash.exe -lc "pacman -Sy --noconfirm --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-binutils"

# 3) 自检
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```

> 打包前请确保 `C:\msys64\mingw64\bin` 在 PATH 中（rustc 生成导入库需要 `dlltool`）。

### 验收真实桌面应用

```powershell
# 让 WebView2 打开调试端口
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9444"
.\src-tauri\target\debug\desk-course.exe

# 另开一个终端跑同一套端到端断言
$env:LUMEN_CDP_PORT=9444; $env:LUMEN_TARGET="5183/"
node scripts/e2e.mjs "课表.xlsx"
```

## 目录结构

```
index.html / mini.html          两个入口：主窗口 与 桌面浮窗
src/
├── App.tsx                     主窗口外壳：侧栏 / 三视图 / 浮层 / 快捷键
├── store.ts                    Zustand store（课程、待办、节次、设置）
├── hooks.ts                    提醒引擎、今日课程、当前时间
├── types.ts                    领域模型
├── mini/
│   ├── main.tsx                浮窗入口
│   └── MiniWidget.tsx          浮窗界面（今日课程 + DDL 汇总）
├── lib/
│   ├── excel.ts                Excel 解析器（网格表 + 清单表）
│   ├── time.ts                 周次 / 节次 / 时间计算
│   ├── notify.ts               Tauri & 浏览器通知、WebAudio 提示音
│   ├── desktop.ts              Tauri 桥接（窗口 / 开机自启）
│   ├── palette.ts              iOS 配色
│   ├── template.ts             模板下载、备份导入导出
│   └── toast.ts                轻提示
└── components/
    ├── Timetable.tsx           课表网格 + 拖动/拉伸/吸附
    ├── TodayHero.tsx           当前课程大卡片 + 今日列表
    ├── TodoPanel.tsx           待办清单 + 自然语言解析
    ├── CourseDrawer.tsx        课程详情抽屉
    ├── SettingsPage.tsx        设置页（含浮窗与开机自启）
    ├── ImportDialog.tsx        导入向导
    └── ui.tsx                  图标 / 开关 / 分段控件 / 浮层 / Toast

src-tauri/                      Rust 后端：双窗口、通知、开机自启
scripts/
├── gen-icons.mjs               零依赖生成全套图标（PNG/ICO 自实现编码）
├── selftest.mjs                解析器自测（可传真实 xlsx）
└── e2e.mjs                     CDP 端到端验收（注入课表 → 断言 → 截图）
```

## Excel 格式说明

两种格式任选其一，可以在设置页「下载模板」得到示例文件。

**格式一：网格课表**（教务处 / WPS 常见）

| 星期 | 星期一 | 星期二 | … |
|---|---|---|---|
| 1 `08:00-08:45` | `线性代数`<br>`郝朝鹏（1-16）`<br>`公共学院8108` | | |

合并单元格代表连堂，行首第一列写节次与时间即可。

**格式二：课程清单**

| 课程名称 | 星期 | 节次 | 上课时间 | 地点 | 教师 | 周次 |
|---|---|---|---|---|---|---|
| 线性代数 | 星期一 | 1-2节 | 08:00-09:35 | 公共学院8108 | 郝朝鹏 | 1-16周 |

导入时还可以直接把文件拖到窗口里。

## 许可证

MIT
