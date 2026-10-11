import { useEffect, useRef } from 'react'

/**
 * 播放与暂停图标之间的形变。
 *
 * 两个状态都写成「两个四边形」：结构一致，浏览器才能对路径做插值。
 * 播放态是三角形沿 x=14.5 切成左右两半（各是一个四边形），
 * 暂停态是两根竖条。于是形变看起来就是两半合拢成三角形、或者裂开成两根条。
 *
 * 注意不能把暂停画成一条 8 点闭合折线——那样第一根的左下角会直接连到
 * 第二根的左上角，nonzero 填充下会变成自交的蝴蝶形，不是两根条。
 */
const PLAY_LEFT: Array<[number, number]> = [
  [9, 5],
  [14.5, 8.5],
  [14.5, 15.5],
  [9, 19],
]

const PLAY_RIGHT: Array<[number, number]> = [
  [14.5, 8.5],
  [20, 12],
  [20, 12],
  [14.5, 15.5],
]

const PAUSE_LEFT: Array<[number, number]> = [
  [8, 5],
  [11, 5],
  [11, 19],
  [8, 19],
]

const PAUSE_RIGHT: Array<[number, number]> = [
  [16, 5],
  [19, 5],
  [19, 19],
  [16, 19],
]

function toQuad(points: Array<[number, number]>): string {
  return `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
}

function toPath(left: Array<[number, number]>, right: Array<[number, number]>): string {
  return `${toQuad(left)} ${toQuad(right)}`
}

const PLAY_PATH = toPath(PLAY_LEFT, PLAY_RIGHT)
const PAUSE_PATH = toPath(PAUSE_LEFT, PAUSE_RIGHT)

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
      duration: 240,
      easing: 'cubic-bezier(0.34, 1.2, 0.5, 1)',
    })
  }, [paused])

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path ref={pathRef} d={paused ? PAUSE_PATH : PLAY_PATH} />
    </svg>
  )
}
