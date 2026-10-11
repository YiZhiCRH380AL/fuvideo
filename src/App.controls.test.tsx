import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DirectoryListing, PlayerSnapshot } from './lib/backend'

const CLIPS = String.raw`E:\clips`
const ANIME = String.raw`E:\clips\anime`
const DEMO = String.raw`E:\clips\demo.mp4`

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
    thumbnailAt: vi.fn(async (_source: string, _position: number) => 'data:image/jpeg;base64,AAAA'),
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
  thumbnailAt: (source: string, position: number) => mocks.thumbnailAt(source, position),
}))

import App from './App'

beforeEach(() => {
  mocks.snapshot = {
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

  for (const fn of [
    mocks.togglePause,
    mocks.seekTo,
    mocks.seekBy,
    mocks.setVolume,
    mocks.toggleMute,
    mocks.setSpeed,
    mocks.toggleFullscreen,
    mocks.playLocalVideo,
    mocks.pickDirectory,
    mocks.listDirectory,
    mocks.thumbnailAt,
  ]) {
    fn.mockClear()
  }

  mocks.togglePause.mockResolvedValue(false)
  mocks.toggleMute.mockResolvedValue(true)
  mocks.toggleFullscreen.mockResolvedValue(true)
  mocks.pickDirectory.mockResolvedValue(CLIPS)
  mocks.listDirectory.mockImplementation(async (directory: string) =>
    directory === ANIME ? mocks.subListing : mocks.listing,
  )
  mocks.thumbnailAt.mockResolvedValue('data:image/jpeg;base64,AAAA')
})

const grid = () => within(screen.getByTestId('video-grid'))
const sidebar = () => within(screen.getByTestId('sidebar'))

/** 侧边栏选目录，等方格出现。 */
async function chooseDirectory(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: '视频库' }))
  await userEvent.click(sidebar().getByRole('button', { name: '选择目录' }))
  await grid().findByRole('button', { name: 'demo.mp4' })
}

/** 选目录 → 点方格放大 → 再点一下播放，停在播放页。 */
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
    ...overrides,
  }

  render(<App />)
  await chooseDirectory()

  const tile = grid().getByRole('button', { name: 'demo.mp4' })
  await userEvent.click(tile)
  await userEvent.click(tile)

  // 机器负载高时默认 1 秒不够，容易偶发失败
  await waitFor(() => expect(screen.getByRole('slider', { name: '播放进度' })).toBeEnabled(), {
    timeout: 3000,
  })
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
    expect(grid().getByRole('button', { name: 'other.mkv' })).toBeInTheDocument()
    // 子目录只出现在侧边栏，不进方格
    expect(grid().queryByRole('button', { name: 'anime' })).not.toBeInTheDocument()

    await waitFor(() => expect(mocks.thumbnailAt).toHaveBeenCalledWith(DEMO, 0))

    await waitFor(() => {
      expect(screen.getByTestId('video-grid').querySelectorAll('.tile__image').length).toBeGreaterThan(0)
    })
  })

  it('点一下方格放大，再点一下播放', async () => {
    render(<App />)
    await chooseDirectory()

    const tile = grid().getByRole('button', { name: 'demo.mp4' })
    await userEvent.click(tile)

    expect(tile).toHaveAttribute('data-focused', 'true')
    expect(mocks.playLocalVideo).not.toHaveBeenCalled()

    await userEvent.click(tile)

    expect(mocks.playLocalVideo).toHaveBeenCalledWith(DEMO)
  })
})

describe('播放页', () => {
  it('显示文件名，并收起目录方格', async () => {
    await openPlayingVideo()

    expect(screen.getByTestId('current-file')).toHaveTextContent('demo.mp4')
    expect(screen.queryByTestId('video-grid')).not.toBeInTheDocument()
  })

  it('返回箭头回到目录页，并把视频暂停', async () => {
    await openPlayingVideo()
    mocks.togglePause.mockResolvedValue(true)

    await userEvent.click(screen.getByRole('button', { name: '返回目录' }))

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('island')).toBeInTheDocument()
    expect(screen.getByTestId('video-grid')).toBeInTheDocument()
  })

  it('已经在播放页时返回不会重复暂停', async () => {
    await openPlayingVideo({ paused: true })

    await userEvent.click(screen.getByRole('button', { name: '返回目录' }))

    expect(mocks.togglePause).not.toHaveBeenCalled()
  })

  it('播放页里侧边栏开关仍然在，并且能收起', async () => {
    await openPlayingVideo()

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'true')
    expect(screen.getByRole('button', { name: '返回目录' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '视频库' }))

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-open', 'false')
  })

  it('一切正常时不显示播放内核版本', async () => {
    await openPlayingVideo()

    expect(screen.getByTestId('backend-status')).toBeEmptyDOMElement()
  })
})

describe('底部常驻条', () => {
  it('回到目录页后显示进度，点它回到播放页', async () => {
    await openPlayingVideo({ position: 30, duration: 120, paused: true })

    expect(screen.queryByTestId('island')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '返回目录' }))

    const island = await screen.findByTestId('island')
    expect(island).toHaveTextContent('demo.mp4')
    expect(island).toHaveTextContent('0:30 / 2:00')

    await userEvent.click(within(island).getByTestId('island-open'))

    await waitFor(() => expect(screen.queryByTestId('video-grid')).not.toBeInTheDocument())
    expect(screen.getByRole('slider', { name: '播放进度' })).toBeInTheDocument()
  })

  it('没有播放过视频时不显示', async () => {
    render(<App />)
    await chooseDirectory()

    expect(screen.queryByTestId('island')).not.toBeInTheDocument()
  })
})

describe('播放控制', () => {
  it('点击按钮会切换成暂停', async () => {
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

  it('拖动进度条松手后跳转到对应位置，且不弹回旧值', async () => {
    await openPlayingVideo({ position: 10, duration: 100 })

    const slider = screen.getByRole('slider', { name: '播放进度' })
    fireEvent.change(slider, { target: { value: '42' } })
    fireEvent.pointerUp(slider)

    await waitFor(() => expect(mocks.seekTo).toHaveBeenCalledWith(42))
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
})

describe('音量与倍速', () => {
  it('点击静音按钮会调用静音切换', async () => {
    await openPlayingVideo()

    await userEvent.click(screen.getByRole('button', { name: '静音' }))

    expect(mocks.toggleMute).toHaveBeenCalledTimes(1)
  })

  it('静音时图标与 aria 状态同步', async () => {
    await openPlayingVideo({ muted: true })

    expect(screen.getByRole('button', { name: '取消静音' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('拖动音量条会设置音量', async () => {
    await openPlayingVideo({ volume: 50 })

    fireEvent.change(screen.getByRole('slider', { name: '音量' }), { target: { value: '80' } })

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

    fireEvent.keyDown(screen.getByRole('slider', { name: '播放进度' }), { code: 'ArrowRight' })

    expect(mocks.seekBy).not.toHaveBeenCalled()
  })

  it('焦点留在进度条上时，空格依然能暂停', async () => {
    await openPlayingVideo()

    fireEvent.keyDown(screen.getByRole('slider', { name: '播放进度' }), { code: 'Space' })

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
  })

  it('目录页不响应播放快捷键', async () => {
    render(<App />)
    await chooseDirectory()

    fireEvent.keyDown(window, { code: 'Space' })

    expect(mocks.togglePause).not.toHaveBeenCalled()
  })
})

describe('侧边栏', () => {
  it('选择目录后同时列出子目录与视频', async () => {
    render(<App />)

    await chooseDirectory()

    expect(mocks.pickDirectory).toHaveBeenCalledTimes(1)
    expect(sidebar().getByRole('button', { name: 'anime' })).toBeInTheDocument()
    expect(sidebar().getByRole('button', { name: 'other.mkv' })).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-directory')).toHaveTextContent(CLIPS)
  })

  it('点子目录会进去，点上一级会回到父目录', async () => {
    render(<App />)
    await chooseDirectory()

    await userEvent.click(sidebar().getByRole('button', { name: 'anime' }))

    expect(await sidebar().findByRole('button', { name: 'ep01.mkv' })).toBeInTheDocument()
    expect(mocks.listDirectory).toHaveBeenLastCalledWith(ANIME)

    await userEvent.click(sidebar().getByRole('button', { name: '上一级' }))

    expect(await sidebar().findByRole('button', { name: 'demo.mp4' })).toBeInTheDocument()
    expect(mocks.listDirectory).toHaveBeenLastCalledWith(CLIPS)
  })

  it('点视频即播放，并标出正在播放的那一个', async () => {
    await openPlayingVideo()

    expect(sidebar().getByRole('button', { name: 'demo.mp4' })).toHaveAttribute('aria-current', 'true')
    expect(sidebar().getByRole('button', { name: 'other.mkv' })).toHaveAttribute('aria-current', 'false')
  })

  it('用户取消选择目录时保持原状', async () => {
    render(<App />)
    mocks.pickDirectory.mockResolvedValueOnce(null)

    await userEvent.click(screen.getByRole('button', { name: '视频库' }))
    await userEvent.click(sidebar().getByRole('button', { name: '选择目录' }))

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

    await userEvent.click(screen.getByRole('button', { name: '视频库' }))
    await userEvent.click(sidebar().getByRole('button', { name: '选择目录' }))

    expect(await sidebar().findByText('这个目录里没有子目录或视频文件')).toBeInTheDocument()
    expect(sidebar().getByRole('button', { name: '上一级' })).toBeDisabled()
  })
})

describe('动效', () => {
  function stageElement(): HTMLElement {
    const stage = document.querySelector('.stage')

    if (!(stage instanceof HTMLElement)) {
      throw new Error('找不到舞台元素')
    }

    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 400,
      right: 800,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    return stage
  }

  it('播放暂停按钮用的是形变图标', async () => {
    await openPlayingVideo()

    expect(screen.getByRole('button', { name: '暂停' }).querySelector('svg')).toBeInTheDocument()
  })

  it('单击视频区域切换播放暂停', async () => {
    await openPlayingVideo()

    fireEvent.click(stageElement())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
  })

  it('双击右半屏快进 10 秒并浮出提示', async () => {
    await openPlayingVideo({ position: 0, duration: 100 })

    const stage = stageElement()
    fireEvent.click(stage, { clientX: 700, clientY: 200 })
    fireEvent.doubleClick(stage, { clientX: 700, clientY: 200 })

    expect(mocks.seekBy).toHaveBeenCalledWith(10)
    expect(screen.getByText('+10s')).toBeInTheDocument()
    expect(screen.getByTestId('flash-ripple')).toBeInTheDocument()
    // 双击应该把待处理的单击取消掉，不能顺带暂停一次
    expect(mocks.togglePause).not.toHaveBeenCalled()
  })

  it('双击左半屏快退 10 秒', async () => {
    await openPlayingVideo({ position: 30, duration: 100 })

    fireEvent.doubleClick(stageElement(), { clientX: 120, clientY: 200 })

    expect(mocks.seekBy).toHaveBeenCalledWith(-10)
    expect(screen.getByText('-10s')).toBeInTheDocument()
  })

  it('拖动进度条时浮出时间气泡，松手后收起', async () => {
    await openPlayingVideo({ position: 10, duration: 100 })
    const slider = screen.getByRole('slider', { name: '播放进度' })

    fireEvent.change(slider, { target: { value: '42' } })

    expect(screen.getByTestId('scrub-bubble')).toHaveTextContent('0:42')

    fireEvent.pointerUp(slider)

    await waitFor(() => expect(screen.queryByTestId('scrub-bubble')).not.toBeInTheDocument())
  })

  it('从方格进播放页时有一层幕布展开', async () => {
    render(<App />)
    await chooseDirectory()

    const tile = grid().getByRole('button', { name: 'demo.mp4' })
    await userEvent.click(tile)
    await userEvent.click(tile)

    expect(await screen.findByTestId('curtain')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('curtain')).not.toBeInTheDocument(), { timeout: 2000 })
  })

  it('缓冲时舞台中央出现呼吸圈', async () => {
    await openPlayingVideo({ buffering: true })

    await waitFor(() => expect(screen.getByTestId('buffering')).toBeInTheDocument())
  })

  it('不缓冲时没有呼吸圈', async () => {
    await openPlayingVideo()

    expect(screen.queryByTestId('buffering')).not.toBeInTheDocument()
  })

  it('空状态有引导图标', async () => {
    render(<App />)

    expect(document.querySelector('.library__icon')).not.toBeNull()
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

  const previewCalls = () =>
    mocks.thumbnailAt.mock.calls.filter(([, position]) => position === 50).length

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
})
