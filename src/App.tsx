import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import HoverPreview from './components/HoverPreview'
import Island from './components/Island'
import PlayPauseIcon from './components/PlayPauseIcon'
import Sidebar from './components/Sidebar'
import VideoGrid from './components/VideoGrid'
import {
  getBackendStatus,
  getPlayerState,
  isTauri,
  listDirectory,
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
  type DirectoryListing,
  type PlayerSnapshot,
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
/** 鼠标停留多久才真正去抓预览图。 */
const PREVIEW_DEBOUNCE_MS = 120

type View = 'library' | 'player'

export default function App() {
  const [status, setStatus] = useState<BackendStatus | null>(null)
  const [view, setView] = useState<View>('library')

  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [focusedPath, setFocusedPath] = useState<string | null>(null)

  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null)

  const [scrub, setScrub] = useState<number | null>(null)
  const [pendingSeek, setPendingSeek] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ fraction: number; seconds: number } | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  /** 双击左右半屏时浮出的涟漪与 ±10 秒提示。 */
  const [flash, setFlash] = useState<{ id: number; x: number; y: number; offset: number } | null>(null)
  /** 从方格进播放页时的幕布：从方格矩形展开到整屏。 */
  const [curtain, setCurtain] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  )

  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [directoryBusy, setDirectoryBusy] = useState(false)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  /** 每次切换全屏递增，用来重放那一下过渡。 */
  const [screenPulse, setScreenPulse] = useState(0)

  const scrubRef = useRef<number | null>(null)
  const clickTimer = useRef<number | null>(null)
  const curtainRef = useRef<HTMLDivElement>(null)
  const pendingTimer = useRef<number | null>(null)
  const previewTimer = useRef<number | null>(null)
  const previewCache = useRef(new Map<string, string>())
  const gridCache = useRef(new Map<string, string>())
  const previewFrame = useRef<number | null>(null)
  const hoveredPoint = useRef<{ fraction: number; seconds: number } | null>(null)

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

  // 播放开始后持续拉取进度，供进度条、时间、音量与底部常驻条使用
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
          // 跳转目标已经被真实位置追上时，把显示权交还给播放状态
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

  // 目录内容变了，方格页的缩略图逐个补上；换目录时中断上一轮。
  // 进播放页就停下：抓帧是另一个 mpv 进程，会和播放抢 CPU/GPU，直接导致卡顿。
  useEffect(() => {
    if (listing === null || view !== 'library') {
      return
    }

    let cancelled = false

    const run = async () => {
      for (const entry of listing.entries) {
        if (cancelled) {
          return
        }

        if (entry.kind !== 'video') {
          continue
        }

        const cached = gridCache.current.get(entry.path)

        if (cached !== undefined) {
          setThumbnails((previous) =>
            previous[entry.path] === cached ? previous : { ...previous, [entry.path]: cached },
          )
          continue
        }

        try {
          const image = await thumbnailAt(entry.path, 0)

          if (cancelled) {
            return
          }

          gridCache.current.set(entry.path, image)
          setThumbnails((previous) => ({ ...previous, [entry.path]: image }))
        } catch {
          // 单个文件抓不到就让它空着，不影响其他方格
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [listing, view])

  const playPath = useCallback(
    async (path: string, from?: DOMRect) => {
      setError(null)

      try {
        await playLocalVideo(path)
        setCurrentFile(path)
        setPendingSeek(null)
        previewCache.current.clear()

        // 从方格进来时用幕布把方格撑满整屏，做个转场
        if (from !== undefined) {
          setCurtain({ x: from.x, y: from.y, width: from.width, height: from.height })
        }

        setView('player')
      } catch (cause: unknown) {
        reportError(cause)
      }
    },
    [reportError],
  )

  const loadDirectory = useCallback(
    async (target: string) => {
      setError(null)
      setDirectoryBusy(true)

      try {
        setListing(await listDirectory(target))
        // 换了目录，之前放大的那个方格就不存在了
        setFocusedPath(null)
      } catch (cause: unknown) {
        reportError(cause)
      } finally {
        setDirectoryBusy(false)
      }
    },
    [reportError],
  )

  const handleChooseDirectory = useCallback(async () => {
    setError(null)

    try {
      const picked = await pickDirectory()

      if (picked) {
        await loadDirectory(picked)
      }
    } catch (cause: unknown) {
      reportError(cause)
    }
  }, [loadDirectory, reportError])

  /** 直接打开单个视频，不走目录。 */
  const handleOpenFile = useCallback(async () => {
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

  const handleGoUp = useCallback(() => {
    if (listing?.parent) {
      void loadDirectory(listing.parent)
    }
  }, [listing, loadDirectory])

  const handleTogglePause = useCallback(async () => {
    setError(null)

    try {
      const paused = await togglePause()
      setPlayer((previous) => (previous ? { ...previous, paused } : previous))
    } catch (cause: unknown) {
      reportError(cause)
    }
  }, [reportError])

  /** 单击切播放/暂停。等 220ms 是为了让双击有机会取消它。 */
  const handleStageClick = useCallback(() => {
    if (currentFile === null) {
      return
    }

    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
      return
    }

    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      void handleTogglePause()
    }, 220)
  }, [currentFile, handleTogglePause])

  /** 双击左右半屏：快退/快进 10 秒，并在点击处放一圈涟漪、中央浮出提示。 */
  const handleStageDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (currentFile === null) {
        return
      }

      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current)
        clickTimer.current = null
      }

      const rect = event.currentTarget.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const direction = localX < rect.width / 2 ? -1 : 1

      seekBy(direction * JUMP_STEP).catch(reportError)

      setFlash({
        id: Date.now(),
        x: rect.width > 0 ? (localX / rect.width) * 100 : 50,
        y: rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50,
        offset: direction * JUMP_STEP,
      })
    },
    [currentFile, reportError],
  )

  /** 回到目录页：先把视频停下来，进度条改由底部常驻条接管。 */
  const handleBackToLibrary = useCallback(async () => {
    setView('library')

    if (player?.paused === false) {
      try {
        const paused = await togglePause()
        setPlayer((previous) => (previous ? { ...previous, paused } : previous))
      } catch (cause: unknown) {
        reportError(cause)
      }
    }
  }, [player, reportError])

  const handleVolumeChange = useCallback(
    (next: number) => {
      setVolume(next).catch(reportError)

      // 拖着音量条就等于要听声音，顺手解除静音
      if (player?.muted === true && next > 0) {
        toggleMute()
          .then((muted) => setPlayer((previous) => (previous ? { ...previous, muted } : previous)))
          .catch(reportError)
      }
    },
    [player?.muted, reportError],
  )

  const handleToggleMute = useCallback(() => {
    toggleMute()
      .then((muted) => setPlayer((previous) => (previous ? { ...previous, muted } : previous)))
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
    setScreenPulse((count) => count + 1)

    toggleFullscreen()
      .then(setFullscreen)
      .catch(reportError)
  }, [reportError])

  const handleScrubChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    scrubRef.current = Number(event.target.value)
    setScrub(scrubRef.current)
  }, [])

  // 拖动过程中只更新显示，松手时才真正跳转
  const handleScrubCommit = useCallback(() => {
    const pending = scrubRef.current
    scrubRef.current = null
    setScrub(null)

    if (pending === null) {
      return
    }

    setPendingSeek(pending)

    if (pendingTimer.current !== null) {
      window.clearTimeout(pendingTimer.current)
    }

    pendingTimer.current = window.setTimeout(() => {
      pendingTimer.current = null
      setPendingSeek(null)
    }, 2000)

    seekTo(pending).catch(reportError)
  }, [reportError])

  const hasMedia = currentFile !== null
  /** 方格点第二次时进播放页，并把方格矩形交给转场用。引用要稳定，方格才能 memo 住。 */
  const handleOpenFromTile = useCallback(
    (path: string, from: DOMRect) => {
      void playPath(path, from)
    },
    [playPath],
  )
  const paused = player?.paused !== false
  const duration = player?.duration ?? 0
  const shownPosition = scrub ?? pendingSeek ?? player?.position ?? 0
  const fillPercent = duration > 0 ? Math.min(100, (shownPosition / duration) * 100) : 0
  const volume = player?.volume ?? 100
  const muted = player?.muted === true
  const speed = player?.speed ?? 1
  const buffering = player?.buffering === true
  // 引用要稳定：VideoGrid 的 FLIP 依赖它，每次渲染都是新数组的话
  // 会白白重测一遍所有方格的位置
  const videos = useMemo(
    () => listing?.entries.filter((entry) => entry.kind === 'video') ?? [],
    [listing],
  )

  const loadPreview = useCallback(
    async (source: string, seconds: number) => {
      const key = `${source}::${Math.round(seconds)}`
      const cached = previewCache.current.get(key)

      if (cached !== undefined) {
        setPreviewImage(cached)
        return
      }

      try {
        const image = await thumbnailAt(source, seconds)
        previewCache.current.set(key, image)
        setPreviewImage(image)
      } catch {
        // 预览拿不到就只是不显示画面，不打断播放
        setPreviewImage(null)
      }
    },
    [],
  )

  const handleProgressHover = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      if (!currentFile || duration <= 0) {
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      const seconds = fraction * duration

      // 指针事件比屏幕刷新快得多，位置更新按帧来就够了
      hoveredPoint.current = { fraction, seconds }

      if (previewFrame.current === null) {
        previewFrame.current = window.requestAnimationFrame(() => {
          previewFrame.current = null

          if (hoveredPoint.current !== null) {
            setPreview(hoveredPoint.current)
          }
        })
      }

      // 抓帧比移动慢得多，快速扫过时只处理停下来的那个位置
      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current)
      }

      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null
        void loadPreview(currentFile, seconds)
      }, PREVIEW_DEBOUNCE_MS)
    },
    [currentFile, duration, loadPreview],
  )

  const handleProgressLeave = useCallback(() => {
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current)
      previewTimer.current = null
    }

    if (previewFrame.current !== null) {
      window.cancelAnimationFrame(previewFrame.current)
      previewFrame.current = null
    }

    hoveredPoint.current = null
    setPreview(null)
    setPreviewImage(null)
  }, [])

  // 空闲一会儿自动收起控件；只在播放页生效。
  // 注意不把「鼠标停在控件上」当作保持显示：那会让控件永远关不掉，
  // 而且和常见播放器（鼠标不动就连同控件一起隐去）不一致。
  const controlsVisible = useIdleVisibility({
    delayMs: CONTROLS_IDLE_MS,
    enabled: view === 'player' && hasMedia && !paused && scrub === null && !speedOpen,
    pinned: view === 'library' || !hasMedia || preview !== null,
  })

  useEffect(
    () => () => {
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current)
      }

      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current)
      }

      if (clickTimer.current !== null) {
        window.clearTimeout(clickTimer.current)
      }

      if (previewFrame.current !== null) {
        window.cancelAnimationFrame(previewFrame.current)
      }
    },
    [],
  )

  // 涟漪与提示放完就收掉
  useEffect(() => {
    if (flash === null) {
      return
    }

    const timer = window.setTimeout(() => setFlash(null), 700)
    return () => window.clearTimeout(timer)
  }, [flash])

  // 幕布：从方格矩形展开到整屏，再把透明度收掉，露出下面的播放页
  useEffect(() => {
    if (curtain === null) {
      return
    }

    const node = curtainRef.current

    if (node !== null && typeof node.animate === 'function') {
      const full = node.getBoundingClientRect()
      const scaleX = full.width > 0 ? curtain.width / full.width : 1
      const scaleY = full.height > 0 ? curtain.height / full.height : 1

      node.animate(
        [
          {
            transform: `translate(${curtain.x - full.x}px, ${curtain.y - full.y}px) scale(${scaleX}, ${scaleY})`,
            opacity: 1,
            offset: 0,
          },
          { transform: 'none', opacity: 1, offset: 0.6 },
          { transform: 'none', opacity: 0, offset: 1 },
        ],
        { duration: 460, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' },
      )
    }

    const timer = window.setTimeout(() => setCurtain(null), 520)
    return () => window.clearTimeout(timer)
  }, [curtain])

  useEffect(() => {
    if (view !== 'player') {
      return
    }

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
  }, [
    handleSpeedChange,
    handleToggleFullscreen,
    handleToggleMute,
    handleTogglePause,
    handleVolumeChange,
    reportError,
    speed,
    view,
    volume,
  ])

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

  const kernelWarning = hasMedia && player !== null && !player.ipcReady ? '播放内核未连接，控制可能无效' : null
  // 桌面端一切正常时不显示内核版本，只在真出问题时开口
  const statusNotice = kernelWarning
    ? kernelWarning
    : status === null
      ? '正在检测运行环境…'
      : status.kind === 'browser'
        ? status.message
        : status.mpvAvailable
          ? null
          : status.message
  const canOpen = isTauri() && status?.mpvAvailable === true

  return (
    <div
      className="app"
      data-stage={view === 'player' && currentFile ? 'video' : 'empty'}
      data-controls={controlsVisible ? 'visible' : 'hidden'}
    >
      <Sidebar
        open={sidebarOpen}
        listing={listing}
        currentPath={currentFile}
        busy={directoryBusy}
        onChooseDirectory={() => void handleChooseDirectory()}
        onEnterDirectory={(path) => void loadDirectory(path)}
        onGoUp={handleGoUp}
        onSelect={(path) => void playPath(path)}
      />

      <div className="shell" data-view={view}>
        <header className="app__bar">
          <div className="app__brand">
            {view === 'player' ? (
              <button
                className="app__toggle"
                type="button"
                onClick={() => void handleBackToLibrary()}
                aria-label="返回目录"
              >
                <span aria-hidden="true">←</span>
              </button>
            ) : null}

            {/* 侧边栏开关在两种视图里都要在，否则从侧边栏进播放页后就关不掉了 */}
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

            {view === 'player' && currentFile ? (
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
            {statusNotice}
          </span>
        </header>

        {view === 'player' ? (
          <>
            <main className="stage" onClick={handleStageClick} onDoubleClick={handleStageDoubleClick}>
              {buffering ? <span className="buffering" data-testid="buffering" /> : null}

              {flash ? (
                <div className="flash" key={flash.id}>
                  <span
                    className="flash__ripple"
                    data-testid="flash-ripple"
                    style={{ '--x': `${flash.x}%`, '--y': `${flash.y}%` } as CSSProperties}
                  />
                  <span className="flash__badge">
                    {flash.offset > 0 ? `+${flash.offset}s` : `${flash.offset}s`}
                  </span>
                </div>
              ) : null}

              {currentFile ? null : (
                <div className="stage__empty">
                  <p className="stage__hint">还没有打开视频</p>
                  <button className="button" type="button" onClick={() => void handleBackToLibrary()}>
                    返回目录
                  </button>
                </div>
              )}
            </main>

            <footer className="controls">
              <button
                className="controls__button"
                type="button"
                onClick={() => void handleTogglePause()}
                disabled={!hasMedia}
                aria-label={paused ? '播放' : '暂停'}
              >
                <PlayPauseIcon paused={paused} />
              </button>

              <span className="controls__time" data-testid="time-display">
                {formatDuration(shownPosition)} / {formatDuration(duration)}
              </span>

              <div
                className="controls__progress-wrap"
                data-scrubbing={scrub !== null ? 'true' : 'false'}
                data-buffering={buffering ? 'true' : 'false'}
              >
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
                {scrub !== null && duration > 0 ? (
                  <span
                    className="controls__bubble"
                    data-testid="scrub-bubble"
                    style={{ left: `${Math.min(97, Math.max(3, (scrub / duration) * 100))}%` }}
                  >
                    {formatDuration(scrub)}
                  </span>
                ) : null}
                {preview && scrub === null ? (
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
          </>
        ) : (
          <main className="library" data-island={currentFile ? 'true' : 'false'}>
            {videos.length === 0 ? (
              <div className="library__empty">
                <span className="library__icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48">
                    <rect x="7" y="13" width="34" height="26" rx="5" />
                    <path d="M7 21h34" />
                    <path d="M18 7h12" />
                  </svg>
                </span>
                <p className="library__hint">选一个目录，把里面的视频铺成方格</p>
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleChooseDirectory()}
                  disabled={!canOpen}
                >
                  选择目录
                </button>
                <button
                  className="library__single"
                  type="button"
                  onClick={() => void handleOpenFile()}
                  disabled={!canOpen}
                >
                  或打开单个视频
                </button>
              </div>
            ) : (
              <VideoGrid
                videos={videos}
                thumbnails={thumbnails}
                focusedPath={focusedPath}
                currentPath={currentFile}
                onFocus={setFocusedPath}
                onOpen={handleOpenFromTile}
              />
            )}
          </main>
        )}
      </div>

      {view === 'library' && currentFile ? (
        <Island
          title={fileName(currentFile)}
          position={player?.position ?? 0}
          duration={player?.duration ?? 0}
          paused={paused}
          onOpen={() => setView('player')}
          onTogglePause={() => void handleTogglePause()}
        />
      ) : null}

      {curtain ? <div className="curtain" ref={curtainRef} data-testid="curtain" /> : null}

      {screenPulse > 0 ? <div className="screen-pulse" key={screenPulse} /> : null}

      {error ? (
        <p className="app__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
