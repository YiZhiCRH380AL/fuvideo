import { formatDuration } from '../lib/time'

export interface IslandProps {
  title: string
  position: number
  duration: number
  paused: boolean
  /** 点主体回到播放页。 */
  onOpen: () => void
  onTogglePause: () => void
}

/**
 * 回目录之后常驻在底部的进度条。
 * 形状参考灵动岛：一个小胶囊，里面是标题、时间和一条进度。
 */
export default function Island({ title, position, duration, paused, onOpen, onTogglePause }: IslandProps) {
  const percent = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  return (
    <div className="island" data-testid="island">
      <div className="island__row">
        <button
          className="island__toggle"
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? '播放' : '暂停'}
        >
          {paused ? '▶' : '❚❚'}
        </button>

        <button
          className="island__main"
          data-testid="island-open"
          type="button"
          onClick={onOpen}
          title={title}
        >
          <span className="island__title">{title}</span>
          <span className="island__time">
            {formatDuration(position)} / {formatDuration(duration)}
          </span>
        </button>
      </div>

      <div className="island__track" aria-hidden="true">
        <div className="island__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
