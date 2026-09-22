/**
 * 桌面端（Tauri）桥接层。浏览器里运行时会优雅降级。
 */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as object)

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

function invoke(): Invoke | null {
  if (!isDesktop()) return null
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__
  return internals?.invoke ?? null
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  const fn = invoke()
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
