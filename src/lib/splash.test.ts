import { describe, expect, it } from 'vitest'
import { shouldLeaveSplash } from './splash'

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
