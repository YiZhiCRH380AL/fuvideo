import { useEffect, type ReactNode } from 'react'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** 面板的无障碍名称。 */
  label: string
  /**
   * 触发按钮所在容器的选择器，比如 `.island__speed`。
   *
   * 点在这个容器里不算「点外面」：开关由按钮自己负责，外面的监听再插一手
   * 会变成「关上又被立刻打开」。容器同时也是定位锚点，所以要有 position: relative。
   */
  anchorSelector: string
  /** 面板自己的附加类名，用来放宽度之类的差异。 */
  className?: string
  /** 面板的角色。简单的选项列表是 `menu`，带页签的设置面板更像 `dialog`。 */
  role?: 'menu' | 'dialog'
  children: ReactNode
}

/**
 * 从控制条上展开的浮层面板。
 *
 * 画面是 mpv 的原生子窗口，浮层只能留在 HTML 这一层，所以这里只提供一个
 * 定位好的容器，视觉沿用控制条那一套（`.popover`）。行为统一收在这儿：
 * 点外面收起、Esc 收起。至于「开着的时候别把界面隐去」，由调用方把 open
 * 接进空闲隐藏的判据——这个组件不该反过来管调用方的状态。
 */
export default function Popover({
  open,
  onClose,
  label,
  anchorSelector,
  className,
  role = 'menu',
  children,
}: PopoverProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest(anchorSelector) === null) {
        onClose()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorSelector, onClose, open])

  if (!open) {
    return null
  }

  return (
    <div
      className={className === undefined ? 'popover' : `popover ${className}`}
      role={role}
      aria-label={label}
      data-testid="popover"
    >
      {children}
    </div>
  )
}
