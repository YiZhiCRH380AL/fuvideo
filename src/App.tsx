import { useCallback, useEffect, useState } from 'react'
import './App.css'
import {
  getBackendStatus,
  isTauri,
  pickVideoFile,
  playLocalVideo,
  type BackendStatus,
} from './lib/backend'
import { formatDuration } from './lib/time'

export default function App() {
  const [status, setStatus] = useState<BackendStatus | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getBackendStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next)
          // 浏览器里要自己铺底色，桌面端窗口是透明的
          document.documentElement.dataset.shell = next.kind
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleOpen = useCallback(async () => {
    setError(null)

    try {
      const path = await pickVideoFile()

      if (!path) {
        return
      }

      await playLocalVideo(path)
      setCurrentFile(path)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const backendLabel = status ? status.message : '正在检测运行环境…'
  const canOpen = isTauri() && status?.mpvAvailable === true

  return (
    <div className="app" data-stage={currentFile ? 'video' : 'empty'}>
      <header className="app__bar">
        <span className="app__wordmark">futurevideo</span>
        <span className="app__backend" data-testid="backend-status">
          {backendLabel}
        </span>
      </header>

      <main className="stage">
        <div className="stage__empty">
          <p className="stage__hint">把视频拖进来，或</p>
          <button className="button" type="button" onClick={handleOpen} disabled={!canOpen}>
            选择视频文件
          </button>
          {currentFile ? (
            <p className="stage__file" data-testid="current-file">
              {currentFile}
            </p>
          ) : null}
        </div>
      </main>

      <footer className="controls">
        <button className="controls__button" type="button" disabled aria-label="播放">
          ▶
        </button>
        <span className="controls__time" data-testid="time-display">
          {formatDuration(0)} / {formatDuration(0)}
        </span>
        <div className="controls__track" aria-hidden="true">
          <div className="controls__track-fill" />
        </div>
      </footer>

      {error ? (
        <p className="app__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
