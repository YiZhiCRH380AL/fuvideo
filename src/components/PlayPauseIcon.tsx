import { useEffect, useRef } from 'react'

/**
 * 播放与暂停图标之间的形变。
 *
 * 两个状态都写成 8 个顶点的多边形：命令结构一致，浏览器才能对路径做插值。
 * 三角形的两个重复顶点在暂停态对应两条竖条的外沿，看起来就是三角形
 * 从右侧裂开成两根竖条（反过来则合并）。
 */
const PLAY_POINTS: Array<[number, number]> = [
  [9, 5],
  [20, 12],
  [20, 12],
  [20, 12],
  [9, 19],
  [9, 19],
  [9, 19],
  [9, 5],
]

const PAUSE_POINTS: Array<[number, number]> = [
  [8, 5],
  [11, 5],
  [11, 19],
  [8, 19],
  [16, 5],
  [19, 5],
  [19, 19],
  [16, 19],
]

function toPath(points: Array<[number, number]>): string {
  return `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
}

const PLAY_PATH = toPath(PLAY_POINTS)
const PAUSE_PATH = toPath(PAUSE_POINTS)

export interface PlayPauseIconProps {
  /** true 表示当前是暂停状态，图标应显示三角形。 */
  paused: boolean
}

export default function PlayPauseIcon({ paused }: PlayPauseIconProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const shownRef = useRef(paused ? PAUSE_PATH : PLAY_PATH)

  useEffect(() => {
    const target = paused ? PAUSE_PATH : PLAY_PATH
    const from = shownRef.current
    shownRef.current = target

    const path = pathRef.current

    // jsdom 没有 Web Animations API，直接切到目标形状
    if (from === target || path === null || typeof path.animate !== 'function') {
      return
    }

    path.animate([{ d: `path("${from}")` }, { d: `path("${target}")` }], {
      duration: 220,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    })
  }, [paused])

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path ref={pathRef} d={paused ? PAUSE_PATH : PLAY_PATH} />
    </svg>
  )
}
