import { formatDuration } from '../lib/time'

export interface HoverPreviewProps {
  /** 抓到的画面，还没抓到时为 null。 */
  image: string | null
  seconds: number
  /** 指针在进度条上的位置比例（0-1）。 */
  fraction: number
}

/** 鼠标停在进度条上时浮出的小画面。 */
export default function HoverPreview({ image, seconds, fraction }: HoverPreviewProps) {
  // 贴边时把预览往中间推一点，免得超出窗口
  const clamped = Math.min(0.92, Math.max(0.08, fraction))

  return (
    <div
      className="preview"
      data-testid="hover-preview"
      style={{ left: `${clamped * 100}%` }}
      aria-hidden="true"
    >
      {image === null ? (
        <div className="preview__placeholder" data-testid="hover-preview-placeholder" />
      ) : (
        <img className="preview__image" data-testid="hover-preview-image" src={image} alt="" />
      )}
      <span className="preview__time">{formatDuration(seconds)}</span>
    </div>
  )
}
