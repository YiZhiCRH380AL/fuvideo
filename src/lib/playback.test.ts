import { describe, expect, it } from 'vitest'
import { clampVolume, formatSpeed, SPEED_OPTIONS, stepSpeed, stepVolume } from './playback'

describe('clampVolume', () => {
  it('把音量限制在 0-100', () => {
    expect(clampVolume(-20)).toBe(0)
    expect(clampVolume(150)).toBe(100)
    expect(clampVolume(42.4)).toBe(42)
  })

  it('非法输入回退到 0', () => {
    expect(clampVolume(Number.NaN)).toBe(0)
  })
})

describe('stepVolume', () => {
  it('按步长增减且不会越界', () => {
    expect(stepVolume(50, 5)).toBe(55)
    expect(stepVolume(50, -5)).toBe(45)
    expect(stepVolume(98, 5)).toBe(100)
    expect(stepVolume(2, -5)).toBe(0)
  })
})

describe('formatSpeed', () => {
  it('整数倍速显示成 1x', () => {
    expect(formatSpeed(1)).toBe('1x')
    expect(formatSpeed(2)).toBe('2x')
  })

  it('小数倍速保留必要位数', () => {
    expect(formatSpeed(0.5)).toBe('0.5x')
    expect(formatSpeed(1.25)).toBe('1.25x')
  })

  it('非法输入回退到 1x', () => {
    expect(formatSpeed(Number.NaN)).toBe('1x')
  })
})

describe('stepSpeed', () => {
  it('在档位之间移动', () => {
    expect(stepSpeed(1, 1)).toBe(1.25)
    expect(stepSpeed(1, -1)).toBe(0.75)
  })

  it('到达两端后保持不动', () => {
    expect(stepSpeed(SPEED_OPTIONS[SPEED_OPTIONS.length - 1], 1)).toBe(2)
    expect(stepSpeed(SPEED_OPTIONS[0], -1)).toBe(0.5)
  })

  it('当前值不在档位上时也朝正确方向移动', () => {
    expect(stepSpeed(1.1, 1)).toBe(1.25)
    expect(stepSpeed(1.1, -1)).toBe(1)
  })

  it('非法输入回退到 1 倍速', () => {
    expect(stepSpeed(Number.NaN, 1)).toBe(1)
  })
})
