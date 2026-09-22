import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import MiniWidget from './MiniWidget'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MiniWidget />
  </StrictMode>,
)
