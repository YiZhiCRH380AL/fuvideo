/** 取出路径里的文件名，兼容 Windows 与 POSIX 分隔符。 */
export function fileName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0)
  return segments.length > 0 ? segments[segments.length - 1] : path
}
