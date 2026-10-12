import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import Crumbs from './components/Crumbs'
import FolderStrip, { type FolderParent } from './components/FolderStrip'
import Island, { type Episode } from './components/Island'
import MediaPanel from './components/MediaPanel'
import SettingsPage from './components/SettingsPage'
import Splash from './components/Splash'
import Tutorial from './components/Tutorial'
import VideoGrid, { type GridFlash } from './components/VideoGrid'
import {
  getBackendStatus,
  getPlayerState,
  isTauri,
  listDirectory,
  listDrives,
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
  JUMP_STEP,
  SEEK_STEP,
  stepSpeed,
  stepVolume,
  VOLUME_STEP,
} from './lib/playback'
import { resolveShortcut, shouldIgnoreShortcut } from './lib/shortcuts'
import { hasSeenTutorial } from './lib/tutorial'
import { useIdleVisibility } from './lib/use-idle-visibility'
import { revealMainWindow } from './lib/window'

/** 播放状态的轮询间隔。 */
const POLL_INTERVAL_MS = 300
/** 鼠标停留多久才真正去抓预览图。 */
const PREVIEW_DEBOUNCE_MS = 120
/** 画面展开播放时，空闲多久把顶栏和底栏一起隐去。 */
const CHROME_IDLE_MS = 2600
/** 缩略图带最多抽多少帧。 */
const MAX_STRIP_FRAMES = 24
/** 抽两帧之间歇一下，别把 CPU 占满影响播放。 */
const STRIP_FRAME_GAP_MS = 120
/** 缩略图带的帧间隔目标（秒）。 */
const STRIP_STEP_SECONDS = 10

/** 「此电脑」这一层的显示名。盘符根目录再往上就是它。 */
const DRIVES_ROOT = '此电脑'

function nearestIndex(times: number[], seconds: number): number {
  let best = 0

  for (let index = 1; index < times.length; index += 1) {
    if (Math.abs(times[index] - seconds) < Math.abs(times[best] - seconds)) {
      best = index
    }
  }

  return best
}

/** 缩略图带要抽哪些时间点：整片均匀铺开，两端各留半格。 */
function stripTimesFor(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return []
  }

  const count = Math.min(
    MAX_STRIP_FRAMES,
    Math.max(6, Math.round(duration / STRIP_STEP_SECONDS)),
  )

  return Array.from({ length: count }, (_, index) => (duration * (index + 0.5)) / count)
}

export default function App() {
  const [status, setStatus] = useState<BackendStatus | null>(null)

  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState(false)

  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null)

  const [scrub, setScrub] = useState<number | null>(null)
  const [pendingSeek, setPendingSeek] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ fraction: number; seconds: number } | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [flash, setFlash] = useState<GridFlash | null>(null)
  const [curtain, setCurtain] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  )

  const [error, setError] = useState<string | null>(null)
  const [directoryBusy, setDirectoryBusy] = useState(false)
  /**
   * 当前展开的面板。
   *
   * 倍速菜单是第一个使用者，后面的音轨、字幕面板往这个联合类型里加就行：
   * 空闲隐藏只看「有没有面板开着」，不必每个面板各接一遍。
   */
  const [openPanel, setOpenPanel] = useState<'speed' | 'media' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  /** 开屏走到哪一步：入场 → 收场（界面同时淡入）→ 卸载。 */
  const [splash, setSplash] = useState<'visible' | 'leaving' | 'done'>('visible')
  /** 运行环境是否探完（探失败也算），开屏据此决定什么时候收场。 */
  const [bootReady, setBootReady] = useState(false)

  /** 是否停在「此电脑」这一层：列出所有能进的盘符。 */
  const [atDrives, setAtDrives] = useState(false)
  const [drives, setDrives] = useState<string[]>([])

  /** 首次进入的用法教程。看过一次就不再自动弹，还能从标题栏的「?」叫回来。 */
  const [tutorialOpen, setTutorialOpen] = useState(() => !hasSeenTutorial())

  const scrubRef = useRef<number | null>(null)
  const pendingTimer = useRef<number | null>(null)
  const previewTimer = useRef<number | null>(null)
  const previewFrame = useRef<number | null>(null)
  const hoveredPoint = useRef<{ fraction: number; seconds: number } | null>(null)
  const previewCache = useRef(new Map<string, string>())
  const gridCache = useRef(new Map<string, string>())
  const curtainRef = useRef<HTMLDivElement>(null)
  const previewBusy = useRef(false)
  const queuedPreview = useRef<{ source: string; seconds: number } | null>(null)

  // 派生值放在最前面：后面的处理函数要用，不能等到渲染前才算
  const hasMedia = currentFile !== null
  const paused = player?.paused !== false
  const duration = player?.duration ?? 0
  const shownPosition = scrub ?? pendingSeek ?? player?.position ?? 0
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

  /** 子目录现在铺在方格上面，和方格同一套视觉。 */
  const folders = useMemo(
    () => listing?.entries.filter((entry) => entry.kind === 'directory') ?? [],
    [listing],
  )

  /*
   * 上下集就是方格墙里的前后一个：排序和墙上看到的完全一致，
   * 所以「下一集」永远是你眼睛看到的右边那一格。
   */
  const episodeIndex = useMemo(
    () => (currentFile === null ? -1 : videos.findIndex((video) => video.path === currentFile)),
    [currentFile, videos],
  )

  const previousEpisode = useMemo<Episode | null>(() => {
    const video = episodeIndex > 0 ? videos[episodeIndex - 1] : undefined
    return video === undefined ? null : { path: video.path, name: video.name }
  }, [episodeIndex, videos])

  const nextEpisode = useMemo<Episode | null>(() => {
    const video =
      episodeIndex >= 0 && episodeIndex < videos.length - 1 ? videos[episodeIndex + 1] : undefined
    return video === undefined ? null : { path: video.path, name: video.name }
  }, [episodeIndex, videos])

  const stripTimes = useMemo(() => stripTimesFor(duration), [duration])

  // 画面展开播放时，空闲一会儿把顶栏和底栏一起隐去。
  // 暂停、拖动进度、开着倍速菜单时保持显示。
  const chromeVisible = useIdleVisibility({
    delayMs: CHROME_IDLE_MS,
    enabled:
      expanded && hasMedia && !paused && scrub === null && openPanel === null && !settingsOpen,
  })

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
      .finally(() => {
        // 探失败也别把开屏挂死：顶栏自己会提示内核不可用
        if (!cancelled) {
          setBootReady(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [reportError])

  /*
   * 主窗口是隐藏着创建出来的，等开屏画好再让它露面。
   * 这一步放在挂载之后再跑：此刻开屏已经提交进 DOM，窗口一显示就是满的，
   * 不会先闪一下空窗口或半个界面。
   */
  useEffect(() => {
    revealMainWindow().catch(reportError)
  }, [reportError])

  const handleSplashLeave = useCallback(() => setSplash('leaving'), [])
  const handleSplashDone = useCallback(() => setSplash('done'), [])

  // 播放开始后持续拉取进度，供底部常驻条使用
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

  // 方格缩略图逐个补上。画面展开时停下：抓帧是另一个 mpv 进程，
  // 会和正在播放的那个抢 CPU/GPU，直接导致播放卡顿。
  useEffect(() => {
    if (listing === null || expanded) {
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
  }, [listing, expanded])

  // 展开画面后先抓一次首帧：既把抓帧进程热起来，又提前把文件载入，
  // 这样第一次悬停进度条不用等冷启动
  useEffect(() => {
    if (!expanded || currentFile === null) {
      return
    }

    let cancelled = false

    const warm = async () => {
      const key = `${currentFile}::0`

      if (previewCache.current.has(key)) {
        return
      }

      try {
        const image = await thumbnailAt(currentFile, 0)

        if (!cancelled) {
          previewCache.current.set(key, image)
        }
      } catch {
        // 预热失败无所谓，真用的时候再抓
      }
    }

    void warm()

    return () => {
      cancelled = true
    }
  }, [currentFile, expanded])

  /**
   * 后台铺一条缩略图带。
   *
   * 单帧抓取要 150-300ms，悬停时临时抓永远跟不上鼠标。所以画面一加载就
   * 按时间均匀抽一批帧存起来，悬停时直接取最近的一帧，响应是即时的。
   * 抽帧之间留一点间隔，避免把 CPU 占满影响播放。
   *
   * 帧只写进缓存（ref），不放进 state：悬停时读的就是缓存，
   * 不需要为了「某一帧好了」再触发一次渲染。
   */
  useEffect(() => {
    if (currentFile === null || stripTimes.length === 0) {
      return
    }

    let cancelled = false

    const run = async () => {
      for (const time of stripTimes) {
        if (cancelled) {
          return
        }

        const key = `${currentFile}::${Math.round(time)}`

        if (previewCache.current.has(key)) {
          continue
        }

        try {
          const image = await thumbnailAt(currentFile, time)

          if (!cancelled) {
            previewCache.current.set(key, image)
          }
        } catch {
          // 单帧失败就跳过，不影响其他帧
        }

        await new Promise((resolve) => window.setTimeout(resolve, STRIP_FRAME_GAP_MS))
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [currentFile, stripTimes])

  const playPath = useCallback(
    async (path: string, from?: DOMRect) => {
      setError(null)

      try {
        await playLocalVideo(path)
        setCurrentFile(path)
        setPendingSeek(null)
        previewCache.current.clear()

        // 用幕布把方格撑满整屏，做个转场
        if (from !== undefined) {
          setCurtain({ x: from.x, y: from.y, width: from.width, height: from.height })
        }

        setExpanded(true)
      } catch (cause: unknown) {
        reportError(cause)
      }
    },
    [reportError],
  )

  /** 收起画面：把视频停下来，方格墙恢复原样。 */
  const collapseVideo = useCallback(async () => {
    setExpanded(false)

    if (player?.paused === false) {
      try {
        const paused = await togglePause()
        setPlayer((previous) => (previous ? { ...previous, paused } : previous))
      } catch (cause: unknown) {
        reportError(cause)
      }
    }
  }, [player?.paused, reportError])

  const loadDirectory = useCallback(
    async (target: string) => {
      setError(null)
      setDirectoryBusy(true)

      try {
        const next = await listDirectory(target)
        setListing(next)
        // 从「此电脑」点进来，或者从别处跳过来，都要离开那一层
        setAtDrives(false)

        // 防御：如果换到的目录里没有正在播的这个文件，放大格会消失，
        // 但整窗还是透明的，画面就悬空了。这时直接收起。
        if (expanded && currentFile !== null && !next.entries.some((entry) => entry.path === currentFile)) {
          void collapseVideo()
        }
      } catch (cause: unknown) {
        reportError(cause)
      } finally {
        setDirectoryBusy(false)
      }
    },
    [collapseVideo, currentFile, expanded, reportError],
  )

  /** 打开「此电脑」：列出所有能进的盘。盘符根目录再往上就是这里。 */
  const openDrives = useCallback(async () => {
    setError(null)
    setDirectoryBusy(true)

    try {
      const next = await listDrives()
      setDrives(next)
      setAtDrives(true)
      // 同上：切走以后放大格会消失，整窗还透明的话画面就悬空了
      if (expanded && currentFile !== null) {
        void collapseVideo()
      }
    } catch (cause: unknown) {
      reportError(cause)
    } finally {
      setDirectoryBusy(false)
    }
  }, [collapseVideo, currentFile, expanded, reportError])

  /**
   * 目录区最前面那个固定入口。
   *
   * 平时是「上一级」；站在盘符根目录时再往上就是「此电脑」，
   * 不然换盘只能靠系统对话框重新选一次目录。
   */
  const parentEntry = useMemo<FolderParent | null>(() => {
    if (atDrives || listing === null) {
      return null
    }

    if (listing.parent !== null) {
      const parent = listing.parent
      return {
        label: '上一级',
        icon: 'up',
        onOpen: () => void loadDirectory(parent),
      }
    }

    return { label: DRIVES_ROOT, icon: 'computer', onOpen: () => void openDrives() }
  }, [atDrives, listing, loadDirectory, openDrives])

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

  /** 上下集：直接换片，沿用原来那套「载入 + 展开」的流程，不用再点方格。 */
  const handlePlayEpisode = useCallback(
    (path: string) => {
      void playPath(path)
    },
    [playPath],
  )

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

  const handleTogglePause = useCallback(async () => {
    setError(null)

    try {
      const paused = await togglePause()
      setPlayer((previous) => (previous ? { ...previous, paused } : previous))
    } catch (cause: unknown) {
      reportError(cause)
    }
  }, [reportError])

  const handleOpenFromTile = useCallback(
    (path: string, from: DOMRect) => {
      // 已经是当前视频就展开继续看，否则换片
      if (path === currentFile) {
        setExpanded(true)
        if (player?.paused !== false) {
          void handleTogglePause()
        }
        return
      }

      void playPath(path, from)
    },
    [currentFile, handleTogglePause, playPath, player?.paused],
  )

  const handleSeekBy = useCallback(
    (offset: number) => {
      seekBy(offset).catch(reportError)
    },
    [reportError],
  )

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
      setOpenPanel(null)
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

  /**
   * 抓一帧预览图。
   *
   * 抓帧是串行的（同一个进程），如果在抓的过程中继续排队就会越积越多，
   * 画面永远落后于光标。所以这里只记住「最新那个位置」，
   * 当前的抓完再处理它，中间那些直接丢掉。
   */
  const fetchPreview = useCallback(async (source: string, seconds: number) => {
    let task: { source: string; seconds: number } | null = { source, seconds }

    if (previewBusy.current) {
      queuedPreview.current = task
      return
    }

    previewBusy.current = true

    try {
      while (task !== null) {
        try {
          const key = `${task.source}::${Math.round(task.seconds)}`
          const cached = previewCache.current.get(key)
          const image = cached ?? (await thumbnailAt(task.source, task.seconds))

          previewCache.current.set(key, image)
          setPreviewImage(image)
        } catch {
          // 预览拿不到就只是不显示画面，不打断播放
          setPreviewImage(null)
        }

        task = queuedPreview.current
        queuedPreview.current = null
      }
    } finally {
      previewBusy.current = false
    }
  }, [])

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

      // 缩略图带里已经有最近的那一帧就直接显示，不用等抓取
      if (stripTimes.length > 0) {
        const nearest = stripTimes[nearestIndex(stripTimes, seconds)]
        const fromStrip = previewCache.current.get(`${currentFile}::${Math.round(nearest)}`)

        if (fromStrip !== undefined) {
          setPreviewImage(fromStrip)

          if (previewTimer.current !== null) {
            window.clearTimeout(previewTimer.current)
            previewTimer.current = null
          }

          return
        }
      }

      // 抓帧比移动慢得多，快速扫过时只处理停下来的那个位置
      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current)
      }

      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null
        void fetchPreview(currentFile, seconds)
      }, PREVIEW_DEBOUNCE_MS)
    },
    [currentFile, duration, fetchPreview, stripTimes],
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

  // 涟漪与提示放完就收掉
  useEffect(() => {
    if (flash === null) {
      return
    }

    const timer = window.setTimeout(() => setFlash(null), 700)
    return () => window.clearTimeout(timer)
  }, [flash])

  // 幕布：从方格矩形展开到整屏，再把透明度收掉
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

  useEffect(
    () => () => {
      for (const timer of [pendingTimer, previewTimer]) {
        if (timer.current !== null) {
          window.clearTimeout(timer.current)
        }
      }

      if (previewFrame.current !== null) {
        window.cancelAnimationFrame(previewFrame.current)
      }
    },
    [],
  )

  // 快捷键在有视频时始终生效，不再区分页面
  useEffect(() => {
    if (!hasMedia) {
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
          handleSeekBy(SEEK_STEP)
          break
        case 'seek-backward':
          handleSeekBy(-SEEK_STEP)
          break
        case 'jump-forward':
          handleSeekBy(JUMP_STEP)
          break
        case 'jump-backward':
          handleSeekBy(-JUMP_STEP)
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
    handleSeekBy,
    handleSpeedChange,
    handleToggleFullscreen,
    handleToggleMute,
    handleTogglePause,
    handleVolumeChange,
    hasMedia,
    speed,
    volume,
  ])

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
  /** 标题栏面包屑要显示的路径：停在「此电脑」时显示它自己。 */
  const shownPath = atDrives ? DRIVES_ROOT : (listing?.directory ?? null)

  return (
    <div
      className="app"
      data-video={expanded && currentFile ? 'true' : 'false'}
      data-chrome={chromeVisible ? 'visible' : 'hidden'}
      data-splash={splash}
    >
      <div className="shell">
        <header className="app__bar">
          <div className="app__brand">
            <span className="app__wordmark">futurevideo</span>

            {/*
              目录区往上层走的路都在这里，不再单开关一个侧边栏。
              画面展开时连它一起收起：新目录里没有当前视频，放大格会消失。
            */}
            {expanded || shownPath === null ? null : (
              <>
                <span className="app__divider" aria-hidden="true" />
                <button
                  className="app__choose"
                  type="button"
                  onClick={() => void handleChooseDirectory()}
                  disabled={!canOpen || directoryBusy}
                >
                  {directoryBusy ? '读取中…' : '选择目录'}
                </button>
                <Crumbs path={shownPath} onNavigate={(path) => void loadDirectory(path)} />
              </>
            )}
          </div>

          <div className="app__tools">
            <button
              className="app__tool"
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="设置"
              title="设置"
            >
              ⚙
            </button>

            <button
              className="app__help"
              type="button"
              onClick={() => setTutorialOpen(true)}
              aria-label="使用帮助"
              title="使用帮助"
            >
              ?
            </button>

            <span
              className="app__backend"
              data-testid="backend-status"
              data-warning={kernelWarning ? 'true' : undefined}
            >
              {statusNotice}
            </span>
          </div>
        </header>

        <main className="library" data-island={hasMedia ? 'true' : 'false'}>
          {atDrives ? (
            <div className="drives" data-testid="drives">
              {drives.map((drive, index) => (
                <button
                  className="folder folder--drive"
                  type="button"
                  key={drive}
                  style={{ '--i': index } as CSSProperties}
                  onClick={() => void loadDirectory(drive)}
                >
                  <span className="folder__glyph" aria-hidden="true">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="6" width="18" height="12" rx="2.4" />
                      <path d="M7 14.5h4" />
                      <path d="M16.5 9.5h.01" />
                    </svg>
                  </span>
                  <span className="folder__name">{drive}</span>
                </button>
              ))}

              {drives.length === 0 ? (
                <p className="library__hint">没有找到可以打开的盘</p>
              ) : null}
            </div>
          ) : listing === null ? (
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
                className="button button--primary"
                type="button"
                onClick={() => void handleChooseDirectory()}
                disabled={!canOpen}
              >
                选择目录
              </button>
              <span className="library__links">
                <button
                  className="library__single"
                  type="button"
                  onClick={() => void openDrives()}
                  disabled={!canOpen}
                >
                  浏览磁盘
                </button>
                <span className="library__dot" aria-hidden="true">
                  ·
                </span>
                <button
                  className="library__single"
                  type="button"
                  onClick={() => void handleOpenFile()}
                  disabled={!canOpen}
                >
                  打开单个视频
                </button>
              </span>
            </div>
          ) : (
            <>
              {/* 看画面时把目录条收掉：整块留给视频 */}
              {expanded ? null : (
                <FolderStrip
                  folders={folders}
                  parent={parentEntry}
                  busy={directoryBusy}
                  onOpen={(path) => void loadDirectory(path)}
                />
              )}

              {videos.length === 0 ? (
                <div className="library__none">
                  <p className="library__hint">
                    {listing.entries.length === 0 ? '这个目录里没有子目录或视频文件' : '这个目录里没有视频'}
                  </p>
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
                  expandedPath={expanded ? currentFile : null}
                  flash={flash}
                  buffering={buffering}
                  onOpen={handleOpenFromTile}
                  onTogglePlay={() => void handleTogglePause()}
                  onSeekBy={(offset) => {
                    handleSeekBy(offset)
                    setFlash({
                      id: Date.now(),
                      x: offset > 0 ? 78 : 22,
                      y: 50,
                      offset,
                    })
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {currentFile ? (
        <Island
          title={fileName(currentFile)}
          previous={previousEpisode}
          next={nextEpisode}
          onPlayEpisode={handlePlayEpisode}
          position={shownPosition}
          duration={duration}
          paused={paused}
          volume={volume}
          muted={muted}
          speed={speed}
          buffering={buffering}
          fullscreen={fullscreen}
          scrub={scrub}
          preview={preview}
          previewImage={previewImage}
          speedOpen={openPanel === 'speed'}
          mediaOpen={openPanel === 'media'}
          mediaPanel={<MediaPanel source={currentFile} onError={reportError} />}
          onTogglePause={() => void handleTogglePause()}
          onScrubChange={handleScrubChange}
          onScrubCommit={handleScrubCommit}
          onProgressHover={handleProgressHover}
          onProgressLeave={handleProgressLeave}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onToggleSpeedMenu={() => setOpenPanel((open) => (open === 'speed' ? null : 'speed'))}
          onCloseSpeedMenu={() => setOpenPanel(null)}
          onToggleMediaPanel={() => setOpenPanel((open) => (open === 'media' ? null : 'media'))}
          onCloseMediaPanel={() => setOpenPanel(null)}
          onSelectSpeed={handleSpeedChange}
          onToggleFullscreen={handleToggleFullscreen}
          onCollapse={() => void collapseVideo()}
        />
      ) : null}

      {curtain ? <div className="curtain" ref={curtainRef} data-testid="curtain" /> : null}

      {splash === 'done' ? null : (
        <Splash ready={bootReady} onLeave={handleSplashLeave} onDone={handleSplashDone} />
      )}

      {/* 开屏没走完之前不弹教程，不然两层浮层会叠在一起 */}
      {splash === 'done' && tutorialOpen ? (
        <Tutorial onClose={() => setTutorialOpen(false)} />
      ) : null}

      {settingsOpen ? (
        <SettingsPage onClose={() => setSettingsOpen(false)} onError={reportError} />
      ) : null}

      {error ? (
        <p className="app__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
