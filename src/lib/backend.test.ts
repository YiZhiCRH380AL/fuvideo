import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  describeProbe,
  getBackendStatus,
  getPlayerDetails,
  isTauri,
  readSettings,
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
