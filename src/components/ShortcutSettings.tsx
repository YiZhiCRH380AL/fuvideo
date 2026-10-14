import { useCallback, useEffect, useState } from 'react'
import { resetShortcuts, setShortcut } from '../lib/backend'
import { defaultCodeFor, isBindableCode, keyLabel, SHORTCUT_ROWS } from '../lib/shortcuts'

export interface ShortcutSettingsProps {
  /** 用户改过的键位；`null` 表示全用出厂键位。 */
  shortcuts: Record<string, string> | null
  /** 后端落盘之后的那份（越界与重键已经被洗掉）。 */
  onChange: (shortcuts: Record<string, string> | null) => void
  onError: (cause: unknown) => void
}

/**
 * 快捷键设置。
 *
 * 点一颗键就进入「按下新键」的状态，再按什么就绑什么。记的是
 * `KeyboardEvent.code`（物理键）而不是按出来的字符，换键盘布局也不会跑位。
 *
 * 录制期间用**捕获阶段**监听：不然新键会先被播放器那套全局快捷键吃掉，
 * 用户会看到「按了一下，视频暂停了，键位没改成」。
 */
export default function ShortcutSettings({ shortcuts, onChange, onError }: ShortcutSettingsProps) {
  /** 正在等按键的那个动作；`null` 表示没在录。 */
  const [recording, setRecording] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = useCallback(
    async (action: string, code: string | null) => {
      setRecording(null)
      setBusy(true)

      try {
        const settings = await setShortcut(action, code)
        onChange(settings.shortcuts ?? null)
      } catch (cause: unknown) {
        onError(cause)
      } finally {
        setBusy(false)
      }
    },
    [onChange, onError],
  )

  const resetAll = useCallback(async () => {
    setRecording(null)
    setBusy(true)

    try {
      const settings = await resetShortcuts()
      onChange(settings.shortcuts ?? null)
    } catch (cause: unknown) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }, [onChange, onError])

  useEffect(() => {
    if (recording === null) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      // Esc 是「算了」，别的纯修饰键按下去没有意义
      if (event.code === 'Escape') {
        setRecording(null)
        return
      }

      if (isBindableCode(event.code)) {
        void apply(recording, event.code)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [apply, recording])

  return (
    <>
      <div className="settings__heading">
        <h3 className="settings__name">快捷键</h3>
        <span className="settings__note">按物理键记，换键盘布局也不会跑位</span>
      </div>

      <ul className="keys" data-testid="shortcut-list">
        {SHORTCUT_ROWS.map((row) => {
          const custom = shortcuts?.[row.action]
          const code = custom ?? defaultCodeFor(row.action)
          const isRecording = recording === row.action

          return (
            <li className="keys__row" key={row.action}>
              <span className="keys__label">{row.label}</span>

              <button
                className="keys__key"
                type="button"
                data-recording={isRecording ? 'true' : 'false'}
                aria-label={`${row.label} 的按键`}
                onClick={() => setRecording(isRecording ? null : row.action)}
              >
                {isRecording ? '按下新键…' : keyLabel(code)}
              </button>

              {custom === undefined ? (
                <span className="keys__spacer" aria-hidden="true" />
              ) : (
                <button
                  className="keys__reset"
                  type="button"
                  aria-label={`把 ${row.label} 恢复默认`}
                  title="恢复默认"
                  onClick={() => void apply(row.action, null)}
                >
                  ↺
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="settings__block">
        <button
          className="settings__chip"
          type="button"
          disabled={busy || shortcuts === null}
          onClick={() => void resetAll()}
        >
          全部恢复默认
        </button>

        <p className="settings__hint">
          {shortcuts === null ? '现在就是出厂键位。' : 'Esc 取消这次改键。'}
        </p>
      </div>
    </>
  )
}
