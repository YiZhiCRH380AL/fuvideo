import type { CSSProperties } from 'react'
import type { BrowseEntry } from '../lib/backend'

export interface FolderStripProps {
  folders: BrowseEntry[]
  /** 已经在盘符根目录时不能再往上。 */
  canGoUp: boolean
  busy: boolean
  onOpen: (path: string) => void
  onGoUp: () => void
}

/**
 * 目录区顶上的文件夹条。
 *
 * 原来侧边栏里那份子目录列表挪到了这里：和方格墙同一套视觉，直接摆在
 * 中心区域的上方，扫一眼就能进去。
 */
export default function FolderStrip({
  folders,
  canGoUp,
  busy,
  onOpen,
  onGoUp,
}: FolderStripProps) {
  return (
    <div className="folders" data-testid="folder-strip">
      <button
        className="folder folder--up"
        type="button"
        onClick={onGoUp}
        disabled={!canGoUp}
        aria-label="上一级"
        title="上一级"
      >
        <span className="folder__glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V6" />
            <path d="M6 12l6-6 6 6" />
          </svg>
        </span>
        <span className="folder__name">上一级</span>
      </button>

      {folders.map((folder, index) => (
        <button
          className="folder"
          type="button"
          key={folder.path}
          title={folder.name}
          style={{ '--i': index + 1 } as CSSProperties}
          onClick={() => onOpen(folder.path)}
        >
          <span className="folder__glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 8.6A2.6 2.6 0 0 1 5.6 6h3.1a2 2 0 0 1 1.6.8l1 1.3h7.1A2.6 2.6 0 0 1 21 10.7v5.7A2.6 2.6 0 0 1 18.4 19H5.6A2.6 2.6 0 0 1 3 16.4z" />
            </svg>
          </span>
          <span className="folder__name">{folder.name}</span>
        </button>
      ))}

      {busy ? <span className="folders__busy">读取中…</span> : null}
    </div>
  )
}
