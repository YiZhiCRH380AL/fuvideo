/** 取出路径里的文件名，兼容 Windows 与 POSIX 分隔符。 */
export function fileName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.length > 0 ? segments[segments.length - 1] : path
}

export interface PathSegment {
  name: string
  /** 走到这一层的完整路径，可以直接拿去列目录。 */
  path: string
}

/**
 * 把路径拆成能逐层点回去的层级，给目录区的面包屑用。
 *
 * `E:\clips\anime` → `E:` / `clips` / `anime`。
 * 拼回去时统一用反斜杠：目录浏览只在 Windows 上跑。
 */
export function pathSegments(path: string): PathSegment[] {
  const normalized = path.trim()

  if (normalized === '') {
    return []
  }

  const segments: PathSegment[] = []
  const drive = /^[A-Za-z]:/.exec(normalized)
  // 盘符路径一律拼回反斜杠；POSIX 绝对路径保留斜杠，别把层级拼歪
  const separator = drive === null && normalized.startsWith('/') ? '/' : '\\'
  let base = ''
  let rest = normalized

  if (drive !== null) {
    base = `${drive[0]}\\`
    rest = normalized.slice(drive[0].length)
    segments.push({ name: drive[0], path: base })
  } else if (normalized.startsWith('\\') || normalized.startsWith('/')) {
    base = normalized[0]
    rest = normalized.slice(1)
    segments.push({ name: base, path: base })
  }

  for (const part of rest.split(/[\\/]+/).filter((piece) => piece.length > 0)) {
    base = base === '' || /[\\/]$/.test(base) ? `${base}${part}` : `${base}${separator}${part}`
    segments.push({ name: part, path: base })
  }

  return segments
}
