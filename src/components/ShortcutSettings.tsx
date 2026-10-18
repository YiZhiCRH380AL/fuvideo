import { useCallback, useEffect, useState } from 'react'
import { resetShortcuts, setShortcut } from '../lib/backend'
import {
  actionLabel,
  buildShortcutMap,
  defaultCodeFor,
  isBindableCode,
  keyLabel,
  SHORTCUT_ROWS,
} from '../lib/shortcuts'

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
  /**
   * 撞上别人键位、正等用户确认的那一次改键。
   *
   * 不确认就直接存会**静默**把原来那条的键抢走：后端清洗时一个键码只留一条，
   * 用户只会发现「快进 1 分钟」突然不灵了。所以这里先停下来问一句。
   */
  const [conflict, setConflict] = useState<{ action: string; code: string; owner: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)

  const apply = useCallback(
    async (action: string, code: string | null) => {
      setRecording(null)
      setConflict(null)
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
    setConflict(null)
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

  /** 当前真正生效的键位表，用来找出「这个键现在归谁」。 */
  const effective = buildShortcutMap(shortcuts)

  /** 想把这个键给某个动作；撞车就先记下来，等用户再点一次确认。 */
  const request = useCallback(
    (action: string, code: string) => {
      const owner = effective[code]

      if (owner !== undefined && owner !== action) {
        setRecording(null)
        setConflict({ action, code, owner })
        return
      }

      void apply(action, code)
    },
    [apply, effective],
  )

  useEffect(() => {
    // 冲突提示挂着的时候也要听 Esc，不然用户只能去点别的地方
    if (recording === null && conflict === null) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      // Esc 是「算了」，别的纯修饰键按下去没有意义
      if (event.code === 'Escape') {
        setRecording(null)
        setConflict(null)
        return
      }

      if (recording !== null && isBindableCode(event.code)) {
        request(recording, event.code)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [conflict, recording, request])

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
          const isConflict = conflict?.action === row.action

          return (
            <li className="keys__row" key={row.action}>
              <span className="keys__label">{row.label}</span>

              <button
                className="keys__key"
                type="button"
                data-recording={isRecording ? 'true' : 'false'}
                data-conflict={isConflict ? 'true' : 'false'}
                aria-label={`${row.label} 的按键`}
                onClick={() => {
                  if (isConflict) {
                    void apply(row.action, conflict.code)
                    return
                  }

                  setConflict(null)
                  setRecording(isRecording ? null : row.action)
                }}
              >
                {isRecording ? '按下新键…' : isConflict ? '再点一次确认' : keyLabel(code)}
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

      {conflict ? (
        <p className="keys__conflict" role="alert" data-testid="shortcut-conflict">
          「{keyLabel(conflict.code)}」现在是「{actionLabel(conflict.owner)}」的，换给「
          {actionLabel(conflict.action)}」会让它没键可用。再点一次那颗键位按钮确认，或者按 Esc 取消。
        </p>
      ) : null}

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
