import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { formatSpeed, SPEED_OPTIONS } from '../lib/playback'
import { formatDuration } from '../lib/time'
import HoverPreview from './HoverPreview'
import PlayPauseIcon from './PlayPauseIcon'

export interface IslandProps {
  title: string
  position: number
  duration: number
  paused: boolean
  volume: number
  muted: boolean
  speed: number
  buffering: boolean
  fullscreen: boolean
  /** 拖动中的进度值；不在拖动时为 null。 */
  scrub: number | null
  preview: { fraction: number; seconds: number } | null
  previewImage: string | null
  speedOpen: boolean
  onTogglePause: () => void
  onScrubChange: (event: ChangeEvent<HTMLInputElement>) => void
  onScrubCommit: () => void
  onProgressHover: (event: ReactPointerEvent<HTMLInputElement>) => void
  onProgressLeave: () => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onToggleSpeedMenu: () => void
  onSelectSpeed: (speed: number) => void
  onToggleFullscreen: () => void
  onCollapse: () => void
}

/**
 * 常驻底部的控制条。
 *
 * 画面上不再有独立的播放页，所以播放需要的全部控件都收在这里：
 * 播放暂停、进度、音量、倍速、全屏，以及收起画面。
 */
export default function Island({
  title,
  position,
  duration,
  paused,
  volume,
  muted,
  speed,
  buffering,
  fullscreen,
  scrub,
  preview,
  previewImage,
  speedOpen,
  onTogglePause,
  onScrubChange,
  onScrubCommit,
  onProgressHover,
  onProgressLeave,
  onVolumeChange,
  onToggleMute,
  onSelectSpeed,
  onToggleSpeedMenu,
  onToggleFullscreen,
  onCollapse,
}: IslandProps) {
  const shown = scrub ?? position
  const fill = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0
  const bubbleAt = duration > 0 ? Math.min(97, Math.max(3, (shown / duration) * 100)) : 50

  return (
    <div className="island" data-testid="island">
      <div className="island__row">
        <button
          className="island__button"
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? '播放' : '暂停'}
        >
          <PlayPauseIcon paused={paused} />
        </button>

        <span className="island__title" title={title}>
          {title}
        </span>

        <span className="island__time" data-testid="time-display">
          {formatDuration(shown)} / {formatDuration(duration)}
        </span>

        <div className="island__volume">
          <button
            className="island__button"
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? '取消静音' : '静音'}
            aria-pressed={muted}
          >
            {muted || volume === 0 ? '🔇' : '🔊'}
          </button>
          <input
            className="island__range island__volume-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={muted ? 0 : Math.round(volume)}
            aria-label="音量"
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            style={{ '--fill': `${muted ? 0 : volume}%` } as CSSProperties}
          />
        </div>

        <div className="island__speed">
          <button
            className="island__button island__button--text"
            type="button"
            onClick={onToggleSpeedMenu}
            aria-haspopup="menu"
            aria-expanded={speedOpen}
            aria-label="播放倍速"
          >
            {formatSpeed(speed)}
          </button>
          {speedOpen ? (
            <div className="speed-menu" role="menu" aria-label="播放倍速">
              {SPEED_OPTIONS.map((option) => (
                <button
                  key={option}
                  className="speed-menu__item"
                  type="button"
                  role="menuitemradio"
                  aria-checked={Math.abs(option - speed) < 0.01}
                  onClick={() => onSelectSpeed(option)}
                >
                  {formatSpeed(option)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          className="island__button"
          type="button"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? '退出全屏' : '全屏'}
        >
          ⛶
        </button>

        <button className="island__button" type="button" onClick={onCollapse} aria-label="收起画面">
          ⌄
        </button>
      </div>

      <div
        className="island__progress"
        data-scrubbing={scrub !== null ? 'true' : 'false'}
        data-buffering={buffering ? 'true' : 'false'}
      >
        <input
          className="island__range island__progress-range"
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={shown}
          aria-label="播放进度"
          onChange={onScrubChange}
          onPointerUp={onScrubCommit}
          onKeyUp={onScrubCommit}
          onBlur={onScrubCommit}
          onPointerMove={onProgressHover}
          onPointerLeave={onProgressLeave}
          style={{ '--fill': `${fill}%` } as CSSProperties}
        />

        {scrub !== null && duration > 0 ? (
          <span className="island__bubble" data-testid="scrub-bubble" style={{ left: `${bubbleAt}%` }}>
            {formatDuration(scrub)}
          </span>
        ) : null}

        {preview && scrub === null ? (
          <HoverPreview image={previewImage} seconds={preview.seconds} fraction={preview.fraction} />
        ) : null}
      </div>
    </div>
  )
}
