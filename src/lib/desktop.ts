/**
 * 桌面端（Tauri）桥接层。浏览器里运行时会优雅降级。
 *
 * 注意：Tauri v2 默认注入 `window.__TAURI_INTERNALS__.invoke`；
 * 当 tauri.conf.json 打开 `app.withGlobalTauri` 时还会额外注入 `window.__TAURI__`。
 * 两种方式都要兼容，否则在开启了 withGlobalTauri 的构建里桥接会全部失效。
 */

interface Internals {
  invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

interface TauriGlobal {
  core?: { invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> }
  window?: { getCurrentWindow?: () => unknown }
}

/** 当前 webview 窗口的句柄（含最小化/最大化/关闭等） */
interface CurrentWindow {
  minimize?: () => Promise<void>
  toggleMaximize?: () => Promise<void>
  maximize?: () => Promise<void>
  unmaximize?: () => Promise<void>
  isMaximized?: () => Promise<boolean>
  close?: () => Promise<void>
  hide?: () => Promise<void>
  setAlwaysOnTop?: (v: boolean) => Promise<void>
  startDragging?: () => Promise<void>
  onResized?: (cb: () => void) => Promise<() => void>
}

function currentWindow(): CurrentWindow | undefined {
  const fn = tauriGlobal()?.window?.getCurrentWindow as (() => CurrentWindow) | undefined
  return fn ? fn() : undefined
}

/** 窗口控制（自定义标题栏用） */
export const minimizeWindow = () => currentWindow()?.minimize?.() ?? Promise.resolve()
export const toggleMaximizeWindow = () => currentWindow()?.toggleMaximize?.() ?? Promise.resolve()
export const closeWindow = () => currentWindow()?.close?.() ?? Promise.resolve()
export async function isWindowMaximized(): Promise<boolean> {
  try {
    return (await currentWindow()?.isMaximized?.()) ?? false
  } catch {
    return false
  }
}
export async function onWindowResized(cb: () => void): Promise<() => void> {
  const win = currentWindow()
  if (!win?.onResized) return () => {}
  return win.onResized(cb)
}

function internals(): Internals | undefined {
  return (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__
}

function tauriGlobal(): TauriGlobal | undefined {
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__
}

export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && !!(internals() ?? tauriGlobal())

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (typeof window === 'undefined') return null
  const fn = internals()?.invoke ?? tauriGlobal()?.core?.invoke
  if (!fn) return null
  try {
    return await fn<T>(cmd, args)
  } catch (err) {
    console.warn(`[desktop] ${cmd} 调用失败`, err)
    return null
  }
}

/** 主窗口 */
export const showMainWindow = () => call<void>('show_main')
export const hideMainWindow = () => call<void>('hide_main')

/** 浮窗 */
export const showMiniWindow = () => call<void>('set_mini_visible', { visible: true })
export const hideMiniWindow = () => call<void>('hide_mini')
export const setMiniAlwaysOnTop = (onTop: boolean) => call<void>('set_mini_always_on_top', { onTop })
/** 固定 = 置顶 + 不可拖动 + 不可改大小；解除后可以拖到任意位置 */
export const setMiniLocked = (locked: boolean) => call<void>('set_mini_locked', { locked })
/** 固定后让鼠标穿透到桌面 */
export const setMiniClickThrough = (through: boolean) => call<void>('set_mini_click_through', { through })

/* ---------------- 窗口几何 ---------------- */
/*
 * 注意：Tauri 的 Window 实例在 WebView2 上并没有暴露 currentMonitor/primaryMonitor，
 * 但 WebView 自己知道屏幕工作区（screen.availXxx，已扣除任务栏），
 * 而 setPosition / setSize 接受的是逻辑坐标（物理像素 / scaleFactor）。
 * 直接用 CSS 像素就是逻辑坐标，不用手动换算。
 */

function invokeFn():
  | (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>)
  | undefined {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: <T>(c: string, a?: unknown) => Promise<T> } })
    .__TAURI_INTERNALS__
  return internals?.invoke as
    | (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>)
    | undefined
}

/**
 * 浮窗几何。
 *
 * 血的教训（都实测过）：
 *  1. 全局 Tauri API 的 `window.setSize()` 运行时传 `{width,height}`，后端要
 *     `{Logical:{...}}`，报 unknown variant 后**静默失败**；
 *  2. `set_position` 的单位会和前端再次缩放，导致窗口被夹回屏幕内。
 * 所以尺寸用底层 invoke 显式传 Logical，**贴边定位直接交给 Rust 命令**
 * （那边用 monitor.work_area() 的物理像素最准）。
 */
export async function setMiniSize(width: number, height: number): Promise<boolean> {
  const fn = invokeFn()
  if (!fn) return false
  try {
    await fn('plugin:window|set_size', {
      label: 'mini',
      value: { Logical: { width: Math.round(width), height: Math.round(height) } },
    })
    return true
  } catch (err) {
    console.warn('[desktop] set_size 失败', err)
    return false
  }
}

/** 贴到当前显示器工作区右上角（由 Rust 计算物理坐标） */
export async function snapMiniToTopRight(width: number, height: number, gap = 16): Promise<boolean> {
  const ok = await call<void>('snap_mini_top_right', { width, height, gap })
  if (ok != null) return true
  // 浏览器预览时退化为普通 set_size
  return setMiniSize(width, height)
}

/** 工作区高度（逻辑像素），用于限制浮窗内容高度 */
export async function miniWorkAreaHeight(): Promise<number> {
  const h = await call<number>('mini_work_area_height')
  if (typeof h === 'number' && h > 200) return h
  const s = window.screen
  const dpr = window.devicePixelRatio || 1
  return (s.availHeight || s.height || 1080) / dpr
}

/**
 * 请求后端在启动完成后（延迟 2.6s）一次性把浮窗贴到右上角。
 * 前端自己贴会被 Windows 的默认定位覆盖，所以交给 Rust 收尾。
 */
export async function requestInitialSnap(firstRun: boolean, height: number): Promise<boolean> {
  const r = await call<void>('request_initial_snap', { firstRun, height })
  return r != null
}

/** 设置页「浮窗回到右上角」 */
export async function resetMiniToTopRight(height: number): Promise<boolean> {
  return snapMiniToTopRight(400, Math.max(200, Math.round(height)))
}

/** 托盘图标 */
export const setTrayVisible = (visible: boolean) => call<void>('set_tray_visible', { visible })
export const getTrayVisible = () => call<boolean>('get_tray_visible')

/** 开机自启 */
export const setAutoStart = (enabled: boolean) => call<boolean>('set_autostart', { enabled })
export const getAutoStart = () => call<boolean>('get_autostart')

/** 是否由开机自启拉起 */
export const launchedAtStartup = () => call<boolean>('launched_at_startup')

/** 应用版本 */
export const appVersion = () => call<string>('app_version')

/** 隐藏当前窗口（浮窗自己的关闭按钮） */
export async function hideCurrentWindow(): Promise<void> {
  const win = currentWindow()
  if (win?.hide) {
    await win.hide()
    return
  }
  const ok = await call<void>('hide_mini')
  if (ok == null) window.close()
}

/* ------------------------------------------------------------------ */
/* 原生文件拖放（桌面端）                                               */
/* ------------------------------------------------------------------ */

export interface NativeFileDrop {
  name: string
  data: ArrayBuffer
}

/**
 * Tauri 的窗口会把 OS 级文件拖放「吞掉」（dragDropEnabled），
 * 所以 HTML5 的 drop 事件在桌面端收不到文件，必须监听原生事件。
 */
export async function onNativeFileDrop(handlers: {
  onEnter?: () => void
  onLeave?: () => void
  onFile: (file: NativeFileDrop) => void
}): Promise<() => void> {
  const w = tauriGlobal()?.window
  const win = w?.getCurrentWindow?.() as
    | { onDragDropEvent?: (cb: (e: { payload: { type: string; paths?: string[] } }) => void) => Promise<() => void> }
    | undefined
  if (!win?.onDragDropEvent) return () => {}

  let readFile: ((p: string) => Promise<Uint8Array>) | null = null
  try {
    const mod = await import('@tauri-apps/plugin-fs')
    readFile = (p: string) => mod.readFile(p)
  } catch {
    console.warn('[desktop] 未安装 @tauri-apps/plugin-fs，桌面端拖放导入不可用')
  }

  const unlisten = await win.onDragDropEvent(async (event) => {
    const p = event.payload
    if (p.type === 'enter' || p.type === 'over') {
      handlers.onEnter?.()
      return
    }
    if (p.type === 'leave') {
      handlers.onLeave?.()
      return
    }
    if (p.type === 'drop') {
      handlers.onLeave?.()
      const path = p.paths?.[0]
      if (!path || !readFile) return
      try {
        const bytes = await readFile(path)
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        handlers.onFile({ name: path.split(/[\\/]/).pop() ?? 'timetable.xlsx', data: ab })
      } catch (err) {
        console.warn('[desktop] 读取拖入的文件失败', err)
      }
    }
  })
  return unlisten
}
