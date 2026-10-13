import type {
  ChangeEvent,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { formatSpeed, SPEED_OPTIONS } from '../lib/playback'
import { formatDuration } from '../lib/time'
import HoverPreview from './HoverPreview'
import PlayPauseIcon from './PlayPauseIcon'
import Popover from './Popover'

export interface IslandProps {
  title: string
  /** 同目录里的上一集/下一集：没有就把对应按钮置灰。 */
  previous: Episode | null
  next: Episode | null
  onPlayEpisode: (path: string) => void
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
  /** 倍速菜单自己收起时（点外面或按 Esc）通知外面。 */
  onCloseSpeedMenu: () => void
  onSelectSpeed: (speed: number) => void
  mediaOpen: boolean
  onToggleMediaPanel: () => void
  onCloseMediaPanel: () => void
  /** 音轨与字幕面板的内容。面板自己管数据，这里只给它一个挂载点。 */
  mediaPanel: ReactNode
  onToggleFullscreen: () => void
  onCollapse: () => void
}

export interface Episode {
  path: string
  name: string
}

/**
 * 常驻底部的控制条。
 *
 * 画面上不再有独立的播放页，所以播放需要的全部控件都收在这里：
 * 播放暂停、进度、音量、倍速、全屏，以及收起画面。
 */
export default function Island({
  title,
  previous,
  next,
  onPlayEpisode,
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
  onCloseSpeedMenu,
  mediaOpen,
  onToggleMediaPanel,
  onCloseMediaPanel,
  mediaPanel,
  onToggleFullscreen,
  onCollapse,
}: IslandProps) {
  const shown = scrub ?? position
  const fill = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0
  const bubbleAt = duration > 0 ? Math.min(97, Math.max(3, (shown / duration) * 100)) : 50

  return (
    <div className="island" data-testid="island" data-tutorial="island">
      <div className="island__row">
        <button
          className="island__button"
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? '播放' : '暂停'}
        >
          <PlayPauseIcon paused={paused} />
        </button>

        {/*
          上下集：直接按目录里的顺序换片，不用先收起画面再点方格。
          没有上一集/下一集时置灰，用户一眼就知道到头了。
        */}
        <button
          className="island__button"
          type="button"
          onClick={() => previous !== null && onPlayEpisode(previous.path)}
          disabled={previous === null}
          aria-label="上一集"
          title={previous === null ? '已经是第一个' : `上一集 · ${previous.name}`}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="2" height="12" rx="1" />
            <path d="M19.5 6.9v10.2a.9.9 0 0 1-1.4.75l-6.9-5.1a.9.9 0 0 1 0-1.5l6.9-5.1a.9.9 0 0 1 1.4.75z" />
          </svg>
        </button>

        <button
          className="island__button"
          type="button"
          onClick={() => next !== null && onPlayEpisode(next.path)}
          disabled={next === null}
          aria-label="下一集"
          title={next === null ? '已经是最后一个' : `下一集 · ${next.name}`}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="16" y="6" width="2" height="12" rx="1" />
            <path d="M4.5 6.9v10.2a.9.9 0 0 0 1.4.75l6.9-5.1a.9.9 0 0 0 0-1.5l-6.9-5.1a.9.9 0 0 0-1.4.75z" />
          </svg>
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
          <Popover
            open={speedOpen}
            onClose={onCloseSpeedMenu}
            label="播放倍速"
            anchorSelector=".island__speed"
          >
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option}
                className="popover__item"
                type="button"
                role="menuitemradio"
                aria-checked={Math.abs(option - speed) < 0.01}
                onClick={() => onSelectSpeed(option)}
              >
                {formatSpeed(option)}
              </button>
            ))}
          </Popover>
        </div>

        {/* 音轨、输出设备、字幕都收在这个面板里，控制条上只多一个入口 */}
        <div className="island__media" data-tutorial="media">
          <button
            className="island__button"
            type="button"
            onClick={onToggleMediaPanel}
            aria-haspopup="dialog"
            aria-expanded={mediaOpen}
            aria-label="音轨与字幕"
            title="音轨与字幕"
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="5.4" width="17" height="1.6" rx="0.8" />
              <rect x="3.5" y="11.2" width="17" height="1.6" rx="0.8" />
              <rect x="3.5" y="17" width="17" height="1.6" rx="0.8" />
              <rect x="7.2" y="3.6" width="2.2" height="5.4" rx="1.1" />
              <rect x="14.2" y="9.4" width="2.2" height="5.4" rx="1.1" />
              <rect x="6" y="15.2" width="2.2" height="5.4" rx="1.1" />
            </svg>
          </button>

          <Popover
            open={mediaOpen}
            onClose={onCloseMediaPanel}
            label="音轨与字幕"
            anchorSelector=".island__media"
            className="popover--panel"
            role="dialog"
          >
            {mediaPanel}
          </Popover>
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
          /* 方向键交给播放器走 5 秒一跳，别让滑块自己按 0.1 秒挪 */
          data-keys="playback"
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
