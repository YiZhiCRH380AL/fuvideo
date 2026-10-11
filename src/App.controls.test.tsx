import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerSnapshot } from './lib/backend'

const IDLE: PlayerSnapshot = {
  hasMedia: false,
  path: null,
  position: 0,
  duration: 0,
  paused: true,
}

// vi.hoisted 保证这些 mock 在模块导入之前就已经就绪
const mocks = vi.hoisted(() => ({
  snapshot: {
    hasMedia: false,
    path: null,
    position: 0,
    duration: 0,
    paused: true,
  } as PlayerSnapshot,
  togglePause: vi.fn(async () => false),
  seekTo: vi.fn(async (_position: number) => {}),
}))

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
  playLocalVideo: async () => {},
  getPlayerState: async () => mocks.snapshot,
  togglePause: () => mocks.togglePause(),
  seekTo: (position: number) => mocks.seekTo(position),
}))

import App from './App'

beforeEach(() => {
  mocks.snapshot = { ...IDLE }
  mocks.togglePause.mockClear()
  mocks.togglePause.mockResolvedValue(false)
  mocks.seekTo.mockClear()
})

async function openVideo() {
  const button = screen.getByRole('button', { name: '选择视频文件' })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
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
    mocks.snapshot = { hasMedia: true, path: String.raw`E:\clips\demo.mp4`, position: 12, duration: 60, paused: false }
    mocks.togglePause.mockResolvedValue(true)

    render(<App />)
    await openVideo()

    const button = await screen.findByRole('button', { name: '暂停' })
    await userEvent.click(button)

    expect(mocks.togglePause).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument()
    })
  })

  it('显示播放位置与总时长', async () => {
    mocks.snapshot = { hasMedia: true, path: 'x', position: 30, duration: 60, paused: true }

    render(<App />)
    await openVideo()

    await waitFor(() => {
      expect(screen.getByTestId('time-display')).toHaveTextContent('0:30 / 1:00')
    })
    expect(screen.getByRole('slider')).toHaveValue('30')
  })

  it('拖动进度条松手后跳转到对应位置', async () => {
    mocks.snapshot = { hasMedia: true, path: 'x', position: 10, duration: 100, paused: false }

    render(<App />)
    await openVideo()

    const slider = await screen.findByRole('slider')
    await waitFor(() => expect(slider).toBeEnabled())

    fireEvent.change(slider, { target: { value: '42' } })
    fireEvent.pointerUp(slider)

    await waitFor(() => expect(mocks.seekTo).toHaveBeenCalledWith(42))
  })
})
