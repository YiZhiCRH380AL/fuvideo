import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import AppearanceSettings from './AppearanceSettings'

describe('外观设置', () => {
  it('列出全部主题并回报用户选择', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    const onMotionChange = vi.fn()

    render(
      <AppearanceSettings
        theme="midnight"
        motion="full"
        onThemeChange={onThemeChange}
        onMotionChange={onMotionChange}
      />,
    )

    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(screen.getByRole('radio', { name: /极夜蓝/ })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: /苔原绿/ }))
    await user.click(screen.getByRole('button', { name: /轻量/ }))

    expect(onThemeChange).toHaveBeenCalledWith('forest')
    expect(onMotionChange).toHaveBeenCalledWith('subtle')
  })

  it('主题预览会跟着当前主题的颜色变化', () => {
    render(
      <AppearanceSettings
        theme="daylight"
        motion="off"
        onThemeChange={() => {}}
        onMotionChange={() => {}}
      />,
    )

    expect(screen.getByText('FUTUREVIDEO / 日光')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /关闭/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('色盘支持方向键切换，键盘用户不必逐个 Tab', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()

    render(
      <AppearanceSettings
        theme="midnight"
        motion="full"
        onThemeChange={onThemeChange}
        onMotionChange={() => {}}
      />,
    )

    const current = screen.getByRole('radio', { name: /极夜蓝/ })
    current.focus()
    await user.keyboard('{ArrowRight}')

    expect(onThemeChange).toHaveBeenCalledWith('ember')
    await expect(screen.getByRole('radio', { name: /余烬橙/ })).toHaveFocus()
  })
})
