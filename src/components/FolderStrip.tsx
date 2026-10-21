import type { CSSProperties, WheelEvent } from 'react'
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
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    event.currentTarget.scrollLeft += event.deltaY
  }

  return (
    <section className="folders-section" aria-label="文件夹">
      <div className="folders-section__head">
        <span className="folders-section__title">文件夹</span>
        <span className="folders-section__count">{folders.length + (parent === null ? 0 : 1)}</span>
      </div>

      <div className="folders" data-testid="folder-strip" onWheel={handleWheel}>
        {parent === null ? null : (
          <button
            className="folder folder--parent"
            type="button"
            onClick={parent.onOpen}
            aria-label={parent.label}
            title={parent.label}
          >
            <span className="folder__frame">
              <span className="folder__glyph" aria-hidden="true">
                {parent.icon === 'up' ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path className="glyph__stroke" d="M12 19V6" />
                    <path className="glyph__stroke" d="M6 12l6-6 6 6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect className="glyph__stroke" x="3" y="6" width="18" height="12" rx="2.4" />
                    <path className="glyph__stroke" d="M7 14.5h4" />
                    <path className="glyph__stroke" d="M16.5 9.5h.01" />
                  </svg>
                )}
              </span>
            </span>
            <span className="folder__name">{parent.label}</span>
            <span className="folder__arrow" aria-hidden="true">
              ↖
            </span>
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
            <span className="folder__frame">
              <span className="folder__glyph" aria-hidden="true">
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    className="glyph__back"
                    d="M7 14.5A3.5 3.5 0 0 1 10.5 11h8.6a3 3 0 0 1 2.4 1.2l2.3 2.9h13.7A3.5 3.5 0 0 1 41 18.6V38a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"
                  />
                  <path className="glyph__front" d="M7 19.4h34V38a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" />
                </svg>
              </span>
            </span>
            <span className="folder__name">{folder.name}</span>
            <span className="folder__arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}

        {busy ? <span className="folders__busy">读取中…</span> : null}
      </div>
    </section>
  )
}
