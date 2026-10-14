import { describe, expect, it } from 'vitest'
import { hasFired, remainingSeconds, sleepDeadline } from './sleep'

describe('sleepDeadline', () => {
  it('按分钟算出到点时刻', () => {
    expect(sleepDeadline(15, 1_000_000)).toBe(1_000_000 + 15 * 60_000)
  })
})

describe('remainingSeconds', () => {
  it('向上取整到秒，方便显示成 14:59 这种倒计时', () => {
    expect(remainingSeconds(60_000, 0)).toBe(60)
    expect(remainingSeconds(60_000, 500)).toBe(60)
    expect(remainingSeconds(60_000, 59_600)).toBe(0)
  })

  /** 过点了也不是负数：界面上不该出现「还有 -3 秒」。 */
  it('过点了就是 0', () => {
    expect(remainingSeconds(1_000, 5_000)).toBe(0)
  })
})

describe('hasFired', () => {
  it('到点那一刻就算到点', () => {
    expect(hasFired(5_000, 4_999)).toBe(false)
    expect(hasFired(5_000, 5_000)).toBe(true)
    expect(hasFired(5_000, 5_001)).toBe(true)
  })
})
