import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DirectoryListing, PlayerSnapshot } from './lib/backend'

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
}

const CLIPS = String.raw`E:\clips`
const ANIME = String.raw`E:\clips\anime`

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
    } as PlayerSnapshot,
    togglePause: vi.fn(async () => false),
    seekTo: vi.fn(async (_position: number) => {}),
    seekBy: vi.fn(async (_offset: number) => {}),
    setVolume: vi.fn(async (_volume: number) => {}),
    toggleMute: vi.fn(async () => true),
    setSpeed: vi.fn(async (_speed: number) => {}),
    toggleFullscreen: vi.fn(async () => true),
    playLocalVideo: vi.fn(async (_path: string) => {}),
    pickDirectory: vi.fn(async (): Promise<string | null> => String.raw`E:\clips`),
    listDirectory: vi.fn(async (_directory: string): Promise<DirectoryListing> => listing),
    thumbnailAt: vi.fn(async (_position: number) => 'data:image/jpeg;base64,AAAA'),
  }
})

vi.mock('./lib/backend', () => ({
  isTauri: () => true,
  getBackendStatus: async () => ({
    kind: 'tauri',
    mpvAvailable: true,
    mpvVersion: '0.41.0',
    mpvPath: 'C:/mpv/mpv.exe',
    message: '播放内核 mpv 0.41.0',
  }),
  pickVideoFile: async () => String.raw`E:\clips\demo.mp4`,
  playLocalVideo: (path: string) => mocks.playLocalVideo(path),
  getPlayerState: async () => mocks.snapshot,
  togglePause: () => mocks.togglePause(),
  seekTo: (position: number) => mocks.seekTo(position),
  seekBy: (offset: number) => mocks.seekBy(offset),
  setVolume: (volume: number) => mocks.setVolume(volume),
  toggleMute: () => mocks.toggleMute(),
  setSpeed: (speed: number) => mocks.setSpeed(speed),
  toggleFullscreen: () => mocks.toggleFullscreen(),
  pickDirectory: () => mocks.pickDirectory(),
  listDirectory: (directory: string) => mocks.listDirectory(directory),
  thumbnailAt: (position: number) => mocks.thumbnailAt(position),
}))

import App from './App'

beforeEach(() => {
  mocks.snapshot = { ...IDLE }
  mocks.togglePause.mockClear()
  mocks.togglePause.mockResolvedValue(false)
  mocks.seekTo.mockClear()
  mocks.seekBy.mockClear()
  mocks.setVolume.mockClear()
  mocks.toggleMute.mockClear()
  mocks.toggleMute.mockResolvedValue(true)
  mocks.setSpeed.mockClear()
  mocks.toggleFullscreen.mockClear()
  mocks.playLocalVideo.mockClear()
  mocks.pickDirectory.mockClear()
  mocks.listDirectory.mockClear()
  mocks.listDirectory.mockImplementation(async (directory: string) =>
    directory === ANIME ? mocks.subListing : mocks.listing,
  )
  mocks.thumbnailAt.mockClear()
  mocks.thumbnailAt.mockResolvedValue('data:image/jpeg;base64,AAAA')
})

async function openVideo() {
  const button = screen.getByRole('button', { name: '选择视频文件' })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
}

/** 载入一个正在播放的视频，返回已就绪的界面。 */
async function openPlayingVideo(overrides: Partial<PlayerSnapshot> = {}) {
  mocks.snapshot = {
    hasMedia: true,
    ipcReady: true,
    path: String.raw`E:\clips\demo.mp4`,
    position: 0,
    duration: 120,
    paused: false,
    volume: 50,
    muted: false,
    speed: 1,
    ...overrides,
  }

  render(<App />)
  await openVideo()
  // 用进度条是否可用判断播放状态已经到位，与暂停与否无关
  await waitFor(() => expect(screen.getByRole('slider', { name: '播放进度' })).toBeEnabled())
}

describe('播放控制', () => {
  it('加载视频后收起空状态，并在标题栏显示文件名', async () => {
    render(<App />)

    expect(screen.getByText('把视频拖进来，或')).toBeInTheDocument()

    await openVideo()

    await waitFor(() => {
      expect(screen.queryByText('把视频拖进来，或')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('current-file')).toHaveTextContent('demo.mp4')
  })

  it('播放中点击按钮会切换成暂停', async () => {
    await openPlayingVideo()
    mocks.togglePause.mockResolvedValue(true)

    await userEvent.click(screen.getByRole('button', { name: '暂停' }))

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument()
    })
  })

  it('显示播放位置与总时长', async () => {
    await openPlayingVideo({ position: 30, duration: 60, paused: true })

    await waitFor(() => {
      expect(screen.getByTestId('time-display')).toHaveTextContent('0:30 / 1:00')
    })
    expect(screen.getByRole('slider', { name: '播放进度' })).toHaveValue('30')
  })

  it('拖动进度条松手后跳转到对应位置', async () => {
    await openPlayingVideo({ position: 10, duration: 100 })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.change(slider, { target: { value: '42' } })
    fireEvent.pointerUp(slider)

    await waitFor(() => expect(mocks.seekTo).toHaveBeenCalledWith(42))
  })

  it('松手后进度条停在目标位置，不会被尚未更新的状态拉回去', async () => {
    await openPlayingVideo({ position: 10, duration: 100 })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.change(slider, { target: { value: '42' } })
    fireEvent.pointerUp(slider)

    await waitFor(() => expect(mocks.seekTo).toHaveBeenCalledWith(42))

    // 状态仍然回报旧的 10 秒，但界面必须留在 42 秒，不能弹回去
    expect(slider).toHaveValue('42')
  })

  it('真实位置追上目标后，进度条交还给播放位置', async () => {
    await openPlayingVideo({ position: 10, duration: 100 })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.change(slider, { target: { value: '42' } })
    fireEvent.pointerUp(slider)

    await waitFor(() => expect(slider).toHaveValue('42'))

    mocks.snapshot = { ...mocks.snapshot, position: 42.2 }

    await waitFor(() => expect(slider).toHaveValue('42.2'), { timeout: 2000 })
  })

  it('状态回报还没到位时，选好文件后控件就已经可用', async () => {
    // 曾经 Rust 序列化出的是 has_media，前端读 hasMedia 恒为 undefined，
    // 于是所有控件都被禁用。这条用例守住这个契约。
    mocks.snapshot = { ...IDLE }

    render(<App />)
    await openVideo()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '播放' })).toBeEnabled()
    })
    expect(screen.getByRole('slider', { name: '播放进度' })).toBeEnabled()
    expect(screen.getByRole('slider', { name: '音量' })).toBeEnabled()
  })

  it('播放内核没连上时给出提示', async () => {
    await openPlayingVideo({ ipcReady: false })

    expect(screen.getByTestId('backend-status')).toHaveTextContent('播放内核未连接')
  })

  it('播放内核正常时不显示告警', async () => {
    await openPlayingVideo()

    expect(screen.getByTestId('backend-status')).not.toHaveTextContent('播放内核未连接')
  })
})

describe('音量与倍速', () => {
  it('点击静音按钮会调用静音切换', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '静音' }))

    expect(mocks.toggleMute).toHaveBeenCalledTimes(1)
  })

  it('静音时图标与 aria 状态同步', async () => {
    await openPlayingVideo({ muted: true })

    const button = screen.getByRole('button', { name: '取消静音' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('拖动音量条会设置音量', async () => {
    await openPlayingVideo({ volume: 50 })

    const slider = screen.getByRole('slider', { name: '音量' })
    fireEvent.change(slider, { target: { value: '80' } })

    await waitFor(() => expect(mocks.setVolume).toHaveBeenCalledWith(80))
  })

  it('从倍速菜单选择档位会设置倍速', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '播放倍速' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: '1.5x' }))

    expect(mocks.setSpeed).toHaveBeenCalledWith(1.5)
  })

  it('全屏按钮调用全屏切换', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '全屏' }))

    expect(mocks.toggleFullscreen).toHaveBeenCalledTimes(1)
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

  it('焦点在进度条上时方向键交给控件自己处理', async () => {
    await openPlayingVideo()

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.keyDown(slider, { code: 'ArrowRight' })

    expect(mocks.seekBy).not.toHaveBeenCalled()
  })

  it('焦点留在进度条上时，空格依然能暂停', async () => {
    await openPlayingVideo()

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.keyDown(slider, { code: 'Space' })

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
  })
})

describe('侧边栏', () => {
  async function openSidebar() {
    await userEvent.click(screen.getByRole('button', { name: '视频库' }))
  }

  async function chooseDirectory() {
    await openSidebar()
    await userEvent.click(screen.getByRole('button', { name: '选择目录' }))
    await screen.findByRole('button', { name: 'demo.mp4' })
  }

  it('选择目录后同时列出子目录与视频', async () => {
    render(<App />)

    await chooseDirectory()

    expect(mocks.pickDirectory).toHaveBeenCalledTimes(1)
    expect(mocks.listDirectory).toHaveBeenCalledWith(CLIPS)
    expect(screen.getByRole('button', { name: 'anime' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-directory')).toHaveTextContent(CLIPS)
  })

  it('点子目录会进去，点上一级会回到父目录', async () => {
    render(<App />)

    await chooseDirectory()

    await userEvent.click(screen.getByRole('button', { name: 'anime' }))

    expect(await screen.findByRole('button', { name: 'ep01.mkv' })).toBeInTheDocument()
    expect(mocks.listDirectory).toHaveBeenLastCalledWith(ANIME)

    await userEvent.click(screen.getByRole('button', { name: '上一级' }))

    expect(await screen.findByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
    expect(mocks.listDirectory).toHaveBeenLastCalledWith(CLIPS)
  })

  it('点视频即播放，并标出正在播放的那一个', async () => {
    await openPlayingVideo()

    await chooseDirectory()

    expect(screen.getByRole('button', { name: 'demo.mp4' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'other.mkv' })).toHaveAttribute('aria-current', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'other.mkv' }))

    expect(mocks.playLocalVideo).toHaveBeenCalledWith(String.raw`E:\clips\other.mkv`)
  })

  it('用户取消选择目录时保持原状', async () => {
    render(<App />)
    mocks.pickDirectory.mockResolvedValueOnce(null)

    await openSidebar()
    await userEvent.click(screen.getByRole('button', { name: '选择目录' }))

    expect(screen.getByTestId('sidebar-directory')).toHaveTextContent('还没有选择目录')
    expect(mocks.listDirectory).not.toHaveBeenCalled()
  })

  it('已经在盘符根目录时不能再往上', async () => {
    render(<App />)
    mocks.listDirectory.mockImplementation(async () => ({
      directory: 'E:\\',
      parent: null,
      entries: [],
    }))

    await openSidebar()
    await userEvent.click(screen.getByRole('button', { name: '选择目录' }))

    expect(await screen.findByText('这个目录里没有子目录或视频文件')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一级' })).toBeDisabled()
  })
})

describe('进度条悬停预览', () => {
  function hoverAt(slider: HTMLElement, clientX: number) {
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 18,
      right: 200,
      bottom: 18,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerMove(slider, { clientX })
  }

  it('悬停会抓取对应时间点的画面', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })

    hoverAt(screen.getByRole('slider', { name: '播放进度' }), 100)

    await waitFor(() => expect(mocks.thumbnailAt).toHaveBeenCalledWith(50), { timeout: 1500 })
    expect(await screen.findByTestId('hover-preview-image')).toBeInTheDocument()
  })

  it('同一时间点走缓存，不重复抓取', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })
    const slider = screen.getByRole('slider', { name: '播放进度' })

    hoverAt(slider, 100)
    await waitFor(() => expect(mocks.thumbnailAt).toHaveBeenCalledTimes(1), { timeout: 1500 })

    fireEvent.pointerLeave(slider)
    hoverAt(slider, 100)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
    })

    expect(mocks.thumbnailAt).toHaveBeenCalledTimes(1)
  })

  it('鼠标离开后收起预览', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })
    const slider = screen.getByRole('slider', { name: '播放进度' })

    hoverAt(slider, 100)
    expect(await screen.findByTestId('hover-preview')).toBeInTheDocument()

    fireEvent.pointerLeave(slider)

    expect(screen.queryByTestId('hover-preview')).not.toBeInTheDocument()
  })
})
