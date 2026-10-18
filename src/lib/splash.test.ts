import { describe, expect, it } from 'vitest'
import {
  shouldLeaveSplash,
  SPLASH_MAX_MS,
  SPLASH_MIN_MS,
  SPLASH_SPEEDS,
  timingFor,
} from './splash'

describe('开屏收场条件', () => {
  it('环境还没探完时不收场，哪怕最短时长已经过去', () => {
    expect(shouldLeaveSplash({ ready: false, minElapsed: true, overdue: false })).toBe(false)
  })

  it('环境探完还要等入场动画走完，不能一闪而过', () => {
    expect(shouldLeaveSplash({ ready: true, minElapsed: false, overdue: false })).toBe(false)
    expect(shouldLeaveSplash({ ready: true, minElapsed: true, overdue: false })).toBe(true)
  })

  it('环境迟迟探不完时按兜底时长收场，别把开屏挂死', () => {
    expect(shouldLeaveSplash({ ready: false, minElapsed: true, overdue: true })).toBe(true)
  })
})

describe('开屏停留档位', () => {
  it('标准档就是原来那两个常量', () => {
    const timing = timingFor('normal')

    expect(timing.minMs).toBe(SPLASH_MIN_MS)
    expect(timing.maxMs).toBe(SPLASH_MAX_MS)
  })

  it('快档比标准短，关闭档探完就进', () => {
    expect(timingFor('fast').minMs).toBeLessThan(SPLASH_MIN_MS)
    expect(timingFor('off').minMs).toBe(0)
    // 关闭档也得留一个兜底上限：环境卡住时不能一直挡着
    expect(timingFor('off').maxMs).toBeGreaterThan(0)
  })

  /** 手改配置文件写错一个字母，不该让开屏一闪而过或者卡十秒。 */
  it('认不出来的档位按标准档处理', () => {
    expect(timingFor('慢动作')).toEqual(timingFor('normal'))
    expect(timingFor(null)).toEqual(timingFor('normal'))
    expect(timingFor(undefined)).toEqual(timingFor('normal'))
  })

  it('每个档位都有给人看的名字，且 id 唯一', () => {
    const ids = SPLASH_SPEEDS.map((item) => item.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(SPLASH_SPEEDS.every((item) => item.label.length > 0)).toBe(true)
  })
})
