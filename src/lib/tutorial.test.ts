import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasSeenTutorial, markTutorialSeen } from './tutorial'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('教程看过没有', () => {
  it('第一次进来是没看过的', () => {
    expect(hasSeenTutorial()).toBe(false)
  })

  it('记下看过后就不再自动弹', () => {
    markTutorialSeen()

    expect(hasSeenTutorial()).toBe(true)
  })

  it('本地存储读不了时当作看过，免得每次启动都盖一层', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied')
      },
    })

    expect(hasSeenTutorial()).toBe(true)
  })

  it('本地存储写不进去也不报错，只是下次还会弹', () => {
    vi.stubGlobal('localStorage', {
      setItem() {
        throw new Error('denied')
      },
    })

    expect(() => markTutorialSeen()).not.toThrow()
  })
})
