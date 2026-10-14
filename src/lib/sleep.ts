/**
 * 定时关闭的时间账。
 *
 * 单独拎出来是因为「什么时候算到点」这件事最容易写错（差一秒、负数、忘了取整），
 * 而它又不好在界面用例里等——最短的档位也是十五分钟。放在这里用真时间算就行。
 */

/** 从 `now` 开始算，`minutes` 分钟之后是哪个时刻。 */
export function sleepDeadline(minutes: number, now: number): number {
  return now + minutes * 60_000
}

/** 还剩多少秒。已经过点了就是 0，不返回负数。 */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.round((endsAt - now) / 1000))
}

/** 到点没有。 */
export function hasFired(endsAt: number, now: number): boolean {
  return now >= endsAt
}
