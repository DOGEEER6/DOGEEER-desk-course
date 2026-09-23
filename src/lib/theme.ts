/**
 * 主题：浅色 / 深色 / 跟随系统。
 * 主窗口与浮窗同源（共用 localStorage），但各存一份 key；
 * 主窗口切换时会顺带更新浮窗的那份，保证观感一致。
 */
export type ThemeMode = 'system' | 'light' | 'dark'

export const MAIN_THEME_KEY = 'lumen-theme'
export const MINI_THEME_KEY = 'lumen-mini-theme'

let current: ThemeMode = 'light'

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

export function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

export function applyTheme(mode: ThemeMode) {
  current = mode
  apply(mode)
}

export function setTheme(mode: ThemeMode, key: string = MAIN_THEME_KEY) {
  current = mode
  try {
    localStorage.setItem(key, mode)
    // 主窗口切主题时同步浮窗，保证风格一致
    if (key === MAIN_THEME_KEY) localStorage.setItem(MINI_THEME_KEY, mode)
  } catch {
    /* ignore */
  }
  apply(mode)
}

/** 兼容旧调用 */
export function syncMiniTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(MINI_THEME_KEY, mode)
  } catch {
    /* ignore */
  }
}

function read(key: string, fallback: ThemeMode): ThemeMode {
  try {
    const v = localStorage.getItem(key)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return fallback
}

/**
 * 入口调用一次。
 * @param key      存储键（主窗口 / 浮窗各一份）
 * @param fallback 没存过时的默认值 —— 产品默认**浅色**
 */
export function initTheme(key: string = MAIN_THEME_KEY, fallback: ThemeMode = 'light'): ThemeMode {
  const mode = read(key, fallback)
  applyTheme(mode)
  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (current === 'system') apply('system')
    }
    if (media.addEventListener) media.addEventListener('change', onChange)
    else media.addListener?.(onChange)
  } catch {
    /* ignore */
  }
  return mode
}
