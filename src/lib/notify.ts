/**
 * 通知适配层：同时支持 Tauri 桌面端与浏览器调试环境
 */

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as object)

let cachedPermission: PermissionState | null = null

export async function ensurePermission(): Promise<PermissionState> {
  if (cachedPermission) return cachedPermission
  if (isTauri()) {
    try {
      const mod = await import('@tauri-apps/plugin-notification')
      let granted = await mod.isPermissionGranted()
      if (!granted) granted = (await mod.requestPermission()) === 'granted'
      cachedPermission = granted ? 'granted' : 'denied'
    } catch {
      cachedPermission = 'unsupported'
    }
    return cachedPermission
  }
  if (typeof Notification === 'undefined') {
    cachedPermission = 'unsupported'
    return cachedPermission
  }
  cachedPermission = Notification.permission as PermissionState
  if (cachedPermission === 'prompt') {
    try {
      cachedPermission = (await Notification.requestPermission()) as PermissionState
    } catch {
      /* ignore */
    }
  }
  return cachedPermission
}

export async function notify(title: string, body: string): Promise<boolean> {
  const perm = await ensurePermission()
  if (perm !== 'granted') return false
  try {
    if (isTauri()) {
      const mod = await import('@tauri-apps/plugin-notification')
      mod.sendNotification({ title, body, sound: 'default' })
      return true
    }
    new Notification(title, { body, silent: false })
    return true
  } catch {
    return false
  }
}

/* ---------------- 提示音（WebAudio 合成，不依赖资源文件） ---------------- */

let audioCtx: AudioContext | null = null

export function playChime(kind: 'bell' | 'done' = 'bell') {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioCtx = audioCtx ?? new Ctor()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime

    const notes = kind === 'bell' ? [880, 1174.7] : [1046.5, 1318.5, 1568]
    notes.forEach((f, i) => {
      const t = now + i * 0.13
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.16, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.65)
    })
  } catch {
    /* 静默失败即可 */
  }
}

/* ---------------- 窗口聚焦 ---------------- */

export async function isWindowFocused(): Promise<boolean> {
  if (!isTauri()) return document.hasFocus()
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return await getCurrentWindow().isFocused()
  } catch {
    return document.hasFocus()
  }
}
