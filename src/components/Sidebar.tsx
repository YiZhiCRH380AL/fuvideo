import type { VideoEntry } from '../lib/backend'
import { fileName } from '../lib/path'

export interface SidebarProps {
  open: boolean
  directory: string | null
  entries: VideoEntry[]
  currentPath: string | null
  busy: boolean
  onChooseDirectory: () => void
  onSelect: (path: string) => void
}

/** 侧边栏：选一个目录，列出其中的视频，点一下就能播。 */
export default function Sidebar({
  open,
  directory,
  entries,
  currentPath,
  busy,
  onChooseDirectory,
  onSelect,
}: SidebarProps) {
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

        <p className="sidebar__directory" data-testid="sidebar-directory">
          {directory === null ? '还没有选择目录' : fileName(directory)}
        </p>

        {directory === null ? (
          <p className="sidebar__hint">选一个目录，这里会列出里面的视频</p>
        ) : entries.length === 0 ? (
          <p className="sidebar__hint">这个目录里没有视频文件</p>
        ) : (
          <ul className="sidebar__list">
            {entries.map((entry) => (
              <li key={entry.path}>
                <button
                  className="sidebar__item"
                  type="button"
                  title={entry.name}
                  aria-current={entry.path === currentPath}
                  onClick={() => onSelect(entry.path)}
                >
                  {entry.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
