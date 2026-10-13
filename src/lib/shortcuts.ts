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
      const type = target instanceof HTMLInputElement ? target.type : ''

      if (type !== 'range') {
        return true
      }

      /*
       * 播放进度条的方向键要还给播放器。
       *
       * 它自己的 step 是 0.1 秒，按一下只挪 0.1 秒，肉眼根本看不出来——
       * 用户只会觉得「方向键快进快退没反应」。交给播放器就是 5 秒一跳。
       * 其余滑块（音量、均衡器）仍旧自己吃方向键。
       */
      if (target instanceof HTMLElement && target.dataset.keys === 'playback') {
        return false
      }

      return code.startsWith('Arrow')
    }
    case 'BUTTON':
    case 'A':
      // 让按钮自己响应空格与回车，避免一次按键触发两遍
      return code === 'Space' || code === 'Enter' || code === 'NumpadEnter'
    default:
      return false
  }
}
