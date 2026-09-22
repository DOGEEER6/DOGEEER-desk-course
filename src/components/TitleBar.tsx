import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Icon } from './ui'
import {
  closeWindow,
  isDesktop,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  toggleMaximizeWindow,
} from '../lib/desktop'
import { pad2 } from '../lib/time'

/**
 * 自绘标题栏：把 Windows 原生的关闭 / 最小化 / 最大化融进页面。
 * 整条可拖动；按钮区域标记 no-drag。
 */
export function TitleBar({ now }: { now: Date }) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isDesktop()) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    const sync = () => void isWindowMaximized().then(setMaximized)
    sync()
    void onWindowResized(sync).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return (
    <header className="titlebar" data-tauri-drag-region>
      {/* 品牌 */}
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <div
          className="grid h-[22px] w-[22px] place-items-center rounded-[7px] bg-gradient-to-br from-[#3AA0FF] to-[#0A84FF] text-white shadow-[0_4px_10px_-4px_rgba(10,132,255,0.9)]"
          data-tauri-drag-region
        >
          <Icon name="calendar" size={12} />
        </div>
        <span className="text-[12.5px] font-extrabold tracking-[0.02em]" data-tauri-drag-region>
          DOGEEER
        </span>
        <span className="text-[11.5px] font-medium text-ink-4" data-tauri-drag-region>
          课表
        </span>
      </div>

      {/* 中部可拖动区域 + 时钟 */}
      <div className="flex flex-1 items-center justify-center gap-2" data-tauri-drag-region>
        <span className="tabular text-[11.5px] font-semibold text-ink-4" data-tauri-drag-region>
          {now.getFullYear()}/{pad2(now.getMonth() + 1)}/{pad2(now.getDate())}{' '}
          {pad2(now.getHours())}:{pad2(now.getMinutes())}
        </span>
      </div>

      {/* 窗口按钮 */}
      {isDesktop() && (
        <div className="ml-auto flex items-center pr-[4px]">
          <div className="no-drag flex items-center">
          <button
            type="button"
            className="titlebar-btn"
            title="最小化"
            aria-label="最小化"
            onClick={() => void minimizeWindow()}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-btn"
            title={maximized ? '还原' : '最大化'}
            aria-label={maximized ? '还原' : '最大化'}
            onClick={() => {
              void toggleMaximizeWindow()
              window.setTimeout(() => void isWindowMaximized().then(setMaximized), 120)
            }}
          >
            {maximized ? (
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.4" y="4.2" width="5.4" height="5.4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" />
                <path d="M4.3 4.2V3.2a1 1 0 011-1h3.3a1 1 0 011 1v3.3a1 1 0 01-1 1h-1" fill="none" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={clsx('titlebar-btn')}
            data-kind="close"
            title="关闭"
            aria-label="关闭"
            onClick={() => void closeWindow()}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          </div>
        </div>
      )}
    </header>
  )
}
