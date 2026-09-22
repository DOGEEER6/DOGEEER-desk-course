import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import MiniWidget from './MiniWidget'
import { initTheme, MINI_THEME_KEY } from '../lib/theme'

// 浮窗默认深色：深色桌面上更自然，也不会出现浅色描边
initTheme(MINI_THEME_KEY, 'dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniWidget />
  </StrictMode>,
)
