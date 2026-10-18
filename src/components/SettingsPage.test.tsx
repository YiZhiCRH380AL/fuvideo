import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AudioEffectKind,
  type AudioOptions,
  type PlayerSettings,
  type VideoOptions,
} from '../lib/backend'

/** 后端模块被整个 mock 掉了，默认值要从真模块拿。 */
const { DEFAULT_SETTINGS } = await vi.importActual<{ DEFAULT_SETTINGS: PlayerSettings }>(
  '../lib/backend',
)

function baseSettings(): PlayerSettings {
  // 直接拿前端那份默认值：设置项一多，手写一份迟早对不上
  return { ...DEFAULT_SETTINGS }
}

const OPTIONS: AudioOptions = {
  frequencies: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  gainLimit: 12,
  modes: [
    { id: 'simple', label: '简单' },
    { id: 'advanced', label: '高级' },
  ],
  presets: [
    { id: 'off', label: '关闭' },
    { id: 'flat', label: '平坦' },
    { id: 'music', label: '音乐' },
  ],
  samplerates: [
    { id: 'source', label: '跟随源' },
    { id: '48000', label: '48000 Hz' },
  ],
  formats: [
    { id: 'source', label: '跟随源' },
    { id: 'float', label: '32 位浮点' },
  ],
}

const VIDEO_OPTIONS: VideoOptions = {
  colorLimit: 100,
  sharpenLimit: 5,
  modes: [
    { id: 'simple', label: '简单' },
    { id: 'advanced', label: '高级' },
  ],
  aspects: [
    { id: 'auto', label: '自动' },
    { id: '16:9', label: '16:9' },
  ],
  rotations: [0, 90, 180, 270],
  flips: [{ id: 'h', label: '左右镜像' }],
  profiles: [{ id: 'high', label: '高质量（缩放更锐利）' }],
  toneMappings: [
    { id: 'auto', label: '自动' },
    { id: 'bt.2390', label: 'BT.2390（推荐）' },
  ],
  hwdec: [
    { id: 'auto-safe', label: '自动（推荐）' },
    { id: 'no', label: '关闭，用软件解码' },
  ],
  screenshotFormats: [
    { id: 'jpg', label: 'JPEG（体积小）' },
    { id: 'png', label: 'PNG（无损）' },
  ],
}

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  readSettings: vi.fn(),
  getAudioOptions: vi.fn(),
  setAudioFilterMode: vi.fn(),
  setAudioEffect: vi.fn(),
  setEqualizerPreset: vi.fn(),
  setEqualizerBand: vi.fn(),
  setAudioSamplerate: vi.fn(),
  setAudioFormat: vi.fn(),
  setAudioSpdif: vi.fn(),
  getVideoOptions: vi.fn(),
  getPlayerDetails: vi.fn(),
  setVideoFilterMode: vi.fn(),
  setVideoAspect: vi.fn(),
  setVideoFill: vi.fn(),
  setVideoRotate: vi.fn(),
  setHwdec: vi.fn(),
  takeScreenshot: vi.fn(),
  setShortcut: vi.fn(),
  resetShortcuts: vi.fn(),
  setSplashSpeed: vi.fn(),
}))

vi.mock('../lib/backend', () => ({
  readSettings: () => mocks.readSettings(),
  getAudioOptions: () => mocks.getAudioOptions(),
  setAudioFilterMode: (mode: string) => mocks.setAudioFilterMode(mode),
  setAudioEffect: (kind: AudioEffectKind, enabled: boolean) => mocks.setAudioEffect(kind, enabled),
  setEqualizerPreset: (preset: string) => mocks.setEqualizerPreset(preset),
  setEqualizerBand: (index: number, gain: number) => mocks.setEqualizerBand(index, gain),
  setAudioSamplerate: (samplerate: number | null) => mocks.setAudioSamplerate(samplerate),
  setAudioFormat: (format: string | null) => mocks.setAudioFormat(format),
  setAudioSpdif: (enabled: boolean) => mocks.setAudioSpdif(enabled),
  getVideoOptions: () => mocks.getVideoOptions(),
  getPlayerDetails: () => mocks.getPlayerDetails(),
  setVideoFilterMode: (mode: string) => mocks.setVideoFilterMode(mode),
  setVideoAspect: (aspect: string) => mocks.setVideoAspect(aspect),
  setVideoFill: (fill: boolean) => mocks.setVideoFill(fill),
  setVideoRotate: (degrees: number) => mocks.setVideoRotate(degrees),
  setHwdec: (mode: string) => mocks.setHwdec(mode),
  takeScreenshot: () => mocks.takeScreenshot(),
  setShortcut: (action: string, code: string | null) => mocks.setShortcut(action, code),
  resetShortcuts: () => mocks.resetShortcuts(),
  setSplashSpeed: (speed: string) => mocks.setSplashSpeed(speed),
}))

import SettingsPage from './SettingsPage'

/**
 * 每个 setter 都顺手把 mock 里的设置改掉，并返回改完的那份。
 *
 * 界面拿返回值更新自己，所以 mock 要模仿后端的真实行为——否则「点了之后界面跟着变」
 * 这类断言测的是假象。
 */
function wireSetters(): void {
  mocks.readSettings.mockImplementation(async () => mocks.settings)

  mocks.setAudioFilterMode.mockImplementation(async (mode: string) => {
    mocks.settings = { ...mocks.settings, audioFilterMode: mode }
    return mocks.settings
  })

  mocks.setAudioEffect.mockImplementation(async (kind: AudioEffectKind, enabled: boolean) => {
    const key =
      kind === 'loudness'
        ? 'loudnessNormalization'
        : kind === 'surround'
          ? 'virtualSurround'
          : 'stereoWidening'

    mocks.settings = { ...mocks.settings, [key]: enabled }
    return mocks.settings
  })

  mocks.setEqualizerPreset.mockImplementation(async (preset: string) => {
    mocks.settings = { ...mocks.settings, equalizerPreset: preset }
    return mocks.settings
  })

  mocks.setEqualizerBand.mockImplementation(async (index: number, gain: number) => {
    const bands = [...((mocks.settings.equalizerBands as number[] | null) ?? Array(10).fill(0))]
    bands[index] = gain

    mocks.settings = { ...mocks.settings, equalizerBands: bands, equalizerPreset: 'custom' }
    return mocks.settings
  })

  mocks.setAudioSamplerate.mockImplementation(async (samplerate: number | null) => {
    mocks.settings = { ...mocks.settings, audioSamplerate: samplerate }
    return mocks.settings
  })

  mocks.setAudioFormat.mockImplementation(async (format: string | null) => {
    mocks.settings = { ...mocks.settings, audioFormat: format }
    return mocks.settings
  })

  mocks.setAudioSpdif.mockImplementation(async (enabled: boolean) => {
    mocks.settings = { ...mocks.settings, audioSpdif: enabled }
    return mocks.settings
  })

  mocks.setShortcut.mockImplementation(async (action: string, code: string | null) => {
    const current = (mocks.settings.shortcuts as Record<string, string> | null) ?? {}
    const next = { ...current }

    if (code === null) {
      delete next[action]
    } else {
      next[action] = code
    }

    mocks.settings = { ...mocks.settings, shortcuts: Object.keys(next).length === 0 ? null : next }
    return mocks.settings
  })

  mocks.resetShortcuts.mockImplementation(async () => {
    mocks.settings = { ...mocks.settings, shortcuts: null }
    return mocks.settings
  })

  mocks.setSplashSpeed.mockImplementation(async (speed: string) => {
    mocks.settings = { ...mocks.settings, splashSpeed: speed }
    return mocks.settings
  })
}

function renderPage() {
  return render(
    <SettingsPage
      onClose={vi.fn()}
      onError={vi.fn()}
      shortcuts={null}
      onShortcutsChange={vi.fn()}
    />,
  )
}

const bandList = () => within(screen.getByTestId('equalizer-bands'))

beforeEach(() => {
  mocks.settings = baseSettings() as unknown as Record<string, unknown>
  mocks.getAudioOptions.mockResolvedValue(OPTIONS)
  mocks.getVideoOptions.mockResolvedValue(VIDEO_OPTIONS)
  mocks.getPlayerDetails.mockResolvedValue({ hwdecCurrent: 'd3d11va' })
  mocks.takeScreenshot.mockResolvedValue(String.raw`E:\clips\demo 截图.jpg`)

  for (const fn of [
    mocks.readSettings,
    mocks.getAudioOptions,
    mocks.setAudioFilterMode,
    mocks.setAudioEffect,
    mocks.setEqualizerPreset,
    mocks.setEqualizerBand,
    mocks.setAudioSamplerate,
    mocks.setAudioFormat,
    mocks.setAudioSpdif,
    mocks.setShortcut,
    mocks.resetShortcuts,
    mocks.setSplashSpeed,
  ]) {
    fn.mockClear()
  }

  wireSetters()
})

describe('设置页 · 简单模式', () => {
  it('默认按当前设置渲染三个开关，且都没打开', async () => {
    renderPage()

    const loudness = await screen.findByRole('checkbox', { name: /响度归一化/ })

    expect(loudness).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /虚拟环绕/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /立体声扩展/ })).not.toBeChecked()
    // 简单模式下不摆均衡器出来，免得一上来就是一片滑块
    expect(screen.queryByTestId('equalizer-bands')).not.toBeInTheDocument()
  })

  it('勾上响度归一化会通知后端', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('checkbox', { name: /响度归一化/ }))

    await waitFor(() => expect(mocks.setAudioEffect).toHaveBeenCalledWith('loudness', true))
  })

  it('简单/高级两个模式按钮反映当前模式，点了会切过去', async () => {
    renderPage()

    // 音效和画面各有一组「简单 / 高级」，按分组定位
    const modes = within(await screen.findByRole('group', { name: '音效模式' }))
    const simple = modes.getByRole('button', { name: '简单' })
    const advanced = modes.getByRole('button', { name: '高级' })

    expect(simple).toHaveAttribute('aria-pressed', 'true')
    expect(advanced).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(advanced)

    await waitFor(() => expect(mocks.setAudioFilterMode).toHaveBeenCalledWith('advanced'))
    // 后端返回的是切过之后的设置，界面要跟着变
    expect(await screen.findByTestId('equalizer-bands')).toBeInTheDocument()
  })
})

describe('设置页 · 高级模式', () => {
  beforeEach(() => {
    mocks.settings = {
      ...baseSettings(),
      audioFilterMode: 'advanced',
    } as unknown as Record<string, unknown>
  })

  it('把均衡器、输出、透传都摆出来', async () => {
    renderPage()

    expect(await screen.findByTestId('equalizer-bands')).toBeInTheDocument()
    expect(bandList().getAllByRole('slider')).toHaveLength(OPTIONS.frequencies.length)
    expect(screen.getByRole('button', { name: '音乐' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /采样率/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /位深/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /音频透传/ })).not.toBeChecked()
  })

  it('频点用 kHz 简写标在滑块旁边', async () => {
    renderPage()

    const bands = await screen.findByTestId('equalizer-bands')

    expect(bands).toHaveTextContent('31')
    expect(bands).toHaveTextContent('16k')
  })

  it('点预设会通知后端', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '音乐' }))

    await waitFor(() => expect(mocks.setEqualizerPreset).toHaveBeenCalledWith('music'))
  })

  it('拖滑块的过程中不发请求，松手才提交', async () => {
    renderPage()

    // 设置是异步读回来的，要等滑块真的出现
    const slider = within(await screen.findByTestId('equalizer-bands')).getAllByRole('slider')[0]

    fireEvent.change(slider, { target: { value: '6' } })
    expect(mocks.setEqualizerBand).not.toHaveBeenCalled()
    expect(slider).toHaveValue('6')

    fireEvent.pointerUp(slider)

    await waitFor(() => expect(mocks.setEqualizerBand).toHaveBeenCalledWith(0, 6))
  })

  it('开关透传会通知后端，并说明滤镜会失效', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('checkbox', { name: /音频透传/ }))

    await waitFor(() => expect(mocks.setAudioSpdif).toHaveBeenCalledWith(true))
    expect(screen.getByText(/音效全部失效/)).toBeInTheDocument()
    // 透传开着的时候均衡器是无效的，界面上就别让它看起来能用
    expect(bandList().getAllByRole('slider')[0]).toBeDisabled()
  })

  it('切换采样率与位深会通知后端', async () => {
    renderPage()

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /采样率/ }), '48000')
    await waitFor(() => expect(mocks.setAudioSamplerate).toHaveBeenCalledWith(48000))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /位深/ }), 'float')
    await waitFor(() => expect(mocks.setAudioFormat).toHaveBeenCalledWith('float'))
  })
})
describe('设置页 · 画面', () => {
  it('简单模式只摆常用项：比例、旋转、缩放、截图，不摊色彩', async () => {
    renderPage()

    expect(await screen.findByRole('group', { name: '画面比例' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '旋转' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '截一张当前画面' })).toBeInTheDocument()
    // 色彩滑块是高级的东西，简单模式不摆出来
    expect(screen.queryByRole('slider', { name: '亮度' })).not.toBeInTheDocument()
  })

  it('选画面比例会通知后端', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '16:9' }))

    await waitFor(() => expect(mocks.setVideoAspect).toHaveBeenCalledWith('16:9'))
  })

  it('截图会把存到哪儿显示出来', async () => {
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '截一张当前画面' }))

    await waitFor(() => expect(mocks.takeScreenshot).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('screenshot-saved')).toHaveTextContent('截图.jpg')
  })

  it('高级模式摊开色彩、硬解与 HDR，并显示当前真正生效的硬解后端', async () => {
    mocks.settings = { ...baseSettings(), videoFilterMode: 'advanced' } as unknown as Record<
      string,
      unknown
    >

    renderPage()

    expect(await screen.findByRole('slider', { name: '亮度' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '画面比例' })).toBeInTheDocument()
    // 显示的是 mpv 报的「真正在用」的那个，不是用户选了什么
    expect(screen.getByTestId('hwdec-current')).toHaveTextContent('d3d11va')
  })
})

describe('设置页 · 快捷键', () => {
  /**
   * 带状态的壳。
   *
   * 设置页自己不管键位表——它把改动交给外面（App 那边要立刻生效）。所以这里得有个
   * 真的把值存下来的爹，否则「改完之后显示新键」这件事压根不会发生。
   */
  function Harness({ initial }: { initial: Record<string, string> | null }) {
    const [value, setValue] = useState<Record<string, string> | null>(initial)

    return (
      <SettingsPage
        onClose={vi.fn()}
        onError={vi.fn()}
        shortcuts={value}
        onShortcutsChange={setValue}
      />
    )
  }

  /** 每个动作一行，键码要显示成人看得懂的字。 */
  it('列出每个动作，键码显示成按键的字', async () => {
    renderPage()

    const list = await screen.findByTestId('shortcut-list')

    expect(within(list).getByRole('button', { name: '播放 / 暂停 的按键' })).toHaveTextContent('空格')
    expect(within(list).getByRole('button', { name: '静音开关 的按键' })).toHaveTextContent('M')
    expect(within(list).getByRole('button', { name: '前进一帧 的按键' })).toHaveTextContent('.')
  })

  /**
   * 录制期间按键不能被播放器那套快捷键吃掉：这条用例让 App 的全局监听也挂上，
   * 确认「按下去之后键位真的改了」，而不是顺手暂停了一下视频。
   */
  it('点一下按键再按新键，就把新键交给后端', async () => {
    render(<Harness initial={null} />)

    const key = await screen.findByRole('button', { name: '静音开关 的按键' })

    await userEvent.click(key)
    expect(key).toHaveTextContent('按下新键…')

    fireEvent.keyDown(window, { code: 'KeyQ' })

    await waitFor(() => expect(mocks.setShortcut).toHaveBeenCalledWith('toggle-mute', 'KeyQ'))
    // 改完之后立刻生效：界面拿后端返回的那份更新
    expect(key).toHaveTextContent('Q')
  })

  it('改过的那一条能单独恢复默认', async () => {
    render(<Harness initial={{ 'toggle-mute': 'KeyQ' }} />)

    const key = await screen.findByRole('button', { name: '静音开关 的按键' })
    expect(key).toHaveTextContent('Q')

    await userEvent.click(screen.getByRole('button', { name: '把 静音开关 恢复默认' }))
    await waitFor(() => expect(mocks.setShortcut).toHaveBeenCalledWith('toggle-mute', null))
    expect(key).toHaveTextContent('M')
  })

  it('一键全部恢复默认', async () => {
    render(<Harness initial={{ 'toggle-mute': 'KeyQ', 'speed-up': 'KeyY' }} />)

    await userEvent.click(await screen.findByRole('button', { name: '全部恢复默认' }))
    await waitFor(() => expect(mocks.resetShortcuts).toHaveBeenCalledTimes(1))

    // 后端返回的那份是「没改过」，界面跟着回到出厂键位
    expect(await screen.findByRole('button', { name: '静音开关 的按键' })).toHaveTextContent('M')
  })
})

describe('设置页 · 界面', () => {
  it('开屏档位有三个选项，点「快」会通知后端并记住选择', async () => {
    renderPage()

    const group = await screen.findByRole('group', { name: '开屏停留时长' })
    expect(within(group).getByRole('button', { name: '标准' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.click(within(group).getByRole('button', { name: '快' }))

    await waitFor(() => expect(mocks.setSplashSpeed).toHaveBeenCalledWith('fast'))
    expect(within(group).getByRole('button', { name: '快' })).toHaveAttribute('aria-pressed', 'true')
  })

  /** 认不出来的档位落到「标准」上，界面不能一个都不选中。 */
  it('配置里是认不出的档位时，界面上「标准」是选中的', async () => {
    mocks.settings = { ...baseSettings(), splashSpeed: '慢动作' } as unknown as Record<string, unknown>

    renderPage()

    const group = await screen.findByRole('group', { name: '开屏停留时长' })

    expect(within(group).getByRole('button', { name: '标准' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

