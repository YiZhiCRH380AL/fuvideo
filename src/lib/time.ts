/**
 * 把秒数格式化成播放器常见的时间文本。
 * 不足一小时用 m:ss，超过一小时用 h:mm:ss。
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00'
  }

  const seconds = Math.floor(totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/**
 * 「刚刚 / 5 分钟前 / 3 小时前 / 昨天 / 9月12日」。
 *
 * 时间戳是 Unix 秒（后端存的就是这个）。`now` 用来测试；时钟回拨（时间戳比现在还晚）
 * 一律说「刚刚」，别显示一个负数。
 */
export function formatRelativeTime(timestampSeconds: number, now: number = Date.now()): string {
  if (!Number.isFinite(timestampSeconds)) {
    return ''
  }

  const elapsed = Math.max(0, Math.floor(now / 1000 - timestampSeconds))

  if (elapsed < 60) {
    return '刚刚'
  }

  if (elapsed < 3600) {
    return `${Math.floor(elapsed / 60)} 分钟前`
  }

  if (elapsed < 86_400) {
    return `${Math.floor(elapsed / 3600)} 小时前`
  }

  if (elapsed < 172_800) {
    return '昨天'
  }

  if (elapsed < 86_400 * 30) {
    return `${Math.floor(elapsed / 86_400)} 天前`
  }

  const date = new Date(timestampSeconds * 1000)

  return `${date.getMonth() + 1}月${date.getDate()}日`
}
