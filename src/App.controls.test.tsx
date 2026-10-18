import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DirectoryListing, PlayerSnapshot } from './lib/backend'
import { PAUSE_PATH, PLAY_PATH } from './lib/play-pause-paths'
import { markTutorialSeen } from './lib/tutorial'
import { clearThumbnails } from './lib/thumbnail-cache'

const CLIPS = String.raw`E:\clips`
const ANIME = String.raw`E:\clips\anime`
const DEMO = String.raw`E:\clips\demo.mp4`
const OTHER = String.raw`E:\clips\other.mkv`
const THIRD = String.raw`E:\clips\anime\ep01.mkv`
const IDLE: PlayerSnapshot = {
  hasMedia: false,
  ipcReady: false,
  path: null,
  position: 0,
  duration: 0,
  paused: true,
  volume: 100,
  muted: false,
  speed: 1,
  buffering: false,
  idleActive: false,
}

// vi.hoisted 保证这些 mock 在模块导入之前就已经就绪
const mocks = vi.hoisted(() => {
  const listing = {
    directory: String.raw`E:\clips`,
    // 尾随反斜杠不能用 String.raw：那儿的 \ 会把结束反引号转义掉
    parent: 'E:\\',
    entries: [
      { name: 'anime', path: String.raw`E:\clips\anime`, kind: 'directory' as const },
      { name: 'demo.mp4', path: String.raw`E:\clips\demo.mp4`, kind: 'video' as const },
      { name: 'other.mkv', path: String.raw`E:\clips\other.mkv`, kind: 'video' as const },
    ],
  }

  const subListing = {
    directory: String.raw`E:\clips\anime`,
    parent: String.raw`E:\clips`,
    entries: [{ name: 'ep01.mkv', path: String.raw`E:\clips\anime\ep01.mkv`, kind: 'video' as const }],
  }

  return {
    listing,
    subListing,
    snapshot: {
      hasMedia: false,
      ipcReady: false,
      path: null,
      position: 0,
      duration: 0,
      paused: true,
      volume: 100,
      muted: false,
      speed: 1,
      buffering: false,
    } as PlayerSnapshot,
    /** 后端把自带的示例文件复制到这里，再当作普通目录打开。 */
    sampleFolder: String.raw`C:\Users\zhan2\AppData\Roaming\com.fuvideo.desktop\示例视频`,
    prepareSampleFolder: vi.fn(),
    /** 播放列表与收藏夹：mock 里也要真的改，界面才拿得到「改完之后」的列表。 */
    collections: { playlist: [] as string[], favorites: [] as string[] },
    getCollections: vi.fn(),
    togglePlaylist: vi.fn(),
    shiftInPlaylist: vi.fn(),
    toggleFavorite: vi.fn(),
    clearCollection: vi.fn(async (_kind: string) => ({ playlist: [] as string[], favorites: [] as string[] })),
    exportCollection: vi.fn(),
    importPlaylist: vi.fn(),
    // 设置页要用的一份设置：字段和 Rust 侧对齐，少一个字段界面就会读成 undefined
    settings: {
      hwdec: 'auto-safe',
      savePosition: true,
      subAuto: null,
      subFontSize: null,
      subPosition: null,
      subAssOverride: null,
      audioChannels: null,
      audioDevice: null,
      audioExclusive: false,
      audioFilterMode: 'simple',
      loudnessNormalization: false,
      virtualSurround: false,
      stereoWidening: false,
      equalizerPreset: null,
      equalizerBands: null,
      audioSamplerate: null,
      audioFormat: null,
      audioSpdif: false,
      videoFilterMode: 'simple',
      videoAspect: null,
      videoFill: false,
      videoZoom: null,
      videoRotate: null,
      videoFlip: null,
      videoProfile: null,
      videoBrightness: null,
      videoContrast: null,
      videoSaturation: null,
      videoHue: null,
      videoGamma: null,
      videoDeband: false,
      videoInterpolation: false,
      videoIcc: false,
      videoSharpen: null,
      videoToneMapping: null,
      videoTargetPeak: null,
      videoHdrRecovery: null,
      screenshotFormat: null,
      screenshotSubtitles: true,
      lastDirectory: null,
      alwaysOnTop: false,
      miniMode: false,
      shortcuts: null,
      splashSpeed: 'normal',
      volume: null,
      speed: null,
      windowWidth: null,
      windowHeight: null,
      windowX: null,
      windowY: null,
    } as Record<string, unknown>,
    rememberDirectory: vi.fn(),
    rememberAlwaysOnTop: vi.fn(),
    rememberMiniMode: vi.fn(),
    getPlayOptions: vi.fn(),
    setPlayMode: vi.fn(),
    // 章节、AB 循环与逐帧：这个测试只关心面板能不能用，链路本身由 Rust 那边验
    getChapters: vi.fn(async () => [] as { index: number; title: string | null; time: number }[]),
    getLoopPoints: vi.fn(async () => ({ a: null as number | null, b: null as number | null })),
    getRecent: vi.fn(async () => ({ entries: [] as { path: string; playedAt: number; position: number }[] })),
    clearRecent: vi.fn(async () => ({ entries: [] as { path: string; playedAt: number; position: number }[] })),
    forgetRecent: vi.fn(async (_path: string) => ({
      entries: [] as { path: string; playedAt: number; position: number }[],
    })),
    getBookmarks: vi.fn(async () => ({
      entries: [] as { path: string; position: number; createdAt: number }[],
    })),
    addBookmark: vi.fn(async (_path: string, _position: number) => ({
      entries: [] as { path: string; position: number; createdAt: number }[],
    })),
    removeBookmark: vi.fn(async (_path: string, _position: number) => ({
      entries: [] as { path: string; position: number; createdAt: number }[],
    })),
    getCaptureDevices: vi.fn(async () => ({
      cameras: [] as string[],
      microphones: [] as string[],
    })),
    playCaptureDevice: vi.fn(async (_kind: string, _name: string) => {}),
    getBackendStatus: vi.fn(),
    selectChapter: vi.fn(async (_index: number) => {}),
    setLoopA: vi.fn(async (_seconds: number | null) => {}),
    setLoopB: vi.fn(async (_seconds: number | null) => {}),
    stepFrame: vi.fn(async (_forward: boolean) => {}),
    togglePause: vi.fn(async () => false),
    pauseVideo: vi.fn(async () => {}),
    seekTo: vi.fn(async (_position: number) => {}),
    seekBy: vi.fn(async (_offset: number) => {}),
    setVolume: vi.fn(async (_volume: number) => {}),
    toggleMute: vi.fn(async () => true),
    setSpeed: vi.fn(async (_speed: number) => {}),
    toggleFullscreen: vi.fn(async () => true),
    playLocalVideo: vi.fn(async (_path: string) => {}),
    pickDirectory: vi.fn(async (): Promise<string | null> => String.raw`E:\clips`),
    listDirectory: vi.fn(async (_directory: string): Promise<DirectoryListing> => listing),
    listDrives: vi.fn(async (): Promise<string[]> => ['C:\\', 'E:\\']),
    thumbnailAt: vi.fn(async (_source: string, _position: number) => 'data:image/jpeg;base64,AAAA'),
  }
})

/** 让窗口露面那一步会调真实的 invoke，在 jsdom 里必然抛错，桩掉它。 */
vi.mock('./lib/window', () => ({ revealMainWindow: async () => {} }))

vi.mock('./lib/backend', () => ({
  isTauri: () => true,
  getBackendStatus: () => mocks.getBackendStatus(),
  pickVideoFile: async () => String.raw`E:\clips\demo.mp4`,
  playLocalVideo: (path: string) => mocks.playLocalVideo(path),
  getPlayerState: async () => mocks.snapshot,
  togglePause: () => mocks.togglePause(),
  pauseVideo: () => mocks.pauseVideo(),
  seekTo: (position: number) => mocks.seekTo(position),
  seekBy: (offset: number) => mocks.seekBy(offset),
  setVolume: (volume: number) => mocks.setVolume(volume),
  toggleMute: () => mocks.toggleMute(),
  setSpeed: (speed: number) => mocks.setSpeed(speed),
  toggleFullscreen: () => mocks.toggleFullscreen(),
  pickDirectory: () => mocks.pickDirectory(),
  prepareSampleFolder: () => mocks.prepareSampleFolder(),
  getCollections: () => mocks.getCollections(),
  togglePlaylist: (path: string) => mocks.togglePlaylist(path),
  shiftInPlaylist: (path: string, delta: number) => mocks.shiftInPlaylist(path, delta),
  toggleFavorite: (path: string) => mocks.toggleFavorite(path),
  exportCollection: (kind: 'playlist' | 'favorites') => mocks.exportCollection(kind),
  importPlaylist: () => mocks.importPlaylist(),
  listDirectory: (directory: string) => mocks.listDirectory(directory),
  listDrives: () => mocks.listDrives(),
  thumbnailAt: (source: string, position: number) => mocks.thumbnailAt(source, position),
  // 音轨与字幕面板用到的那一批：这个测试只关心面板能不能打开，
  // 面板内部的行为由 MediaPanel.test.tsx 负责。
  getPlayerDetails: async () => ({
    path: null,
    tracks: [],
    hwdecCurrent: null,
    secondarySubtitleId: null,
    audioDelay: 0,
    subtitleDelay: 0,
    subtitleFontSize: 38,
    subtitlePosition: 100,
    subtitleStyle: 'scale',
    audioChannels: 'auto-safe',
    audioDevice: 'auto',
    audioExclusive: false,
  }),
  getAudioDevices: async () => [],
  setAudioTrack: async () => {},
  setSubtitleTrack: async () => {},
  setSecondarySubtitle: async () => {},
  addSubtitleFile: async () => null,
  addAudioFile: async () => null,
  setAudioDelay: async () => {},
  setSubtitleDelay: async () => {},
  setSubtitleFontSize: async () => {},
  setSubtitlePosition: async () => {},
  setSubtitleStyleOverride: async () => {},
  setAudioChannels: async () => {},
  setAudioDevice: async () => {},
  setAudioExclusive: async () => {},
  // 设置页用到的那一批：这个测试只关心设置页能不能从右上角打开
  readSettings: async () => mocks.settings,
  getAudioOptions: async () => ({
    frequencies: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    gainLimit: 12,
    modes: [
      { id: 'simple', label: '简单' },
      { id: 'advanced', label: '高级' },
    ],
    presets: [
      { id: 'off', label: '关闭' },
      { id: 'music', label: '音乐' },
    ],
    samplerates: [{ id: 'source', label: '跟随源' }],
    formats: [{ id: 'source', label: '跟随源' }],
  }),
  setAudioFilterMode: async () => mocks.settings,
  setAudioEffect: async () => mocks.settings,
  setEqualizerPreset: async () => mocks.settings,
  setEqualizerBand: async () => mocks.settings,
  setAudioSamplerate: async () => mocks.settings,
  setAudioFormat: async () => mocks.settings,
  setAudioSpdif: async () => mocks.settings,
  // 设置页现在还有「画面」一节，这几个也得在
  getVideoOptions: async () => ({
    colorLimit: 100,
    sharpenLimit: 5,
    modes: [
      { id: 'simple', label: '简单' },
      { id: 'advanced', label: '高级' },
    ],
    aspects: [{ id: 'auto', label: '自动' }],
    rotations: [0, 90, 180, 270],
    flips: [{ id: 'h', label: '左右镜像' }],
    profiles: [{ id: 'high', label: '高质量（缩放更锐利）' }],
    toneMappings: [{ id: 'auto', label: '自动' }],
    hwdec: [{ id: 'auto-safe', label: '自动（推荐）' }],
    screenshotFormats: [{ id: 'jpg', label: 'JPEG（体积小）' }],
  }),
  setVideoFilterMode: async () => mocks.settings,
  setVideoAspect: async () => mocks.settings,
  setVideoFill: async () => mocks.settings,
  setVideoRotate: async () => mocks.settings,
  setHwdec: async () => mocks.settings,
  takeScreenshot: async () => String.raw`E:\clips\demo 截图.jpg`,
  rememberDirectory: (path: string) => mocks.rememberDirectory(path),
  rememberAlwaysOnTop: async (enabled: boolean) => {
    mocks.rememberAlwaysOnTop(enabled)
    mocks.settings = { ...mocks.settings, alwaysOnTop: enabled }
    return mocks.settings
  },
  rememberMiniMode: async (enabled: boolean) => {
    mocks.rememberMiniMode(enabled)
    mocks.settings = { ...mocks.settings, miniMode: enabled }
    return mocks.settings
  },
  setShortcut: async (action: string, code: string | null) => {
    const current = (mocks.settings.shortcuts as Record<string, string> | null) ?? {}
    const next = { ...current }

    if (code === null) {
      delete next[action]
    } else {
      next[action] = code
    }

    mocks.settings = { ...mocks.settings, shortcuts: Object.keys(next).length === 0 ? null : next }
    return mocks.settings
  },
  resetShortcuts: async () => {
    mocks.settings = { ...mocks.settings, shortcuts: null }
    return mocks.settings
  },
  setSplashSpeed: async (speed: string) => {
    mocks.settings = { ...mocks.settings, splashSpeed: speed }
    return mocks.settings
  },
  playUrl: (url: string) => mocks.playLocalVideo(url),
  stepFrame: (forward: boolean) => mocks.stepFrame(forward),
  getChapters: () => mocks.getChapters(),
  selectChapter: (index: number) => mocks.selectChapter(index),
  getLoopPoints: () => mocks.getLoopPoints(),
  getRecent: () => mocks.getRecent(),
  clearRecent: () => mocks.clearRecent(),
  forgetRecent: (path: string) => mocks.forgetRecent(path),
  getBookmarks: () => mocks.getBookmarks(),
  addBookmark: (path: string, position: number) => mocks.addBookmark(path, position),
  removeBookmark: (path: string, position: number) => mocks.removeBookmark(path, position),
  getCaptureDevices: () => mocks.getCaptureDevices(),
  playCaptureDevice: (kind: string, name: string) => mocks.playCaptureDevice(kind, name),
  clearCollection: (kind: 'playlist' | 'favorites') => mocks.clearCollection(kind),
  setLoopA: (seconds: number | null) => mocks.setLoopA(seconds),
  setLoopB: (seconds: number | null) => mocks.setLoopB(seconds),
  getPlayOptions: async () => mocks.getPlayOptions(),
  setPlayMode: async (mode: string) => {
    mocks.setPlayMode(mode)
    return mocks.settings
  },
}))

import App from './App'

beforeEach(() => {
  // 这些用例测的是主界面：教程只在第一次进入时弹，这里先标记看过
  window.localStorage.clear()
  markTutorialSeen()
  // 缩略图缓存是模块级的：不清的话后一个用例会拿到前一个抓到的帧
  clearThumbnails()

  mocks.snapshot = { ...IDLE }
  // 上一个用例可能改过设置（比如换成别的「上次目录」），这里复位
  mocks.settings = {
    ...mocks.settings,
    lastDirectory: null,
    alwaysOnTop: false,
    miniMode: false,
    shortcuts: null,
    splashSpeed: 'normal',
  }

  for (const fn of [
    mocks.togglePause,
    mocks.pauseVideo,
    mocks.seekTo,
    mocks.seekBy,
    mocks.setVolume,
    mocks.toggleMute,
    mocks.setSpeed,
    mocks.toggleFullscreen,
    mocks.playLocalVideo,
    mocks.pickDirectory,
    mocks.listDirectory,
    mocks.listDrives,
    mocks.thumbnailAt,
    mocks.prepareSampleFolder,
    mocks.getCollections,
    mocks.togglePlaylist,
    mocks.shiftInPlaylist,
    mocks.toggleFavorite,
    mocks.exportCollection,
    mocks.importPlaylist,
    mocks.rememberDirectory,
    mocks.rememberAlwaysOnTop,
    mocks.rememberMiniMode,
    mocks.getChapters,
    mocks.getLoopPoints,
    mocks.getRecent,
    mocks.clearRecent,
    mocks.forgetRecent,
    mocks.getBookmarks,
    mocks.addBookmark,
    mocks.removeBookmark,
    mocks.getCaptureDevices,
    mocks.playCaptureDevice,
    mocks.clearCollection,
    mocks.selectChapter,
    mocks.setLoopA,
    mocks.setLoopB,
    mocks.stepFrame,
    mocks.getPlayOptions,
    mocks.setPlayMode,
  ]) {
    fn.mockClear()
  }

  mocks.getChapters.mockResolvedValue([])
  mocks.getLoopPoints.mockResolvedValue({ a: null, b: null })
  mocks.getRecent.mockResolvedValue({ entries: [] })
  mocks.clearRecent.mockResolvedValue({ entries: [] })
  mocks.forgetRecent.mockResolvedValue({ entries: [] })
  mocks.getBookmarks.mockResolvedValue({ entries: [] })
  mocks.getCaptureDevices.mockResolvedValue({ cameras: [], microphones: [] })
  mocks.getBackendStatus.mockResolvedValue({
    kind: 'tauri',
    mpvAvailable: true,
    mpvVersion: '0.41.0',
    mpvPath: 'C:/mpv/mpv.exe',
    ytdlAvailable: true,
    message: '播放内核 mpv 0.41.0',
  })
  mocks.clearCollection.mockImplementation(async (kind: string) =>
    kind === 'favorites'
      ? { ...mocks.collections, favorites: [] }
      : { ...mocks.collections, playlist: [] },
  )
  mocks.exportCollection.mockResolvedValue(String.raw`E:\clips\playlist.m3u8`)
  mocks.importPlaylist.mockResolvedValue(null)
  mocks.togglePause.mockResolvedValue(false)
  mocks.toggleMute.mockResolvedValue(true)
  mocks.toggleFullscreen.mockResolvedValue(true)
  mocks.pickDirectory.mockResolvedValue(CLIPS)
  mocks.listDirectory.mockImplementation(async (directory: string) =>
    directory === ANIME ? mocks.subListing : mocks.listing,
  )
  mocks.thumbnailAt.mockResolvedValue('data:image/jpeg;base64,AAAA')
  mocks.prepareSampleFolder.mockResolvedValue(mocks.sampleFolder)
  mocks.getPlayOptions.mockResolvedValue([
    { id: 'sequence', label: '顺序播放' },
    { id: 'single', label: '单曲循环' },
    { id: 'list', label: '列表循环' },
    { id: 'shuffle', label: '随机播放' },
  ])

  // 列表的 mock 要真的增删改，界面拿返回值更新自己
  mocks.collections = { playlist: [], favorites: [] }
  mocks.getCollections.mockImplementation(async () => mocks.collections)
  mocks.togglePlaylist.mockImplementation(async (path: string) => {
    const contains = mocks.collections.playlist.includes(path)
    const playlist = contains
      ? mocks.collections.playlist.filter((item) => item !== path)
      : [...mocks.collections.playlist, path]

    mocks.collections = { ...mocks.collections, playlist }
    return mocks.collections
  })
  mocks.shiftInPlaylist.mockImplementation(async (path: string, delta: number) => {
    const playlist = [...mocks.collections.playlist]
    const index = playlist.indexOf(path)
    const target = index + delta

    if (index >= 0 && target >= 0 && target < playlist.length) {
      const moved = playlist[index]
      playlist[index] = playlist[target]
      playlist[target] = moved
    }

    mocks.collections = { ...mocks.collections, playlist }
    return mocks.collections
  })
  mocks.toggleFavorite.mockImplementation(async (path: string) => {
    const contains = mocks.collections.favorites.includes(path)
    const favorites = contains
      ? mocks.collections.favorites.filter((item) => item !== path)
      : [...mocks.collections.favorites, path]

    mocks.collections = { ...mocks.collections, favorites }
    return mocks.collections
  })
})

const grid = () => within(screen.getByTestId('video-grid'))
const folders = () => within(screen.getByTestId('folder-strip'))
const crumbs = () => screen.getByTestId('crumbs')

/** 选一个目录，等方格出现。 */
async function chooseDirectory(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: '选择目录' }))
  await grid().findByRole('button', { name: 'demo.mp4' })
}

/** 选目录 → 点方格，方格放大成画面，底部控制条出现。 */
async function openPlayingVideo(overrides: Partial<PlayerSnapshot> = {}): Promise<void> {
  mocks.snapshot = {
    hasMedia: true,
    ipcReady: true,
    path: DEMO,
    position: 0,
    duration: 120,
    paused: false,
    volume: 50,
    muted: false,
    speed: 1,
    buffering: false,
    idleActive: false,
    ...overrides,
  }

  render(<App />)
  await chooseDirectory()
  await userEvent.click(grid().getByRole('button', { name: 'demo.mp4' }))

  await waitFor(() => expect(screen.getByTestId('expanded-tile')).toBeInTheDocument(), { timeout: 3000 })

  // 进度条出现只说明已选中文件，还要等状态真正拉回来
  const shownVolume = mocks.snapshot.muted ? 0 : Math.round(mocks.snapshot.volume)

  await waitFor(
    () => expect(screen.getByRole('slider', { name: '音量' })).toHaveValue(String(shownVolume)),
    { timeout: 3000 },
  )
}

describe('目录页', () => {
  it('没有选择目录时提示选择目录', () => {
    render(<App />)

    expect(screen.getByText('选一个目录，把里面的视频铺成方格')).toBeInTheDocument()
    expect(screen.queryByTestId('video-grid')).not.toBeInTheDocument()
  })

  it('选择目录后把视频铺成方格，缩略图取首帧', async () => {
    render(<App />)
    await chooseDirectory()

    expect(mocks.listDirectory).toHaveBeenCalledWith(CLIPS)
    expect(grid().getByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
    // 子目录只出现在侧边栏，不进方格
    expect(grid().queryByRole('button', { name: 'anime' })).not.toBeInTheDocument()

    await waitFor(() => expect(mocks.thumbnailAt).toHaveBeenCalledWith(DEMO, 0))
    await waitFor(() => {
      expect(screen.getByTestId('video-grid').querySelectorAll('.tile__image').length).toBeGreaterThan(0)
    })
  })
})

describe('方格放大播放', () => {
  it('播放中按钮显示暂停图标，暂停时显示播放图标', async () => {
    await openPlayingVideo({ paused: false })

    expect(screen.getByRole('button', { name: '暂停' }).querySelector('path')).toHaveAttribute(
      'd',
      PAUSE_PATH,
    )
  })

  it('暂停状态显示播放三角形', async () => {
    await openPlayingVideo({ paused: true })

    expect(screen.getByRole('button', { name: '播放' }).querySelector('path')).toHaveAttribute(
      'd',
      PLAY_PATH,
    )
  })

  it('暂停时顶栏和底栏保持显示', async () => {
    await openPlayingVideo({ paused: true })

    expect(document.querySelector('.app')).toHaveAttribute('data-chrome', 'visible')
  })

  it('点击方格后放大成画面，其他方格向下让位', async () => {
    await openPlayingVideo()

    const expanded = screen.getByTestId('expanded-tile')

    expect(expanded).toBeInTheDocument()
    expect(screen.getByTestId('video-grid')).toHaveAttribute('data-expanded', 'true')
    // 其他方格仍在墙里，只是排到放大那格之后
    expect(grid().getByRole('button', { name: 'other.mkv' })).toBeInTheDocument()
  })

  it('展开后窗口转为透明，让底层画面透出来', async () => {
    await openPlayingVideo()

    expect(document.querySelector('.app')).toHaveAttribute('data-video', 'true')
  })

  it('展开时不显示换目录的入口，收起后恢复', async () => {
    await openPlayingVideo()

    // 换目录会让放大格消失，所以看画面时先把入口藏掉
    expect(screen.queryByRole('button', { name: '选择目录' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('folder-strip')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '收起画面' }))

    expect(await screen.findByRole('button', { name: '选择目录' })).toBeInTheDocument()
    expect(screen.getByTestId('folder-strip')).toBeInTheDocument()
  })

  it('点击展开的画面切换播放暂停', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByTestId('expanded-tile'))

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
  })

  it('双击展开画面的右半屏快进 10 秒并浮出提示', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })

    const expanded = screen.getByTestId('expanded-tile')
    vi.spyOn(expanded, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 450,
      right: 800,
      bottom: 450,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.doubleClick(expanded, { clientX: 700, clientY: 200 })

    expect(mocks.seekBy).toHaveBeenCalledWith(10)
    expect(screen.getByText('+10s')).toBeInTheDocument()
    expect(screen.getByTestId('flash-ripple')).toBeInTheDocument()
  })

  it('双击左半屏快退 10 秒', async () => {
    await openPlayingVideo({ position: 30, duration: 100 })

    const expanded = screen.getByTestId('expanded-tile')
    vi.spyOn(expanded, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 450,
      right: 800,
      bottom: 450,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.doubleClick(expanded, { clientX: 100, clientY: 200 })

    expect(mocks.seekBy).toHaveBeenCalledWith(-10)
    expect(screen.getByText('-10s')).toBeInTheDocument()
  })

  it('缓冲时画面中央出现呼吸圈', async () => {
    await openPlayingVideo({ buffering: true })

    await waitFor(() => expect(screen.getByTestId('buffering')).toBeInTheDocument())
  })

  it('从方格进画面时有一层幕布展开', async () => {
    render(<App />)
    await chooseDirectory()

    await userEvent.click(grid().getByRole('button', { name: 'demo.mp4' }))

    expect(await screen.findByTestId('curtain')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('curtain')).not.toBeInTheDocument(), { timeout: 2000 })
  })

  it('点收起画面会暂停并恢复方格墙', async () => {
    await openPlayingVideo()
    mocks.togglePause.mockResolvedValue(true)

    await userEvent.click(screen.getByRole('button', { name: '收起画面' }))

    // 收起走的是「设成暂停」，不是「切一下」：收起可能被连着触发两次
    expect(mocks.pauseVideo).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByTestId('expanded-tile')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('video-grid')).toHaveAttribute('data-expanded', 'false')
    // 收起后控制条仍在
    expect(screen.getByTestId('island')).toBeInTheDocument()
  })

  it('已经在暂停时收起不会重复暂停', async () => {
    await openPlayingVideo({ paused: true })

    await userEvent.click(screen.getByRole('button', { name: '收起画面' }))

    expect(mocks.pauseVideo).not.toHaveBeenCalled()
  })
})

describe('底部控制条', () => {
  it('没播放过视频时不显示', async () => {
    render(<App />)
    await chooseDirectory()

    expect(screen.queryByTestId('island')).not.toBeInTheDocument()
  })

  it('展开后显示文件名与时间', async () => {
    await openPlayingVideo({ position: 30, duration: 120, paused: true })

    const island = screen.getByTestId('island')
    expect(island).toHaveTextContent('demo.mp4')
    await waitFor(() => expect(screen.getByTestId('time-display')).toHaveTextContent('0:30 / 2:00'))
  })

  it('点击按钮会切换成暂停', async () => {
    await openPlayingVideo()
    mocks.togglePause.mockResolvedValue(true)

    await userEvent.click(within(screen.getByTestId('island')).getByRole('button', { name: '暂停' }))

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
  })

  it('拖动进度条松手后跳转，且不弹回旧值', async () => {
    await openPlayingVideo({ position: 10, duration: 100 })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.change(slider, { target: { value: '42' } })
    fireEvent.pointerUp(slider)

    await waitFor(() => expect(mocks.seekTo).toHaveBeenCalledWith(42))
    expect(slider).toHaveValue('42')
  })

  it('拖动进度条时浮出时间气泡', async () => {
    await openPlayingVideo({ position: 10, duration: 100 })
    const slider = screen.getByRole('slider', { name: '播放进度' })

    fireEvent.change(slider, { target: { value: '42' } })

    expect(screen.getByTestId('scrub-bubble')).toHaveTextContent('0:42')

    fireEvent.pointerUp(slider)

    await waitFor(() => expect(screen.queryByTestId('scrub-bubble')).not.toBeInTheDocument())
  })

  it('拖动音量条会设置音量', async () => {
    await openPlayingVideo({ volume: 50 })

    fireEvent.change(screen.getByRole('slider', { name: '音量' }), { target: { value: '80' } })

    await waitFor(() => expect(mocks.setVolume).toHaveBeenCalledWith(80))
  })

  it('点击静音按钮会调用静音切换', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '静音' }))

    expect(mocks.toggleMute).toHaveBeenCalledTimes(1)
  })

  it('静音时图标与 aria 状态同步', async () => {
    await openPlayingVideo({ muted: true })

    expect(screen.getByRole('button', { name: '取消静音' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('从倍速菜单选择档位会设置倍速', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '播放倍速' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: '1.5x' }))

    expect(mocks.setSpeed).toHaveBeenCalledWith(1.5)
  })

  it('倍速菜单按 Esc 收起', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '播放倍速' }))
    expect(screen.getByRole('menuitemradio', { name: '1.5x' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menuitemradio', { name: '1.5x' })).not.toBeInTheDocument()
  })

  it('控制条上的按钮能打开音轨与字幕面板，再按一次收起', async () => {
    await openPlayingVideo()

    const button = screen.getByRole('button', { name: '音轨与字幕' })

    await userEvent.click(button)
    expect(await screen.findByRole('dialog', { name: '音轨与字幕' })).toBeInTheDocument()

    await userEvent.click(button)
    expect(screen.queryByRole('dialog', { name: '音轨与字幕' })).not.toBeInTheDocument()
  })

  it('右上角的按钮能打开设置页，Esc 收起', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(await screen.findByRole('dialog', { name: '设置' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
  })

  /**
   * 回归：教程「说明设置」那一步曾经框住了播放列表按钮。
   *
   * 原因是那一步拿共用的 `.app__tool` 当目标，而顶栏的按钮都带这个类，
   * `querySelector` 取到的是排在最前面的那颗。现在每一步都用专属的
   * `data-tutorial` 钩子，这里把「类名是共用的」这件事也钉住。
   */
  it('教程指「设置」时框的是齿轮，不是顶栏上别的按钮', async () => {
    render(<App />)

    expect(document.querySelectorAll('.app__tool')).toHaveLength(4)
    expect(document.querySelector("[data-tutorial='settings']")).toBe(
      screen.getByRole('button', { name: '设置' }),
    )
  })

  it('空状态里点「看示例视频」会打开自带的示例文件夹', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: '看示例视频' }))

    await waitFor(() => expect(mocks.prepareSampleFolder).toHaveBeenCalledTimes(1))
    // 拿回来的路径要当成普通目录打开，方格墙才会出现
    await waitFor(() => expect(mocks.listDirectory).toHaveBeenCalledWith(mocks.sampleFolder))
    expect(await grid().findByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
  })

  it('全屏按钮调用全屏切换', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '全屏' }))

    expect(mocks.toggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('按方格墙的顺序切下一集，到头了按钮置灰', async () => {
    // demo.mp4 是墙里第一个视频，前面没有上一集
    await openPlayingVideo()

    expect(screen.getByRole('button', { name: '上一集' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一集' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: '下一集' }))

    expect(mocks.playLocalVideo).toHaveBeenLastCalledWith(String.raw`E:\clips\other.mkv`)
    // 换过去之后自己成了最后一个，于是换成上一集能点
    await waitFor(() => expect(screen.getByRole('button', { name: '上一集' })).toBeEnabled())
    expect(screen.getByRole('button', { name: '下一集' })).toBeDisabled()
  })

  it('上一集能回到墙里的前一个', async () => {
    await openPlayingVideo()
    await userEvent.click(screen.getByRole('button', { name: '下一集' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '上一集' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: '上一集' }))

    expect(mocks.playLocalVideo).toHaveBeenLastCalledWith(String.raw`E:\clips\demo.mp4`)
  })
})

describe('首次进入的教程', () => {
  it('第一次进来会弹，关掉之后重开不再弹', async () => {
    window.localStorage.clear()
    const first = render(<App />)

    expect(await screen.findByTestId('tutorial', {}, { timeout: 4000 })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '关闭教程' }))
    expect(screen.queryByTestId('tutorial')).not.toBeInTheDocument()

    // 重开一次：等到开屏走完（教程本该出现的时刻）也不该再弹
    first.unmount()
    render(<App />)

    await waitFor(
      () => expect(document.querySelector('.app')).toHaveAttribute('data-splash', 'done'),
      { timeout: 4000 },
    )
    expect(screen.queryByTestId('tutorial')).not.toBeInTheDocument()
  })

  it('标题栏的「?」随时能把教程叫回来', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: '使用帮助' }))

    expect(await screen.findByTestId('tutorial', {}, { timeout: 4000 })).toBeInTheDocument()
  })
})

describe('键盘快捷键', () => {
  it('空格切换播放暂停', async () => {
    await openPlayingVideo()

    fireEvent.keyDown(window, { code: 'Space' })

    await waitFor(() => expect(mocks.togglePause).toHaveBeenCalledTimes(1))
  })

  it('方向键左右快退快进固定秒数', async () => {
    await openPlayingVideo()

    fireEvent.keyDown(window, { code: 'ArrowRight' })
    fireEvent.keyDown(window, { code: 'ArrowLeft' })
    fireEvent.keyDown(window, { code: 'KeyL' })

    expect(mocks.seekBy).toHaveBeenNthCalledWith(1, 5)
    expect(mocks.seekBy).toHaveBeenNthCalledWith(2, -5)
    expect(mocks.seekBy).toHaveBeenNthCalledWith(3, 10)
  })

  it('上下方向键按步长调整音量', async () => {
    await openPlayingVideo({ volume: 50 })

    fireEvent.keyDown(window, { code: 'ArrowUp' })
    fireEvent.keyDown(window, { code: 'ArrowDown' })

    expect(mocks.setVolume).toHaveBeenNthCalledWith(1, 55)
    expect(mocks.setVolume).toHaveBeenNthCalledWith(2, 45)
  })

  it('方括号调整倍速档位', async () => {
    await openPlayingVideo({ speed: 1 })

    fireEvent.keyDown(window, { code: 'BracketRight' })
    fireEvent.keyDown(window, { code: 'BracketLeft' })

    expect(mocks.setSpeed).toHaveBeenNthCalledWith(1, 1.25)
    expect(mocks.setSpeed).toHaveBeenNthCalledWith(2, 0.75)
  })

  /**
   * 回归：焦点落在进度条上时，方向键曾经「没反应」。
   *
   * 进度条是 `input[type=range]`，原本让它自己吃方向键——可它的 step 是 0.1 秒，
   * 按一下只挪 0.1 秒，肉眼看不出来。现在进度条把方向键交回播放器，5 秒一跳。
   */
  it('焦点在进度条上时，方向键照样快退快进 5 秒', async () => {
    await openPlayingVideo()

    const progress = screen.getByRole('slider', { name: '播放进度' })

    fireEvent.keyDown(progress, { code: 'ArrowRight' })
    fireEvent.keyDown(progress, { code: 'ArrowLeft' })

    expect(mocks.seekBy).toHaveBeenNthCalledWith(1, 5)
    expect(mocks.seekBy).toHaveBeenNthCalledWith(2, -5)
  })

  it('焦点留在进度条上时，空格依然能暂停', async () => {
    await openPlayingVideo()

    fireEvent.keyDown(screen.getByRole('slider', { name: '播放进度' }), { code: 'Space' })

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
  })

  it('没有视频时不响应播放快捷键', async () => {
    render(<App />)
    await chooseDirectory()

    fireEvent.keyDown(window, { code: 'Space' })

    expect(mocks.togglePause).not.toHaveBeenCalled()
  })
})

describe('目录区', () => {
  it('选目录后子目录铺成文件夹条，视频铺成方格，路径进面包屑', async () => {
    render(<App />)

    await chooseDirectory()

    expect(mocks.pickDirectory).toHaveBeenCalledTimes(1)
    // 子目录在中心区域，和方格同一套视觉，不再是侧边栏里的一份列表
    expect(folders().getByRole('button', { name: 'anime' })).toBeInTheDocument()
    expect(grid().getByRole('button', { name: 'other.mkv' })).toBeInTheDocument()
    expect(crumbs()).toHaveAttribute('title', CLIPS)
    expect(crumbs()).toHaveTextContent('clips')
  })

  it('点文件夹会进去，点上一级会回到父目录', async () => {
    render(<App />)
    await chooseDirectory()

    await userEvent.click(folders().getByRole('button', { name: 'anime' }))

    expect(await grid().findByRole('button', { name: 'ep01.mkv' })).toBeInTheDocument()
    expect(mocks.listDirectory).toHaveBeenLastCalledWith(ANIME)
    expect(crumbs()).toHaveAttribute('title', ANIME)

    await userEvent.click(folders().getByRole('button', { name: '上一级' }))

    expect(await grid().findByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
    expect(mocks.listDirectory).toHaveBeenLastCalledWith(CLIPS)
  })

  it('点面包屑里的任意一层直接跳过去', async () => {
    render(<App />)
    await chooseDirectory()

    await userEvent.click(folders().getByRole('button', { name: 'anime' }))
    await grid().findByRole('button', { name: 'ep01.mkv' })

    // 从 E:\clips\anime 点「clips」回到上一层
    await userEvent.click(within(crumbs()).getByRole('button', { name: 'clips' }))

    expect(await grid().findByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
    expect(mocks.listDirectory).toHaveBeenLastCalledWith(CLIPS)
  })

  it('路径太深时只显示最后几层，前面折成省略号', async () => {
    render(<App />)
    mocks.listDirectory.mockImplementation(async () => ({
      directory: String.raw`E:\a\b\c\d`,
      parent: String.raw`E:\a\b\c`,
      entries: [{ name: 'deep.mp4', path: String.raw`E:\a\b\c\d\deep.mp4`, kind: 'video' as const }],
    }))

    await userEvent.click(screen.getByRole('button', { name: '选择目录' }))
    await grid().findByRole('button', { name: 'deep.mp4' })

    expect(crumbs()).toHaveTextContent('…')
    // 只留最后三层：b、c 可点，d 是当前目录
    expect(within(crumbs()).queryByRole('button', { name: 'E:' })).not.toBeInTheDocument()
    expect(within(crumbs()).getByRole('button', { name: 'b' })).toBeInTheDocument()
    expect(within(crumbs()).getByRole('button', { name: 'c' })).toBeInTheDocument()
    expect(within(crumbs()).getByText('d')).toBeInTheDocument()
  })

  it('用户取消选择目录时保持原状', async () => {
    render(<App />)
    mocks.pickDirectory.mockResolvedValueOnce(null)

    await userEvent.click(screen.getByRole('button', { name: '选择目录' }))

    expect(screen.getByText('选一个目录，把里面的视频铺成方格')).toBeInTheDocument()
    expect(screen.queryByTestId('crumbs')).not.toBeInTheDocument()
    expect(screen.queryByTestId('folder-strip')).not.toBeInTheDocument()
    expect(mocks.listDirectory).not.toHaveBeenCalled()
  })

  it('站在盘符根目录时，最前面的入口换成「此电脑」', async () => {
    render(<App />)
    mocks.listDirectory.mockImplementation(async () => ({
      directory: 'E:\\',
      parent: null,
      entries: [],
    }))

    await userEvent.click(screen.getByRole('button', { name: '选择目录' }))

    expect(await screen.findByText('这个目录里没有子目录或视频文件')).toBeInTheDocument()
    // 根目录再往上没有目录可去，但可以换盘
    expect(folders().queryByRole('button', { name: '上一级' })).not.toBeInTheDocument()

    const swap = folders().getByRole('button', { name: '此电脑' })

    expect(swap).toBeEnabled()
    expect(swap.querySelector('rect')).not.toBeNull()
  })

  it('从盘符根目录可以切到别的盘', async () => {
    render(<App />)
    mocks.listDirectory.mockImplementation(async (directory: string) => {
      if (directory === 'E:\\') {
        return { directory: 'E:\\', parent: null, entries: [] }
      }

      if (directory === 'C:\\') {
        return {
          directory: 'C:\\',
          parent: null,
          entries: [{ name: 'win.mp4', path: String.raw`C:\win.mp4`, kind: 'video' as const }],
        }
      }

      return mocks.listing
    })

    await chooseDirectory()
    await userEvent.click(folders().getByRole('button', { name: '上一级' }))
    await userEvent.click(await folders().findByRole('button', { name: '此电脑' }))

    expect(await screen.findByTestId('drives')).toBeInTheDocument()
    expect(mocks.listDrives).toHaveBeenCalledTimes(1)
    // 面包屑也跟着停在「此电脑」
    expect(crumbs()).toHaveTextContent('此电脑')

    await userEvent.click(within(screen.getByTestId('drives')).getByRole('button', { name: 'C:\\' }))

    expect(await grid().findByRole('button', { name: 'win.mp4' })).toBeInTheDocument()
    expect(screen.queryByTestId('drives')).not.toBeInTheDocument()
    expect(crumbs()).toHaveAttribute('title', 'C:\\')
  })
})

describe('进度条悬停预览', () => {
  function hoverAt(slider: HTMLElement, clientX: number) {
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 16,
      right: 200,
      bottom: 16,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerMove(slider, { clientX })
  }

  const previewCalls = () =>
    mocks.thumbnailAt.mock.calls.filter(([, position]) => position === 50).length

  const calledWith = (position: number) =>
    mocks.thumbnailAt.mock.calls.filter(([, value]) => value === position).length

  /** 等缩略图带把 100 秒的片子抽完，免得它的请求干扰后面的断言。 */
  async function waitForStrip(): Promise<void> {
    const times = Array.from({ length: 10 }, (_, index) => Math.round((100 * (index + 0.5)) / 10))

    await waitFor(() => expect(times.every((time) => calledWith(time) > 0)).toBe(true), { timeout: 6000 })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
  }

  it('悬停会抓取对应时间点的画面', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })

    hoverAt(screen.getByRole('slider', { name: '播放进度' }), 100)

    await waitFor(() => expect(previewCalls()).toBe(1), { timeout: 1500 })
    expect(await screen.findByTestId('hover-preview-image')).toBeInTheDocument()
  })

  it('同一时间点走缓存，不重复抓取', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })
    const slider = screen.getByRole('slider', { name: '播放进度' })

    hoverAt(slider, 100)
    await waitFor(() => expect(previewCalls()).toBe(1), { timeout: 1500 })

    fireEvent.pointerLeave(slider)
    hoverAt(slider, 100)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    expect(previewCalls()).toBe(1)
  })

  it('鼠标离开后收起预览', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })
    const slider = screen.getByRole('slider', { name: '播放进度' })

    hoverAt(slider, 100)
    expect(await screen.findByTestId('hover-preview')).toBeInTheDocument()

    fireEvent.pointerLeave(slider)

    expect(screen.queryByTestId('hover-preview')).not.toBeInTheDocument()
  })

  it('缩略图带铺好后，悬停直接取用不再抓帧', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })
    await waitForStrip()

    const before = mocks.thumbnailAt.mock.calls.length

    // 悬停到 45 秒：带里已有这一帧，不该再发请求
    hoverAt(screen.getByRole('slider', { name: '播放进度' }), 90)

    expect(await screen.findByTestId('hover-preview-image')).toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    expect(mocks.thumbnailAt.mock.calls.length).toBe(before)
  })
})
describe('播放列表与收藏夹', () => {
  it('方格上那两颗按钮是加列表和收藏', async () => {
    render(<App />)
    await chooseDirectory()

    expect(screen.getByRole('button', { name: '把 demo.mp4 加入播放列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收藏 demo.mp4' })).toBeInTheDocument()
  })

  it('点一下加进播放列表，按钮跟着变成「移出」', async () => {
    render(<App />)
    await chooseDirectory()

    await userEvent.click(screen.getByRole('button', { name: '把 demo.mp4 加入播放列表' }))

    await waitFor(() => expect(mocks.togglePlaylist).toHaveBeenCalledWith(DEMO))
    // 拿后端返回的列表更新界面：它已经在里面了
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '把 demo.mp4 移出播放列表' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
  })

  it('收藏之后按钮变成已收藏', async () => {
    render(<App />)
    await chooseDirectory()

    await userEvent.click(screen.getByRole('button', { name: '收藏 demo.mp4' }))

    await waitFor(() => expect(mocks.toggleFavorite).toHaveBeenCalledWith(DEMO))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '取消收藏 demo.mp4' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
  })

  it('右上角的按钮打开播放列表，能调顺序、能移出', async () => {
    mocks.collections = { playlist: [DEMO, OTHER], favorites: [] }

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))

    const list = within(await screen.findByTestId('playlist-list'))

    expect(list.getAllByRole('listitem')).toHaveLength(2)
    // 第一条不能再往上挪
    expect(list.getByRole('button', { name: '把 demo.mp4 上移' })).toBeDisabled()

    await userEvent.click(list.getByRole('button', { name: '把 demo.mp4 下移' }))
    await waitFor(() => expect(mocks.shiftInPlaylist).toHaveBeenCalledWith(DEMO, 1))

    await userEvent.click(list.getByRole('button', { name: '把 demo.mp4 从播放列表移出' }))
    await waitFor(() => expect(mocks.togglePlaylist).toHaveBeenCalledWith(DEMO))
  })

  it('列表里的每一行都带封面', async () => {
    mocks.collections = { playlist: [DEMO], favorites: [] }

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))

    const list = await screen.findByTestId('playlist-list')

    // 抓帧是异步的：等那张图落进 img
    await waitFor(() => {
      expect(list.querySelector('.paths__thumb img')).not.toBeNull()
    })
    expect(mocks.thumbnailAt).toHaveBeenCalledWith(DEMO, 0)
  })

  it('播放列表空着的时候告诉用户怎么加进来', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))

    expect(await screen.findByTestId('playlist-empty')).toHaveTextContent('鼠标移到方格上')
  })

  it('收藏夹里点那行小字：跳到所在目录，并把那一格高亮出来', async () => {
    mocks.collections = { playlist: [], favorites: [DEMO] }

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '收藏夹' }))

    const list = within(await screen.findByTestId('favorites-list'))
    await userEvent.click(list.getByRole('button', { name: String.raw`跳到 E:\clips` }))

    await waitFor(() => expect(mocks.listDirectory).toHaveBeenCalledWith(CLIPS))

    const tile = grid().getByRole('button', { name: 'demo.mp4' }).closest('.tile')
    await waitFor(() => expect(tile).toHaveAttribute('data-highlight', 'true'))
  })

  /** 播放列表和收藏夹用同一套行：那行小字两边都有，点了都是「带我去看它在哪」。 */
  it('播放列表里也有那行小字，点了同样跳回目录', async () => {
    mocks.collections = { playlist: [DEMO], favorites: [] }

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))

    const list = within(await screen.findByTestId('playlist-list'))
    await userEvent.click(list.getByRole('button', { name: String.raw`跳到 E:\clips` }))

    await waitFor(() => expect(mocks.listDirectory).toHaveBeenCalledWith(CLIPS))
  })

  /**
   * 收藏夹那行小字是「带我去看这个文件在哪」，不是「播它」。
   * 以前正在播的片子会一直播下去，方格墙还停在放大状态里，高亮根本看不见。
   */
  it('正在播放时从收藏夹跳转：先离开播放画面，而且不会顺手播起来', async () => {
    mocks.collections = { playlist: [], favorites: [DEMO] }

    await openPlayingVideo({ paused: false })
    expect(screen.getByTestId('expanded-tile')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '收藏夹' }))
    const list = within(await screen.findByTestId('favorites-list'))
    await userEvent.click(list.getByRole('button', { name: String.raw`跳到 E:\clips` }))

    // 画面收起来了、也暂停了
    await waitFor(() => expect(screen.queryByTestId('expanded-tile')).not.toBeInTheDocument())
    expect(mocks.pauseVideo).toHaveBeenCalledTimes(1)

    // 只是跳过去看看：除了最开始点方格那一次，没有别的播放
    expect(mocks.playLocalVideo).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(grid().getByRole('button', { name: 'demo.mp4' }).closest('.tile')).toHaveAttribute(
        'data-highlight',
        'true',
      ),
    )
  })

  it('当前视频播完（mpv 进入待机）就自动播列表里的下一个', async () => {
    mocks.collections = { playlist: [DEMO, OTHER], favorites: [] }

    // 先正常播着，再把快照切成「播完」：顺序很重要，
    // 一上来就给待机快照不算数（那正是下一个用例要挡住的假待机）
    await openPlayingVideo()
    mocks.snapshot = { ...mocks.snapshot, idleActive: true }

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenLastCalledWith(OTHER))
  })

  /**
   * 回归：播完自动下一个曾经会「跳过一个」。
   *
   * 刚 `loadfile` 到下一片时 mpv 还没把它拉起来，快照同样是待机；
   * 只看 `idleActive` 就会把「刚切过去」当成「这一片也播完了」，直接再跳一格，
   * 于是第二片被跳过、直接播第三片。
   */
  it('刚切到下一片时那个假待机不会再往下跳一格', async () => {
    mocks.collections = { playlist: [DEMO, OTHER, THIRD], favorites: [] }

    await openPlayingVideo()
    mocks.snapshot = { ...mocks.snapshot, idleActive: true }

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenLastCalledWith(OTHER))

    // 新片还没起来，快照一直是待机：这时不许再跳到第三片
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(mocks.playLocalVideo).toHaveBeenCalledTimes(2)
  })

  it('列表里没有下一个就停在原地', async () => {
    mocks.collections = { playlist: [DEMO], favorites: [] }

    await openPlayingVideo()
    mocks.snapshot = { ...mocks.snapshot, idleActive: true }
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 只有点方格那一次播放
    expect(mocks.playLocalVideo).toHaveBeenCalledTimes(1)
  })

  /**
   * 从列表里点名字播放时，也要切到它所在的目录。
   *
   * 否则：空状态下点一下，视频是播了，但背后的目录区还停在「选择目录」的引导上——
   * 收起画面就露出一块空屏，方格墙、上下集也全都对不上。
   */
  it('从列表里点名字播放时，会先切到它所在的目录', async () => {
    mocks.collections = { playlist: [DEMO], favorites: [] }

    render(<App />)
    expect(screen.getByText('选一个目录，把里面的视频铺成方格')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))
    const list = within(await screen.findByTestId('playlist-list'))
    await userEvent.click(list.getByRole('button', { name: 'demo.mp4' }))

    await waitFor(() => expect(mocks.listDirectory).toHaveBeenCalledWith(CLIPS))
    // 引导语让位给方格墙
    await waitFor(() =>
      expect(screen.queryByText('选一个目录，把里面的视频铺成方格')).not.toBeInTheDocument(),
    )
    expect(mocks.playLocalVideo).toHaveBeenCalledWith(DEMO)
  })
})

describe('记住上次的目录', () => {
  it('启动时把上次打开的目录直接铺回来', async () => {
    mocks.settings = { ...mocks.settings, lastDirectory: CLIPS }

    render(<App />)

    await waitFor(() => expect(mocks.listDirectory).toHaveBeenCalledWith(CLIPS))
    expect(await grid().findByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
  })

  /**
   * 上次那个目录可能已经被删掉或挪走了。
   * 启动时读不到就安静放过——不该一开窗先甩一条错误给用户。
   */
  it('上次的目录读不到时不报错，退回空状态', async () => {
    mocks.settings = { ...mocks.settings, lastDirectory: String.raw`E:\gone` }
    mocks.listDirectory.mockRejectedValueOnce(new Error('目录不存在'))

    render(<App />)

    await waitFor(() => expect(mocks.listDirectory).toHaveBeenCalledWith(String.raw`E:\gone`))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('选一个目录，把里面的视频铺成方格')).toBeInTheDocument()
  })

  it('打开一个目录之后会把它记下来', async () => {
    render(<App />)
    await chooseDirectory()

    await waitFor(() => expect(mocks.rememberDirectory).toHaveBeenCalledWith(CLIPS))
  })
})

describe('播放模式', () => {
  /** 播完当前这一片：把快照切成待机。 */
  async function finishCurrent(): Promise<void> {
    mocks.snapshot = { ...mocks.snapshot, idleActive: true }
  }

  it('列表循环：走到最后一片之后回到第一片', async () => {
    mocks.settings = { ...mocks.settings, playMode: 'list' }
    mocks.collections = { playlist: [DEMO, OTHER], favorites: [] }

    render(<App />)
    await chooseDirectory()
    // 从列表里的最后一片开始
    await userEvent.click(grid().getByRole('button', { name: 'other.mkv' }))
    await waitFor(() => expect(screen.getByTestId('expanded-tile')).toBeInTheDocument())
    await finishCurrent()

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenLastCalledWith(DEMO))
  })

  it('随机：挑一个跟当前不同的', async () => {
    mocks.settings = { ...mocks.settings, playMode: 'shuffle' }
    mocks.collections = { playlist: [DEMO, OTHER, THIRD], favorites: [] }

    await openPlayingVideo()
    await finishCurrent()

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenCalledTimes(2))

    const next = mocks.playLocalVideo.mock.calls[1][0]

    expect([DEMO, OTHER, THIRD]).toContain(next)
    expect(next).not.toBe(DEMO)
  })

  it('面板顶上能切播放模式，并把它存下来', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))
    const modes = within(await screen.findByRole('group', { name: '播放模式' }))
    await userEvent.click(modes.getByRole('button', { name: '随机播放' }))

    await waitFor(() => expect(mocks.setPlayMode).toHaveBeenCalledWith('shuffle'))
    expect(modes.getByRole('button', { name: '随机播放' })).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * 单曲循环：播完还是它自己。
   *
   * 这条正是之前没写成的那个缺口——当时断言「同一个路径又播了一次」稳定失败，
   * 只留下了实现。这里按真实顺序走：先真的播起来（记下「这一片确实播过」），
   * 再切到待机，看它会不会把同一片再放一遍。
   */
  it('单曲循环：播完还是它自己', async () => {
    mocks.settings = { ...mocks.settings, playMode: 'single' }
    mocks.collections = { playlist: [DEMO, OTHER], favorites: [] }

    await openPlayingVideo()
    expect(mocks.playLocalVideo).toHaveBeenCalledTimes(1)

    await finishCurrent()

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenCalledTimes(2))
    expect(mocks.playLocalVideo).toHaveBeenLastCalledWith(DEMO)
    // 而且只放两回：待机状态会在每次轮询里反复出现，多跳就会一直重放
    expect(mocks.playLocalVideo.mock.calls.filter(([path]) => path === DEMO)).toHaveLength(2)
  })
})

describe('播放工具面板', () => {
  /** 点右上角那颗 🧰，等面板出来。 */
  async function openTools(): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))

    return screen.findByTestId('playback-tools')
  }

  it('没在播放时章节是空状态，播放之后列得出来，点一下跳过去', async () => {
    render(<App />)

    const idlePanel = await openTools()
    expect(await within(idlePanel).findByTestId('tools-chapters-empty')).toHaveTextContent(
      '先放一个视频',
    )

    // 关掉面板去挑片，再打开来看章节
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))
    await chooseDirectory()

    mocks.getChapters.mockResolvedValue([
      { index: 0, title: '开场', time: 0 },
      { index: 1, title: '正片', time: 65 },
    ])

    await userEvent.click(grid().getByRole('button', { name: 'demo.mp4' }))
    await waitFor(() => expect(screen.getByTestId('expanded-tile')).toBeInTheDocument())

    const panel = await openTools()

    const chapter = await within(panel).findByRole('button', { name: /正片/ })
    await userEvent.click(chapter)

    await waitFor(() => expect(mocks.selectChapter).toHaveBeenCalledWith(1))
  })

  it('设 A / 设 B 用的是当前位置，清除把两端一起清', async () => {
    // 假后端也要真的记住这两个点，界面才拿得到「设完之后」的状态
    let points: { a: number | null; b: number | null } = { a: null, b: null }

    mocks.getLoopPoints.mockImplementation(async () => points)
    mocks.setLoopA.mockImplementation(async (seconds: number | null) => {
      points = { ...points, a: seconds }
    })
    mocks.setLoopB.mockImplementation(async (seconds: number | null) => {
      points = { ...points, b: seconds }
    })

    await openPlayingVideo({ position: 33 })
    const panel = await openTools()

    await userEvent.click(await within(panel).findByRole('button', { name: /设 A/ }))
    await waitFor(() => expect(mocks.setLoopA).toHaveBeenCalledWith(33))
    await waitFor(() => expect(panel).toHaveTextContent('A 点 0:33'))

    await userEvent.click(within(panel).getByRole('button', { name: /设 B/ }))
    await waitFor(() => expect(mocks.setLoopB).toHaveBeenCalledWith(33))
    await waitFor(() => expect(panel).toHaveTextContent('B 点 0:33'))

    await userEvent.click(within(panel).getByRole('button', { name: '清除' }))
    await waitFor(() => expect(mocks.setLoopA).toHaveBeenCalledWith(null))
    expect(mocks.setLoopB).toHaveBeenCalledWith(null)
    await waitFor(() => expect(panel).toHaveTextContent('A 点 未设'))
  })

  it('选了定时时长就显示倒计时，动作默认是暂停', async () => {
    await openPlayingVideo()
    const panel = await openTools()

    await userEvent.click(await within(panel).findByRole('button', { name: '15 分' }))

    expect(await within(panel).findByTestId('tools-sleep')).toHaveTextContent('就暂停')
    expect(within(panel).getByRole('button', { name: '15 分' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // 换成「退出应用」，倒计时还在
    await userEvent.click(within(panel).getByRole('button', { name: '退出应用' }))
    expect(await within(panel).findByTestId('tools-sleep')).toHaveTextContent('就退出')

    // 关掉之后回到提示语
    await userEvent.click(within(panel).getByRole('button', { name: '关闭定时' }))
    expect(await within(panel).findByTestId('tools-sleep')).toHaveTextContent('到点之后自动动手')
  })

  it('置顶与迷你模式都会落盘，迷你模式把界面收成一小块', async () => {
    render(<App />)
    await chooseDirectory()
    const panel = await openTools()

    await userEvent.click(within(panel).getByRole('checkbox', { name: /窗口置顶/ }))
    await waitFor(() => expect(mocks.rememberAlwaysOnTop).toHaveBeenCalledWith(true))

    await userEvent.click(within(panel).getByRole('checkbox', { name: /迷你模式/ }))
    await waitFor(() => expect(mocks.rememberMiniMode).toHaveBeenCalledWith(true))
    await waitFor(() => expect(document.querySelector('.app')).toHaveAttribute('data-mini', 'true'))

    // 顶栏收起来了，出口得留在画面上
    await userEvent.click(screen.getByRole('button', { name: '退出迷你模式' }))
    await waitFor(() => expect(document.querySelector('.app')).toHaveAttribute('data-mini', 'false'))
    expect(mocks.rememberMiniMode).toHaveBeenLastCalledWith(false)
  })

  it('打开地址会把地址交给内核', async () => {
    render(<App />)
    const panel = await openTools()

    await userEvent.type(within(panel).getByRole('textbox', { name: '视频地址' }), 'https://a.test/b.mkv')
    await userEvent.click(within(panel).getByRole('button', { name: '打开' }))

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenCalledWith('https://a.test/b.mkv'))
  })

  /**
   * 网址没有对应的方格：放大播放时整块目录区要收掉，
   * 否则空状态里那句「选一个目录…」会一直挂在画面中间。
   */
  it('从空状态打开网址：中间那句引导要收起来', async () => {
    render(<App />)
    const panel = await openTools()

    await userEvent.type(
      within(panel).getByRole('textbox', { name: '视频地址' }),
      'https://a.test/b.mkv',
    )
    await userEvent.click(within(panel).getByRole('button', { name: '打开' }))

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenCalledWith('https://a.test/b.mkv'))
    expect(screen.queryByText(/选一个目录/)).toBeNull()
    expect(await screen.findByText('b.mkv')).toBeInTheDocument()
  })
})

describe('方格墙的搜索与排序', () => {
  it('按名字过滤，过滤空了给的是「没有匹配」', async () => {
    render(<App />)
    await chooseDirectory()

    await userEvent.type(screen.getByRole('searchbox', { name: '搜索这个目录' }), 'demo')

    await waitFor(() => expect(grid().queryByRole('button', { name: 'other.mkv' })).toBeNull())
    expect(grid().getByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()

    await userEvent.clear(screen.getByRole('searchbox', { name: '搜索这个目录' }))
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索这个目录' }), 'zzz')

    expect(await screen.findByText(/没有名字里有「zzz」的条目/)).toBeInTheDocument()
  })

  it('可以按名字倒序排', async () => {
    render(<App />)
    await chooseDirectory()

    const demo = grid().getByRole('button', { name: 'demo.mp4' })
    const other = grid().getByRole('button', { name: 'other.mkv' })

    // 默认正序：demo 在 other 前面
    expect(demo.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '名称 ↓' }))

    await waitFor(() =>
      expect(
        other.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy(),
    )
  })

  it('搜索框里按 Esc 清空', async () => {
    render(<App />)
    await chooseDirectory()

    const search = screen.getByRole('searchbox', { name: '搜索这个目录' })
    await userEvent.type(search, 'demo')
    await waitFor(() => expect(grid().queryByRole('button', { name: 'other.mkv' })).toBeNull())

    fireEvent.keyDown(search, { key: 'Escape' })

    expect(search).toHaveValue('')
    await waitFor(() =>
      expect(grid().getByRole('button', { name: 'other.mkv' })).toBeInTheDocument(),
    )
  })
})

describe('逐帧快捷键', () => {
  it('句号往前走一帧，逗号往后退一帧', async () => {
    await openPlayingVideo()

    fireEvent.keyDown(window, { code: 'Period' })
    await waitFor(() => expect(mocks.stepFrame).toHaveBeenCalledWith(true))

    fireEvent.keyDown(window, { code: 'Comma' })
    await waitFor(() => expect(mocks.stepFrame).toHaveBeenCalledWith(false))
  })
})

describe('播放列表导出 / 导入', () => {
  /** 打开播放列表面板。 */
  async function openPlaylist(): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))

    return screen.getByRole('dialog', { name: '播放列表' })
  }

  it('导出走后端，并把写到哪儿显示出来', async () => {
    mocks.collections = { playlist: [DEMO, OTHER], favorites: [] }
    render(<App />)

    const dialog = await openPlaylist()

    await userEvent.click(within(dialog).getByRole('button', { name: '导出 .m3u8' }))

    await waitFor(() => expect(mocks.exportCollection).toHaveBeenCalledWith('playlist'))
    expect(await screen.findByTestId('playlist-notice')).toHaveTextContent('playlist.m3u8')
  })

  it('导入会把并好的列表铺回来，并说清楚现在有几个', async () => {
    mocks.importPlaylist.mockResolvedValue({ playlist: [DEMO, OTHER], favorites: [] })
    render(<App />)

    const dialog = await openPlaylist()

    await userEvent.click(within(dialog).getByRole('button', { name: '导入 .m3u8' }))

    await waitFor(() => expect(mocks.importPlaylist).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('playlist-notice')).toHaveTextContent('2 个视频')
    expect(screen.getByTestId('playlist-list')).toHaveTextContent('other.mkv')
  })

  /** 用户点「取消」时后端给的是 null：什么都不该变，也不该弹错误。 */
  it('导入取消时列表和提示都不动', async () => {
    mocks.collections = { playlist: [DEMO], favorites: [] }
    mocks.importPlaylist.mockResolvedValue(null)
    render(<App />)

    const dialog = await openPlaylist()

    await userEvent.click(within(dialog).getByRole('button', { name: '导入 .m3u8' }))

    await waitFor(() => expect(mocks.importPlaylist).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('playlist-notice')).toBeNull()
    expect(screen.getByTestId('playlist-list')).toHaveTextContent('demo.mp4')
  })
})

describe('最近播放', () => {
  it('列出来，点一条直接播', async () => {
    mocks.getRecent.mockResolvedValue({
      entries: [
        { path: DEMO, playedAt: 200, position: 65 },
        { path: OTHER, playedAt: 100, position: 0 },
      ],
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))

    const list = await screen.findByTestId('tools-recent')

    // 看过的显示停在哪，没看过的显示「从头」
    // 用 ^ 锚住文件名：每行还有一颗「从最近播放里去掉 …」的按钮，也带文件名
    expect(within(list).getByRole('button', { name: /^demo\.mp4/ })).toHaveTextContent('1:05')
    expect(within(list).getByRole('button', { name: /^other\.mkv/ })).toHaveTextContent('从头')

    await userEvent.click(within(list).getByRole('button', { name: /^demo\.mp4/ }))

    await waitFor(() => expect(mocks.playLocalVideo).toHaveBeenCalledWith(DEMO))
  })

  it('清空之后回到空状态', async () => {
    mocks.getRecent.mockResolvedValue({
      entries: [{ path: DEMO, playedAt: 200, position: 65 }],
    })
    mocks.clearRecent.mockResolvedValue({ entries: [] })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))
    await screen.findByTestId('tools-recent')

    await userEvent.click(screen.getByRole('button', { name: '清空' }))

    await waitFor(() => expect(mocks.clearRecent).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('tools-recent-empty')).toBeInTheDocument()
  })
})

describe('列表清空与单条移除', () => {
  /** 清空会丢东西，所以要点两下；第一下只把按钮变成「确认清空？」。 */
  it('清空要按两下，第二下才真的清', async () => {
    mocks.collections = { playlist: [DEMO, OTHER], favorites: [] }
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: '播放列表' }))
    const dialog = screen.getByRole('dialog', { name: '播放列表' })

    await userEvent.click(within(dialog).getByRole('button', { name: '清空' }))

    expect(within(dialog).getByRole('button', { name: '确认清空？' })).toBeInTheDocument()
    expect(mocks.clearCollection).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: '确认清空？' }))

    await waitFor(() => expect(mocks.clearCollection).toHaveBeenCalledWith('playlist'))
    expect(await screen.findByTestId('playlist-notice')).toHaveTextContent('播放列表已清空')
    expect(await screen.findByTestId('playlist-empty')).toBeInTheDocument()
  })

  it('最近播放点 ✕ 只去掉那一条', async () => {
    mocks.getRecent.mockResolvedValue({
      entries: [
        { path: DEMO, playedAt: 200, position: 65 },
        { path: OTHER, playedAt: 100, position: 0 },
      ],
    })
    mocks.forgetRecent.mockResolvedValue({
      entries: [{ path: OTHER, playedAt: 100, position: 0 }],
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))
    const list = await screen.findByTestId('tools-recent')

    await userEvent.click(
      within(list).getByRole('button', { name: '从最近播放里去掉 demo.mp4' }),
    )

    await waitFor(() => expect(mocks.forgetRecent).toHaveBeenCalledWith(DEMO))
    await waitFor(() =>
      expect(within(list).queryByRole('button', { name: /^demo\.mp4/ })).toBeNull(),
    )
    expect(within(list).getByRole('button', { name: /^other\.mkv/ })).toBeInTheDocument()
  })
})

describe('书签', () => {
  const bookmark = (path: string, position: number) => ({ path, position, createdAt: 100 })

  /** 打开播放工具面板。 */
  async function openTools(): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))

    return screen.findByTestId('playback-tools')
  }

  it('只列当前这部片子的书签，点一条跳到那个时间点', async () => {
    mocks.getBookmarks.mockResolvedValue({
      entries: [bookmark(DEMO, 65), bookmark(OTHER, 12)],
    })

    await openPlayingVideo()
    const panel = await openTools()
    const list = await within(panel).findByTestId('tools-bookmarks')

    expect(within(list).getByRole('button', { name: '1:05' })).toBeInTheDocument()
    // 别的片子的书签不该出现在当前文件下面
    expect(within(list).queryByRole('button', { name: '0:12' })).toBeNull()

    await userEvent.click(within(list).getByRole('button', { name: '1:05' }))

    await waitFor(() => expect(mocks.seekTo).toHaveBeenCalledWith(65))
  })

  it('在当前位置加一条，位置用的是播放进度', async () => {
    mocks.addBookmark.mockResolvedValue({ entries: [bookmark(DEMO, 65)] })

    await openPlayingVideo({ position: 65 })
    const panel = await openTools()

    await userEvent.click(within(panel).getByRole('button', { name: '在 1:05 加' }))

    await waitFor(() => expect(mocks.addBookmark).toHaveBeenCalledWith(DEMO, 65))
    expect(await within(panel).findByTestId('tools-bookmarks')).toHaveTextContent('1:05')
  })

  it('✕ 只去掉那一条书签', async () => {
    mocks.getBookmarks.mockResolvedValue({
      entries: [bookmark(DEMO, 65), bookmark(DEMO, 90)],
    })
    mocks.removeBookmark.mockResolvedValue({ entries: [bookmark(DEMO, 90)] })

    await openPlayingVideo()
    const panel = await openTools()
    const list = await within(panel).findByTestId('tools-bookmarks')

    await userEvent.click(within(list).getByRole('button', { name: '去掉 1:05 的书签' }))

    await waitFor(() => expect(mocks.removeBookmark).toHaveBeenCalledWith(DEMO, 65))
    await waitFor(() => expect(within(list).queryByRole('button', { name: '1:05' })).toBeNull())
    expect(within(list).getByRole('button', { name: '1:30' })).toBeInTheDocument()
  })
})

describe('输入设备', () => {
  it('选中摄像头再打开：后端拿到名字，灵动岛显示它', async () => {
    mocks.getCaptureDevices.mockResolvedValue({
      cameras: ['Integrated Camera', 'USB Capture'],
      microphones: ['麦克风 (Realtek)'],
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))
    const panel = await screen.findByTestId('playback-tools')

    const camera = await within(panel).findByRole('combobox', { name: '摄像头' })
    // 默认选中第一个，省一次点击
    expect(camera).toHaveValue('Integrated Camera')

    await userEvent.selectOptions(camera, 'USB Capture')
    await userEvent.click(within(panel).getByRole('button', { name: '打开摄像头' }))

    await waitFor(() =>
      expect(mocks.playCaptureDevice).toHaveBeenCalledWith('video', 'USB Capture'),
    )

    // 面板关掉之后，灵动岛上是设备名（不是 av://dshow: 地址）
    expect(await screen.findByText('USB Capture')).toBeInTheDocument()
  })

  it('没有找到设备时给一句空状态', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))

    expect(await screen.findByTestId('tools-devices-empty')).toHaveTextContent('没有找到')
  })
})

describe('在线视频（yt-dlp）', () => {
  it('没装 yt-dlp 时在地址栏下面说明，装了就不啰嗦', async () => {
    mocks.getBackendStatus.mockResolvedValue({
      kind: 'tauri',
      mpvAvailable: true,
      mpvVersion: '0.41.0',
      mpvPath: 'C:/mpv/mpv.exe',
      ytdlAvailable: false,
      message: '播放内核 mpv 0.41.0',
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))

    expect(await screen.findByTestId('tools-ytdl-missing')).toHaveTextContent('yt-dlp')
  })

  it('装了 yt-dlp 就不显示那条提示', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '播放工具' }))
    await screen.findByTestId('playback-tools')

    expect(screen.queryByTestId('tools-ytdl-missing')).toBeNull()
  })
})

describe('打开失败', () => {
  /** 后端拒绝时不能留在「0:00 在播」的假状态上。 */
  it('报错，并且把展开的画面收回去', async () => {
    mocks.playLocalVideo.mockRejectedValueOnce(new Error('打不开这个文件'))

    render(<App />)
    await chooseDirectory()
    await userEvent.click(grid().getByRole('button', { name: 'demo.mp4' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('打不开这个文件')
    expect(screen.queryByTestId('expanded-tile')).toBeNull()
  })
})
