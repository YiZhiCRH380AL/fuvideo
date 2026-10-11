import { describe, expect, it } from 'vitest'
import { resolveShortcut, shouldIgnoreShortcut } from './shortcuts'

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
  })

  it('未映射的按键返回 null', () => {
    expect(resolveShortcut('KeyQ')).toBeNull()
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
