import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

import type { NamedCollection } from '../lib/backend'

export interface FavoritePickerProps {
  path: string
  name: string
  /** 收藏按钮的矩形，用来把面板贴在按钮旁边并避开窗口边缘。 */
  anchor: DOMRect
  /** 关闭后把键盘焦点还给触发按钮。 */
  trigger: HTMLElement
  quickFavorite: boolean
  customCollections: NamedCollection[]
  onToggleQuick: () => Promise<void>
  onToggleNamed: (id: string) => Promise<void>
  onManage: () => void
  onError: (cause: unknown) => void
  onClose: () => void
}

const PANEL_WIDTH = 264
const VIEWPORT_GAP = 8

/**
 * 目录页方格上的「收藏到」面板。
 *
 * 快速收藏和命名收藏夹并列成可连续勾选的选项。面板用 fixed 定位，
 * 这样不会被方格的 overflow: hidden 裁掉，也不受 FLIP 悬停位移影响。
 */
export default function FavoritePicker({
  path,
  name,
  anchor,
  trigger,
  quickFavorite,
  customCollections,
  onToggleQuick,
  onToggleNamed,
  onManage,
  onError,
  onClose,
}: FavoritePickerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const firstOptionRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const titleId = useId()

  useEffect(() => {
    // Chromium 默认会为了露出自动聚焦元素而滚动页面，窄窗口下会撞上
    // 下面的“滚动即关闭”保护；这里只交焦点，不让页面自己滚。
    firstOptionRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) {
        return
      }

      // 点任意方格的收藏按钮都交给按钮自己切换目标，不在这里抢先关掉。
      if (
        event.target.closest('.tile__action--favorite') !== null ||
        panelRef.current?.contains(event.target)
      ) {
        return
      }

      onClose()
    }

    const closeForViewportChange = () => onClose()
    const onScroll = (event: Event) => {
      // 收藏夹很多时，选项区自己也要能滚；只有页面/方格墙滚动才收起面板。
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) {
        return
      }

      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeForViewportChange)
    window.addEventListener('scroll', onScroll)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeForViewportChange)
      window.removeEventListener('scroll', onScroll)
    }
  }, [onClose])

  useEffect(() => {
    return () => {
      trigger.focus()
    }
  }, [trigger])

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy !== null) {
      return
    }

    setBusy(key)

    try {
      await action()
    } catch (cause: unknown) {
      onError(cause)
    } finally {
      setBusy(null)
    }
  }

  const left = Math.max(
    VIEWPORT_GAP,
    Math.min(anchor.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - VIEWPORT_GAP),
  )
  const openAbove = anchor.top > window.innerHeight / 2
  const position: CSSProperties = openAbove
    ? {
        left,
        bottom: Math.max(VIEWPORT_GAP, window.innerHeight - anchor.top + VIEWPORT_GAP),
        maxHeight: Math.max(160, anchor.top - VIEWPORT_GAP * 2),
      }
    : {
        left,
        top: anchor.bottom + VIEWPORT_GAP,
        maxHeight: Math.max(160, window.innerHeight - anchor.bottom - VIEWPORT_GAP * 2),
      }

  return (
    <div
      className="favorite-picker"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={position}
      data-testid="favorite-picker"
    >
      <header className="favorite-picker__head">
        <span>SAVE TO</span>
        <strong id={titleId} title={name}>
          {name}
        </strong>
        <small>选择一个或多个收藏夹</small>
      </header>

      <div className="favorite-picker__options" role="group" aria-label="收藏夹选项">
        <button
          ref={firstOptionRef}
          className="favorite-picker__option"
          type="button"
          aria-pressed={quickFavorite}
          disabled={busy !== null}
          onClick={() => void run('favorites', onToggleQuick)}
        >
          <span className="favorite-picker__mark" aria-hidden="true">
            {quickFavorite ? '★' : '☆'}
          </span>
          <span>
            <strong>快速收藏</strong>
            <small>{quickFavorite ? '已加入' : '未加入'}</small>
          </span>
          <span className="favorite-picker__check" aria-hidden="true">
            {quickFavorite ? '✓' : ''}
          </span>
        </button>

        {customCollections.map((collection) => {
          const selected = collection.paths.includes(path)

          return (
            <button
              className="favorite-picker__option"
              type="button"
              key={collection.id}
              aria-pressed={selected}
              disabled={busy !== null}
              onClick={() =>
                void run(collection.id, () => onToggleNamed(collection.id))
              }
            >
              <span className="favorite-picker__mark" aria-hidden="true">
                {selected ? '★' : '☆'}
              </span>
              <span>
                <strong>{collection.name}</strong>
                <small>{collection.paths.length} 个视频</small>
              </span>
              <span className="favorite-picker__check" aria-hidden="true">
                {selected ? '✓' : ''}
              </span>
            </button>
          )
        })}

        {customCollections.length === 0 ? (
          <p className="favorite-picker__empty">
            还没有命名收藏夹。仍可先放进快速收藏，或去收藏夹页新建。
          </p>
        ) : null}
      </div>

      <footer className="favorite-picker__foot">
        <button type="button" onClick={onManage}>
          管理收藏夹
        </button>
        <button type="button" className="favorite-picker__done" onClick={onClose}>
          完成
        </button>
      </footer>
    </div>
  )
}
