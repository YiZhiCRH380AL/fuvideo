import {
  memo,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { BrowseEntry } from '../lib/backend'

export interface GridFlash {
  id: number
  x: number
  y: number
  offset: number
}

export interface VideoGridProps {
  videos: BrowseEntry[]
  thumbnails: Record<string, string>
  /** 正在播放、并且已经放大成画面的那一个；没有则为 null。 */
  expandedPath: string | null
  /** 双击放大画面时浮出的涟漪提示。 */
  flash: GridFlash | null
  buffering: boolean
  onOpen: (path: string, from: DOMRect) => void
  onTogglePlay: () => void
  onSeekBy: (offset: number) => void
}

interface TileProps {
  video: BrowseEntry
  thumbnail: string | undefined
  expanded: boolean
  flash: GridFlash | null
  buffering: boolean
  onOpen: (path: string, from: DOMRect) => void
  onTogglePlay: () => void
  onSeekBy: (offset: number) => void
}

const Tile = memo(function Tile({
  video,
  thumbnail,
  expanded,
  flash,
  buffering,
  onOpen,
  onTogglePlay,
  onSeekBy,
}: TileProps) {
  /** 放大后的画面：单击切播放暂停，双击左右半屏快退快进。 */
  const handleExpandedClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.detail > 1) {
      return
    }

    onTogglePlay()
  }

  const handleExpandedDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const localX = event.clientX - rect.left

    onSeekBy(localX < rect.width / 2 ? -10 : 10)
  }

  if (expanded) {
    return (
      <div
        className="tile tile--expanded"
        data-tile={video.path}
        data-testid="expanded-tile"
        onClick={handleExpandedClick}
        onDoubleClick={handleExpandedDoubleClick}
      >
        {flash ? (
          <div className="flash" key={flash.id}>
            <span
              className="flash__ripple"
              data-testid="flash-ripple"
              style={{ '--x': `${flash.x}%`, '--y': `${flash.y}%` } as CSSProperties}
            />
            <span className="flash__badge">
              {flash.offset > 0 ? `+${flash.offset}s` : `${flash.offset}s`}
            </span>
          </div>
        ) : null}

        {buffering ? <span className="buffering" data-testid="buffering" /> : null}
      </div>
    )
  }

  return (
    <button
      className="tile"
      data-tile={video.path}
      type="button"
      title={video.name}
      onClick={(event) => onOpen(video.path, event.currentTarget.getBoundingClientRect())}
    >
      {thumbnail === undefined ? (
        <span className="tile__placeholder" />
      ) : (
        <img className="tile__image" src={thumbnail} alt="" loading="lazy" decoding="async" />
      )}
      <span className="tile__play" aria-hidden="true">
        ▶
      </span>
      <span className="tile__label">{video.name}</span>
    </button>
  )
})

/**
 * 视频方格墙。
 *
 * 点一个方格就把它放大成铺满视口的画面，并用 `order: -1` 挪到最前面，
 * 于是其他方格整体向下让位。放大的那一格背景透明，让底层 mpv 的画面透出来。
 *
 * 放大会改变相邻格子的位置，这里用 FLIP：先记下变化前的外接矩形，
 * DOM 更新后再把每个格子从旧位置动画到新位置。
 */
export default function VideoGrid({
  videos,
  thumbnails,
  expandedPath,
  flash,
  buffering,
  onOpen,
  onTogglePlay,
  onSeekBy,
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

      // 放大那一下不做形变，直接换形态更干脆
      if (tile.classList.contains('tile--expanded')) {
        continue
      }

      // 测试环境（jsdom）没有 Web Animations API，直接跳过动画，布局仍然正确
      if (typeof tile.animate !== 'function') {
        continue
      }

      // 提前提层，避免动画期间每帧重新栅格化
      tile.style.willChange = 'transform'

      const animation = tile.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})` },
          { transform: 'none' },
        ],
        // 末段带一点点过冲，格子归位才有「被推过去」的手感
        { duration: 320, easing: 'cubic-bezier(0.34, 1.12, 0.5, 1)' },
      )

      animation.addEventListener(
        'finish',
        () => {
          tile.style.willChange = ''
        },
        { once: true },
      )

      // 文字被整体缩放会糊，动画期间先藏起来再淡回
      tile
        .querySelector('.tile__label')
        ?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'linear' })
    }

    // 注意依赖里没有 thumbnails：缩略图到达不改变任何格子的位置，
    // 把它放进来会让每张图到达都触发一次全网格测量，直接卡住
    previousRects.current = next
  }, [videos, expandedPath])

  return (
    <div
      className="grid"
      ref={containerRef}
      data-testid="video-grid"
      data-expanded={expandedPath !== null ? 'true' : 'false'}
    >
      {videos.map((video) => (
        <Tile
          key={video.path}
          video={video}
          thumbnail={thumbnails[video.path]}
          expanded={video.path === expandedPath}
          flash={video.path === expandedPath ? flash : null}
          buffering={video.path === expandedPath && buffering}
          onOpen={onOpen}
          onTogglePlay={onTogglePlay}
          onSeekBy={onSeekBy}
        />
      ))}
    </div>
  )
}
