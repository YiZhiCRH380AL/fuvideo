import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {
  applyMotionPreference,
  applyTheme,
  readMotionHint,
  readThemeHint,
} from './lib/theme'

// 在 React 首帧之前铺好主题，开屏关闭时也不会先闪一下默认色。
applyTheme(readThemeHint())
applyMotionPreference(readMotionHint())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
