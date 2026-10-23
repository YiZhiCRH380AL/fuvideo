import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  getAudioOptions,
  getPlayerDetails,
  getVideoOptions,
  readSettings,
  setAudioEffect,
  setAudioFilterMode,
  setAudioFormat,
  setAudioSamplerate,
  setAudioSpdif,
  setEqualizerBand,
  setEqualizerPreset,
  setSplashSpeed,
  type AudioEffectKind,
  type AudioOptions,
  type PlayerSettings,
  type VideoOptions,
} from '../lib/backend'
import { SPLASH_SPEEDS, speedFor } from '../lib/splash'
import { normalizeMotion, normalizeTheme, type MotionPreference, type ThemeId } from '../lib/theme'
import AppearanceSettings from './AppearanceSettings'
import AudioSpectrum from './AudioSpectrum'
import VideoSettings from './VideoSettings'
import ShortcutSettings from './ShortcutSettings'
import './SettingsPage.css'

export interface SettingsPageProps {
  onClose: () => void
  /** 出错交给外面统一提示：界面上只该有一个错误出口。 */
  onError: (cause: unknown) => void
  /** 用户改过的键位；`null` 表示全用出厂键位。 */
  shortcuts: Record<string, string> | null
  /** 改完之后由外面记下来：快捷键要立刻生效，不能等下次启动。 */
  onShortcutsChange: (shortcuts: Record<string, string> | null) => void
  /** 当前外观由 App 持有，这里只负责展示与回报选择。 */
  theme?: ThemeId
  motion?: MotionPreference
  onThemeChange?: (theme: ThemeId) => void
  onMotionChange?: (motion: MotionPreference) => void
}

const EFFECTS: { kind: AudioEffectKind; title: string; hint: string }[] = [
  {
    kind: 'loudness',
    title: '响度归一化',
    hint: '把忽大忽小的对白拉平，晚上看视频不用一直调音量',
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
export default function SettingsPage({
  onClose,
  onError,
  shortcuts,
  onShortcutsChange,
  theme,
  motion,
  onThemeChange,
  onMotionChange,
}: SettingsPageProps) {
  const [settings, setSettings] = useState<PlayerSettings | null>(null)
  const [options, setOptions] = useState<AudioOptions | null>(null)
  const [videoOptions, setVideoOptions] = useState<VideoOptions | null>(null)
  /** mpv 报出来的、当前真正在用的硬解后端。 */
  const [hwdecCurrent, setHwdecCurrent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** 正在拖的那一段。松手之前只改界面，不去重建滤镜链。 */
  const [dragging, setDragging] = useState<{ index: number; gain: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [nextSettings, nextOptions, nextVideoOptions, details] = await Promise.all([
          readSettings(),
          getAudioOptions(),
          getVideoOptions(),
          // 没在播放时读不到详情，不该因此把整个设置页卡住
          getPlayerDetails().catch(() => null),
        ])

        if (!cancelled) {
          setSettings(nextSettings)
          setOptions(nextOptions)
          setVideoOptions(nextVideoOptions)
          setHwdecCurrent(details?.hwdecCurrent ?? null)
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
  const activeTheme = normalizeTheme(theme ?? settings?.theme)
  const activeMotion = normalizeMotion(motion ?? settings?.motion)
  const gainLimit = options?.gainLimit ?? 12
  const frequencies = options?.frequencies ?? []

  const changeTheme = (next: ThemeId) => {
    setSettings((current) => (current === null ? current : { ...current, theme: next }))
    onThemeChange?.(next)
  }

  const changeMotion = (next: MotionPreference) => {
    setSettings((current) => (current === null ? current : { ...current, motion: next }))
    onMotionChange?.(next)
  }

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
          <div className="settings__head-copy">
            <span className="settings__head-kicker">FUTUREVIDEO / CONTROL ROOM</span>
            <h2 className="settings__title" id="settings-title">
              设置
            </h2>
          </div>
          <button className="settings__close" type="button" onClick={onClose} aria-label="关闭设置">
            ✕
          </button>
        </header>

        <div className="settings__body">
          <nav className="settings__rail" aria-label="设置分区">
            <span className="settings__rail-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="settings__rail-kicker">FUTURE / CONTROL ROOM</span>
            <a href="#settings-appearance">外观</a>
            <a href="#settings-audio">音效</a>
            <a href="#settings-video">画面</a>
            <a href="#settings-keys">快捷键</a>
            <span className="settings__rail-footer">偏好保存在本机</span>
          </nav>

          <div className="settings__content">
            <AppearanceSettings
              theme={activeTheme}
              motion={activeMotion}
              onThemeChange={changeTheme}
              onMotionChange={changeMotion}
            />

            <section className="settings__section" id="settings-audio">
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

                  <AudioSpectrum frequencies={frequencies} active={!passthrough} />

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

            <div id="settings-video">
              {!settings || !videoOptions ? null : (
                <VideoSettings
                  settings={settings}
                  options={videoOptions}
                  hwdecCurrent={hwdecCurrent}
                  busy={busy}
                  run={run}
                  onError={onError}
                />
              )}
            </div>

          <section className="settings__section" id="settings-keys">
            <ShortcutSettings
              shortcuts={shortcuts}
              onChange={onShortcutsChange}
              onError={onError}
            />
          </section>

          <section className="settings__section" id="settings-interface">
            <div className="settings__heading">
              <h3 className="settings__name">界面</h3>
              <span className="settings__note">改完下次启动生效</span>
            </div>

            {settings ? (
              <div className="settings__block">
                <span className="settings__label">开屏停留</span>
                <div className="settings__chips" role="group" aria-label="开屏停留时长">
                  {SPLASH_SPEEDS.map((item) => (
                    <button
                      className="settings__chip"
                      key={item.id}
                      type="button"
                      aria-pressed={speedFor(settings.splashSpeed) === item.id}
                      disabled={busy}
                      onClick={() => run(() => setSplashSpeed(item.id))}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="settings__hint">
                  只改开屏停多久，入场与收场的动效不变；选「关闭」也是探完就进，不会硬切。
                </p>
              </div>
            ) : null}
          </section>
          </div>
        </div>

        <p className="settings__foot">设置存在本机，下次打开还是这样。</p>
      </div>
    </div>
  )
}
