export type ShortcutAction =
  | 'toggle-play'
  | 'seek-forward'
  | 'seek-backward'
  | 'jump-forward'
  | 'jump-backward'
  | 'volume-up'
  | 'volume-down'
  | 'toggle-mute'
  | 'toggle-fullscreen'
  | 'speed-up'
  | 'speed-down'

const SHORTCUTS: Record<string, ShortcutAction> = {
  Space: 'toggle-play',
  KeyK: 'toggle-play',
  ArrowRight: 'seek-forward',
  ArrowLeft: 'seek-backward',
  KeyL: 'jump-forward',
  KeyJ: 'jump-backward',
  ArrowUp: 'volume-up',
  ArrowDown: 'volume-down',
  KeyM: 'toggle-mute',
  KeyF: 'toggle-fullscreen',
  BracketRight: 'speed-up',
  BracketLeft: 'speed-down',
}

export function resolveShortcut(code: string): ShortcutAction | null {
  return SHORTCUTS[code] ?? null
}

/**
 * 判断这个快捷键要不要让位给当前获得焦点的控件。
 *
 * 注意不能一刀切：进度条获得焦点后仍然要能用空格暂停，
 * 否则用户点过一次进度条，播放器就再也按不动了。
 */
export function shouldIgnoreShortcut(code: string, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  switch (target.tagName) {
    case 'TEXTAREA':
    case 'SELECT':
      return true
    case 'INPUT': {
      // 滑块自己要吃方向键，其余快捷键（空格、静音、全屏）照常归播放器
      const type = target instanceof HTMLInputElement ? target.type : ''
      return type === 'range' ? code.startsWith('Arrow') : true
    }
    case 'BUTTON':
    case 'A':
      // 让按钮自己响应空格与回车，避免一次按键触发两遍
      return code === 'Space' || code === 'Enter' || code === 'NumpadEnter'
    default:
      return false
  }
}
