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

/** 焦点在输入类控件里时，快捷键要让位给控件本身。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
