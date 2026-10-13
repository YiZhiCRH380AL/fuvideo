import { thumbnailAt } from './backend'

/**
 * 缩略图的共用缓存。
 *
 * 抓一帧要起/复用后台那个无界面的 mpv，一次一百多毫秒，而且是串行的。
 * 方格墙和播放列表/收藏夹面板都会用到同一批帧，各抓各的等于把时间翻倍，
 * 所以缓存放这儿共用一份。
 */
const cache = new Map<string, string>()
/** 正在抓的那些，避免同一个路径排队抓两遍。 */
const pending = new Map<string, Promise<string | null>>()

export function cachedThumbnail(path: string): string | undefined {
  return cache.get(path)
}

/** 清空缓存。测试之间要清，否则后一个用例会拿到前一个抓到的帧、不再去问后端。 */
export function clearThumbnails(): void {
  cache.clear()
  pending.clear()
}

/** 抓首帧并缓存。抓不到返回 null，由调用方决定怎么显示。 */
export function loadThumbnail(path: string): Promise<string | null> {
  const cached = cache.get(path)

  if (cached !== undefined) {
    return Promise.resolve(cached)
  }

  const inFlight = pending.get(path)

  if (inFlight !== undefined) {
    return inFlight
  }

  const task = thumbnailAt(path, 0)
    .then((image) => {
      cache.set(path, image)
      return image
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(path)
    })

  pending.set(path, task)
  return task
}
