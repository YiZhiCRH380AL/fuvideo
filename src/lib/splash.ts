/**
 * 开屏动画的节奏。
 *
 * 开屏不是为了拖时间，而是为了遮住「窗口刚起来、播放内核还在探」的那一下。
 * 所以它有两个边界：环境秒探完也要把入场动画走完（SPLASH_MIN_MS），
 * 探得太久也不能一直挡着（SPLASH_MAX_MS）。
 */

/** 最短停留时间：入场动画本身就有这么久，早收场反而像闪了一下。 */
export const SPLASH_MIN_MS = 1150

/** 兜底时长：环境迟迟探不完就先放人进去，顶栏自己会提示。 */
export const SPLASH_MAX_MS = 2600

/** 收场时长，必须和 Splash.css 里的 --dur-splash 一致。 */
export const SPLASH_EXIT_MS = 460

export interface SplashGate {
  /** 运行环境是否已经探测完（成功或失败都算探完）。 */
  ready: boolean
  /** 最短停留时间是否已经过去。 */
  minElapsed: boolean
  /** 是否已经等到兜底时长。 */
  overdue: boolean
}

/** 开屏是否可以收场了。 */
export function shouldLeaveSplash({ ready, minElapsed, overdue }: SplashGate): boolean {
  return overdue || (ready && minElapsed)
}
