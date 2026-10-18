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

/**
 * 开屏的停留时长档位。
 *
 * 只改「停多久」，不动入场与收场那两段动效——用户明确要求别动开屏的样子。
 * `off` 不是「不播开屏」，而是「探完就进」：收场那 460ms 还是走的，
 * 不然窗口会从开屏一下切成方格，反而像闪了一下。
 */
export type SplashSpeed = 'fast' | 'normal' | 'off'

export interface SplashTiming {
  /** 最短停留时间。 */
  minMs: number
  /** 兜底时长：环境迟迟探不完也不能一直挡着。 */
  maxMs: number
}

export const DEFAULT_SPLASH_SPEED: SplashSpeed = 'normal'

export const SPLASH_SPEEDS: { id: SplashSpeed; label: string; timing: SplashTiming }[] = [
  { id: 'off', label: '关闭（探完就进）', timing: { minMs: 0, maxMs: 600 } },
  { id: 'fast', label: '快', timing: { minMs: 700, maxMs: 1600 } },
  { id: 'normal', label: '标准', timing: { minMs: SPLASH_MIN_MS, maxMs: SPLASH_MAX_MS } },
]

/**
 * 把设置里的档位收敛成认识的那三个。认不出来的值一律按「标准」——
 * 手改配置文件写错一个字母，不该让开屏变得一闪而过或者卡十秒。
 */
export function speedFor(value: string | null | undefined): SplashSpeed {
  return SPLASH_SPEEDS.some((item) => item.id === value)
    ? (value as SplashSpeed)
    : DEFAULT_SPLASH_SPEED
}

/** 把设置里的档位翻成时序。 */
export function timingFor(speed: string | null | undefined): SplashTiming {
  const id = speedFor(speed)

  return SPLASH_SPEEDS.find((item) => item.id === id)?.timing ?? SPLASH_SPEEDS[2].timing
}

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
