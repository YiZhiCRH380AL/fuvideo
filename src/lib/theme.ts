/**
 * 外观主题与动效偏好。
 *
 * 主题 id 会同时写进 settings.json 和 localStorage：前者负责长期保存，
 * 后者让界面在异步读取设置之前就能铺上正确的颜色，避免开屏后闪一下默认主题。
 */

export interface ThemeDefinition {
  id: string
  label: string
  shortLabel: string
  description: string
  swatches: readonly [string, string, string]
}

export const THEMES = [
  {
    id: 'midnight',
    label: '极夜蓝',
    shortLabel: '极夜',
    description: '冷静的蓝紫与冰青，适合夜里长时间观看',
    swatches: ['#080b16', '#7c9cff', '#6ce5e8'],
  },
  {
    id: 'ember',
    label: '余烬橙',
    shortLabel: '余烬',
    description: '暖橙与金色，像散场后还亮着的一盏灯',
    swatches: ['#160c0b', '#ff8a5b', '#ffd166'],
  },
  {
    id: 'forest',
    label: '苔原绿',
    shortLabel: '苔原',
    description: '深林绿配青柠高光，安静而有生命力',
    swatches: ['#08120f', '#63d7a3', '#d3f26a'],
  },
  {
    id: 'tide',
    label: '潮汐青',
    shortLabel: '潮汐',
    description: '海面般的青蓝，清透、克制、不抢画面',
    swatches: ['#071319', '#41d6d9', '#77a7ff'],
  },
  {
    id: 'blossom',
    label: '莓果粉',
    shortLabel: '莓果',
    description: '莓粉与淡紫，给片单一点电影海报感',
    swatches: ['#160d14', '#ff83b7', '#b79cff'],
  },
  {
    id: 'daylight',
    label: '日光纸',
    shortLabel: '日光',
    description: '暖白纸张与朱砂红，适合明亮的桌面环境',
    swatches: ['#f3efe5', '#b4482e', '#2a7f77'],
  },
] as const satisfies readonly ThemeDefinition[]

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'midnight'
export const THEME_STORAGE_KEY = 'fuvideo.theme'

export const MOTION_MODES = [
  { id: 'full', label: '完整', description: '保留环境光、视差与主题切换动效' },
  { id: 'subtle', label: '轻量', description: '保留状态反馈，减少持续运动' },
  { id: 'off', label: '关闭', description: '不做过渡动画，只保留即时反馈' },
] as const

export type MotionPreference = (typeof MOTION_MODES)[number]['id']

export const DEFAULT_MOTION: MotionPreference = 'full'
export const MOTION_STORAGE_KEY = 'fuvideo.motion'

export function themeFor(id: unknown): (typeof THEMES)[number] {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function normalizeTheme(id: unknown): ThemeId {
  return themeFor(id).id
}

export function normalizeMotion(id: unknown): MotionPreference {
  return MOTION_MODES.find((mode) => mode.id === id)?.id ?? DEFAULT_MOTION
}

/** 提前铺主题。非浏览器环境（例如纯函数测试）安静跳过。 */
export function applyTheme(theme: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

export function applyMotionPreference(motion: MotionPreference): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.motion = motion
  }
}

function readStoredThemeValue(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readThemeHint(): ThemeId {
  return normalizeTheme(readStoredThemeValue(THEME_STORAGE_KEY))
}

export function readMotionHint(): MotionPreference {
  return normalizeMotion(readStoredThemeValue(MOTION_STORAGE_KEY))
}

/** 写本地提示值；隐私模式或测试桩不给 localStorage 时静默失败。 */
export function rememberAppearance(theme: ThemeId, motion: MotionPreference): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    window.localStorage.setItem(MOTION_STORAGE_KEY, motion)
  } catch {
    // 真正持久的设置在 settings.json；这里只是首帧优化
  }
}
