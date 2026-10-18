import { describe, expect, it } from 'vitest'
import { formatDuration, formatRelativeTime } from './time'

describe('formatDuration', () => {
  it('不足一分钟时按 m:ss 输出', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(7)).toBe('0:07')
    expect(formatDuration(59)).toBe('0:59')
  })

  it('超过一分钟时按 m:ss 输出', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(605)).toBe('10:05')
  })

  it('超过一小时时按 h:mm:ss 输出', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('小数秒向下取整', () => {
    expect(formatDuration(12.9)).toBe('0:12')
  })

  it('非法输入回退到 0:00', () => {
    expect(formatDuration(-1)).toBe('0:00')
    expect(formatDuration(Number.NaN)).toBe('0:00')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

describe('formatRelativeTime', () => {
  // 固定一个「现在」，免得用例跟着真实时间飘
  const now = Date.UTC(2026, 8, 20, 12, 0, 0)
  const secondsAgo = (seconds: number): number => Math.floor(now / 1000) - seconds

  it('一分钟内说「刚刚」', () => {
    expect(formatRelativeTime(secondsAgo(0), now)).toBe('刚刚')
    expect(formatRelativeTime(secondsAgo(59), now)).toBe('刚刚')
  })

  it('小时内按分钟、一天内按小时', () => {
    expect(formatRelativeTime(secondsAgo(60), now)).toBe('1 分钟前')
    expect(formatRelativeTime(secondsAgo(59 * 60), now)).toBe('59 分钟前')
    expect(formatRelativeTime(secondsAgo(3600), now)).toBe('1 小时前')
    expect(formatRelativeTime(secondsAgo(23 * 3600), now)).toBe('23 小时前')
  })

  it('隔一天说「昨天」，再久按天，超过 30 天给日期', () => {
    expect(formatRelativeTime(secondsAgo(24 * 3600), now)).toBe('昨天')
    expect(formatRelativeTime(secondsAgo(3 * 24 * 3600), now)).toBe('3 天前')
    expect(formatRelativeTime(secondsAgo(40 * 24 * 3600), now)).toBe('8月11日')
  })

  /** 时钟回拨时时间戳会比「现在」还晚：说「刚刚」，别显示负数。 */
  it('未来的时间戳当刚刚', () => {
    expect(formatRelativeTime(secondsAgo(-600), now)).toBe('刚刚')
  })

  it('坏值给空串', () => {
    expect(formatRelativeTime(Number.NaN, now)).toBe('')
  })
})
