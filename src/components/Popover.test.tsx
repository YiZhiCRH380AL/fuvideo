import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Popover from './Popover'

/** 锚点容器就是触发按钮所在的那个 div，点它自己不算「点外面」。 */
function renderPopover(open = true) {
  const onClose = vi.fn()

  render(
    <div className="island__speed">
      <button type="button">播放倍速</button>
      <Popover open={open} onClose={onClose} label="播放倍速" anchorSelector=".island__speed">
        <button type="button" role="menuitemradio" aria-checked="true">
          1x
        </button>
      </Popover>
    </div>,
  )

  return { onClose }
}

describe('Popover', () => {
  it('关着的时候什么都不渲染', () => {
    renderPopover(false)

    expect(screen.queryByTestId('popover')).not.toBeInTheDocument()
  })

  it('开着的时候带出无障碍名称和里面的内容', () => {
    renderPopover()

    const panel = screen.getByTestId('popover')

    expect(panel).toHaveAttribute('role', 'menu')
    expect(panel).toHaveAttribute('aria-label', '播放倍速')
    expect(screen.getByRole('menuitemradio', { name: '1x' })).toBeInTheDocument()
  })

  it('点面板外面收起', async () => {
    const { onClose } = renderPopover()

    await userEvent.click(document.body)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点锚点里的触发按钮不收起，交给按钮自己管开关', async () => {
    const { onClose } = renderPopover()

    await userEvent.click(screen.getByRole('button', { name: '播放倍速' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('点面板内容不收起', async () => {
    const { onClose } = renderPopover()

    await userEvent.click(screen.getByRole('menuitemradio', { name: '1x' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('按 Esc 收起', async () => {
    const { onClose } = renderPopover()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('关着的时候不监听这些事件', async () => {
    const { onClose } = renderPopover(false)

    await userEvent.keyboard('{Escape}')
    await userEvent.click(document.body)

    expect(onClose).not.toHaveBeenCalled()
  })
})
