import type { CSSProperties, ReactNode, WheelEvent } from 'react'

import type { BrowseEntry } from '../lib/backend'

export interface FolderStripProps {
  folders: BrowseEntry[]
  /** 最前面那个固定入口；没有就不显示。 */
  parent: FolderParent | null
  busy: boolean
  onOpen: (path: string) => void
  onHome: () => void
  atHome: boolean
  forceOpen: boolean
  actions: ReactNode
  status: string | null
  statusWarning: boolean
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
 * 可悬停展开的应用侧栏。
 *
 * 收起时只留左边一条窄轨；鼠标靠近、键盘聚焦或教程需要时展开。
 * 文件夹和原先标题栏上的全局按钮都在这里，避免操作分散在上下两处。
 */
export default function FolderStrip({
  folders,
  parent,
  busy,
  onOpen,
  onHome,
  atHome,
  forceOpen,
  actions,
  status,
  statusWarning,
}: FolderStripProps) {
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const element = event.currentTarget

    if (
      element.scrollWidth <= element.clientWidth + 1 ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    ) {
      return
    }

    element.scrollLeft += event.deltaY
  }

  return (
    <aside
      className="app-sidebar"
      aria-label="文件夹导航"
      data-open={forceOpen ? 'true' : 'false'}
    >
      <span className="app-sidebar__handle" aria-hidden="true" data-tutorial="sidebar">
        <i />
        <i />
        <i />
        <b>MENU</b>
      </span>

      <div className="app-sidebar__content">
        <button
          className="app-sidebar__home"
          type="button"
          aria-pressed={atHome}
          onClick={onHome}
        >
          <span className="app-sidebar__home-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <small>FUTUREVIDEO</small>
            <strong>{atHome ? '正在首页' : '回到首页'}</strong>
          </span>
        </button>

        {atHome || (parent === null && folders.length === 0 && !busy) ? null : (
          <section className="app-sidebar__folders" aria-label="文件夹">
            <div className="app-sidebar__section-head">
              <span>文件夹</span>
              <small>{folders.length + (parent === null ? 0 : 1)}</small>
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
        )}

        <div className="app-sidebar__actions">
          <span className="app-sidebar__section-head">
            <span>控制台</span>
            <small>ACTIONS</small>
          </span>
          {actions}
        </div>

        {status === null ? null : (
          <span
            className="app-sidebar__status app__backend"
            data-testid="backend-status"
            data-warning={statusWarning ? 'true' : undefined}
          >
            {status}
          </span>
        )}
      </div>
    </aside>
  )
}
