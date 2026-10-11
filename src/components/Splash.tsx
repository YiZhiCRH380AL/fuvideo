import { useEffect, useRef, useState } from 'react'
import {
  shouldLeaveSplash,
  SPLASH_EXIT_MS,
  SPLASH_MAX_MS,
  SPLASH_MIN_MS,
} from '../lib/splash'
import './Splash.css'

export interface SplashProps {
  /** 运行环境是否已经探测完。探完之前不急着收场，免得先露出「正在检测」。 */
  ready: boolean
  /** 开始收场：此时底下的界面同时开始淡入。 */
  onLeave: () => void
  /** 收场动画播完，可以整块卸载了。 */
  onDone: () => void
}

/**
 * 开屏浮层。
 *
 * 底色、logo、字标、进度线按顺序入场，等运行环境探完再整块淡出。
 * 入场是 CSS 动画（第一帧就到位，窗口一显示就是满的），收场靠 data-leaving
 * 切过渡，JS 只负责掐时间，不参与逐帧。
 */
export default function Splash({ ready, onLeave, onDone }: SplashProps) {
  const [minElapsed, setMinElapsed] = useState(SPLASH_MIN_MS <= 0)
  const [overdue, setOverdue] = useState(SPLASH_MAX_MS <= 0)

  /*
   * 收场条件是单调的（时长只会往前走，环境只会从「没探完」变成「探完」），
   * 所以直接算出来就行，不用再存一份 state 追着它跑。
   */
  const leaving = shouldLeaveSplash({ ready, minElapsed, overdue })

  /*
   * 回调放进 ref：父组件每次渲染都会给新函数，收场那次 effect 不能因为
   * 回调换了身份就重跑一遍计时。同步也放在 effect 里，避免渲染期改 ref。
   */
  const leaveRef = useRef(onLeave)
  const doneRef = useRef(onDone)

  useEffect(() => {
    leaveRef.current = onLeave
    doneRef.current = onDone
  })

  useEffect(() => {
    if (minElapsed) {
      return
    }

    const timer = window.setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS)
    return () => window.clearTimeout(timer)
  }, [minElapsed])

  useEffect(() => {
    if (overdue) {
      return
    }

    const timer = window.setTimeout(() => setOverdue(true), SPLASH_MAX_MS)
    return () => window.clearTimeout(timer)
  }, [overdue])

  useEffect(() => {
    if (!leaving) {
      return
    }

    leaveRef.current()
    const timer = window.setTimeout(() => doneRef.current(), SPLASH_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  return (
    <div className="splash" data-testid="splash" data-leaving={leaving ? 'true' : 'false'}>
      {/* 开屏是过场，别让读屏软件在这里停下来 */}
      <span className="splash__glow" aria-hidden="true" />

      <span className="splash__mark" aria-hidden="true">
        <svg className="splash__logo" viewBox="0 0 1024 1024" focusable="false">
          <defs>
            <linearGradient id="splash-surface" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1c1c24" />
              <stop offset="100%" stopColor="#0a0a0c" />
            </linearGradient>
            <linearGradient id="splash-accent" x1="0.1" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#9cc7ff" />
              <stop offset="100%" stopColor="#5b8def" />
            </linearGradient>
            <radialGradient id="splash-halo" cx="0.5" cy="0.45" r="0.5">
              <stop offset="0%" stopColor="#6ea8ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#6ea8ff" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="1024" height="1024" rx="228" fill="url(#splash-surface)" />
          <rect
            x="10"
            y="10"
            width="1004"
            height="1004"
            rx="220"
            fill="none"
            stroke="#34343e"
            strokeWidth="12"
          />
          <circle cx="512" cy="486" r="340" fill="url(#splash-halo)" />

          {/* 和图标同一套形状：播放三角形中间留一道缝 */}
          <path d="M 378 296 L 506 399 L 506 625 L 378 728 Z" fill="url(#splash-accent)" />
          <path d="M 530 418 L 646 512 L 530 606 Z" fill="url(#splash-accent)" />
        </svg>
      </span>

      <span className="splash__name" aria-hidden="true">
        futurevideo
      </span>

      <span className="splash__bar" aria-hidden="true" />
    </div>
  )
}
