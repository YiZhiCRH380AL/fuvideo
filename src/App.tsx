import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import './App.css'
import {
  getBackendStatus,
  getPlayerState,
  isTauri,
  pickVideoFile,
  playLocalVideo,
  seekTo,
  togglePause,
  type BackendStatus,
  type PlayerSnapshot,
} from './lib/backend'
import { fileName } from './lib/path'
import { formatDuration } from './lib/time'

/** 播放状态的轮询间隔。 */
const POLL_INTERVAL_MS = 300

export default function App() {
  const [status, setStatus] = useState<BackendStatus | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrubRef = useRef<number | null>(null)

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

  // 播放开始后持续拉取进度，供进度条与时间显示使用
  useEffect(() => {
    if (!currentFile) {
      return
    }

    let cancelled = false
    let inFlight = false

    const tick = async () => {
      if (inFlight) {
        return
      }

      inFlight = true

      try {
        const snapshot = await getPlayerState()

        if (!cancelled) {
          setPlayer(snapshot)
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        inFlight = false
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [currentFile])

  const handleTogglePause = useCallback(async () => {
    setError(null)

    try {
      const paused = await togglePause()
      setPlayer((previous) => (previous ? { ...previous, paused } : previous))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const handleScrubChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    scrubRef.current = Number(event.target.value)
    setScrub(scrubRef.current)
  }, [])

  // 拖动过程中只更新显示，松手时才真正跳转，避免每移动一像素就发一次请求
  const handleScrubCommit = useCallback(() => {
    const pending = scrubRef.current
    scrubRef.current = null
    setScrub(null)

    if (pending === null) {
      return
    }

    seekTo(pending).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [])

  const backendLabel = status ? status.message : '正在检测运行环境…'
  const canOpen = isTauri() && status?.mpvAvailable === true
  const hasMedia = player?.hasMedia === true
  const duration = player?.duration ?? 0
  const shownPosition = scrub ?? player?.position ?? 0
  const fillPercent = duration > 0 ? Math.min(100, (shownPosition / duration) * 100) : 0

  return (
    <div className="app" data-stage={currentFile ? 'video' : 'empty'}>
      <header className="app__bar">
        <div className="app__brand">
          <span className="app__wordmark">futurevideo</span>
          {currentFile ? (
            <span className="app__file" data-testid="current-file">
              {fileName(currentFile)}
            </span>
          ) : null}
        </div>
        <span className="app__backend" data-testid="backend-status">
          {backendLabel}
        </span>
      </header>

      <main className="stage">
        {currentFile ? null : (
          <div className="stage__empty">
            <p className="stage__hint">把视频拖进来，或</p>
            <button className="button" type="button" onClick={handleOpen} disabled={!canOpen}>
              选择视频文件
            </button>
          </div>
        )}
      </main>

      <footer className="controls">
        <button
          className="controls__button"
          type="button"
          onClick={handleTogglePause}
          disabled={!hasMedia}
          aria-label={player?.paused === false ? '暂停' : '播放'}
        >
          {player?.paused === false ? '❚❚' : '▶'}
        </button>
        <span className="controls__time" data-testid="time-display">
          {formatDuration(shownPosition)} / {formatDuration(duration)}
        </span>
        <input
          className="controls__progress"
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={shownPosition}
          disabled={!hasMedia}
          aria-label="播放进度"
          onChange={handleScrubChange}
          onPointerUp={handleScrubCommit}
          onKeyUp={handleScrubCommit}
          onBlur={handleScrubCommit}
          style={{ '--fill': `${fillPercent}%` } as CSSProperties}
        />
      </footer>

      {error ? (
        <p className="app__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
