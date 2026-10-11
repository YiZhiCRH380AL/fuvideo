import { useEffect, useRef } from 'react'
import { PAUSE_PATH, PLAY_PATH } from '../lib/play-pause-paths'

export interface PlayPauseIconProps {
  /** true 表示当前是暂停状态，图标应显示三角形。 */
  paused: boolean
}

export default function PlayPauseIcon({ paused }: PlayPauseIconProps) {
  const pathRef = useRef<SVGPathElement>(null)
  // paused 为真表示已经暂停，这时该显示「播放」三角形
  const shownRef = useRef(paused ? PLAY_PATH : PAUSE_PATH)

  useEffect(() => {
    const target = paused ? PLAY_PATH : PAUSE_PATH
    const from = shownRef.current
    shownRef.current = target

    const path = pathRef.current

    // jsdom 没有 Web Animations API，直接切到目标形状
    if (from === target || path === null || typeof path.animate !== 'function') {
      return
    }

    path.animate([{ d: `path("${from}")` }, { d: `path("${target}")` }], {
      duration: 240,
      easing: 'cubic-bezier(0.34, 1.2, 0.5, 1)',
    })
  }, [paused])

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path ref={pathRef} d={paused ? PLAY_PATH : PAUSE_PATH} />
    </svg>
  )
}
