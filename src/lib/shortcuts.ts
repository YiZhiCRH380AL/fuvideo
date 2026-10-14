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
  | 'toggle-mini'
  | 'speed-up'
  | 'speed-down'
  | 'frame-forward'
  | 'frame-backward'

/**
 * 出厂键位表：**键码 → 动作**。
 *
 * 方向是「键 → 动作」而不是反过来，因为一个动作可以落在好几颗键上
 * （暂停既是空格也是 K）。改键之后由 [buildShortcutMap] 把这份表跟用户那份合起来。
 */
const DEFAULT_SHORTCUTS: Record<string, ShortcutAction> = {
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
  KeyT: 'toggle-mini',
  BracketRight: 'speed-up',
  BracketLeft: 'speed-down',
  // 逐帧用 mpv 自己的那两颗键，从别的播放器切过来不用重学
  Period: 'frame-forward',
  Comma: 'frame-backward',
}

/** 动作的展示顺序，也就是设置页里那一列的顺序。 */
export const SHORTCUT_ROWS: { action: ShortcutAction; label: string }[] = [
  { action: 'toggle-play', label: '播放 / 暂停' },
  { action: 'seek-forward', label: '快进 5 秒' },
  { action: 'seek-backward', label: '快退 5 秒' },
  { action: 'jump-forward', label: '快进 1 分钟' },
  { action: 'jump-backward', label: '快退 1 分钟' },
  { action: 'frame-forward', label: '前进一帧' },
  { action: 'frame-backward', label: '后退一帧' },
  { action: 'volume-up', label: '音量加' },
  { action: 'volume-down', label: '音量减' },
  { action: 'toggle-mute', label: '静音开关' },
  { action: 'speed-up', label: '加快倍速' },
  { action: 'speed-down', label: '减慢倍速' },
  { action: 'toggle-fullscreen', label: '全屏开关' },
  { action: 'toggle-mini', label: '迷你模式' },
]

const ACTIONS: ShortcutAction[] = SHORTCUT_ROWS.map((row) => row.action)

export function isShortcutAction(value: string): value is ShortcutAction {
  return (ACTIONS as string[]).includes(value)
}

/** 纯修饰键与锁定键：按下它们只是「准备按组合键」，拿来当单键快捷键没有意义。 */
const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'ContextMenu',
])

/** 这个键码能不能拿来当快捷键。规则跟后端清洗时用的是同一套。 */
export function isBindableCode(code: string): boolean {
  return (
    code.length > 0 && code.length <= 24 && /^[A-Za-z][A-Za-z0-9]*$/.test(code) && !MODIFIER_CODES.has(code)
  )
}

/** 某个动作在出厂表里落在哪颗键上（一个动作可能有好几颗，取第一颗）。 */
export function defaultCodeFor(action: ShortcutAction): string {
  const found = Object.entries(DEFAULT_SHORTCUTS).find(([, mapped]) => mapped === action)

  return found ? found[0] : ''
}

/**
 * 把出厂表和用户改过的几条合起来，得到真正生效的「键码 → 动作」。
 *
 * 两条规矩：被改掉的动作，它原来的键要让出来；被占用的键，原来的动作要让位。
 * 不这么做的话一个键会同时触发两件事——这也是后端清洗时守的同一件事。
 */
export function buildShortcutMap(
  overrides: Record<string, string> | null | undefined,
): Record<string, ShortcutAction> {
  const changes = Object.entries(overrides ?? {}).filter(([action]) => isShortcutAction(action))
  const taken = new Set(changes.map(([, code]) => code))
  const rebound = new Set(changes.map(([action]) => action))
  const map: Record<string, ShortcutAction> = {}

  for (const [code, action] of Object.entries(DEFAULT_SHORTCUTS)) {
    if (taken.has(code) || rebound.has(action)) {
      continue
    }

    map[code] = action
  }

  for (const [action, code] of changes) {
    if (code !== '') {
      map[code] = action as ShortcutAction
    }
  }

  return map
}

export function resolveShortcut(
  code: string,
  map: Record<string, ShortcutAction> = DEFAULT_SHORTCUTS,
): ShortcutAction | null {
  return map[code] ?? null
}

/**
 * 键码转成人看的字。
 *
 * `KeyboardEvent.code` 认的是**物理键**（`KeyA` / `BracketLeft`），
 * 换成别的键盘布局也落在同一颗键上；但直接把 `KeyA` 摆到界面上没人看得懂。
 */
export function keyLabel(code: string): string {
  if (code === '') {
    return '未设置'
  }

  const named: Record<string, string> = {
    Space: '空格',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Backslash: '\\',
    Enter: '回车',
    NumpadEnter: '小键盘回车',
    Escape: 'Esc',
    Tab: 'Tab',
    Backspace: '退格',
    Delete: 'Del',
    Home: 'Home',
    End: 'End',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    Insert: 'Ins',
  }

  if (named[code] !== undefined) {
    return named[code]
  }

  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3)
  }

  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5)
  }

  if (code.startsWith('Numpad')) {
    return `小键盘${code.slice(6)}`
  }

  return code
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
