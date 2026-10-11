import type { DirectoryListing } from '../lib/backend'

export interface SidebarProps {
  open: boolean
  listing: DirectoryListing | null
  currentPath: string | null
  busy: boolean
  onChooseDirectory: () => void
  onEnterDirectory: (path: string) => void
  onGoUp: () => void
  onSelect: (path: string) => void
}

/** 侧边栏：选一个目录，浏览其中的子目录与视频，点视频即播。 */
export default function Sidebar({
  open,
  listing,
  currentPath,
  busy,
  onChooseDirectory,
  onEnterDirectory,
  onGoUp,
  onSelect,
}: SidebarProps) {
  const empty = listing !== null && listing.entries.length === 0

  return (
    <aside
      className="sidebar"
      data-open={open ? 'true' : 'false'}
      aria-label="视频库"
      aria-hidden={!open}
    >
      <div className="sidebar__inner">
        <div className="sidebar__head">
          <span className="sidebar__title">视频库</span>
          <button className="sidebar__choose" type="button" onClick={onChooseDirectory} disabled={busy}>
            {busy ? '读取中…' : '选择目录'}
          </button>
        </div>

        <div className="sidebar__path">
          <button
            className="sidebar__up"
            type="button"
            onClick={onGoUp}
            disabled={listing?.parent == null}
            aria-label="上一级"
            title="上一级"
          >
            ↑
          </button>
          <span
            className="sidebar__directory"
            data-testid="sidebar-directory"
            title={listing?.directory ?? ''}
          >
            {listing === null ? '还没有选择目录' : listing.directory}
          </span>
        </div>

        {listing === null ? (
          <p className="sidebar__hint">选一个目录，这里会列出里面的子目录和视频</p>
        ) : empty ? (
          <p className="sidebar__hint">这个目录里没有子目录或视频文件</p>
        ) : (
          <ul className="sidebar__list">
            {listing.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  className="sidebar__item"
                  data-kind={entry.kind}
                  type="button"
                  title={entry.name}
                  aria-current={entry.kind === 'video' ? entry.path === currentPath : undefined}
                  onClick={() =>
                    entry.kind === 'directory' ? onEnterDirectory(entry.path) : onSelect(entry.path)
                  }
                >
                  <span className="sidebar__marker" aria-hidden="true">
                    {entry.kind === 'directory' ? '▸' : ''}
                  </span>
                  <span className="sidebar__name">{entry.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
