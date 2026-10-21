import { motion, useReducedMotion } from 'motion/react'
import { useRef, type CSSProperties, type KeyboardEvent } from 'react'

import { THEMES, type ThemeId } from '../lib/theme'

export interface ThemePickerProps {
  theme: ThemeId
  onChange: (theme: ThemeId) => void
  compact?: boolean
}

/**
 * 主题色盘。
 *
 * 参考 Motion Primitives 共享 layoutId 的滑动高亮手法，但这里把高亮做成
 * 一条从旧色盘滑到新色盘的光带；切换时颜色只做短促的扩散，不持续流动。
 */
export default function ThemePicker({ theme, onChange, compact = false }: ThemePickerProps) {
  const reduceMotion = useReducedMotion()
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % THEMES.length
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + THEMES.length) % THEMES.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = THEMES.length - 1
    }

    if (nextIndex === null) {
      return
    }

    event.preventDefault()
    const nextTheme = THEMES[nextIndex]
    onChange(nextTheme.id)
    optionRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      className="theme-picker"
      data-compact={compact ? 'true' : 'false'}
      role="radiogroup"
      aria-label="颜色主题"
    >
      {THEMES.map((item, index) => {
        const active = item.id === theme
        const style = {
          '--swatch-bg': item.swatches[0],
          '--swatch-a': item.swatches[1],
          '--swatch-b': item.swatches[2],
        } as CSSProperties

        return (
          <button
            className="theme-picker__option"
            type="button"
            role="radio"
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            key={item.id}
            aria-checked={active}
            aria-label={`${item.label}：${item.description}`}
            title={item.description}
            tabIndex={active ? 0 : -1}
            style={style}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="theme-picker__swatch" aria-hidden="true">
              <span className="theme-picker__swatch-light" />
              {active ? (
                <motion.span
                  className="theme-picker__active"
                  layoutId={compact ? 'theme-active-compact' : 'theme-active-settings'}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
            </span>
            <span className="theme-picker__text">
              <span className="theme-picker__label">{compact ? item.shortLabel : item.label}</span>
              {compact ? null : (
                <span className="theme-picker__description">{item.description}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
