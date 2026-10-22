import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FavoritePicker from './FavoritePicker'

const PATH = String.raw`E:\clips\demo.mp4`

function anchorRect(): DOMRect {
  return {
    x: 520,
    y: 180,
    top: 180,
    right: 544,
    bottom: 204,
    left: 520,
    width: 24,
    height: 24,
    toJSON: () => ({}),
  } as DOMRect
}

afterEach(() => {
  document.querySelectorAll('[data-test-trigger]').forEach((element) => element.remove())
})

describe('方格收藏夹选择面板', () => {
  it('同时列出快速收藏和命名收藏夹，并显示当前归属', () => {
    const trigger = document.createElement('button')
    trigger.dataset.testTrigger = 'true'
    document.body.append(trigger)

    render(
      <FavoritePicker
        path={PATH}
        name="demo.mp4"
        anchor={anchorRect()}
        trigger={trigger}
        quickFavorite={false}
        customCollections={[
          { id: 'night', name: '夜场', paths: [PATH] },
          { id: 'travel', name: '旅行', paths: [] },
        ]}
        onToggleQuick={vi.fn(async () => {})}
        onToggleNamed={vi.fn(async () => {})}
        onManage={vi.fn()}
        onError={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'demo.mp4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /快速收藏/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /夜场/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /旅行/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('可以连续把视频加入快速收藏和任意命名收藏夹', async () => {
    const trigger = document.createElement('button')
    trigger.dataset.testTrigger = 'true'
    document.body.append(trigger)
    const onToggleQuick = vi.fn(async () => {})
    const onToggleNamed = vi.fn(async () => {})

    render(
      <FavoritePicker
        path={PATH}
        name="demo.mp4"
        anchor={anchorRect()}
        trigger={trigger}
        quickFavorite={false}
        customCollections={[{ id: 'night', name: '夜场', paths: [] }]}
        onToggleQuick={onToggleQuick}
        onToggleNamed={onToggleNamed}
        onManage={vi.fn()}
        onError={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /快速收藏/ }))
    await waitFor(() => expect(onToggleQuick).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: /夜场/ }))
    await waitFor(() => expect(onToggleNamed).toHaveBeenCalledWith('night'))
  })

  it('Esc 关闭，关闭后焦点回到原来的收藏按钮', async () => {
    const trigger = document.createElement('button')
    trigger.dataset.testTrigger = 'true'
    document.body.append(trigger)
    const onClose = vi.fn()

    const view = render(
      <FavoritePicker
        path={PATH}
        name="demo.mp4"
        anchor={anchorRect()}
        trigger={trigger}
        quickFavorite={false}
        customCollections={[]}
        onToggleQuick={vi.fn(async () => {})}
        onToggleNamed={vi.fn(async () => {})}
        onManage={vi.fn()}
        onError={vi.fn()}
        onClose={onClose}
      />,
    )

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(trigger).toHaveFocus()
  })

  it('收藏夹选项自己的滚动不会关闭面板，页面滚动才会关闭', () => {
    const trigger = document.createElement('button')
    trigger.dataset.testTrigger = 'true'
    document.body.append(trigger)
    const onClose = vi.fn()

    render(
      <FavoritePicker
        path={PATH}
        name="demo.mp4"
        anchor={anchorRect()}
        trigger={trigger}
        quickFavorite={false}
        customCollections={[]}
        onToggleQuick={vi.fn(async () => {})}
        onToggleNamed={vi.fn(async () => {})}
        onManage={vi.fn()}
        onError={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.scroll(screen.getByRole('group', { name: '收藏夹选项' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.scroll(window)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
