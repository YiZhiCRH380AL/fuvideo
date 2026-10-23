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
import { LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './App.css'
import Crumbs from './components/Crumbs'
import CollectionsPanel from './components/CollectionsPanel'
import CollectionsPage from './components/CollectionsPage'
import FavoritePicker from './components/FavoritePicker'
import FolderStrip, { type FolderParent } from './components/FolderStrip'
import Island, { type Episode } from './components/Island'
import MediaPanel from './components/MediaPanel'
import PlaybackLibraryDrawer from './components/PlaybackLibraryDrawer'
import PlaybackTools, { type SleepAction } from './components/PlaybackTools'
import Popover from './components/Popover'
import SettingsPage from './components/SettingsPage'
import Splash from './components/Splash'
import ThemePicker from './components/ThemePicker'
import Tutorial from './components/Tutorial'
import VideoGrid, { type GridFlash } from './components/VideoGrid'
import {
  getBackendStatus,
  getCollections,
  getPlayOptions,
  getPlayerState,
  clearCollection,
  createCollection,
  deleteCollection,
  exportCollection,
  importPlaylist,
  isTauri,
  listDirectory,
  listDrives,
  pauseVideo,
  pickDirectory,
  pickVideoFile,
  playLocalVideo,
  playCaptureDevice,
  playUrl,
  prepareSampleFolder,
  readSettings,
  rememberAlwaysOnTop,
  rememberDirectory,
  rememberMiniMode,
  renameCollection,
  setPlayMode as savePlayMode,
  setMotion as saveMotion,
  setTheme as saveTheme,
  seekBy,
  seekTo,
  setSpeed,
  setVolume,
  shiftInPlaylist,
  stepFrame,
  thumbnailAt,
  toggleFavorite,
  toggleNamedCollection,
  toggleFullscreen,
  toggleMute,
  togglePause,
  togglePlaylist,
  type BackendStatus,
  type BrowseEntry,
  type Collections,
  type OptionChoice,
  type DirectoryListing,
  type PlayerSnapshot,
} from './lib/backend'
import { fileName, parentDirectory } from './lib/path'
import {
  JUMP_STEP,
  SEEK_STEP,
  stepSpeed,
  stepVolume,
  VOLUME_STEP,
} from './lib/playback'
import { buildShortcutMap, resolveShortcut, shouldIgnoreShortcut } from './lib/shortcuts'
import { hasFired, remainingSeconds, sleepDeadline } from './lib/sleep'
import { timingFor } from './lib/splash'
import {
  applyMotionPreference,
  applyTheme,
  normalizeMotion,
  normalizeTheme,
  readMotionHint,
  readThemeHint,
  rememberAppearance,
  themeFor,
  type MotionPreference,
  type ThemeId,
} from './lib/theme'
import { hasSeenTutorial } from './lib/tutorial'
import { cachedThumbnail, loadThumbnail } from './lib/thumbnail-cache'
import { useIdleVisibility } from './lib/use-idle-visibility'
import { revealMainWindow } from './lib/window'

/** 播放状态的轮询间隔。 */
const POLL_INTERVAL_MS = 300

/** 迷你模式的窗口尺寸：16:9 的一小块，搁在角落看片用。 */
const MINI_WIDTH = 560
const MINI_HEIGHT = 315

/**
 * 主窗口的尺寸下限，和 `tauri.conf.json` 里那几个值保持一致。
 *
 * 迷你模式要缩到比它还小，所以进迷你模式前得先把下限放开，退出时再放回去；
 * 不放开的话窗口会被自己的约束卡住，点了「迷你」看起来没反应。
 */
const MAIN_MIN_WIDTH = 640
const MAIN_MIN_HEIGHT = 400

/** 迷你模式下放开的下限。 */
const MINI_MIN_WIDTH = 320
const MINI_MIN_HEIGHT = 180

/**
 * 主窗口句柄；拿不到就返回 `null`。
 *
 * 浏览器里（端到端测试、开发时的浏览器预览）没有 Tauri 的窗口对象，
 * `getCurrentWindow()` 会当场抛错。窗口方面的操作失败不该把整个界面带下去。
 */
function mainWindow(): ReturnType<typeof getCurrentWindow> | null {
  if (!isTauri()) {
    return null
  }

  try {
    return getCurrentWindow()
  } catch {
    return null
  }
}
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
/** 从收藏夹跳过来之后，高亮停留多久。 */
const HIGHLIGHT_MS = 2600

/** 「此电脑」这一层的显示名。盘符根目录再往上就是它。 */
const DRIVES_ROOT = '此电脑'

interface FavoritePickerState {
  path: string
  name: string
  anchor: DOMRect
  trigger: HTMLElement
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
  const [capturedPreview, setCapturedPreview] = useState<{
    image: string
    seconds: number
  } | null>(null)
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
  const [openPanel, setOpenPanel] = useState<
    'speed' | 'media' | 'playlist' | 'tools' | 'appearance' | null
  >(
    null,
  )
  /** 播放列表与收藏夹。两者都只是一串路径，顺序就是播放顺序。 */
  const [collections, setCollections] = useState<Collections>({
    playlist: [],
    favorites: [],
    customCollections: [],
  })
  const [collectionsOpen, setCollectionsOpen] = useState(false)
  const [favoritePicker, setFavoritePicker] = useState<FavoritePickerState | null>(null)
  const [playbackLibraryOpen, setPlaybackLibraryOpen] = useState(false)
  /** 导出/导入之后给用户看的一句话。 */
  const [collectionNotice, setCollectionNotice] = useState<string | null>(null)
  /** 刚从收藏夹跳过来的那一个，会在方格墙上高亮一下。 */
  const [highlightPath, setHighlightPath] = useState<string | null>(null)
  /** 播放模式（顺序 / 单曲循环 / 列表循环 / 随机），决定「播完一个之后放什么」。 */
  const [playMode, setPlayMode] = useState('sequence')
  const [playModes, setPlayModes] = useState<OptionChoice[]>([])
  /** 自定义快捷键：动作 id → 键码。`null` 表示全用出厂键位。 */
  const [shortcutOverrides, setShortcutOverrides] = useState<Record<string, string> | null>(null)
  /** 迷你模式：窗口缩成一小块，界面只剩灵动岛。 */
  const [miniMode, setMiniMode] = useState(false)
  /** 窗口置顶。 */
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  /** 定时：到点之后干什么、什么时候到。 */
  const [sleep, setSleep] = useState<{ minutes: number; endsAt: number; action: SleepAction } | null>(
    null,
  )
  /** 定时到点之后干什么。没开定时的时候也记着上次选的。 */
  const [sleepAction, setSleepAction] = useState<SleepAction>('pause')
  /** 每秒跳一下的钟，用来显示定时还剩多久。 */
  const [clock, setClock] = useState(() => Date.now())
  /** 方格墙的搜索词与排序。只影响摆出来的顺序，不动目录本身。 */
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'name-desc'>('name')
  /** 开屏停留时长档位。设置里改完要下次启动才看得到效果。 */
  const [splashSpeed, setSplashSpeed] = useState('normal')
  /** 界面配色与动效强度。本地先读一个提示值，设置文件到了以后再以文件为准。 */
  const [appearanceTheme, setAppearanceTheme] = useState<ThemeId>(() => readThemeHint())
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(() =>
    readMotionHint(),
  )
  /** 每次换主题换一个 key，让色盘扩散动画从头播一次。 */
  const [themeBurst, setThemeBurst] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /**
   * 用户点过方格没有。
   *
   * 教程第二步只认这个：点下去就算走过了，不等播放内核把画面挂上来——
   * 首次播放要起进程、找窗口，等一两秒是常事，拿「已经在播」当判据会让人以为点不动。
   */
  const [openedVideo, setOpenedVideo] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  /** 开屏走到哪一步：入场 → 收场（界面同时淡入）→ 卸载。 */
  const [splash, setSplash] = useState<'visible' | 'leaving' | 'done'>('visible')
  /** 运行环境是否探完（探失败也算），开屏据此决定什么时候收场。 */
  const [bootReady, setBootReady] = useState(false)

  /** 是否停在「此电脑」这一层：列出所有能进的盘符。 */
  const [atDrives, setAtDrives] = useState(false)
  const [drives, setDrives] = useState<string[]>([])
  /** 是否停在首页。上次目录会预加载，但启动不再直接跳过首页封面。 */
  const [atHome, setAtHome] = useState(true)

  /** 首次进入的用法教程。看过一次就不再自动弹，还能从标题栏的「?」叫回来。 */
  const [tutorialOpen, setTutorialOpen] = useState(() => !hasSeenTutorial())

  const scrubRef = useRef<number | null>(null)
  const pendingTimer = useRef<number | null>(null)
  const previewTimer = useRef<number | null>(null)
  const previewFrame = useRef<number | null>(null)
  const hoveredPoint = useRef<{ fraction: number; seconds: number } | null>(null)
  const previewCache = useRef(new Map<string, string>())
  const desiredPreview = useRef<{ source: string; seconds: number } | null>(null)
  const curtainRef = useRef<HTMLDivElement>(null)
  const previewBusy = useRef(false)
  const queuedPreview = useRef<{ source: string; seconds: number } | null>(null)
  /** 进迷你模式之前的窗口尺寸，退出时还原。 */
  const miniRestore = useRef<{ width: number; height: number } | null>(null)

  // 派生值放在最前面：后面的处理函数要用，不能等到渲染前才算
  const hasMedia = currentFile !== null
  const paused = player?.paused !== false
  const duration = player?.duration ?? 0
  const shownPosition = scrub ?? pendingSeek ?? player?.position ?? 0
  const volume = player?.volume ?? 100
  const muted = player?.muted === true
  const speed = player?.speed ?? 1
  const buffering = player?.buffering === true

  /*
   * 搜索与排序都在这里做，只影响「怎么摆」，不碰目录本身。
   * 排序用中文的排序规则并打开数字识别，不然「第10集」会排到「第2集」前面。
   */
  const matches = useCallback(
    (entry: BrowseEntry): boolean => entry.name.toLowerCase().includes(search.trim().toLowerCase()),
    [search],
  )

  const byName = useCallback(
    (left: BrowseEntry, right: BrowseEntry): number => {
      const order = left.name.localeCompare(right.name, 'zh-Hans-CN', { numeric: true })

      return sort === 'name' ? order : -order
    },
    [sort],
  )

  // 引用要稳定：VideoGrid 的 FLIP 依赖它，每次渲染都是新数组的话
  // 会白白重测一遍所有方格的位置
  const videos = useMemo(
    () => (listing?.entries ?? []).filter((entry) => entry.kind === 'video' && matches(entry)).sort(byName),
    [byName, listing, matches],
  )

  /** 子目录现在铺在方格上面，和方格同一套视觉。 */
  const folders = useMemo(
    () =>
      (listing?.entries ?? []).filter((entry) => entry.kind === 'directory' && matches(entry)).sort(byName),
    [byName, listing, matches],
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

  /** 教程要盯的那几件事。做成稳定引用，免得每渲染一次就重新判断一遍「做到了没」。 */
  const tutorialProgress = useMemo(
    () => ({
      hasDirectory: listing !== null || atDrives,
      hasVideos: videos.length > 0,
      hasMedia,
      openedVideo,
    }),
    [atDrives, hasMedia, listing, openedVideo, videos.length],
  )

  const stripTimes = useMemo(() => stripTimesFor(duration), [duration])

  /**
   * 正在放的这部片子有没有对应的方格。
   *
   * 网址和输入设备都没有格子；这时放大播放要把整块目录区收掉，
   * 否则「选一个目录，把里面的视频铺成方格」那类引导会一直挂在画面中间。
   */
  const playingInGrid =
    currentFile !== null && videos.some((video) => video.path === currentFile)

  /** 真正生效的键位表：出厂键位加上用户改过的那几条。 */
  const shortcutMap = useMemo(() => buildShortcutMap(shortcutOverrides), [shortcutOverrides])

  /** 定时还剩多少秒；没开定时就是 `null`。 */
  const sleepRemaining = sleep === null ? null : remainingSeconds(sleep.endsAt, clock)

  /** 开屏的停留时序：设置里选「快 / 关闭」时只改这个，不动动效本身。 */
  const splashTiming = timingFor(splashSpeed)

  // 画面展开播放时，空闲一会儿把顶栏和底栏一起隐去。
  // 暂停、拖动进度、开着倍速菜单时保持显示。
  const chromeVisible = useIdleVisibility({
    delayMs: CHROME_IDLE_MS,
    // 教程开着时界面不能自己隐去：它正指着顶栏和灵动岛上的按钮
    enabled:
      expanded &&
      hasMedia &&
      !paused &&
      scrub === null &&
      openPanel === null &&
      !settingsOpen &&
      !collectionsOpen &&
      !playbackLibraryOpen &&
      !tutorialOpen,
  })

  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause))
  }, [])

  const handleThemeChange = useCallback(
    (next: ThemeId) => {
      setAppearanceTheme(next)
      applyTheme(next)
      rememberAppearance(next, motionPreference)

      if (motionPreference !== 'off') {
        setThemeBurst(Date.now())
      }

      void saveTheme(next).catch(reportError)
    },
    [motionPreference, reportError],
  )

  const handleMotionChange = useCallback(
    (next: MotionPreference) => {
      setMotionPreference(next)
      applyMotionPreference(next)
      rememberAppearance(appearanceTheme, next)
      void saveMotion(next).catch(reportError)
    },
    [appearanceTheme, reportError],
  )

  /**
   * 迷你模式：窗口缩成一小块，界面只剩灵动岛。
   *
   * 缩之前先量一下当前尺寸，退出时还原回去；不然从小窗退出来会一直卡在小尺寸。
   * 窗口尺寸和界面布局是两件事，所以这里两件都做。
   */
  const applyMiniMode = useCallback(
    async (next: boolean) => {
      const current = mainWindow()

      if (current === null) {
        return
      }

      try {
        if (next) {
          const size = await current.innerSize()
          miniRestore.current = { width: size.width, height: size.height }
          // 先放开下限，否则窗口会被 640×400 卡住，看起来像没反应
          await current.setSizeConstraints({
            minWidth: MINI_MIN_WIDTH,
            minHeight: MINI_MIN_HEIGHT,
          })
          await current.setSize(new LogicalSize(MINI_WIDTH, MINI_HEIGHT))
        } else {
          const restore = miniRestore.current
          miniRestore.current = null

          await current.setSizeConstraints({
            minWidth: MAIN_MIN_WIDTH,
            minHeight: MAIN_MIN_HEIGHT,
          })

          if (restore !== null) {
            await current.setSize(new LogicalSize(restore.width, restore.height))
          }
        }
      } catch (cause: unknown) {
        reportError(cause)
      }
    },
    [reportError],
  )

  const handleToggleMini = useCallback(() => {
    const next = !miniMode

    setMiniMode(next)
    setOpenPanel(null)
    void applyMiniMode(next)
    // 记住这个偏好，下次打开还是这样
    void rememberMiniMode(next)
      .then((settings) => setMiniMode(settings.miniMode))
      .catch(() => {})
  }, [applyMiniMode, miniMode])

  const handleToggleAlwaysOnTop = useCallback(() => {
    const next = !alwaysOnTop

    setAlwaysOnTop(next)

    const current = mainWindow()

    if (current !== null) {
      void current.setAlwaysOnTop(next).catch(reportError)
    }

    void rememberAlwaysOnTop(next)
      .then((settings) => setAlwaysOnTop(settings.alwaysOnTop))
      .catch(() => {})
  }, [alwaysOnTop, reportError])

  useEffect(() => {
    applyTheme(appearanceTheme)
  }, [appearanceTheme])

  useEffect(() => {
    applyMotionPreference(motionPreference)
  }, [motionPreference])

  useEffect(() => {
    let cancelled = false

    getBackendStatus()
      .then(async (next) => {
        if (!cancelled) {
          setStatus(next)
          // 浏览器里要自己铺底色，桌面端窗口是透明的
          document.documentElement.dataset.shell = next.kind
        }

        /*
         * 上次打开的目录：直接铺回来，开屏收场时就不是一块空画面了。
         *
         * 目录可能已经被删掉或挪走，所以这里失败就安静放过——
         * 不该在启动的时候先甩一条错误给用户。
         */
        const [settings, modes] = await Promise.all([
          readSettings().catch(() => null),
          getPlayOptions().catch(() => []),
        ])

        if (cancelled) {
          return
        }

        setPlayMode(settings?.playMode ?? 'sequence')
        setShortcutOverrides(settings?.shortcuts ?? null)
        setAlwaysOnTop(settings?.alwaysOnTop === true)
        // 档位认不出来时 `timingFor` 会当标准档，别让开屏一闪而过
        setSplashSpeed(settings?.splashSpeed ?? 'normal')
        // 浏览器预览没有 settings.json，localStorage 就是唯一能跨刷新保存的地方。
        const storedTheme =
          next.kind === 'browser' ? readThemeHint() : normalizeTheme(settings?.theme)
        const storedMotion =
          next.kind === 'browser' ? readMotionHint() : normalizeMotion(settings?.motion)
        setAppearanceTheme(storedTheme)
        setMotionPreference(storedMotion)
        applyTheme(storedTheme)
        applyMotionPreference(storedMotion)
        rememberAppearance(storedTheme, storedMotion)

        // 上次是迷你模式：窗口跟着缩回去。置顶不用在这儿管，后端启动时已经设过了
        if (settings?.miniMode === true) {
          setMiniMode(true)
          void applyMiniMode(true)
        }

        // 后端没给出选项表（比如某些环境下这个命令不存在）时退回空表：
        // 面板上少一排按钮，总好过整页崩掉
        setPlayModes(Array.isArray(modes) ? modes : [])

        if (cancelled || settings?.lastDirectory == null) {
          return
        }

        const listing = await listDirectory(settings.lastDirectory).catch(() => null)

        if (!cancelled && listing !== null) {
          setListing(listing)
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
  }, [applyMiniMode, reportError])

  /*
   * 定时到点就动手。钟只在开着定时的时候走：`clock` 一变这条就重新对一次表，
   * 到点了就清掉定时（先清，免得两秒内连着触发两次）。
   */
  useEffect(() => {
    if (sleep === null) {
      return
    }

    if (!hasFired(sleep.endsAt, Date.now())) {
      const timer = window.setInterval(() => setClock(Date.now()), 1000)
      return () => window.clearInterval(timer)
    }

    setSleep(null)

    if (sleep.action === 'close') {
      const current = mainWindow()

      if (current !== null) {
        void current.close().catch(reportError)
      }

      return
    }

    void (async () => {
      try {
        await pauseVideo()
        setPlayer((previous) => (previous ? { ...previous, paused: true } : previous))
      } catch (cause: unknown) {
        reportError(cause)
      }
    })()
  }, [clock, reportError, sleep])

  // 播放列表与收藏夹读一次就够；之后每次改动都用后端返回的那份更新
  useEffect(() => {
    let cancelled = false

    getCollections()
      .then((next) => {
        if (!cancelled) {
          setCollections(next)
        }
      })
      // 浏览器里没有后端：保持空列表就好，不必为这个弹错误
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  // 高亮只是「提醒一下」，看过就散
  useEffect(() => {
    if (highlightPath === null) {
      return
    }

    const timer = window.setTimeout(() => setHighlightPath(null), HIGHLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [highlightPath])

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

        const cached = cachedThumbnail(entry.path)

        if (cached !== undefined) {
          setThumbnails((previous) =>
            previous[entry.path] === cached ? previous : { ...previous, [entry.path]: cached },
          )
          continue
        }

        try {
          const image = await loadThumbnail(entry.path)

          if (cancelled) {
            return
          }

          if (image !== null) {
            setThumbnails((previous) => ({ ...previous, [entry.path]: image }))
          }
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
    async (
      path: string,
      from?: DOMRect,
      /*
       * 怎么把它交给内核。默认是「按本机文件播」；打网络地址时换成 `playUrl`——
       * 后端命令是同一个，差别只在调用点上说得更清楚。
       */
      open: (target: string) => Promise<void> = playLocalVideo,
    ) => {
      setError(null)
      setAtHome(false)
      // 点下去就算「这一步做过了」，后面起内核要多久都不影响教程推进
      setOpenedVideo(true)

      try {
        await open(path)
        setCurrentFile(path)
        setPendingSeek(null)
        previewCache.current.clear()

        // 用幕布把方格撑满整屏，做个转场
        if (from !== undefined) {
          setCurtain({ x: from.x, y: from.y, width: from.width, height: from.height })
        }

        setExpanded(true)
      } catch (cause: unknown) {
        // 打开失败：别把界面停在「0:00 在播」的假状态上
        setCurrentFile(null)
        setExpanded(false)
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
        // 用「设成暂停」而不是「切一下」：这里可能被连着触发两次，
        // 切一下会变成「暂停又恢复」，设成暂停怎么调都一样
        await pauseVideo()
        setPlayer((previous) => (previous ? { ...previous, paused: true } : previous))
      } catch (cause: unknown) {
        reportError(cause)
      }
    }
  }, [player?.paused, reportError])

  const handleGoHome = useCallback(() => {
    setAtHome(true)
    setOpenPanel(null)
    setError(null)

    if (expanded) {
      void collapseVideo()
    }
  }, [collapseVideo, expanded])

  const loadDirectory = useCallback(
    async (target: string) => {
      setError(null)
      setDirectoryBusy(true)

      try {
        const next = await listDirectory(target)
        setListing(next)
        setAtHome(false)
        // 从「此电脑」点进来，或者从别处跳过来，都要离开那一层
        setAtDrives(false)

        // 记下这个目录，下次启动直接铺回来（记不住也不影响这次浏览）
        void rememberDirectory(target).catch(() => {})

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
      setAtHome(false)
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

  /**
   * 打开自带的示例文件夹。
   *
   * 第一次点会把示例视频和字幕复制到应用配置目录下，之后就是普通目录了：
   * 用户可以在里面加自己的文件，也随时能换成别的文件夹。
   */
  const handleOpenSample = useCallback(async () => {
    setError(null)

    try {
      await loadDirectory(await prepareSampleFolder())
    } catch (cause: unknown) {
      reportError(cause)
    }
  }, [loadDirectory, reportError])

  /** 加进 / 移出播放列表：后端返回改完之后的列表，界面直接换掉。 */
  const togglePlaylistPath = useCallback(async (path: string) => {
    setCollections(await togglePlaylist(path))
  }, [])

  const handleTogglePlaylist = useCallback(
    (path: string) => {
      void togglePlaylistPath(path).catch(reportError)
    },
    [reportError, togglePlaylistPath],
  )

  const handleShiftPlaylist = useCallback(
    (path: string, delta: number) => {
      shiftInPlaylist(path, delta).then(setCollections).catch(reportError)
    },
    [reportError],
  )

  const toggleFavoritePath = useCallback(async (path: string) => {
    setCollections(await toggleFavorite(path))
  }, [])

  const handleOpenFavoritePicker = useCallback(
    (path: string, name: string, trigger: HTMLElement) => {
      setOpenPanel(null)
      setFavoritePicker((current) =>
        current?.path === path
          ? null
          : {
              path,
              name,
              anchor: trigger.getBoundingClientRect(),
              trigger,
            },
      )
    },
    [],
  )

  const handleCreateCollection = useCallback(async (name: string) => {
    const next = await createCollection(name)
    setCollections(next)
    return next
  }, [])

  const handleRenameCollection = useCallback(async (id: string, name: string) => {
    const next = await renameCollection(id, name)
    setCollections(next)
    return next
  }, [])

  const handleDeleteCollection = useCallback(async (id: string) => {
    const next = await deleteCollection(id)
    setCollections(next)
    return next
  }, [])

  const handleToggleNamedCollection = useCallback(async (id: string, path: string) => {
    setCollections(await toggleNamedCollection(id, path))
  }, [])

  /** 切播放模式：先改界面，再落盘（落盘失败就把错误摆出来）。 */
  const handlePickPlayMode = useCallback(
    (mode: string) => {
      setPlayMode(mode)
      savePlayMode(mode).catch(reportError)
    },
    [reportError],
  )

  /**
   * 从列表里点某个视频：先切到它所在的目录，再播。
   *
   * 不切目录的话，从空状态点一下会变成「视频在播、背后还挂着那句选目录的引导」，
   * 收起画面就是一块空屏；就算本来开着别的目录，方格墙和上下集也跟当前这片对不上。
   */
  const handlePlayFromList = useCallback(
    async (path: string) => {
      setOpenPanel(null)
      setCollectionsOpen(false)
      setPlaybackLibraryOpen(false)
      await loadDirectory(parentDirectory(path))
      void playPath(path)
    },
    [loadDirectory, playPath],
  )

  const handleChoosePlaybackDirectory = useCallback(async () => {
    const picked = await pickDirectory()
    return picked === null ? null : listDirectory(picked)
  }, [])

  const handlePlayFromDrawer = useCallback(
    (path: string) => {
      setPlaybackLibraryOpen(false)
      void playPath(path)
    },
    [playPath],
  )

  /**
   * 收藏夹里点那行小字：跳回视频所在的目录，再把那一格高亮出来。
   *
   * 先切目录再高亮：方格墙是换目录之后才铺出来的，顺序反了就没有格子可指。
   */
  const handleExportCollection = useCallback(
    async (kind: 'playlist' | 'favorites') => {
      setCollectionNotice(null)

      try {
        const saved = await exportCollection(kind)

        if (saved !== null) {
          setCollectionNotice(`已导出到 ${saved}`)
        }
      } catch (cause: unknown) {
        reportError(cause)
      }
    },
    [reportError],
  )

  const handleImportPlaylist = useCallback(async () => {
    setCollectionNotice(null)

    try {
      const next = await importPlaylist()

      // 用户取消是 null；假后端没有这条命令时也是 null
      if (next === null || !Array.isArray(next.playlist)) {
        return
      }

      setCollections(next)
      setCollectionNotice(`已导入，播放列表现在有 ${next.playlist.length} 个视频`)
    } catch (cause: unknown) {
      reportError(cause)
    }
  }, [reportError])

  const handleClearCollection = useCallback(
    async (kind: 'playlist' | 'favorites') => {
      setCollectionNotice(null)

      try {
        setCollections(await clearCollection(kind))
        setCollectionNotice(kind === 'playlist' ? '播放列表已清空' : '收藏夹已清空')
      } catch (cause: unknown) {
        reportError(cause)
      }
    },
    [reportError],
  )

  const handleRevealFavorite = useCallback(
    async (path: string) => {
      setOpenPanel(null)
      setCollectionsOpen(false)
      setPlaybackLibraryOpen(false)

      // 收藏夹那一行小字的意思是「带我去看看这个文件在哪」，不是「播它」：
      // 先离开播放画面，方格墙才露得出来，高亮也才有意义
      await collapseVideo()

      await loadDirectory(parentDirectory(path))
      setHighlightPath(path)
    },
    [collapseVideo, loadDirectory],
  )

  /**
   * 这一片有没有真的播起来过。
   *
   * 它的值始终是「上一部真的播过的片子」，所以刚载入的新片天然对不上——
   * 这正好挡掉换片瞬间那个假待机（见下面的注释）。
   */
  const playedCurrent = useRef<string | null>(null)

  /**
   * 播完之后该放哪个。
   *
   * 四种模式：顺序（下一个，到头就停）、单曲循环（还是它）、列表循环（到头回到第一个）、
   * 随机（挑一个跟当前不同的）。列表在应用这边、不在 mpv 的 playlist 里，
   * 所以这套由我们自己算，而不是交给 `loop-file` / `loop-playlist`。
   */
  const nextAfter = useCallback(
    (list: string[], current: string): string | undefined => {
      if (playMode === 'single') {
        return current
      }

      if (list.length === 0) {
        return undefined
      }

      const index = list.indexOf(current)

      if (playMode === 'list') {
        return index < 0 ? list[0] : list[(index + 1) % list.length]
      }

      if (playMode === 'shuffle') {
        const others = list.filter((path) => path !== current)

        // 列表里只有这一片时，随机也只能是它
        return others.length === 0 ? list[0] : others[Math.floor(Math.random() * others.length)]
      }

      return index >= 0 ? list[index + 1] : undefined
    },
    [playMode],
  )

  /**
   * 播完自动播下一个。
   *
   * mpv 播完会把文件卸掉进入待机（`idle-active` 从 false 翻成 true），拿它当判据最可靠：
   * 实测 `eof-reached` 在进入待机之后就整个读不到了。
   *
   * **但只看 `idle-active` 会一跳两格**：刚 `loadfile` 到下一片时 mpv 还没把它拉起来，
   * 快照同样是「待机」，于是刚切过去就被当成「这一片也播完了」，直接又跳一格。
   * 所以多一条：只有「这一片确实播起来过」才算播完。
   */
  useEffect(() => {
    if (currentFile === null) {
      return
    }

    if (player?.idleActive !== true) {
      playedCurrent.current = currentFile
      return
    }

    if (playedCurrent.current !== currentFile) {
      return
    }

    // 处理过就清掉：待机状态会在每次轮询里反复出现，不清就会一直往下跳
    playedCurrent.current = null

    const next = nextAfter(collections.playlist, currentFile)

    if (next !== undefined) {
      void playPath(next)
    }
  }, [collections.playlist, currentFile, nextAfter, playPath, player?.idleActive])

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

  /** 拖进来的东西：是目录就铺方格，是文件就当视频打开。 */
  const handleDroppedPath = useCallback(
    async (path: string) => {
      // 后端本来就是这么分辨目录的，这里不自己猜扩展名
      const isDirectory = await listDirectory(path)
        .then(() => true)
        .catch(() => false)

      if (isDirectory) {
        await loadDirectory(path)
        return
      }

      await playPath(path)
    },
    [loadDirectory, playPath],
  )

  /** 打开一个网络地址（或任何 mpv 认的路径/流）。 */
  const handleOpenUrl = useCallback(
    (url: string) => {
      setOpenPanel(null)
      // 走 `playUrl`：同一个后端命令，只是把「这是地址」这件事写在调用点上
      void playPath(url, undefined, playUrl)
    },
    [playPath],
  )

  /**
   * 打开输入设备（摄像头 / 麦克风）。
   *
   * 界面上用的是设备友好名字（灵动岛显示它），后端把它拼成 `av://dshow:…`。
   */
  const handlePlayCapture = useCallback(
    (kind: 'video' | 'audio', name: string) => {
      setOpenPanel(null)

      if (name.trim() === '') {
        return
      }

      void playPath(name, undefined, (target) => playCaptureDevice(kind, target))
    },
    [playPath],
  )

  /** 定时：换成新的时长，或者用 `null` 关掉。 */
  const handleSleepTimer = useCallback(
    (minutes: number | null) => {
      if (minutes === null) {
        setSleep(null)
        return
      }

      setClock(Date.now())
      setSleep({ minutes, endsAt: sleepDeadline(minutes, Date.now()), action: sleepAction })
    },
    [sleepAction],
  )

  /** 只换「到点之后干什么」，时长不动。 */
  const handleSleepAction = useCallback((action: SleepAction) => {
    setSleepAction(action)
    setSleep((previous) => (previous === null ? null : { ...previous, action }))
  }, [])

  /** 逐帧步进。mpv 走完一帧会自己停住，界面上就是「按一下动一帧」。 */
  const handleStepFrame = useCallback(
    async (forward: boolean) => {
      try {
        await stepFrame(forward)
        // 后端会顺手暂停；先本地跟上，省得图标闪一下
        setPlayer((previous) => (previous ? { ...previous, paused: true } : previous))
      } catch (cause: unknown) {
        reportError(cause)
      }
    },
    [reportError],
  )

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
          const desired = desiredPreview.current

          if (
            desired?.source === task.source &&
            Math.abs(desired.seconds - task.seconds) < 0.75
          ) {
            setCapturedPreview({ image, seconds: task.seconds })
          }
        } catch {
          // 预览拿不到就只是不显示画面，不打断播放
          setCapturedPreview(null)
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
      // 抓帧、缓存键和时间标签统一到整秒，避免浮点小数让 58 秒画面配 57 秒标签。
      const seconds = Math.min(duration, Math.round(fraction * duration))
      desiredPreview.current = { source: currentFile, seconds }

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

      // 只复用「当前这一秒」的缓存。预抽取的相邻帧可以继续预取，
      // 但不能拿来冒充光标所在时间。
      const exact = previewCache.current.get(`${currentFile}::${Math.round(seconds)}`)

      if (exact !== undefined) {
        setCapturedPreview({ image: exact, seconds })

        if (previewTimer.current !== null) {
          window.clearTimeout(previewTimer.current)
          previewTimer.current = null
        }

        return
      }

      // 光标已经离开上一张图的时间时立刻撤掉，绝不让旧画面陪着新时间标签。
      setCapturedPreview((current) =>
        current !== null && Math.abs(current.seconds - seconds) < 0.75 ? current : null,
      )

      // 抓帧比移动慢得多，快速扫过时只处理停下来的那个位置
      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current)
      }

      previewTimer.current = window.setTimeout(() => {
        previewTimer.current = null
        void fetchPreview(currentFile, seconds)
      }, PREVIEW_DEBOUNCE_MS)
    },
    [currentFile, duration, fetchPreview],
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
    desiredPreview.current = null
    setPreview(null)
    setCapturedPreview(null)
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

      const action = resolveShortcut(event.code, shortcutMap)

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
        case 'frame-forward':
          void handleStepFrame(true)
          break
        case 'frame-backward':
          void handleStepFrame(false)
          break
        case 'toggle-mini':
          handleToggleMini()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleSeekBy,
    handleSpeedChange,
    handleStepFrame,
    handleToggleFullscreen,
    handleToggleMini,
    handleToggleMute,
    handleTogglePause,
    handleVolumeChange,
    hasMedia,
    shortcutMap,
    speed,
    volume,
  ])

  /*
   * 把文件或文件夹拖进窗口就能用。
   *
   * 拖放事件由 Tauri 从 WebView 转出来（`dragDropEnabled` 默认就是开的）。
   * 拿不到也不影响别的功能：按钮和快捷键都还在，所以这里安静失败。
   */
  useEffect(() => {
    if (!isTauri()) {
      return
    }

    let stop: (() => void) | null = null
    let cancelled = false

    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type !== 'drop') {
            return
          }

          const [first] = event.payload.paths ?? []

          if (first !== undefined) {
            void handleDroppedPath(first)
          }
        })

        if (cancelled) {
          unlisten()
        } else {
          stop = unlisten
        }
      } catch {
        // 没有拖放能力就算了，不去打扰用户
      }
    })()

    return () => {
      cancelled = true
      stop?.()
    }
  }, [handleDroppedPath])

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
  const shownPreview =
    preview === null
      ? null
      : capturedPreview !== null && Math.abs(preview.seconds - capturedPreview.seconds) < 0.75
        ? { ...preview, seconds: capturedPreview.seconds }
        : preview
  const shownPreviewImage =
    preview !== null &&
    capturedPreview !== null &&
    Math.abs(preview.seconds - capturedPreview.seconds) < 0.75
      ? capturedPreview.image
      : null

  const sidebarActions = (
    <div className="app__tools app__tools--sidebar">
      <div className="app__collection app__playlist">
        <button
          className="app__tool"
          type="button"
          data-sidebar-label="播放列表"
          onClick={() => {
            setCollectionNotice(null)
            setOpenPanel((open) => (open === 'playlist' ? null : 'playlist'))
          }}
          aria-haspopup="dialog"
          aria-expanded={openPanel === 'playlist'}
          aria-label="播放列表"
          title="播放列表"
        >
          ≡
        </button>

        <Popover
          open={openPanel === 'playlist'}
          onClose={() => setOpenPanel(null)}
          label="播放列表"
          anchorSelector=".app__playlist"
          className="popover--panel popover--paths popover--down"
          role="dialog"
        >
          <CollectionsPanel
            kind="playlist"
            paths={collections.playlist}
            modes={playModes}
            mode={playMode}
            onPickMode={handlePickPlayMode}
            onPlay={handlePlayFromList}
            onRemove={handleTogglePlaylist}
            onShift={handleShiftPlaylist}
            onReveal={handleRevealFavorite}
            onExport={(kind) => void handleExportCollection(kind)}
            onImport={() => void handleImportPlaylist()}
            onClear={(kind) => void handleClearCollection(kind)}
            notice={collectionNotice}
          />
        </Popover>
      </div>

      <button
        className="app__tool"
        type="button"
        data-sidebar-label="收藏夹"
        onClick={() => {
          setOpenPanel(null)
          setCollectionsOpen(true)
        }}
        aria-haspopup="dialog"
        aria-expanded={collectionsOpen}
        aria-label="收藏夹"
        title="收藏夹"
      >
        ★
      </button>

      <div className="app__collection app__tools-menu">
        <button
          className="app__tool"
          type="button"
          data-sidebar-label="播放工具"
          onClick={() => setOpenPanel((open) => (open === 'tools' ? null : 'tools'))}
          aria-haspopup="dialog"
          aria-expanded={openPanel === 'tools'}
          aria-label="播放工具"
          title="播放工具"
        >
          ⋮
        </button>

        <Popover
          open={openPanel === 'tools'}
          onClose={() => setOpenPanel(null)}
          label="播放工具"
          anchorSelector=".app__tools-menu"
          className="popover--panel popover--tools popover--down"
          role="dialog"
        >
          <PlaybackTools
            source={currentFile}
            position={shownPosition}
            sleepRemaining={sleepRemaining}
            sleepMinutes={sleep?.minutes ?? null}
            sleepAction={sleepAction}
            onSleepTimer={handleSleepTimer}
            onSleepAction={handleSleepAction}
            miniMode={miniMode}
            alwaysOnTop={alwaysOnTop}
            onToggleMini={handleToggleMini}
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            onOpenUrl={handleOpenUrl}
            onPlayRecent={(path) => {
              setOpenPanel(null)
              void playPath(path)
            }}
            onPlayCapture={handlePlayCapture}
            ytdlAvailable={status === null ? null : status.ytdlAvailable}
            onError={reportError}
          />
        </Popover>
      </div>

      <div className="app__appearance">
        <button
          className="app__theme-trigger"
          type="button"
          data-sidebar-label="外观主题"
          onClick={() =>
            setOpenPanel((open) => (open === 'appearance' ? null : 'appearance'))
          }
          aria-haspopup="dialog"
          aria-expanded={openPanel === 'appearance'}
          aria-label={`更换颜色主题，当前为${themeFor(appearanceTheme).label}`}
          title="更换颜色主题"
        >
          <span className="app__theme-orb" aria-hidden="true" />
          <span className="app__theme-name">{themeFor(appearanceTheme).shortLabel}</span>
          <span className="app__theme-chevron" aria-hidden="true">
            ⌄
          </span>
        </button>

        <Popover
          open={openPanel === 'appearance'}
          onClose={() => setOpenPanel(null)}
          label="颜色主题"
          anchorSelector=".app__appearance"
          className="popover--panel popover--themes popover--down"
          role="dialog"
        >
          <div className="theme-menu">
            <div className="theme-menu__head">
              <span className="theme-menu__eyebrow">APPEARANCE</span>
              <span className="theme-menu__title">给今晚换一种颜色</span>
            </div>
            <ThemePicker compact theme={appearanceTheme} onChange={handleThemeChange} />
            <button
              className="theme-menu__more"
              type="button"
              onClick={() => {
                setOpenPanel(null)
                setSettingsOpen(true)
              }}
            >
              调整动效与更多外观
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </Popover>
      </div>

      <button
        className="app__tool"
        type="button"
        data-sidebar-label="设置"
        data-tutorial="settings"
        onClick={() => setSettingsOpen(true)}
        aria-label="设置"
        title="设置"
      >
        ⚙
      </button>

      <button
        className="app__help"
        type="button"
        data-sidebar-label="使用帮助"
        onClick={() => setTutorialOpen(true)}
        aria-label="使用帮助"
        title="使用帮助"
      >
        ?
      </button>
    </div>
  )

  return (
    <div
      className="app"
      data-video={expanded && currentFile ? 'true' : 'false'}
      data-chrome={chromeVisible ? 'visible' : 'hidden'}
      data-splash={splash}
      data-mini={miniMode ? 'true' : 'false'}
      data-appearance={appearanceTheme}
      data-motion={motionPreference}
    >
      <div className="app__atmosphere" aria-hidden="true">
        <span className="app__aurora app__aurora--one" />
        <span className="app__aurora app__aurora--two" />
        <span className="app__aurora app__aurora--three" />
        <span className="app__grain" />
      </div>
      <div className="shell">
        <header className="app__bar">
          <div className="app__brand">
            <button
              className="app__home-mark"
              type="button"
              onClick={handleGoHome}
              aria-label="回到首页"
              title="回到首页"
              data-testid="home-button"
            >
              <span className="app__mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="app__wordmark">
                <span className="app__name">FutureVideo</span>
                <span className="app__tagline">YOUR PRIVATE SCREEN</span>
                <span className="app__version" data-testid="app-version">
                  {__APP_VERSION__}
                </span>
              </span>
            </button>

            {/*
              目录区往上层走的路都在这里，不再单开关一个侧边栏。
              画面展开时连它一起收起：新目录里没有当前视频，放大格会消失。
            */}
            {expanded || atHome || shownPath === null ? null : (
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

        </header>

        <main className="library" data-island={hasMedia ? 'true' : 'false'}>
          {expanded && !playingInGrid ? null : atDrives && !atHome ? (
            <div className="drives" data-testid="drives">
              {drives.map((drive, index) => (
                <button
                  className="folder folder--drive"
                  type="button"
                  key={drive}
                  style={{ '--i': index } as CSSProperties}
                  onClick={() => void loadDirectory(drive)}
                >
                  <span className="folder__frame">
                    <span className="folder__glyph" aria-hidden="true">
                      <svg viewBox="0 0 48 48" aria-hidden="true">
                        <path
                          className="glyph__back"
                          d="M7 14.5A3.5 3.5 0 0 1 10.5 11h8.6a3 3 0 0 1 2.4 1.2l2.3 2.9h13.7A3.5 3.5 0 0 1 41 18.6V38a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"
                        />
                        <path
                          className="glyph__front"
                          d="M7 19.4h34V38a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"
                        />
                      </svg>
                    </span>
                  </span>
                  <span className="folder__name">{drive}</span>
                </button>
              ))}

              {drives.length === 0 ? (
                <p className="library__hint">没有找到可以打开的盘</p>
              ) : null}
            </div>
          ) : atHome || listing === null ? (
            <div className="library__empty">
              <div className="library__hero">
                <div className="library__hero-copy">
                  <span className="library__eyebrow">
                    <span aria-hidden="true" />
                    YOUR PRIVATE CINEMA
                  </span>
                  <h1 className="library__headline">
                    <span>让每一帧</span>
                    <span className="library__headline-accent">都有你的颜色。</span>
                  </h1>
                  <p className="library__hint">
                    <span>选一个目录，把里面的视频铺成方格</span>
                    <span>没有广告，没有推荐，只留下你真正想看的。</span>
                  </p>

                  <div className="library__hero-actions">
                    {listing === null ? (
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() => void handleChooseDirectory()}
                        disabled={!canOpen}
                      >
                        <span>选择目录</span>
                        <span aria-hidden="true">↗</span>
                      </button>
                    ) : (
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() => setAtHome(false)}
                      >
                        <span>继续上次片库</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    )}
                    <button
                      className="library__single library__sample"
                      type="button"
                      data-tutorial="sample"
                      onClick={() => void handleOpenSample()}
                      disabled={!canOpen}
                    >
                      看示例视频
                    </button>
                  </div>

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
                      /
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

                <div className="library__hero-stage" aria-hidden="true">
                  <span className="library__orbit library__orbit--one" />
                  <span className="library__orbit library__orbit--two" />
                  <div className="library__poster library__poster--back">
                    <span>LATE NIGHT</span>
                  </div>
                  <div className="library__poster library__poster--middle">
                    <span>LOCAL / 04</span>
                  </div>
                  <div className="library__poster library__poster--front">
                    <span className="library__poster-glow" />
                    <span className="library__poster-index">FU / 001</span>
                    <span className="library__poster-play">▶</span>
                    <span className="library__poster-name">周末放映室</span>
                    <span className="library__poster-line" />
                    <span className="library__poster-meta">YOUR COLOR. YOUR FRAME.</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="library__workspace">
                <div className="library__main">
              {/* 搜索与排序只改「怎么摆」，不动目录本身 */}
              {expanded || listing.entries.length === 0 ? null : (
                <div className="library__tools">
                  <span className="library__toolbar-title">
                    <span>LIBRARY</span>
                    本地片库
                  </span>
                  <input
                    className="library__search"
                    type="search"
                    value={search}
                    placeholder="按名字找"
                    aria-label="搜索这个目录"
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      // 键盘用户也有一个「清空」：Chromium 的 type=search 只给了鼠标用的 ×
                      if (event.key === 'Escape') {
                        setSearch('')
                      }
                    }}
                  />

                  <span className="library__count">
                    {String(videos.length).padStart(2, '0')} 部影片
                  </span>

                  <div className="library__sort" role="group" aria-label="排序">
                    <button
                      className="library__sort-chip"
                      type="button"
                      aria-pressed={sort === 'name'}
                      onClick={() => setSort('name')}
                    >
                      名称 ↑
                    </button>
                    <button
                      className="library__sort-chip"
                      type="button"
                      aria-pressed={sort === 'name-desc'}
                      onClick={() => setSort('name-desc')}
                    >
                      名称 ↓
                    </button>
                  </div>
                </div>
              )}

              <section className="library__videos" aria-label={search.trim() ? '搜索结果' : '全部影片'}>
                {expanded ? null : (
                  <div className="library__videos-head">
                    <div className="library__videos-title">
                      <span>VIDEO COLLECTION</span>
                      <h2>{search.trim() ? '搜索结果' : '全部影片'}</h2>
                    </div>
                    <span className="library__videos-count">
                      {String(videos.length).padStart(2, '0')} / {String(listing.entries.length).padStart(2, '0')}
                    </span>
                  </div>
                )}

                {videos.length === 0 ? (
                  <div className="library__none">
                    <p className="library__hint">
                      {search.trim() !== ''
                        ? `没有名字里有「${search.trim()}」的条目`
                        : listing.entries.length === 0
                          ? '这个目录里没有子目录或视频文件'
                          : '这个目录里没有视频'}
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
                    playlist={collections.playlist}
                    favorites={collections.favorites}
                    customCollections={collections.customCollections ?? []}
                    highlightPath={highlightPath}
                    onOpen={handleOpenFromTile}
                    onTogglePlaylist={handleTogglePlaylist}
                    onOpenFavoritePicker={handleOpenFavoritePicker}
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
              </section>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {!miniMode ? (
        <FolderStrip
          folders={atHome ? [] : folders}
          parent={atHome ? null : parentEntry}
          busy={directoryBusy}
          onOpen={(path) => void loadDirectory(path)}
          onHome={handleGoHome}
          atHome={atHome}
          forceOpen={openPanel !== null}
          actions={sidebarActions}
          status={statusNotice}
          statusWarning={kernelWarning !== null}
        />
      ) : null}

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
          preview={shownPreview}
          previewImage={shownPreviewImage}
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

      {expanded && !playbackLibraryOpen ? (
        <button
          className="playback-side-tab"
          type="button"
          onClick={() => {
            setOpenPanel(null)
            setPlaybackLibraryOpen(true)
          }}
          aria-haspopup="dialog"
          aria-label="打开播放片库"
          title="打开播放片库"
        >
          <span className="playback-side-tab__icon" aria-hidden="true">
            ▦
          </span>
          <span className="playback-side-tab__label">片库</span>
        </button>
      ) : null}

      {currentFile ? (
        <PlaybackLibraryDrawer
          open={playbackLibraryOpen}
          source={listing}
          collections={collections}
          onClose={() => setPlaybackLibraryOpen(false)}
          onError={reportError}
          onChooseDirectory={handleChoosePlaybackDirectory}
          onPlay={handlePlayFromDrawer}
          onTogglePlaylist={togglePlaylistPath}
          onToggleFavorite={toggleFavoritePath}
          onToggleNamedCollection={handleToggleNamedCollection}
        />
      ) : null}

      {favoritePicker === null ? null : (
        <FavoritePicker
          key={favoritePicker.path}
          path={favoritePicker.path}
          name={favoritePicker.name}
          anchor={favoritePicker.anchor}
          trigger={favoritePicker.trigger}
          quickFavorite={collections.favorites.includes(favoritePicker.path)}
          customCollections={collections.customCollections ?? []}
          onToggleQuick={() => toggleFavoritePath(favoritePicker.path)}
          onToggleNamed={(id) => handleToggleNamedCollection(id, favoritePicker.path)}
          onManage={() => {
            setFavoritePicker(null)
            setCollectionsOpen(true)
          }}
          onError={reportError}
          onClose={() => setFavoritePicker(null)}
        />
      )}

      {themeBurst !== null && motionPreference !== 'off' ? (
        <span className="theme-burst" key={themeBurst} aria-hidden="true" />
      ) : null}

      {curtain ? <div className="curtain" ref={curtainRef} data-testid="curtain" /> : null}

      {splash === 'done' ? null : (
        <Splash
          ready={bootReady}
          onLeave={handleSplashLeave}
          onDone={handleSplashDone}
          minMs={splashTiming.minMs}
          maxMs={splashTiming.maxMs}
        />
      )}

      {/* 开屏没走完之前不弹教程，不然两层浮层会叠在一起 */}
      {splash === 'done' && tutorialOpen ? (
        <Tutorial onClose={() => setTutorialOpen(false)} progress={tutorialProgress} />
      ) : null}

      {settingsOpen ? (
        <SettingsPage
          onClose={() => setSettingsOpen(false)}
          onError={reportError}
          shortcuts={shortcutOverrides}
          onShortcutsChange={setShortcutOverrides}
          theme={appearanceTheme}
          motion={motionPreference}
          onThemeChange={handleThemeChange}
          onMotionChange={handleMotionChange}
        />
      ) : null}

      {collectionsOpen ? (
        <CollectionsPage
          collections={collections}
          onClose={() => setCollectionsOpen(false)}
          onError={reportError}
          onPlay={(path) => void handlePlayFromList(path)}
          onReveal={(path) => void handleRevealFavorite(path)}
          onCreate={handleCreateCollection}
          onRename={handleRenameCollection}
          onDelete={handleDeleteCollection}
          onToggleFavorite={toggleFavoritePath}
          onToggleNamedCollection={handleToggleNamedCollection}
        />
      ) : null}

      {/* 迷你模式下顶栏是收起来的，退出得留一个看得见的出口 */}
      {miniMode ? (
        <button className="app__mini-exit" type="button" onClick={handleToggleMini}>
          退出迷你模式
        </button>
      ) : null}

      {error ? (
        <p className="app__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
