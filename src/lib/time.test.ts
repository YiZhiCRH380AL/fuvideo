import { describe, expect, it } from 'vitest'
import { formatDuration } from './time'

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
