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
