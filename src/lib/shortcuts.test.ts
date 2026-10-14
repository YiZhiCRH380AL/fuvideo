import { describe, expect, it } from 'vitest'
import {
  buildShortcutMap,
  defaultCodeFor,
  isBindableCode,
  keyLabel,
  resolveShortcut,
  shouldIgnoreShortcut,
} from './shortcuts'

describe('resolveShortcut', () => {
  it('映射常用播放快捷键', () => {
    expect(resolveShortcut('Space')).toBe('toggle-play')
    expect(resolveShortcut('KeyK')).toBe('toggle-play')
    expect(resolveShortcut('ArrowRight')).toBe('seek-forward')
    expect(resolveShortcut('ArrowLeft')).toBe('seek-backward')
    expect(resolveShortcut('KeyL')).toBe('jump-forward')
    expect(resolveShortcut('KeyJ')).toBe('jump-backward')
    expect(resolveShortcut('ArrowUp')).toBe('volume-up')
    expect(resolveShortcut('ArrowDown')).toBe('volume-down')
    expect(resolveShortcut('KeyM')).toBe('toggle-mute')
    expect(resolveShortcut('KeyF')).toBe('toggle-fullscreen')
    expect(resolveShortcut('BracketRight')).toBe('speed-up')
    expect(resolveShortcut('BracketLeft')).toBe('speed-down')
    expect(resolveShortcut('Period')).toBe('frame-forward')
    expect(resolveShortcut('Comma')).toBe('frame-backward')
    expect(resolveShortcut('KeyT')).toBe('toggle-mini')
  })

  it('未映射的按键返回 null', () => {
    expect(resolveShortcut('KeyQ')).toBeNull()
  })
})

describe('buildShortcutMap', () => {
  it('没改过时就是出厂键位', () => {
    expect(buildShortcutMap(null)['KeyM']).toBe('toggle-mute')
  })

  /** 改键之后原来的键要让出来，不然一个键会同时触发两件事。 */
  it('改过的动作让出原来的键', () => {
    const map = buildShortcutMap({ 'toggle-mute': 'KeyQ' })

    expect(map['KeyQ']).toBe('toggle-mute')
    expect(map['KeyM']).toBeUndefined()
  })

  /** 抢了别人的键，别人也得让位——否则按下去两个动作一起跑。 */
  it('被占用的键会把原来的动作挤走', () => {
    const map = buildShortcutMap({ 'toggle-mute': 'KeyL' })

    expect(map['KeyL']).toBe('toggle-mute')
    expect(map['KeyM']).toBeUndefined()
  })

  it('不认识的动作名直接忽略', () => {
    const map = buildShortcutMap({ '没有这个动作': 'KeyQ' })

    expect(map['KeyQ']).toBeUndefined()
    expect(map['KeyM']).toBe('toggle-mute')
  })
})

describe('keyLabel', () => {
  it('把键码写成人看得懂的字', () => {
    expect(keyLabel('KeyA')).toBe('A')
    expect(keyLabel('Digit1')).toBe('1')
    expect(keyLabel('Space')).toBe('空格')
    expect(keyLabel('ArrowLeft')).toBe('←')
    expect(keyLabel('BracketLeft')).toBe('[')
    expect(keyLabel('NumpadEnter')).toBe('小键盘回车')
  })

  /** 认不出来的原样带出来：总比显示一个空白强。 */
  it('认不出来的键码原样显示', () => {
    expect(keyLabel('MediaPlayPause')).toBe('MediaPlayPause')
    expect(keyLabel('')).toBe('未设置')
  })
})

describe('isBindableCode', () => {
  it('字母数字键都能绑', () => {
    expect(isBindableCode('KeyA')).toBe(true)
    expect(isBindableCode('Digit5')).toBe(true)
    expect(isBindableCode('F11')).toBe(true)
    expect(isBindableCode('BracketLeft')).toBe(true)
  })

  /** 纯修饰键按下去只是「准备按组合键」，绑它等于把键位丢了。 */
  it('修饰键与锁定键不能绑', () => {
    expect(isBindableCode('ShiftLeft')).toBe(false)
    expect(isBindableCode('ControlRight')).toBe(false)
    expect(isBindableCode('CapsLock')).toBe(false)
    expect(isBindableCode('')).toBe(false)
  })
})

describe('defaultCodeFor', () => {
  it('给出厂键位里这个动作落在哪颗键上', () => {
    expect(defaultCodeFor('toggle-mute')).toBe('KeyM')
    expect(defaultCodeFor('toggle-play')).toBe('Space')
  })
})

describe('shouldIgnoreShortcut', () => {
  it('文本输入与可编辑区域吃掉全部快捷键', () => {
    const text = document.createElement('input')
    text.type = 'text'

    expect(shouldIgnoreShortcut('Space', text)).toBe(true)
    expect(shouldIgnoreShortcut('Space', document.createElement('textarea'))).toBe(true)
    expect(shouldIgnoreShortcut('Space', document.createElement('select'))).toBe(true)

    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(shouldIgnoreShortcut('Space', editable)).toBe(true)
  })

  it('滑块只吃掉方向键，空格仍然能暂停', () => {
    const range = document.createElement('input')
    range.type = 'range'

    expect(shouldIgnoreShortcut('ArrowRight', range)).toBe(true)
    expect(shouldIgnoreShortcut('ArrowUp', range)).toBe(true)
    expect(shouldIgnoreShortcut('Space', range)).toBe(false)
    expect(shouldIgnoreShortcut('KeyM', range)).toBe(false)
  })

  /**
   * 播放进度条是例外：它自己的 step 是 0.1 秒，按一下只挪 0.1 秒、肉眼看不出来，
   * 用户只会觉得「方向键没反应」。所以它的方向键要交回给播放器（5 秒一跳）。
   */
  it('播放进度条不吃方向键，交给播放器', () => {
    const progress = document.createElement('input')
    progress.type = 'range'
    progress.dataset.keys = 'playback'

    expect(shouldIgnoreShortcut('ArrowRight', progress)).toBe(false)
    expect(shouldIgnoreShortcut('ArrowLeft', progress)).toBe(false)
    // 空格本来也不该被它吃掉
    expect(shouldIgnoreShortcut('Space', progress)).toBe(false)
  })

  it('按钮只吃掉空格与回车，避免重复触发', () => {
    const button = document.createElement('button')

    expect(shouldIgnoreShortcut('Space', button)).toBe(true)
    expect(shouldIgnoreShortcut('Enter', button)).toBe(true)
    expect(shouldIgnoreShortcut('KeyF', button)).toBe(false)
  })

  it('普通元素与 null 不受影响', () => {
    expect(shouldIgnoreShortcut('Space', document.createElement('div'))).toBe(false)
    expect(shouldIgnoreShortcut('Space', null)).toBe(false)
  })
})
