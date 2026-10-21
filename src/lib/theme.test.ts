import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_MOTION,
  DEFAULT_THEME,
  MOTION_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyMotionPreference,
  applyTheme,
  normalizeMotion,
  normalizeTheme,
  readMotionHint,
  readThemeHint,
  rememberAppearance,
  themeFor,
} from './theme'

describe('外观主题', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.motion
  })

  it('认不出的主题回落到极夜蓝', () => {
    expect(normalizeTheme('neon-pink')).toBe(DEFAULT_THEME)
    expect(themeFor('neon-pink').label).toBe('极夜蓝')
  })

  it('主题与动效偏好会写进 DOM', () => {
    applyTheme('forest')
    applyMotionPreference('subtle')

    expect(document.documentElement.dataset.theme).toBe('forest')
    expect(document.documentElement.dataset.motion).toBe('subtle')
  })

  it('本地提示值只接受已知档位', () => {
    rememberAppearance('blossom', 'off')

    expect(readThemeHint()).toBe('blossom')
    expect(readMotionHint()).toBe('off')

    window.localStorage.setItem(THEME_STORAGE_KEY, 'unknown')
    window.localStorage.setItem(MOTION_STORAGE_KEY, 'cinematic')

    expect(readThemeHint()).toBe(DEFAULT_THEME)
    expect(readMotionHint()).toBe(DEFAULT_MOTION)
    expect(normalizeMotion('cinematic')).toBe(DEFAULT_MOTION)
  })

  it('本地存储不可用时也不应让启动失败', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(readThemeHint()).toBe(DEFAULT_THEME)
    expect(readMotionHint()).toBe(DEFAULT_MOTION)
    expect(() => rememberAppearance('tide', 'full')).not.toThrow()
  })
})
