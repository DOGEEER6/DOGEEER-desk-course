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
  window?: { getCurrentWindow?: () => { hide?: () => Promise<void> } }
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

/** 开机自启 */
export const setAutoStart = (enabled: boolean) => call<boolean>('set_autostart', { enabled })
export const getAutoStart = () => call<boolean>('get_autostart')

/** 是否由开机自启拉起 */
export const launchedAtStartup = () => call<boolean>('launched_at_startup')

export const appVersion = () => call<string>('app_version')

/** 隐藏当前窗口（浮窗自己的关闭按钮） */
export async function hideCurrentWindow(): Promise<void> {
  const win = tauriGlobal()?.window?.getCurrentWindow?.()
  if (win?.hide) {
    await win.hide()
    return
  }
  const ok = await call<void>('hide_mini')
  if (ok == null) window.close()
}
