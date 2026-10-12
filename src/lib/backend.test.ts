import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  addSubtitleFile,
  describeProbe,
  getAudioOptions,
  getAudioDevices,
  getBackendStatus,
  getPlayerDetails,
  isTauri,
  prepareSampleFolder,
  readSettings,
  setAudioFilterMode,
  setAudioDevice,
  setAudioSpdif,
  setAudioTrack,
  setEqualizerPreset,
  writeSettings,
} from './backend'

describe('isTauri', () => {
  it('jsdom 环境下不是 Tauri', () => {
    expect(isTauri()).toBe(false)
  })
})

describe('describeProbe', () => {
  it('探测到 mpv 时带出版本号', () => {
    const status = describeProbe({ available: true, version: '0.40.0', path: 'C:/mpv/mpv.exe' })

    expect(status.mpvAvailable).toBe(true)
    expect(status.message).toContain('0.40.0')
  })

  it('没有 mpv 时给出可读提示', () => {
    const status = describeProbe({ available: false, version: null, path: null })

    expect(status.mpvAvailable).toBe(false)
    expect(status.message).toContain('未检测到 mpv')
  })
})

describe('getBackendStatus', () => {
  it('浏览器环境下返回 browser 类型', async () => {
    const status = await getBackendStatus()

    expect(status.kind).toBe('browser')
    expect(status.mpvAvailable).toBe(false)
  })
})

describe('getPlayerDetails', () => {
  it('浏览器环境下返回空轨道表', async () => {
    const details = await getPlayerDetails()

    expect(details.path).toBeNull()
    expect(details.tracks).toEqual([])
    expect(details.hwdecCurrent).toBeNull()
  })
})

describe('readSettings', () => {
  it('浏览器环境下退回默认值，不让界面卡住', async () => {
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })
})

describe('writeSettings', () => {
  it('浏览器环境下明确报错，而不是静默丢掉用户的修改', async () => {
    await expect(writeSettings(DEFAULT_SETTINGS)).rejects.toThrow()
  })
})

describe('播放控制类命令', () => {
  it('浏览器环境下给出可读的错误，而不是沉默地什么都不做', async () => {
    await expect(getAudioDevices()).rejects.toThrow('桌面应用')
    await expect(setAudioTrack(2)).rejects.toThrow('桌面应用')
    await expect(addSubtitleFile()).rejects.toThrow('桌面应用')
    await expect(setAudioDevice('auto')).rejects.toThrow('桌面应用')
  })

  it('音效设置的读写也一样', async () => {
    await expect(getAudioOptions()).rejects.toThrow('桌面应用')
    await expect(setAudioFilterMode('advanced')).rejects.toThrow('桌面应用')
    await expect(setEqualizerPreset('music')).rejects.toThrow('桌面应用')
    await expect(setAudioSpdif(true)).rejects.toThrow('桌面应用')
  })

  it('示例文件夹要在桌面端才能准备', async () => {
    await expect(prepareSampleFolder()).rejects.toThrow('桌面应用')
  })
})
