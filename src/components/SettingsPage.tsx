import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  getAudioOptions,
  readSettings,
  setAudioEffect,
  setAudioFilterMode,
  setAudioFormat,
  setAudioSamplerate,
  setAudioSpdif,
  setEqualizerBand,
  setEqualizerPreset,
  type AudioEffectKind,
  type AudioOptions,
  type PlayerSettings,
} from '../lib/backend'
import './SettingsPage.css'

export interface SettingsPageProps {
  onClose: () => void
  /** 出错交给外面统一提示：界面上只该有一个错误出口。 */
  onError: (cause: unknown) => void
}

const EFFECTS: { kind: AudioEffectKind; title: string; hint: string }[] = [
  {
    kind: 'loudness',
    title: '响度归一化',
    hint: '把忽大忽小的对白拉平，夜里看片不用一直捏着音量',
  },
  {
    kind: 'surround',
    title: '虚拟环绕',
    hint: '在普通耳机和音箱上做出包围感',
  },
  {
    kind: 'widening',
    title: '立体声扩展',
    hint: '拉开左右声道的差异，声场听起来更宽',
  },
]

/** 三个开关各自对应设置里的哪个字段。 */
const EFFECT_KEYS: Record<AudioEffectKind, 'loudnessNormalization' | 'virtualSurround' | 'stereoWidening'> = {
  loudness: 'loudnessNormalization',
  surround: 'virtualSurround',
  widening: 'stereoWidening',
}

/** 频点标签：1000 以上写成 kHz，一排滑块底下的字才挤得下。 */
function formatFrequency(hertz: number): string {
  return hertz >= 1000 ? `${hertz / 1000}k` : String(hertz)
}

/**
 * 设置页。
 *
 * 放在整窗浮层而不是控制条上的浮层里，是因为均衡器这类东西要占地方：
 * 10 段滑块、预设、输出格式都需要横向空间，挤在一枚小胶囊里只能做成别扭的样子。
 *
 * 数据只有两个来源：`readSettings` 拿当前值，`getAudioOptions` 拿选项表。
 * 每次改动都返回落盘之后的设置，界面直接用它更新——不在前端自己推演结果。
 */
export default function SettingsPage({ onClose, onError }: SettingsPageProps) {
  const [settings, setSettings] = useState<PlayerSettings | null>(null)
  const [options, setOptions] = useState<AudioOptions | null>(null)
  const [busy, setBusy] = useState(false)
  /** 正在拖的那一段。松手之前只改界面，不去重建滤镜链。 */
  const [dragging, setDragging] = useState<{ index: number; gain: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [nextSettings, nextOptions] = await Promise.all([readSettings(), getAudioOptions()])

        if (!cancelled) {
          setSettings(nextSettings)
          setOptions(nextOptions)
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          onError(cause)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [onError])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  /** 所有改动的统一入口：拿后端返回的那份设置更新界面，顺手挡掉并发点按。 */
  const run = useCallback(
    async (action: () => Promise<PlayerSettings>) => {
      setBusy(true)

      try {
        setSettings(await action())
      } catch (cause: unknown) {
        onError(cause)
      } finally {
        setBusy(false)
      }
    },
    [onError],
  )

  const advanced = settings?.audioFilterMode === 'advanced'
  const passthrough = settings?.audioSpdif === true
  const gainLimit = options?.gainLimit ?? 12
  const frequencies = options?.frequencies ?? []

  /** 拖动中的那一段显示拖动值，其余的显示存下来的值。 */
  const bandGain = (index: number): number => {
    if (dragging !== null && dragging.index === index) {
      return dragging.gain
    }

    return settings?.equalizerBands?.[index] ?? 0
  }

  const commitBand = (index: number) => {
    if (dragging === null || dragging.index !== index) {
      return
    }

    const gain = dragging.gain
    setDragging(null)
    void run(() => setEqualizerBand(index, gain))
  }

  return (
    <div
      className="settings"
      data-testid="settings"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="settings__backdrop" onClick={onClose} />

      <div className="settings__panel">
        <header className="settings__head">
          <h2 className="settings__title" id="settings-title">
            设置
          </h2>
          <button className="settings__close" type="button" onClick={onClose} aria-label="关闭设置">
            ✕
          </button>
        </header>

        <div className="settings__body">
          <section className="settings__section">
            <div className="settings__heading">
              <h3 className="settings__name">音效</h3>
              <span className="settings__note">只影响声音，画面和字幕不受影响</span>
            </div>

            <div className="settings__chips" role="group" aria-label="音效模式">
              {(options?.modes ?? []).map((mode) => (
                <button
                  className="settings__chip"
                  key={mode.id}
                  type="button"
                  aria-pressed={settings?.audioFilterMode === mode.id}
                  disabled={busy || settings === null}
                  onClick={() => void run(() => setAudioFilterMode(mode.id))}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {advanced ? (
              <>
                <div className="settings__block">
                  <span className="settings__label">均衡器</span>

                  <div className="settings__chips" role="group" aria-label="均衡器预设">
                    {(options?.presets ?? []).map((preset) => (
                      <button
                        className="settings__chip"
                        key={preset.id}
                        type="button"
                        aria-pressed={settings?.equalizerPreset === preset.id}
                        disabled={busy || passthrough}
                        onClick={() => void run(() => setEqualizerPreset(preset.id))}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="settings__bands" data-testid="equalizer-bands">
                    {frequencies.map((hertz, index) => {
                      const gain = bandGain(index)
                      const fill = ((gain + gainLimit) / (gainLimit * 2)) * 100

                      return (
                        <div className="settings__band" key={hertz}>
                          <span className="settings__frequency">{formatFrequency(hertz)}</span>
                          <input
                            className="settings__range"
                            type="range"
                            min={-gainLimit}
                            max={gainLimit}
                            step={0.5}
                            value={gain}
                            disabled={busy || passthrough}
                            aria-label={`${formatFrequency(hertz)} 赫兹`}
                            style={{ '--fill': `${fill}%` } as CSSProperties}
                            onChange={(event) =>
                              setDragging({ index, gain: Number(event.target.value) })
                            }
                            onPointerUp={() => commitBand(index)}
                            onKeyUp={() => commitBand(index)}
                            onBlur={() => commitBand(index)}
                          />
                          <span className="settings__gain">{gain.toFixed(1)} dB</span>
                        </div>
                      )
                    })}
                  </div>

                  <p className="settings__hint">
                    每一次改动都会重建一次音频滤镜链（mpv 不支持只改一段），所以这里是松手之后才生效。
                  </p>
                </div>

                <div className="settings__block">
                  <span className="settings__label">输出</span>

                  <label className="settings__field">
                    采样率
                    <select
                      className="settings__select"
                      value={settings?.audioSamplerate?.toString() ?? 'source'}
                      disabled={busy}
                      onChange={(event) =>
                        void run(() =>
                          setAudioSamplerate(
                            event.target.value === 'source' ? null : Number(event.target.value),
                          ),
                        )
                      }
                    >
                      {(options?.samplerates ?? []).map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="settings__field">
                    位深
                    <select
                      className="settings__select"
                      value={settings?.audioFormat ?? 'source'}
                      disabled={busy}
                      onChange={(event) =>
                        void run(() =>
                          setAudioFormat(event.target.value === 'source' ? null : event.target.value),
                        )
                      }
                    >
                      {(options?.formats ?? []).map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="settings__block">
                  <span className="settings__label">透传</span>

                  <label className="settings__toggle">
                    <input
                      type="checkbox"
                      checked={passthrough}
                      disabled={busy}
                      onChange={(event) =>
                        void run(() => setAudioSpdif(event.target.checked))
                      }
                    />
                    音频透传（AC3 / DTS / TrueHD 原样交给功放）
                  </label>

                  {passthrough ? (
                    <p className="settings__warning">
                      透传时音频不经过任何处理，上面的音效全部失效——这就是它会灰掉的原因。
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="settings__block">
                {EFFECTS.map((effect) => (
                  <label className="settings__toggle" key={effect.kind}>
                    <input
                      type="checkbox"
                      checked={settings?.[EFFECT_KEYS[effect.kind]] === true}
                      disabled={busy || passthrough || settings === null}
                      onChange={(event) =>
                        void run(() => setAudioEffect(effect.kind, event.target.checked))
                      }
                    />
                    <span className="settings__effect">
                      {effect.title}
                      <span className="settings__effect-hint">{effect.hint}</span>
                    </span>
                  </label>
                ))}

                <p className="settings__hint">
                  想要均衡器、输出格式这些细调，切到「高级」。
                </p>
              </div>
            )}
          </section>
        </div>

        <p className="settings__foot">设置存在本机，下次打开还是这样。</p>
      </div>
    </div>
  )
}
