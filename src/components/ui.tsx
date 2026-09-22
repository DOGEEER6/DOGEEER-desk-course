import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useToastStore, type ToastTone } from '../lib/toast'

/* ------------------------------------------------------------------ */
/* 弹簧参数                                                            */
/* ------------------------------------------------------------------ */

export const springSoft = { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.9 }
export const springSnappy = { type: 'spring' as const, stiffness: 620, damping: 38, mass: 0.8 }
export const springGentle = { type: 'spring' as const, stiffness: 260, damping: 30 }

/* ------------------------------------------------------------------ */
/* 图标（线性，1.8 描边，风格统一）                                       */
/* ------------------------------------------------------------------ */

type IconName =
  | 'calendar'
  | 'check'
  | 'checkCircle'
  | 'plus'
  | 'settings'
  | 'import'
  | 'bell'
  | 'bellOff'
  | 'close'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'trash'
  | 'clock'
  | 'pin'
  | 'user'
  | 'note'
  | 'drag'
  | 'search'
  | 'flag'
  | 'sun'
  | 'list'
  | 'sparkle'
  | 'download'
  | 'warning'

const PATHS: Record<IconName, ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="3.5" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.4l2.6 2.6L16 9.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.6 7.4l2 1.2M17.4 15.4l2 1.2M4.6 16.6l2-1.2M17.4 8.6l2-1.2" />
    </>
  ),
  import: (
    <>
      <path d="M12 3.5v11" />
      <path d="M7.8 10.3L12 14.5l4.2-4.2" />
      <path d="M4.5 16.5v1.6a2.4 2.4 0 002.4 2.4h10.2a2.4 2.4 0 002.4-2.4v-1.6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 15.5V10a6 6 0 10-12 0v5.5L4.5 18h15z" />
      <path d="M10 21h4" />
    </>
  ),
  bellOff: (
    <>
      <path d="M18 15.5V10a6 6 0 00-9.2-5.1M6 7.5A6 6 0 006 10v5.5L4.5 18h11" />
      <path d="M10 21h4M3.5 3.5l17 17" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevronLeft: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  chevronRight: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5L12 16l6.5-6.5" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.2a2 2 0 002 1.8h5a2 2 0 002-1.8L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 10-13 0C5.5 14.9 12 21 12 21z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
    </>
  ),
  note: (
    <>
      <path d="M6 3.8h8.5L19 8.3V20a1.8 1.8 0 01-1.8 1.8H6A1.8 1.8 0 014.2 20V5.6A1.8 1.8 0 016 3.8z" />
      <path d="M14 4v4.6h4.6M8 13h8M8 16.5h5.5" />
    </>
  ),
  drag: (
    <>
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.4" />
      <path d="M15.8 15.8L20.5 20.5" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4.5M6 5h11l-2 3.6 2 3.6H6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.2M12 19v2.2M4.5 4.5l1.6 1.6M17.9 17.9l1.6 1.6M2.8 12H5M19 12h2.2M4.5 19.5l1.6-1.6M17.9 6.1l1.6-1.6" />
    </>
  ),
  list: <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />,
  sparkle: (
    <>
      <path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7z" />
      <path d="M18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  download: (
    <>
      <path d="M12 20.5V9.5" />
      <path d="M16.2 13.7L12 9.5l-4.2 4.2" />
      <path d="M4.5 7.5V6a2.4 2.4 0 012.4-2.4h10.2A2.4 2.4 0 0119.5 6v1.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.8l8.6 15.4H3.4z" />
      <path d="M12 9.5v4.2M12 16.6h.01" />
    </>
  ),
}

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1.8,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 开关                                                                */
/* ------------------------------------------------------------------ */

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="switch"
      data-on={checked}
      disabled={disabled}
      style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
    >
      <span />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* 分段控件                                                            */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number }>({ left: 3, width: 0 })

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value)
    const host = ref.current
    if (!host || idx < 0) return
    const btn = host.querySelectorAll('button')[idx] as HTMLElement | undefined
    if (!btn) return
    setThumb({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [value, options])

  return (
    <div ref={ref} className={clsx('segmented', className)}>
      <motion.div
        className="segmented-thumb"
        animate={{ left: thumb.left, width: thumb.width }}
        transition={springSnappy}
      />
      {options.map((o) => (
        <button key={o.value} type="button" data-active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 模态 / 抽屉                                                          */
/* ------------------------------------------------------------------ */

export function Overlay({
  open,
  onClose,
  children,
  align = 'center',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  align?: 'center' | 'right'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <motion.div
            className="absolute inset-0"
            style={{ background: 'var(--c-scrim)', backdropFilter: 'blur(3px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            className={clsx(
              'absolute inset-y-0 flex items-stretch',
              align === 'right' ? 'right-0' : 'inset-x-0 items-center justify-center',
            )}
            initial={
              align === 'right' ? { x: 60, opacity: 0 } : { y: 24, opacity: 0, scale: 0.97 }
            }
            animate={align === 'right' ? { x: 0, opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={align === 'right' ? { x: 60, opacity: 0 } : { y: 16, opacity: 0, scale: 0.98 }}
            transition={springSoft}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */

const TONE_STYLE: Record<ToastTone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: 'rgba(10,132,255,0.14)', fg: '#0A84FF', icon: 'sparkle' },
  success: { bg: 'rgba(52,199,89,0.16)', fg: '#1D9E45', icon: 'checkCircle' },
  warn: { bg: 'rgba(255,159,10,0.18)', fg: '#C2740A', icon: 'warning' },
  error: { bg: 'rgba(255,59,48,0.14)', fg: '#D62A20', icon: 'warning' },
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[90] flex w-[min(88vw,400px)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const tone = TONE_STYLE[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 32, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.96 }}
              transition={springSoft}
              className="glass pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3"
              style={{ boxShadow: 'var(--shadow-float)' }}
            >
              <div
                className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <Icon name={tone.icon} size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink">{t.title}</div>
                {t.desc && <div className="mt-0.5 text-[12px] leading-5 text-ink-3">{t.desc}</div>}
                {t.action && (
                  <button
                    className="btn btn-ghost mt-2 h-7 px-3 text-[12px]"
                    onClick={() => {
                      t.action?.onClick()
                      dismiss(t.id)
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                className="btn h-6 w-6 flex-none text-ink-4 hover:text-ink-2"
                onClick={() => dismiss(t.id)}
                aria-label="关闭"
              >
                <Icon name="close" size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
