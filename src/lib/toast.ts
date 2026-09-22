import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warn' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  title: string
  desc?: string
  tone: ToastTone
  /** 毫秒；0 表示不自动关闭 */
  duration: number
  action?: ToastAction
  createdAt: number
}

interface ToastState {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id' | 'createdAt'> & { id?: string }) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    set((s) => ({
      // 最多同时保留 3 条，避免铺满屏幕遮挡界面
      toasts: [...s.toasts.filter((x) => x.id !== id), { ...t, id, createdAt: Date.now() }].slice(-3),
    }))
    if (t.duration > 0) {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
      }, t.duration)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

/** 便捷函数 */
export function toast(
  title: string,
  opts: { desc?: string; tone?: ToastTone; duration?: number; action?: ToastAction } = {},
): string {
  return useToastStore.getState().push({
    title,
    desc: opts.desc,
    tone: opts.tone ?? 'info',
    duration: opts.duration ?? 3600,
    action: opts.action,
  })
}
