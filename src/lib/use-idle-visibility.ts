import { useEffect, useRef, useState } from 'react'

/** 会被视为「用户还在操作」的事件。 */
const ACTIVITY_EVENTS = ['mousemove', 'pointerdown', 'keydown', 'wheel'] as const

export interface IdleVisibilityOptions {
  delayMs: number
  /** 只有满足条件（例如画面展开且正在播放）才自动隐藏。 */
  enabled: boolean
}

/**
 * 空闲一段时间后隐藏界面，任何操作都会立刻唤回。
 *
 * 只按「有没有操作」判断，不因为鼠标停在控件上就一直显示——
 * 那会让界面永远关不掉。
 */
export function useIdleVisibility({ delayMs, enabled }: IdleVisibilityOptions): boolean {
  const [idle, setIdle] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const clear = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }

    if (!enabled) {
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
  }, [delayMs, enabled])

  return !enabled || !idle
}
