import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdleVisibility } from './use-idle-visibility'

function Probe({ enabled, pinned }: { enabled: boolean; pinned: boolean }) {
  const visible = useIdleVisibility({ delayMs: 2500, enabled, pinned })

  return <div data-testid="probe">{visible ? 'visible' : 'hidden'}</div>
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds)
  })
}

describe('useIdleVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('播放中空闲一段时间后隐藏控件', () => {
    render(<Probe enabled pinned={false} />)

    expect(screen.getByTestId('probe')).toHaveTextContent('visible')

    advance(2500)

    expect(screen.getByTestId('probe')).toHaveTextContent('hidden')
  })

  it('鼠标一动就唤回控件，并重新计时', () => {
    render(<Probe enabled pinned={false} />)

    advance(2000)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'))
    })
    advance(2000)

    expect(screen.getByTestId('probe')).toHaveTextContent('visible')

    advance(600)

    expect(screen.getByTestId('probe')).toHaveTextContent('hidden')
  })

  it('暂停（enabled 为 false）时控件常驻', () => {
    render(<Probe enabled={false} pinned={false} />)

    advance(10_000)

    expect(screen.getByTestId('probe')).toHaveTextContent('visible')
  })

  it('鼠标停在控件上（pinned）时不会隐藏', () => {
    render(<Probe enabled pinned />)

    advance(10_000)

    expect(screen.getByTestId('probe')).toHaveTextContent('visible')
  })
})
