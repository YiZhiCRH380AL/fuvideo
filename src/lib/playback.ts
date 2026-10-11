/** 可选的播放倍速档位。 */
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/** 调整音量的步长。 */
export const VOLUME_STEP = 5
/** 方向键快进快退的秒数。 */
export const SEEK_STEP = 5
/** J / L 快进快退的秒数。 */
export const JUMP_STEP = 10

/** 把音量归一到 0-100 的整数。 */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round(value)))
}

export function stepVolume(current: number, delta: number): number {
  return clampVolume(clampVolume(current) + delta)
}

/** 倍速显示成 1x / 1.25x 这样的短文本。 */
export function formatSpeed(speed: number): string {
  if (!Number.isFinite(speed)) {
    return '1x'
  }

  return `${Number(speed.toFixed(2))}x`
}

/** 回退到与给定值最接近的档位。 */
function nearestSpeed(value: number): number {
  return SPEED_OPTIONS.reduce(
    (best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best),
    SPEED_OPTIONS[0] as number,
  )
}

/**
 * 切换到相邻档位：升速取比当前大的最小档，降速取比当前小的最大档。
 * 已经在两端时原地不动。
 */
export function stepSpeed(current: number, direction: 1 | -1): number {
  if (!Number.isFinite(current)) {
    return 1
  }

  const candidates = SPEED_OPTIONS.filter((option) => (direction === 1 ? option > current : option < current))

  if (candidates.length === 0) {
    return nearestSpeed(current)
  }

  return direction === 1 ? candidates[0] : candidates[candidates.length - 1]
}
