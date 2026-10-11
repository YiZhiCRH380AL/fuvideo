import type { TrackInfo } from './backend'

/** 延迟的细调步长。 */
export const DELAY_STEP = 0.1
/** 延迟的粗调步长。字幕慢半秒这种常见情况，一下一下点 0.1 太累。 */
export const DELAY_COARSE_STEP = 0.5
/** 延迟的允许范围，和后端保持一致。 */
export const DELAY_LIMIT = 10

/** 字幕字号的可用区间。mpv 允许 1-9000，但界面上给个能用的范围就够。 */
export const SUBTITLE_SIZE_RANGE = { min: 20, max: 120, step: 2 }
/** 字幕位置的可用区间：0 在顶部，100 在底部。 */
export const SUBTITLE_POSITION_RANGE = { min: 0, max: 150, step: 5 }

/** 声道布局。`auto-safe` 是 mpv 的默认值：按文件里的声道来。 */
export const AUDIO_CHANNEL_OPTIONS = [
  { value: 'auto-safe', label: '跟随文件' },
  { value: 'stereo', label: '立体声' },
  { value: 'mono', label: '单声道' },
  { value: '5.1', label: '5.1' },
  { value: '7.1', label: '7.1' },
] as const

/**
 * ASS 字幕样式覆盖。
 *
 * 默认的 `scale` 是跟着字幕文件走的：文件里写死了字体和位置，
 * 播放器这边调字号、调位置可能看不到变化。想让它们生效就得选 `force`。
 */
export const SUBTITLE_STYLE_OPTIONS = [
  { value: 'scale', label: '跟随字幕文件' },
  { value: 'force', label: '用播放器样式' },
] as const

/** 把数值夹进区间。NaN 这种坏值折到下限，别让它一路传下去。 */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

/** 按步长调整一个数值并夹进区间，顺手消掉浮点累积出来的小数尾巴。 */
export function stepNumber(current: number, delta: number, min: number, max: number): number {
  const base = Number.isFinite(current) ? current : min
  return clampNumber(Math.round((base + delta) * 10) / 10, min, max)
}

/** 调整延迟：先夹到 ±10 秒，再保留一位小数。 */
export function stepDelay(current: number, delta: number): number {
  // 坏值以「没调过」为起点：延迟的区间是 ±10，拿下限当初值会突然跳到 -10 秒
  return stepNumber(Number.isFinite(current) ? current : 0, delta, -DELAY_LIMIT, DELAY_LIMIT)
}

/** 延迟的显示文本：0.0s / +0.5s / -1.2s。 */
export function formatDelay(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.round(seconds * 10) / 10 : 0

  if (value === 0) {
    return '0.0s'
  }

  return `${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(1)}s`
}

/** 步进按钮上的文字。 */
export function formatStep(delta: number, suffix = ''): string {
  const value = Math.round(delta * 10) / 10
  return `${value > 0 ? '+' : ''}${value}${suffix}`
}

/** 语言代码换成看得懂的名字；认不出来就原样显示。 */
const LANGUAGE_LABELS: Record<string, string> = {
  ja: '日语',
  jpn: '日语',
  zh: '中文',
  chi: '中文',
  zho: '中文',
  en: '英语',
  eng: '英语',
  ko: '韩语',
  kor: '韩语',
  fr: '法语',
  fra: '法语',
  fre: '法语',
  de: '德语',
  deu: '德语',
  ger: '德语',
  es: '西班牙语',
  spa: '西班牙语',
  ru: '俄语',
  rus: '俄语',
  pt: '葡萄牙语',
  por: '葡萄牙语',
  it: '意大利语',
  ita: '意大利语',
  th: '泰语',
  tha: '泰语',
}

export function languageLabel(lang: string | null): string | null {
  if (lang === null) {
    return null
  }

  const key = lang.trim().toLowerCase()

  if (key === '') {
    return null
  }

  return LANGUAGE_LABELS[key] ?? lang
}

/** 轨道在列表里的主标题：优先用轨道自带的名字，其次语言，最后编号。 */
export function trackTitle(track: TrackInfo, index: number): string {
  const title = track.title?.trim()

  if (title !== undefined && title !== '') {
    return title
  }

  const language = languageLabel(track.lang)

  if (language !== null) {
    return language
  }

  return track.kind === 'sub' ? `字幕 ${index + 1}` : `音轨 ${index + 1}`
}

/** 轨道右侧的次要信息：编码、是否外挂。都没有就返回 null。 */
export function trackDetail(track: TrackInfo): string | null {
  const parts: string[] = []

  if (track.codec !== null && track.codec.trim() !== '') {
    parts.push(track.codec.toUpperCase())
  }

  if (track.external) {
    parts.push('外挂')
  }

  return parts.length === 0 ? null : parts.join(' · ')
}
