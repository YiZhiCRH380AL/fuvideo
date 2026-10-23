import type { CSSProperties } from 'react'

import { formatDuration } from '../lib/time'

export interface HoverPreviewProps {
  /** 抓到的画面，还没抓到时为 null。 */
  image: string | null
  seconds: number
  /** 指针在进度条上的位置比例（0-1）。 */
  fraction: number
  /** 来自预抓缩略图带、尚未替换成当前整秒的图片。 */
  approximate?: boolean
}

/** 鼠标停在进度条上时浮出的小画面。 */
export default function HoverPreview({
  image,
  seconds,
  fraction,
  approximate = false,
}: HoverPreviewProps) {
  const position = {
    '--preview-left': `${Math.min(1, Math.max(0, fraction)) * 100}%`,
  } as CSSProperties

  return (
    <div
      className="preview"
      data-testid="hover-preview"
      style={position}
      aria-hidden="true"
    >
      {image === null ? (
        <div className="preview__placeholder" data-testid="hover-preview-placeholder" />
      ) : (
        <img className="preview__image" data-testid="hover-preview-image" src={image} alt="" />
      )}
      <span className="preview__time">
        {approximate ? '≈ ' : ''}
        {formatDuration(seconds)}
      </span>
    </div>
  )
}
