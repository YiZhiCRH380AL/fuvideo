import { useEffect, useRef, useState } from 'react'

/** 会被视为「用户还在操作」的事件。 */
const ACTIVITY_EVENTS = ['mousemove', 'pointerdown', 'keydown', 'wheel'] as const

export interface IdleVisibilityOptions {
  delayMs: number
  /** 只有播放中才自动隐藏；暂停时控件常驻。 */
  enabled: boolean
  /** 鼠标停在控件上时强制显示。 */
  pinned: boolean
}

/**
 * 空闲一段时间后隐藏控件，任何操作都会立刻唤回。
 */
export function useIdleVisibility({ delayMs, enabled, pinned }: IdleVisibilityOptions): boolean {
  const [idle, setIdle] = useState(false)
  const timer = useRef<number | null>(null)
  // 暂停或鼠标停在控件上时强制显示，这个结论在渲染期就能算出来，不需要放进 effect
  const forcedVisible = !enabled || pinned

  useEffect(() => {
    const clear = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }

    if (forcedVisible) {
      clear()
      return clear
    }

    const schedule = () => {
      clear()
      timer.current = window.setTimeout(() => {
        timer.current = null
        setIdle(true)
      }, delayMs)
    }

    const reveal = () => {
      setIdle(false)
      schedule()
    }

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, reveal))
    schedule()

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, reveal))
      clear()
    }
  }, [delayMs, forcedVisible])

  return forcedVisible || !idle
}
