import type { CSSProperties } from 'react'
import type { BrowseEntry } from '../lib/backend'

export interface FolderStripProps {
  folders: BrowseEntry[]
  /** 最前面那个固定入口；没有就不显示。 */
  parent: FolderParent | null
  busy: boolean
  onOpen: (path: string) => void
}

/**
 * 目录区最前面那个入口。
 *
 * 平时是「上一级」；已经站在盘符根目录时，再往上就是「此电脑」，
 * 那里列出所有能进的盘，不然换盘只能靠系统对话框。
 */
export interface FolderParent {
  label: string
  icon: 'up' | 'computer'
  onOpen: () => void
}

/**
 * 目录区顶上的文件夹条。
 *
 * 原来侧边栏里那份子目录列表挪到了这里：和方格墙同一套视觉，直接摆在
 * 中心区域的上方，扫一眼就能进去。
 */
export default function FolderStrip({ folders, parent, busy, onOpen }: FolderStripProps) {
  return (
    <div className="folders" data-testid="folder-strip">
      {parent === null ? null : (
        <button
          className="folder folder--parent"
          type="button"
          onClick={parent.onOpen}
          aria-label={parent.label}
          title={parent.label}
        >
          <span className="folder__glyph" aria-hidden="true">
            {parent.icon === 'up' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V6" />
                <path d="M6 12l6-6 6 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="6" width="18" height="12" rx="2.4" />
                <path d="M7 14.5h4" />
                <path d="M16.5 9.5h.01" />
              </svg>
            )}
          </span>
          <span className="folder__name">{parent.label}</span>
        </button>
      )}

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
