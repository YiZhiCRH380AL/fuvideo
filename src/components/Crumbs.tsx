import { pathSegments } from '../lib/path'

export interface CrumbsProps {
  /** 当前目录。 */
  path: string
  onNavigate: (path: string) => void
}

/** 最多显示几段：再深就把中间折起来，标题栏放不下那么多。 */
const MAX_VISIBLE = 3

/**
 * 目录面包屑。
 *
 * 侧边栏去掉以后，往上层走就靠这里：点任意一段直接跳到那一层。
 * 最后一段是当前目录，不再可点（点了也只是重新列一次自己）。
 */
export default function Crumbs({ path, onNavigate }: CrumbsProps) {
  const segments = pathSegments(path)
  const hidden = Math.max(0, segments.length - MAX_VISIBLE)
  const shown = segments.slice(hidden)

  return (
    <nav className="crumbs" data-testid="crumbs" aria-label="目录" title={path}>
      {hidden > 0 ? (
        <span className="crumbs__gap" aria-hidden="true">
          …
        </span>
      ) : null}

      {shown.map((segment, index) => {
        const current = index === shown.length - 1

        return (
          <span className="crumbs__item" key={segment.path}>
            {index > 0 || hidden > 0 ? (
              <span className="crumbs__sep" aria-hidden="true">
                ›
              </span>
            ) : null}

            {current ? (
              <span className="crumbs__current" aria-current="page" title={segment.name}>
                {segment.name}
              </span>
            ) : (
              <button
                className="crumbs__link"
                type="button"
                title={segment.path}
                onClick={() => onNavigate(segment.path)}
              >
                {segment.name}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
