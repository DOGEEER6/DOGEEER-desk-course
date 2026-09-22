/**
 * 主题：跟随 Windows 的浅色 / 深色设置，也支持手动指定。
 * 在应用入口最先执行，避免首帧闪白。
 */
export type ThemeMode = 'system' | 'light' | 'dark'

const KEY = 'lumen-theme'
let media: MediaQueryList | null = null
let current: ThemeMode = 'system'

function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function apply(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && systemDark())
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function getTheme(): ThemeMode {
  return current
}

/** 当前实际是不是深色（用于需要 JS 判断的场景） */
export function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

export function setTheme(mode: ThemeMode) {
  current = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore */
  }
  apply(mode)
}

/** 在入口调用一次：读取偏好 + 监听系统切换 */
export function initTheme(): ThemeMode {
  let stored: ThemeMode = 'system'
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') stored = v
  } catch {
    /* ignore */
  }
  current = stored
  apply(stored)

  try {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (current === 'system') apply('system')
    }
    // 兼容旧版 WebView
    if (media.addEventListener) media.addEventListener('change', onChange)
    else media.addListener?.(onChange)
  } catch {
    /* ignore */
  }
  return stored
}
