import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import MiniWidget from './MiniWidget'
import { initTheme, MINI_THEME_KEY } from '../lib/theme'

// 浮窗主题跟随主界面（主窗口会把选择写进这个键）；没写过时默认浅色
initTheme(MINI_THEME_KEY, 'light')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniWidget />
  </StrictMode>,
)
