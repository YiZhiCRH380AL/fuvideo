import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SPLASH_EXIT_MS, SPLASH_MAX_MS, SPLASH_MIN_MS } from '../lib/splash'
import Splash from './Splash'

/** 推进假时钟：React 的状态更新要在 act 里跑。 */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function renderSplash(ready: boolean) {
  const onLeave = vi.fn()
  const onDone = vi.fn()
  const view = render(<Splash ready={ready} onLeave={onLeave} onDone={onDone} />)

  return { onLeave, onDone, view }
}

const splash = () => screen.getByTestId('splash')

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('开屏浮层', () => {
  it('先亮出 logo、字标和状态线', () => {
    renderSplash(false)

    expect(splash()).toHaveAttribute('data-leaving', 'false')
    expect(splash().querySelector('.splash__logo')).not.toBeNull()
    expect(splash().querySelector('.splash__name')).toHaveTextContent('FutureVideo')
  })

  it('环境没探完就一直等，不会自己先走', async () => {
    const { onLeave } = renderSplash(false)

    await advance(SPLASH_MIN_MS + 200)

    expect(splash()).toHaveAttribute('data-leaving', 'false')
    expect(onLeave).not.toHaveBeenCalled()
  })

  it('环境探完、入场动画也走完后才开始收场', async () => {
    const { onLeave } = renderSplash(true)

    await advance(SPLASH_MIN_MS)

    expect(splash()).toHaveAttribute('data-leaving', 'true')
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('收场动画播完才通知卸载，中间给界面留出淡入的时间', async () => {
    const { onDone } = renderSplash(true)

    await advance(SPLASH_MIN_MS)
    expect(onDone).not.toHaveBeenCalled()

    await advance(SPLASH_EXIT_MS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('环境探得慢，中间探完就立刻收场，不再补等', async () => {
    const onLeave = vi.fn()
    const view = render(<Splash ready={false} onLeave={onLeave} onDone={vi.fn()} />)

    await advance(SPLASH_MIN_MS + 400)
    expect(onLeave).not.toHaveBeenCalled()

    view.rerender(<Splash ready onLeave={onLeave} onDone={vi.fn()} />)

    expect(splash()).toHaveAttribute('data-leaving', 'true')
  })

  it('环境一直探不出来时按兜底时长收场', async () => {
    renderSplash(false)

    await advance(SPLASH_MAX_MS)

    expect(splash()).toHaveAttribute('data-leaving', 'true')
  })
})
