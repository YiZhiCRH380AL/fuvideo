import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import HoverPreview from './components/HoverPreview'
import Sidebar from './components/Sidebar'
import {
  getBackendStatus,
  getPlayerState,
  isTauri,
  listVideos,
  pickDirectory,
  pickVideoFile,
  playLocalVideo,
  seekBy,
  seekTo,
  setSpeed,
  setVolume,
  thumbnailAt,
  toggleFullscreen,
  toggleMute,
  togglePause,
  type BackendStatus,
  type PlayerSnapshot,
  type VideoEntry,
} from './lib/backend'
import { fileName } from './lib/path'
import {
  formatSpeed,
  JUMP_STEP,
  SEEK_STEP,
  SPEED_OPTIONS,
  stepSpeed,
  stepVolume,
  VOLUME_STEP,
} from './lib/playback'
import { resolveShortcut, shouldIgnoreShortcut } from './lib/shortcuts'
import { formatDuration } from './lib/time'
import { useIdleVisibility } from './lib/use-idle-visibility'

/** 播放状态的轮询间隔。 */
const POLL_INTERVAL_MS = 300
/** 空闲多久后收起控件。 */
const CONTROLS_IDLE_MS = 2500

export default function App() {
  const [status, setStatus] = useState<BackendStatus | null>(null)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [pendingSeek, setPendingSeek] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overControls, setOverControls] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [directory, setDirectory] = useState<string | null>(null)
  const [entries, setEntries] = useState<VideoEntry[]>([])
  const [directoryBusy, setDirectoryBusy] = useState(false)
  const [preview, setPreview] = useState<{ fraction: number; seconds: number } | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const scrubRef = useRef<number | null>(null)
  const pendingTimer = useRef<number | null>(null)
  const previewTimer = useRef<number | null>(null)
  const thumbnailCache = useRef(new Map<string, string>())

  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause))
  }, [])

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
          reportError(cause)
        }
      })

    return () => {
      cancelled = true
    }
  }, [reportError])

  // 播放开始后持续拉取进度，供进度条、时间与音量显示使用
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
          // 跳转目标已经被真实位置追上时，把显示权交还给播放状态，
          // 否则进度条会一直停在目标点上不动
          setPendingSeek((pending) =>
            pending !== null && Math.abs(snapshot.position - pending) < 0.75 ? null : pending,
          )
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          reportError(cause)
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
  }, [currentFile, reportError])

  /** 播放一个具体路径。打开文件与侧边栏点选都走这里。 */
  const playPath = useCallback(
    async (path: string) => {
      setError(null)

      try {
        await playLocalVideo(path)
        setCurrentFile(path)
        setPendingSeek(null)
        // 换了片源，预览缓存作废
        thumbnailCache.current.clear()
      } catch (cause: unknown) {
        reportError(cause)
      }
    },
    [reportError],
  )

  const handleOpen = useCallback(async () => {
    setError(null)

    try {
      const path = await pickVideoFile()

      if (path) {
        await playPath(path)
      }
    } catch (cause: unknown) {
      reportError(cause)
    }
  }, [playPath, reportError])

  const handleChooseDirectory = useCallback(async () => {
    setError(null)

    try {
      const picked = await pickDirectory()

      if (!picked) {
        return
      }

      setDirectoryBusy(true)
      const videos = await listVideos(picked)
      setDirectory(picked)
      setEntries(videos)
    } catch (cause: unknown) {
      reportError(cause)
    } finally {
      setDirectoryBusy(false)
    }
  }, [reportError])

  const handleTogglePause = useCallback(async () => {
    setError(null)

    try {
      const paused = await togglePause()
      setPlayer((previous) => (previous ? { ...previous, paused } : previous))
    } catch (cause: unknown) {
      reportError(cause)
    }
  }, [reportError])

  // 以「是否已选中文件」为准，而不是等播放状态回报，
  // 否则状态一来一回之间控件会有一段点不动的空窗
  const hasMedia = currentFile !== null
  const paused = player?.paused !== false
  const duration = player?.duration ?? 0
  // 松手后先停在目标位置，避免轮询把滑块拉回旧位置造成跳动
  const shownPosition = scrub ?? pendingSeek ?? player?.position ?? 0
  const fillPercent = duration > 0 ? Math.min(100, (shownPosition / duration) * 100) : 0
  const volume = player?.volume ?? 100
  const muted = player?.muted === true
  const speed = player?.speed ?? 1

  const handleVolumeChange = useCallback(
    (next: number) => {
      setVolume(next).catch(reportError)

      // 拖着音量条就等于要听声音，顺手解除静音
      if (muted && next > 0) {
        toggleMute().catch(reportError)
      }
    },
    [muted, reportError],
  )

  const handleToggleMute = useCallback(() => {
    toggleMute()
      .then((next) => setPlayer((previous) => (previous ? { ...previous, muted: next } : previous)))
      .catch(reportError)
  }, [reportError])

  const handleSpeedChange = useCallback(
    (next: number) => {
      setSpeed(next).catch(reportError)
      setSpeedOpen(false)
    },
    [reportError],
  )

  const handleToggleFullscreen = useCallback(() => {
    toggleFullscreen()
      .then(setFullscreen)
      .catch(reportError)
  }, [reportError])

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

    setPendingSeek(pending)

    // 兜底：万一跳转没生效，两秒后也要把显示权还给真实位置
    if (pendingTimer.current !== null) {
      window.clearTimeout(pendingTimer.current)
    }

    pendingTimer.current = window.setTimeout(() => {
      pendingTimer.current = null
      setPendingSeek(null)
    }, 2000)

    seekTo(pending).catch(reportError)
  }, [reportError])

  useEffect(
    () => () => {
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current)
      }
    },
    [],
  )

  const loadPreview = useCallback(async (seconds: number) => {
    const key = String(Math.round(seconds))
    const cached = thumbnailCache.current.get(key)

    if (cached !== undefined) {
      setPreviewImage(cached)
      return
    }

    try {
      const image = await thumbnailAt(seconds)
      thumbnailCache.current.set(key, image)
      setPreviewImage(image)
    } catch {
      // 预览拿不到就只是不显示画面，不打断播放
      setPreviewImage(null)
    }
  }, [])

  const handleProgressHover = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      if (!hasMedia || duration <= 0) {
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))

      setPreview({ fraction, seconds: fraction * duration })

      // 鼠标快速扫过时不值得每一帧都去截图
      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current)
      }

      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null
        void loadPreview(fraction * duration)
      }, 120)
    },
    [duration, hasMedia, loadPreview],
  )

  const handleProgressLeave = useCallback(() => {
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current)
      previewTimer.current = null
    }

    setPreview(null)
    setPreviewImage(null)
  }, [])

  // 空闲一会儿自动收起控件；暂停、拖动进度、开着倍速菜单或正在预览时保持显示
  const controlsVisible = useIdleVisibility({
    delayMs: CONTROLS_IDLE_MS,
    enabled: hasMedia && !paused && scrub === null && !speedOpen,
    pinned: overControls || !hasMedia || preview !== null,
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event.code, event.target)) {
        return
      }

      const action = resolveShortcut(event.code)

      if (!action) {
        return
      }

      event.preventDefault()

      switch (action) {
        case 'toggle-play':
          void handleTogglePause()
          break
        case 'seek-forward':
          seekBy(SEEK_STEP).catch(reportError)
          break
        case 'seek-backward':
          seekBy(-SEEK_STEP).catch(reportError)
          break
        case 'jump-forward':
          seekBy(JUMP_STEP).catch(reportError)
          break
        case 'jump-backward':
          seekBy(-JUMP_STEP).catch(reportError)
          break
        case 'volume-up':
          handleVolumeChange(stepVolume(volume, VOLUME_STEP))
          break
        case 'volume-down':
          handleVolumeChange(stepVolume(volume, -VOLUME_STEP))
          break
        case 'toggle-mute':
          handleToggleMute()
          break
        case 'toggle-fullscreen':
          handleToggleFullscreen()
          break
        case 'speed-up':
          handleSpeedChange(stepSpeed(speed, 1))
          break
        case 'speed-down':
          handleSpeedChange(stepSpeed(speed, -1))
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSpeedChange, handleToggleFullscreen, handleToggleMute, handleTogglePause, handleVolumeChange, reportError, speed, volume])

  // 倍速菜单开着时，点别处或按 Esc 收起
  useEffect(() => {
    if (!speedOpen) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest('.controls__speed') === null) {
        setSpeedOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSpeedOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [speedOpen])

  const backendLabel = status ? status.message : '正在检测运行环境…'
  const kernelWarning = hasMedia && player !== null && !player.ipcReady ? '播放内核未连接，控制可能无效' : null
  const canOpen = isTauri() && status?.mpvAvailable === true

  return (
    <div
      className="app"
      data-stage={currentFile ? 'video' : 'empty'}
      data-controls={controlsVisible ? 'visible' : 'hidden'}
    >
      <Sidebar
        open={sidebarOpen}
        directory={directory}
        entries={entries}
        currentPath={currentFile}
        busy={directoryBusy}
        onChooseDirectory={() => void handleChooseDirectory()}
        onSelect={(path) => void playPath(path)}
      />

      <div className="shell">
      <header className="app__bar">
        <div className="app__brand">
          <button
            className="app__toggle"
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            aria-label="视频库"
          >
            <span aria-hidden="true">☰</span>
            <span className="app__toggle-label">视频库</span>
          </button>
          <span className="app__wordmark">futurevideo</span>
          {currentFile ? (
            <span className="app__file" data-testid="current-file">
              {fileName(currentFile)}
            </span>
          ) : null}
        </div>
        <span
          className="app__backend"
          data-testid="backend-status"
          data-warning={kernelWarning ? 'true' : undefined}
        >
          {kernelWarning ?? backendLabel}
        </span>
      </header>

      <main className="stage" onClick={hasMedia ? () => void handleTogglePause() : undefined}>
        {currentFile ? null : (
          <div className="stage__empty">
            <p className="stage__hint">把视频拖进来，或</p>
            <button className="button" type="button" onClick={handleOpen} disabled={!canOpen}>
              选择视频文件
            </button>
          </div>
        )}
      </main>

      <footer
        className="controls"
        onMouseEnter={() => setOverControls(true)}
        onMouseLeave={() => setOverControls(false)}
      >
        <button
          className="controls__button"
          type="button"
          onClick={() => void handleTogglePause()}
          disabled={!hasMedia}
          aria-label={paused ? '播放' : '暂停'}
        >
          {paused ? '▶' : '❚❚'}
        </button>

        <span className="controls__time" data-testid="time-display">
          {formatDuration(shownPosition)} / {formatDuration(duration)}
        </span>

        <div className="controls__progress-wrap">
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
            onPointerMove={handleProgressHover}
            onPointerLeave={handleProgressLeave}
            style={{ '--fill': `${fillPercent}%` } as CSSProperties}
          />
          {preview ? (
            <HoverPreview image={previewImage} seconds={preview.seconds} fraction={preview.fraction} />
          ) : null}
        </div>

        <div className="controls__volume">
          <button
            className="controls__button"
            type="button"
            onClick={handleToggleMute}
            disabled={!hasMedia}
            aria-label={muted ? '取消静音' : '静音'}
            aria-pressed={muted}
          >
            {muted || volume === 0 ? '🔇' : '🔊'}
          </button>
          <input
            className="controls__volume-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={muted ? 0 : Math.round(volume)}
            disabled={!hasMedia}
            aria-label="音量"
            onChange={(event) => handleVolumeChange(Number(event.target.value))}
            style={{ '--fill': `${muted ? 0 : volume}%` } as CSSProperties}
          />
        </div>

        <div className="controls__speed">
          <button
            className="controls__button controls__button--text"
            type="button"
            onClick={() => setSpeedOpen((open) => !open)}
            disabled={!hasMedia}
            aria-haspopup="menu"
            aria-expanded={speedOpen}
            aria-label="播放倍速"
          >
            {formatSpeed(speed)}
          </button>
          {speedOpen ? (
            <div className="speed-menu" role="menu" aria-label="播放倍速">
              {SPEED_OPTIONS.map((option) => (
                <button
                  key={option}
                  className="speed-menu__item"
                  type="button"
                  role="menuitemradio"
                  aria-checked={Math.abs(option - speed) < 0.01}
                  onClick={() => handleSpeedChange(option)}
                >
                  {formatSpeed(option)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          className="controls__button"
          type="button"
          onClick={handleToggleFullscreen}
          aria-label={fullscreen ? '退出全屏' : '全屏'}
        >
          ⛶
        </button>
      </footer>
      </div>

      {error ? (
        <p className="app__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
