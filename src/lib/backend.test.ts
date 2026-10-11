import { describe, expect, it } from 'vitest'
import { describeProbe, getBackendStatus, isTauri } from './backend'

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
