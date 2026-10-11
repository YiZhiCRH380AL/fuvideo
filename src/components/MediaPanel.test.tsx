import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioDevice, PlayerDetails } from '../lib/backend'

const mocks = vi.hoisted(() => ({
  getPlayerDetails: vi.fn(),
  getAudioDevices: vi.fn(),
  setAudioTrack: vi.fn(async (_id: number | null) => {}),
  setSubtitleTrack: vi.fn(async (_id: number | null) => {}),
  setSecondarySubtitle: vi.fn(async (_id: number | null) => {}),
  addSubtitleFile: vi.fn(async (): Promise<string | null> => null),
  addAudioFile: vi.fn(async (): Promise<string | null> => null),
  setAudioDelay: vi.fn(async (_seconds: number) => {}),
  setSubtitleDelay: vi.fn(async (_seconds: number) => {}),
  setSubtitleFontSize: vi.fn(async (_size: number) => {}),
  setSubtitlePosition: vi.fn(async (_position: number) => {}),
  setSubtitleStyleOverride: vi.fn(async (_mode: string) => {}),
  setAudioChannels: vi.fn(async (_channels: string) => {}),
  setAudioDevice: vi.fn(async (_device: string) => {}),
  setAudioExclusive: vi.fn(async (_enabled: boolean) => {}),
}))

vi.mock('../lib/backend', () => ({
  getPlayerDetails: () => mocks.getPlayerDetails(),
  getAudioDevices: () => mocks.getAudioDevices(),
  setAudioTrack: (id: number | null) => mocks.setAudioTrack(id),
  setSubtitleTrack: (id: number | null) => mocks.setSubtitleTrack(id),
  setSecondarySubtitle: (id: number | null) => mocks.setSecondarySubtitle(id),
  addSubtitleFile: () => mocks.addSubtitleFile(),
  addAudioFile: () => mocks.addAudioFile(),
  setAudioDelay: (seconds: number) => mocks.setAudioDelay(seconds),
  setSubtitleDelay: (seconds: number) => mocks.setSubtitleDelay(seconds),
  setSubtitleFontSize: (size: number) => mocks.setSubtitleFontSize(size),
  setSubtitlePosition: (position: number) => mocks.setSubtitlePosition(position),
  setSubtitleStyleOverride: (mode: string) => mocks.setSubtitleStyleOverride(mode),
  setAudioChannels: (channels: string) => mocks.setAudioChannels(channels),
  setAudioDevice: (device: string) => mocks.setAudioDevice(device),
  setAudioExclusive: (enabled: boolean) => mocks.setAudioExclusive(enabled),
}))

import MediaPanel from './MediaPanel'

const DETAILS: PlayerDetails = {
  path: 'E:\\clips\\demo.mkv',
  tracks: [
    {
      id: 1,
      kind: 'video',
      title: null,
      lang: null,
      codec: 'h264',
      selected: true,
      external: false,
      default: true,
    },
    {
      id: 2,
      kind: 'audio',
      title: null,
      lang: 'jpn',
      codec: 'aac',
      selected: true,
      external: false,
      default: true,
    },
    {
      id: 3,
      kind: 'audio',
      title: null,
      lang: 'chi',
      codec: 'aac',
      selected: false,
      external: false,
      default: false,
    },
    {
      id: 4,
      kind: 'sub',
      title: null,
      lang: 'chi',
      codec: 'subrip',
      selected: true,
      external: false,
      default: true,
    },
  ],
  hwdecCurrent: 'd3d11va',
  secondarySubtitleId: null,
  audioDelay: 0,
  subtitleDelay: 0,
  subtitleFontSize: 38,
  subtitlePosition: 100,
  subtitleStyle: 'scale',
  audioChannels: 'auto-safe',
  audioDevice: 'wasapi/{dev}',
  audioExclusive: false,
}

const DEVICES: AudioDevice[] = [
  { name: 'auto', description: '自动选择' },
  { name: 'wasapi/{dev}', description: '耳机 (USB)' },
]

/** 第二条字幕轨：用来验证「第二字幕」区块什么时候出现。 */
const WITH_TWO_SUBTITLES: PlayerDetails = {
  ...DETAILS,
  tracks: [
    ...DETAILS.tracks,
    {
      id: 5,
      kind: 'sub',
      title: null,
      lang: 'eng',
      codec: 'subrip',
      selected: false,
      external: true,
      default: false,
    },
  ],
}

function renderPanel() {
  return render(<MediaPanel source={'E:\\clips\\demo.mkv'} onError={vi.fn()} />)
}

const subtitleTracks = () => within(screen.getByTestId('subtitle-tracks'))

async function openSubtitleTab(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: '字幕' }))
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) {
    fn.mockClear()
  }

  mocks.getPlayerDetails.mockResolvedValue(DETAILS)
  mocks.getAudioDevices.mockResolvedValue(DEVICES)
})

describe('音轨与字幕面板', () => {
  it('列出音轨，并标出当前选中的那条', async () => {
    renderPanel()

    // 轨道表是异步拉回来的：等到列表真的出现，再断言内容
    const options = within(await screen.findByTestId('audio-tracks')).getAllByRole('menuitemradio')

    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('日语')
    expect(options[0]).toHaveTextContent('AAC')
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    expect(options[1]).toHaveTextContent('中文')
    expect(options[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('点另一条音轨会切过去', async () => {
    renderPanel()

    const options = within(await screen.findByTestId('audio-tracks')).getAllByRole('menuitemradio')
    await userEvent.click(options[1])

    await waitFor(() => expect(mocks.setAudioTrack).toHaveBeenCalledWith(3))
  })

  it('列出输出设备并标出当前用的那个，点另一个会切过去', async () => {
    renderPanel()

    const devices = within(await screen.findByTestId('audio-devices'))
    const options = devices.getAllByRole('menuitemradio')

    expect(options[0]).toHaveTextContent('自动选择')
    expect(options[1]).toHaveTextContent('耳机 (USB)')
    expect(options[1]).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(options[0])

    await waitFor(() => expect(mocks.setAudioDevice).toHaveBeenCalledWith('auto'))
  })

  it('勾上独占输出会通知后端', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('checkbox', { name: /独占输出/ }))

    await waitFor(() => expect(mocks.setAudioExclusive).toHaveBeenCalledWith(true))
  })

  it('切声道会通知后端', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: '立体声' }))

    await waitFor(() => expect(mocks.setAudioChannels).toHaveBeenCalledWith('stereo'))
  })

  it('音频延迟可以按 0.5 秒粗调', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: '+0.5s' }))

    await waitFor(() => expect(mocks.setAudioDelay).toHaveBeenCalledWith(0.5))
  })
})

describe('字幕页', () => {
  it('列出字幕轨，并给一个「关闭字幕」的选项', async () => {
    renderPanel()
    await openSubtitleTab()

    // 等详情回来：只有「关闭字幕」的话说明轨道表还没到
    await screen.findByText('中文')

    const options = subtitleTracks().getAllByRole('menuitemradio')

    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('关闭字幕')
    expect(options[0]).toHaveAttribute('aria-checked', 'false')
    expect(options[1]).toHaveTextContent('中文')
    expect(options[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('点「关闭字幕」把 sid 关掉', async () => {
    renderPanel()
    await openSubtitleTab()

    await userEvent.click(subtitleTracks().getAllByRole('menuitemradio')[0])

    await waitFor(() => expect(mocks.setSubtitleTrack).toHaveBeenCalledWith(null))
  })

  it('点另外一条字幕轨会切过去', async () => {
    mocks.getPlayerDetails.mockResolvedValue(WITH_TWO_SUBTITLES)

    renderPanel()
    await openSubtitleTab()

    const options = subtitleTracks().getAllByRole('menuitemradio')
    await userEvent.click(options[2])

    await waitFor(() => expect(mocks.setSubtitleTrack).toHaveBeenCalledWith(5))
  })

  it('可以加载外挂字幕', async () => {
    renderPanel()
    await openSubtitleTab()

    await userEvent.click(screen.getByRole('button', { name: '加载字幕文件…' }))

    await waitFor(() => expect(mocks.addSubtitleFile).toHaveBeenCalledTimes(1))
  })

  it('字幕延迟、字号、位置都能调', async () => {
    renderPanel()
    await openSubtitleTab()

    await userEvent.click(screen.getByRole('button', { name: '+0.1s' }))
    await waitFor(() => expect(mocks.setSubtitleDelay).toHaveBeenCalledWith(0.1))

    await userEvent.click(screen.getByRole('button', { name: '+2' }))
    await waitFor(() => expect(mocks.setSubtitleFontSize).toHaveBeenCalledWith(40))

    await userEvent.click(screen.getByRole('button', { name: '+5' }))
    await waitFor(() => expect(mocks.setSubtitlePosition).toHaveBeenCalledWith(105))
  })

  it('只有一条字幕时不显示第二字幕区块', async () => {
    renderPanel()
    await openSubtitleTab()

    await waitFor(() => expect(screen.getByTestId('subtitle-tracks')).toBeInTheDocument())
    expect(screen.queryByTestId('secondary-subtitles')).not.toBeInTheDocument()
  })

  it('有两条以上字幕时给出第二字幕（双语）选择', async () => {
    mocks.getPlayerDetails.mockResolvedValue(WITH_TWO_SUBTITLES)

    renderPanel()
    await openSubtitleTab()

    const secondary = within(await screen.findByTestId('secondary-subtitles'))
    const options = secondary.getAllByRole('menuitemradio')

    expect(options[0]).toHaveTextContent('关闭')

    await userEvent.click(options[1])

    await waitFor(() => expect(mocks.setSecondarySubtitle).toHaveBeenCalledWith(4))
  })

  it('ASS 样式可以切到「用播放器样式」', async () => {
    renderPanel()
    await openSubtitleTab()

    await userEvent.click(screen.getByRole('button', { name: '用播放器样式' }))

    await waitFor(() => expect(mocks.setSubtitleStyleOverride).toHaveBeenCalledWith('force'))
  })
})
