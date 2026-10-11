import { useLayoutEffect, useRef } from 'react'
import type { BrowseEntry } from '../lib/backend'

export interface VideoGridProps {
  videos: BrowseEntry[]
  thumbnails: Record<string, string>
  /** 被点开放大（但还没播放）的那一个。 */
  focusedPath: string | null
  currentPath: string | null
  onFocus: (path: string) => void
  onOpen: (path: string, from: DOMRect) => void
}

/**
 * 视频方格墙。点一下放大让位，再点一下播放。
 *
 * 放大会改变相邻格子的位置和尺寸，这里用 FLIP：先记下变化前每个格子的
 * 外接矩形，DOM 更新后再把每个格子从旧位置「倒着」动画到新位置。
 * 尺寸变化靠 scale 补，标签在动画期间淡出，避免被拉伸变形。
 */
export default function VideoGrid({
  videos,
  thumbnails,
  focusedPath,
  currentPath,
  onFocus,
  onOpen,
}: VideoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousRects = useRef(new Map<string, DOMRect>())

  useLayoutEffect(() => {
    const container = containerRef.current

    if (container === null) {
      return
    }

    const next = new Map<string, DOMRect>()

    for (const tile of container.querySelectorAll<HTMLElement>('[data-tile]')) {
      const key = tile.dataset.tile ?? ''
      const rect = tile.getBoundingClientRect()
      const previous = previousRects.current.get(key)

      next.set(key, rect)

      if (previous === undefined) {
        continue
      }

      const deltaX = previous.left - rect.left
      const deltaY = previous.top - rect.top
      const scaleX = previous.width / Math.max(rect.width, 1)
      const scaleY = previous.height / Math.max(rect.height, 1)

      const moved = Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1
      const resized = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01

      if (!moved && !resized) {
        continue
      }

      // 测试环境（jsdom）没有 Web Animations API，直接跳过动画，布局仍然正确
      if (typeof tile.animate !== 'function') {
        continue
      }

      tile.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})` },
          { transform: 'none' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      )

      // 文字被整体缩放会糊，动画期间先藏起来再淡回
      tile
        .querySelector('.tile__label')
        ?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'linear' })
    }

    previousRects.current = next
  }, [videos, focusedPath, thumbnails])

  return (
    <div className="grid" ref={containerRef} data-testid="video-grid">
      {videos.map((video) => {
        const thumbnail = thumbnails[video.path]
        const focused = focusedPath === video.path

        return (
          <button
            key={video.path}
            className="tile"
            data-tile={video.path}
            data-focused={focused ? 'true' : 'false'}
            data-current={video.path === currentPath ? 'true' : 'false'}
            type="button"
            title={video.name}
            aria-pressed={focused}
            onClick={(event) =>
              focused ? onOpen(video.path, event.currentTarget.getBoundingClientRect()) : onFocus(video.path)
            }
          >
            {thumbnail === undefined ? (
              <span className="tile__placeholder" />
            ) : (
              <img className="tile__image" src={thumbnail} alt="" />
            )}
            <span className="tile__play" aria-hidden="true">
              ▶
            </span>
            <span className="tile__label">{video.name}</span>
          </button>
        )
      })}
    </div>
  )
}
