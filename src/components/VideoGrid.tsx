import {
  memo,
  useEffect,
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
  /** 播放列表里的路径。 */
  playlist: string[]
  /** 收藏夹里的路径。 */
  favorites: string[]
  /** 刚从收藏夹跳过来要高亮的那一格；没有则为 null。 */
  highlightPath: string | null
  onOpen: (path: string, from: DOMRect) => void
  onTogglePlaylist: (path: string) => void
  onToggleFavorite: (path: string) => void
  onTogglePlay: () => void
  onSeekBy: (offset: number) => void
}

interface TileProps {
  video: BrowseEntry
  thumbnail: string | undefined
  /** 在墙里的第几个，用来错开入场动画。 */
  index: number
  expanded: boolean
  flash: GridFlash | null
  buffering: boolean
  inPlaylist: boolean
  favorite: boolean
  highlighted: boolean
  onOpen: (path: string, from: DOMRect) => void
  onTogglePlaylist: (path: string) => void
  onToggleFavorite: (path: string) => void
  onTogglePlay: () => void
  onSeekBy: (offset: number) => void
}

const Tile = memo(function Tile({
  video,
  thumbnail,
  index,
  expanded,
  flash,
  buffering,
  inPlaylist,
  favorite,
  highlighted,
  onOpen,
  onTogglePlaylist,
  onToggleFavorite,
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
    <div
      className="tile"
      data-tile={video.path}
      data-tutorial="tile"
      data-highlight={highlighted ? 'true' : undefined}
      style={{ '--i': index } as CSSProperties}
    >
      {/*
        打开和「加进列表」必须是两颗不同的按钮，而按钮不能嵌按钮，
        所以外面这层是普通容器，打开动作单独一颗铺满整格的按钮。
      */}
      <button
        className="tile__open"
        type="button"
        title={video.name}
        onClick={(event) => onOpen(video.path, event.currentTarget.getBoundingClientRect())}
      >
        <span className="tile__frame">
          {thumbnail === undefined ? (
            <span className="tile__placeholder" />
          ) : (
            <img className="tile__image" src={thumbnail} alt="" loading="lazy" decoding="async" />
          )}

          <span className="tile__play" aria-hidden="true">
            ▶
          </span>
        </span>

        <span className="tile__name">{video.name}</span>
      </button>

      {/* 鼠标移到方格上（或者键盘焦点进来）才浮出来的两个动作 */}
      <div className="tile__actions">
        <button
          className="tile__action"
          type="button"
          aria-pressed={inPlaylist}
          aria-label={inPlaylist ? `把 ${video.name} 移出播放列表` : `把 ${video.name} 加入播放列表`}
          title={inPlaylist ? '已在播放列表，点击移出' : '加入播放列表'}
          onClick={() => onTogglePlaylist(video.path)}
        >
          {inPlaylist ? '✓' : '≡'}
        </button>

        <button
          className="tile__action"
          type="button"
          aria-pressed={favorite}
          aria-label={favorite ? `取消收藏 ${video.name}` : `收藏 ${video.name}`}
          title={favorite ? '已收藏，点击取消' : '加入收藏夹'}
          onClick={() => onToggleFavorite(video.path)}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>
    </div>
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
  playlist,
  favorites,
  highlightPath,
  onOpen,
  onTogglePlaylist,
  onToggleFavorite,
  onTogglePlay,
  onSeekBy,
}: VideoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousRects = useRef(new Map<string, DOMRect>())

  /** 从收藏夹跳过来时，把那一格滚进视野；高亮本身由 CSS 的 data-highlight 负责。 */
  useEffect(() => {
    const container = containerRef.current

    /*
     * 放大播放时方格墙是「向下让位、被裁掉」的状态（overflow: hidden），
     * 这时候把某一格滚进视野，只会把画面本身顶上去。所以只在看方格墙时才滚。
     */
    if (highlightPath === null || container === null || expandedPath !== null) {
      return
    }

    // 用 dataset 找而不是拼选择器：Windows 路径里的反斜杠在 CSS 选择器里要转义，太容易出错
    const tile = Array.from(container.querySelectorAll<HTMLElement>('[data-tile]')).find(
      (element) => element.dataset.tile === highlightPath,
    )

    // jsdom 没实现 scrollIntoView，测试里跳过这一段
    if (typeof tile?.scrollIntoView === 'function') {
      tile.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [expandedPath, highlightPath, videos])

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
        .querySelector('.tile__name')
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
      {videos.map((video, index) => (
        <Tile
          key={video.path}
          video={video}
          thumbnail={thumbnails[video.path]}
          index={index}
          expanded={video.path === expandedPath}
          flash={video.path === expandedPath ? flash : null}
          buffering={video.path === expandedPath && buffering}
          inPlaylist={playlist.includes(video.path)}
          favorite={favorites.includes(video.path)}
          highlighted={video.path === highlightPath}
          onOpen={onOpen}
          onTogglePlaylist={onTogglePlaylist}
          onToggleFavorite={onToggleFavorite}
          onTogglePlay={onTogglePlay}
          onSeekBy={onSeekBy}
        />
      ))}
    </div>
  )
}
