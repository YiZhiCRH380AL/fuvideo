import { describe, expect, it } from 'vitest'
import { isEditableTarget, resolveShortcut } from './shortcuts'

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

describe('isEditableTarget', () => {
  it('输入控件与可编辑区域返回 true', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)

    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isEditableTarget(editable)).toBe(true)
  })

  it('普通元素与 null 返回 false', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
