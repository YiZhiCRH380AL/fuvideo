import { invoke } from '@tauri-apps/api/core'

export type BackendKind = 'tauri' | 'browser'

export interface BackendStatus {
  kind: BackendKind
  mpvAvailable: boolean
  mpvVersion: string | null
  mpvPath: string | null
  /** 直接展示给用户的一句话说明 */
  message: string
}

interface MpvProbe {
  available: boolean
  version: string | null
  path: string | null
}

export interface PlayerSnapshot {
  hasMedia: boolean
  ipcReady: boolean
  path: string | null
  position: number
  duration: number
  paused: boolean
  volume: number
  muted: boolean
  speed: number
  buffering: boolean
}

/** 一条轨道：视频、音频或字幕。 */
export interface TrackInfo {
  id: number
  kind: string
  title: string | null
  lang: string | null
  codec: string | null
  selected: boolean
  /** 外挂轨道（比如手动挂上的字幕文件）。 */
  external: boolean
  default: boolean
}

/** 播放详情：轨道表，以及当前真正生效的硬解后端。 */
export interface PlayerDetails {
  path: string | null
  tracks: TrackInfo[]
  hwdecCurrent: string | null
  /** 第二字幕（双语字幕的第二条）；`null` 表示没开。 */
  secondarySubtitleId: number | null
  audioDelay: number
  subtitleDelay: number
  subtitleFontSize: number
  subtitlePosition: number
  /** ASS 字幕的样式覆盖模式：`scale` 跟着文件走，`force` 用播放器的字号与位置。 */
  subtitleStyle: string
  audioChannels: string
  audioDevice: string
  audioExclusive: boolean
}

/** 一个音频输出设备。展示用 description，切换时传 name。 */
export interface AudioDevice {
  name: string
  description: string
}

/**
 * 全局播放偏好。
 *
 * `null` 表示「没设置过」——对应到 mpv 就是完全不传这个参数，
 * 让 mpv 用自己的默认值。这和「设置成默认值」不是一回事。
 */
export interface PlayerSettings {
  hwdec: string
  savePosition: boolean
  subAuto: string | null
  subFontSize: number | null
  subPosition: number | null
  subAssOverride: string | null
  audioChannels: string | null
  audioDevice: string | null
  audioExclusive: boolean
}

/** 和 Rust 侧 `Settings::default()` 保持一致。 */
export const DEFAULT_SETTINGS: PlayerSettings = {
  hwdec: 'auto-safe',
  savePosition: true,
  subAuto: null,
  subFontSize: null,
  subPosition: null,
  subAssOverride: null,
  audioChannels: null,
  audioDevice: null,
  audioExclusive: false,
}

const IDLE_DETAILS: PlayerDetails = {
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
}

export type BrowseKind = 'directory' | 'video'

export interface BrowseEntry {
  name: string
  path: string
  kind: BrowseKind
}

export interface DirectoryListing {
  directory: string
  /** 上一级目录；已经在盘符根目录时为 null。 */
  parent: string | null
  entries: BrowseEntry[]
}

const IDLE_SNAPSHOT: PlayerSnapshot = {
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
}

/** 是否跑在 Tauri 外壳里。浏览器里打开时返回 false。 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function describeProbe(probe: MpvProbe): BackendStatus {
  if (!probe.available) {
    return {
      kind: 'tauri',
      mpvAvailable: false,
      mpvVersion: null,
      mpvPath: null,
      message: '未检测到 mpv，播放内核不可用',
    }
  }

  return {
    kind: 'tauri',
    mpvAvailable: true,
    mpvVersion: probe.version,
    mpvPath: probe.path,
    message: probe.version ? `播放内核 mpv ${probe.version}` : '播放内核 mpv 已就绪',
  }
}

/** 查询当前的运行环境与播放内核状态。 */
export async function getBackendStatus(): Promise<BackendStatus> {
  if (!isTauri()) {
    return {
      kind: 'browser',
      mpvAvailable: false,
      mpvVersion: null,
      mpvPath: null,
      message: '当前在浏览器中运行，播放功能需要在桌面应用中打开',
    }
  }

  const probe = await invoke<MpvProbe>('probe_mpv')
  return describeProbe(probe)
}

/** 弹出系统文件选择框，返回选中的视频路径；用户取消时返回 null。 */
export async function pickVideoFile(): Promise<string | null> {
  if (!isTauri()) {
    return null
  }

  return invoke<string | null>('pick_video_file')
}

/** 交给 mpv 播放指定路径的视频。 */
export async function playLocalVideo(path: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('播放功能需要在桌面应用中运行')
  }

  await invoke('play_video', { path })
}

/** 读取播放位置、总时长与暂停状态。 */
export async function getPlayerState(): Promise<PlayerSnapshot> {
  if (!isTauri()) {
    return IDLE_SNAPSHOT
  }

  return invoke<PlayerSnapshot>('player_state')
}

/**
 * 读取播放详情：轨道表与当前生效的硬解后端。
 *
 * 轨道表是数组，塞进 300ms 一次的高频快照会把轮询拖慢，所以单独开一条通道：
 * 界面在需要的时候（比如展开音轨面板）才拉一次。
 */
export async function getPlayerDetails(): Promise<PlayerDetails> {
  if (!isTauri()) {
    return IDLE_DETAILS
  }

  return invoke<PlayerDetails>('player_details')
}

/** 读取全局偏好。读不到时退回默认值，不让界面卡在加载态。 */
export async function readSettings(): Promise<PlayerSettings> {
  if (!isTauri()) {
    return DEFAULT_SETTINGS
  }

  return invoke<PlayerSettings>('read_settings')
}

/** 写入全局偏好，返回实际生效的取值（越界的值会被折回）。 */
export async function writeSettings(settings: PlayerSettings): Promise<PlayerSettings> {
  if (!isTauri()) {
    throw new Error('设置需要在桌面应用中修改')
  }

  return invoke<PlayerSettings>('write_settings', { settings })
}

/** 在播放与暂停之间切换，返回切换后的暂停状态。 */
export async function togglePause(): Promise<boolean> {
  if (!isTauri()) {
    throw new Error('播放控制需要在桌面应用中运行')
  }

  return invoke<boolean>('toggle_pause')
}

/**
 * 播放控制类命令的统一入口。
 *
 * 这些命令都是一行 invoke，差别只在名字和参数；浏览器里一律给出可读错误，
 * 而不是让 invoke 抛一个看不懂的失败。
 */
async function playerCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('播放控制需要在桌面应用中运行')
  }

  return invoke<T>(command, args)
}

/** 列出音频输出设备。展开音轨面板时拉一次。 */
export function getAudioDevices(): Promise<AudioDevice[]> {
  return playerCommand<AudioDevice[]>('audio_devices')
}

/** 切换音轨；传 null 表示关掉音频。 */
export function setAudioTrack(id: number | null): Promise<void> {
  return playerCommand<void>('set_audio_track', { id })
}

/** 切换字幕轨；传 null 表示关闭字幕。 */
export function setSubtitleTrack(id: number | null): Promise<void> {
  return playerCommand<void>('set_subtitle_track', { id })
}

/** 选第二字幕做双语；传 null 表示关掉。 */
export function setSecondarySubtitle(id: number | null): Promise<void> {
  return playerCommand<void>('set_secondary_subtitle', { id })
}

/** 弹框选一个字幕文件挂上去。用户取消时返回 null。 */
export function addSubtitleFile(): Promise<string | null> {
  return playerCommand<string | null>('add_subtitle_file')
}

/** 弹框选一个音频文件当外挂音轨。用户取消时返回 null。 */
export function addAudioFile(): Promise<string | null> {
  return playerCommand<string | null>('add_audio_file')
}

/** 音频延迟，正数表示声音晚一点出来。 */
export function setAudioDelay(seconds: number): Promise<void> {
  return playerCommand<void>('set_audio_delay', { seconds })
}

/** 字幕延迟，正数表示字幕晚一点出来。 */
export function setSubtitleDelay(seconds: number): Promise<void> {
  return playerCommand<void>('set_subtitle_delay', { seconds })
}

/** 字幕字号。这是全局偏好，下次启动也用它。 */
export function setSubtitleFontSize(size: number): Promise<void> {
  return playerCommand<void>('set_subtitle_font_size', { size })
}

/** 字幕垂直位置：0 在顶部，100 在底部。同样是全局偏好。 */
export function setSubtitlePosition(position: number): Promise<void> {
  return playerCommand<void>('set_subtitle_position', { position })
}

/** ASS 字幕的样式覆盖模式。 */
export function setSubtitleStyleOverride(mode: string): Promise<void> {
  return playerCommand<void>('set_subtitle_style_override', { mode })
}

/** 声道布局，取值见 `AUDIO_CHANNEL_OPTIONS`。 */
export function setAudioChannels(channels: string): Promise<void> {
  return playerCommand<void>('set_audio_channels', { channels })
}

/** 切换音频输出设备，设备名来自 `getAudioDevices`。 */
export function setAudioDevice(device: string): Promise<void> {
  return playerCommand<void>('set_audio_device', { device })
}

/** 独占模式：开着会独占设备，别的程序就出不了声。 */
export function setAudioExclusive(enabled: boolean): Promise<void> {
  return playerCommand<void>('set_audio_exclusive', { enabled })
}

/** 跳转到指定秒数。 */
export async function seekTo(position: number): Promise<void> {
  if (!isTauri()) {
    throw new Error('播放控制需要在桌面应用中运行')
  }

  await invoke('seek_to', { position })
}

/** 相对当前位置前后跳转，秒数为正表示前进。 */
export async function seekBy(offset: number): Promise<void> {
  if (!isTauri()) {
    throw new Error('播放控制需要在桌面应用中运行')
  }

  await invoke('seek_by', { offset })
}

/** 设置音量（0-100）。 */
export async function setVolume(volume: number): Promise<void> {
  if (!isTauri()) {
    throw new Error('播放控制需要在桌面应用中运行')
  }

  await invoke('set_volume', { volume })
}

/** 静音开关，返回切换后的静音状态。 */
export async function toggleMute(): Promise<boolean> {
  if (!isTauri()) {
    throw new Error('播放控制需要在桌面应用中运行')
  }

  return invoke<boolean>('toggle_mute')
}

/** 设置播放倍速。 */
export async function setSpeed(speed: number): Promise<void> {
  if (!isTauri()) {
    throw new Error('播放控制需要在桌面应用中运行')
  }

  await invoke('set_speed', { speed })
}

/** 切换全屏，返回切换后的全屏状态。 */
export async function toggleFullscreen(): Promise<boolean> {
  if (!isTauri()) {
    throw new Error('全屏需要在桌面应用中运行')
  }

  return invoke<boolean>('toggle_fullscreen')
}

/** 弹出目录选择框，返回选中的目录；用户取消时返回 null。 */
export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) {
    return null
  }

  return invoke<string | null>('pick_directory')
}

/** 列出目录下的子目录与视频文件。 */
export async function listDirectory(directory: string): Promise<DirectoryListing> {
  if (!isTauri()) {
    return { directory, parent: null, entries: [] }
  }

  return invoke<DirectoryListing>('list_directory', { directory })
}

/** 列出可以进去的顶层入口（各盘符）。盘符根目录再往上就是这里，不然换不了盘。 */
export async function listDrives(): Promise<string[]> {
  if (!isTauri()) {
    return []
  }

  return invoke<string[]>('list_drives')
}

/** 抓取指定视频在指定时间点的画面，返回可直接显示的 data URL。 */
export async function thumbnailAt(source: string, position: number): Promise<string> {
  if (!isTauri()) {
    throw new Error('画面预览需要在桌面应用中运行')
  }

  return invoke<string>('thumbnail_at', { source, position })
}
