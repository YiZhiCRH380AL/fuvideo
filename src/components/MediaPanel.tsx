import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  addAudioFile,
  addSubtitleFile,
  getAudioDevices,
  getPlayerDetails,
  setAudioChannels,
  setAudioDelay,
  setAudioDevice,
  setAudioExclusive,
  setAudioTrack,
  setSecondarySubtitle,
  setSubtitleDelay,
  setSubtitleFontSize,
  setSubtitlePosition,
  setSubtitleStyleOverride,
  setSubtitleTrack,
  type AudioDevice,
  type PlayerDetails,
} from '../lib/backend'
import {
  AUDIO_CHANNEL_OPTIONS,
  DELAY_COARSE_STEP,
  DELAY_STEP,
  SUBTITLE_POSITION_RANGE,
  SUBTITLE_SIZE_RANGE,
  SUBTITLE_STYLE_OPTIONS,
  formatDelay,
  formatStep,
  stepDelay,
  stepNumber,
  trackDetail,
  trackTitle,
} from '../lib/media'

export interface MediaPanelProps {
  /** 当前播放的文件。换片时要重新拉一次轨道表。 */
  source: string | null
  /** 出错交给外面统一提示：界面上只该有一个错误出口。 */
  onError: (cause: unknown) => void
}

type Tab = 'audio' | 'subtitle'

/**
 * 音轨与字幕面板。
 *
 * 所有改动都是「发命令 → 重新读一次 mpv 的真实状态」，不在前端自己推演结果：
 * 切音轨、换输出设备这些操作 mpv 有可能拒绝（设备被独占、轨道不存在），
 * 界面显示的必须是真正生效的值。
 */
export default function MediaPanel({ source, onError }: MediaPanelProps) {
  const [tab, setTab] = useState<Tab>('audio')
  const [details, setDetails] = useState<PlayerDetails | null>(null)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setDetails(await getPlayerDetails())
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [nextDetails, nextDevices] = await Promise.all([getPlayerDetails(), getAudioDevices()])

        if (!cancelled) {
          setDetails(nextDetails)
          setDevices(nextDevices)
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
  }, [onError, source])

  /** 所有改动的统一入口：做完再读一次状态，顺手把并发点按挡掉。 */
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true)

      try {
        await action()
        await refresh()
      } catch (cause: unknown) {
        onError(cause)
      } finally {
        setBusy(false)
      }
    },
    [onError, refresh],
  )

  const tracks = details?.tracks ?? []
  const audioTracks = tracks.filter((track) => track.kind === 'audio')
  const subtitleTracks = tracks.filter((track) => track.kind === 'sub')
  const selectedAudio = audioTracks.find((track) => track.selected)?.id ?? null
  const selectedSubtitle = subtitleTracks.find((track) => track.selected)?.id ?? null
  const audioDelay = details?.audioDelay ?? 0
  const subtitleDelay = details?.subtitleDelay ?? 0
  const subtitleSize = details?.subtitleFontSize ?? SUBTITLE_SIZE_RANGE.min
  const subtitlePosition = details?.subtitlePosition ?? 100

  return (
    <div className="media">
      <div className="media__tabs" role="tablist" aria-label="音轨与字幕">
        <button
          className="media__tab"
          type="button"
          role="tab"
          aria-selected={tab === 'audio'}
          onClick={() => setTab('audio')}
        >
          音频
        </button>
        <button
          className="media__tab"
          type="button"
          role="tab"
          aria-selected={tab === 'subtitle'}
          onClick={() => setTab('subtitle')}
        >
          字幕
        </button>
      </div>

      {tab === 'audio' ? (
        <>
          <Section title="音轨">
            {audioTracks.length === 0 ? (
              <p className="media__hint">这个文件里没有音轨</p>
            ) : (
              <div className="media__list" data-testid="audio-tracks">
                {audioTracks.map((track, index) => (
                  <OptionButton
                    key={track.id}
                    title={trackTitle(track, index)}
                    detail={trackDetail(track)}
                    selected={track.id === selectedAudio}
                    disabled={busy}
                    onClick={() => void run(() => setAudioTrack(track.id))}
                  />
                ))}
              </div>
            )}

            <button
              className="media__action"
              type="button"
              disabled={busy}
              onClick={() => void run(() => addAudioFile())}
            >
              加载音轨文件…
            </button>
          </Section>

          <Section title="输出设备">
            {devices.length === 0 ? (
              <p className="media__hint">没有读到可用的输出设备</p>
            ) : (
              <div className="media__list" data-testid="audio-devices">
                {devices.map((device) => (
                  <OptionButton
                    key={device.name}
                    title={device.description}
                    detail={null}
                    selected={device.name === details?.audioDevice}
                    disabled={busy}
                    onClick={() => void run(() => setAudioDevice(device.name))}
                  />
                ))}
              </div>
            )}

            <label className="media__toggle">
              <input
                type="checkbox"
                checked={details?.audioExclusive === true}
                disabled={busy}
                onChange={(event) => void run(() => setAudioExclusive(event.target.checked))}
              />
              独占输出（别的程序会没声音）
            </label>
          </Section>

          <Section title="声道">
            <div className="media__chips">
              {AUDIO_CHANNEL_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={details?.audioChannels === option.value}
                  disabled={busy}
                  onClick={() => void run(() => setAudioChannels(option.value))}
                />
              ))}
            </div>
          </Section>

          <Section title="音频延迟">
            <Stepper
              value={formatDelay(audioDelay)}
              steps={[-DELAY_COARSE_STEP, -DELAY_STEP, DELAY_STEP, DELAY_COARSE_STEP]}
              disabled={busy}
              format={(delta) => formatStep(delta, 's')}
              onStep={(delta) => void run(() => setAudioDelay(stepDelay(audioDelay, delta)))}
            />
          </Section>
        </>
      ) : (
        <>
          <Section title="字幕轨">
            <div className="media__list" data-testid="subtitle-tracks">
              <OptionButton
                title="关闭字幕"
                detail={null}
                selected={selectedSubtitle === null}
                disabled={busy}
                onClick={() => void run(() => setSubtitleTrack(null))}
              />

              {subtitleTracks.map((track, index) => (
                <OptionButton
                  key={track.id}
                  title={trackTitle(track, index)}
                  detail={trackDetail(track)}
                  selected={track.id === selectedSubtitle}
                  disabled={busy}
                  onClick={() => void run(() => setSubtitleTrack(track.id))}
                />
              ))}
            </div>

            {subtitleTracks.length === 0 ? (
              <p className="media__hint">这个文件里没有字幕，可以挂一个外挂字幕</p>
            ) : null}

            <button
              className="media__action"
              type="button"
              disabled={busy}
              onClick={() => void run(() => addSubtitleFile())}
            >
              加载字幕文件…
            </button>
          </Section>

          {/* 只有一条字幕时不给第二字幕的位置，省得点开一个没用的空列表 */}
          {subtitleTracks.length > 1 ? (
            <Section title="第二字幕（双语）">
              <div className="media__list" data-testid="secondary-subtitles">
                <OptionButton
                  title="关闭"
                  detail={null}
                  selected={details?.secondarySubtitleId == null}
                  disabled={busy}
                  onClick={() => void run(() => setSecondarySubtitle(null))}
                />

                {subtitleTracks.map((track, index) => (
                  <OptionButton
                    key={track.id}
                    title={trackTitle(track, index)}
                    detail={trackDetail(track)}
                    selected={track.id === details?.secondarySubtitleId}
                    disabled={busy}
                    onClick={() => void run(() => setSecondarySubtitle(track.id))}
                  />
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="字幕延迟">
            <Stepper
              value={formatDelay(subtitleDelay)}
              steps={[-DELAY_COARSE_STEP, -DELAY_STEP, DELAY_STEP, DELAY_COARSE_STEP]}
              disabled={busy}
              format={(delta) => formatStep(delta, 's')}
              onStep={(delta) => void run(() => setSubtitleDelay(stepDelay(subtitleDelay, delta)))}
            />
          </Section>

          <Section title="字号">
            <Stepper
              value={String(Math.round(subtitleSize))}
              steps={[
                -SUBTITLE_SIZE_RANGE.step,
                SUBTITLE_SIZE_RANGE.step,
              ]}
              disabled={busy}
              format={(delta) => formatStep(delta)}
              onStep={(delta) =>
                void run(() =>
                  setSubtitleFontSize(
                    stepNumber(subtitleSize, delta, SUBTITLE_SIZE_RANGE.min, SUBTITLE_SIZE_RANGE.max),
                  ),
                )
              }
            />
          </Section>

          <Section title="位置">
            <Stepper
              value={String(Math.round(subtitlePosition))}
              steps={[
                -SUBTITLE_POSITION_RANGE.step,
                SUBTITLE_POSITION_RANGE.step,
              ]}
              disabled={busy}
              format={(delta) => formatStep(delta)}
              onStep={(delta) =>
                void run(() =>
                  setSubtitlePosition(
                    stepNumber(
                      subtitlePosition,
                      delta,
                      SUBTITLE_POSITION_RANGE.min,
                      SUBTITLE_POSITION_RANGE.max,
                    ),
                  ),
                )
              }
            />
          </Section>

          <Section title="样式">
            <div className="media__chips">
              {SUBTITLE_STYLE_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={details?.subtitleStyle === option.value}
                  disabled={busy}
                  onClick={() => void run(() => setSubtitleStyleOverride(option.value))}
                />
              ))}
            </div>
            <p className="media__hint">ASS 字幕自带样式，选「跟随字幕文件」时字号和位置可能看不到变化。</p>
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="media__section">
      <span className="media__label">{title}</span>
      {children}
    </div>
  )
}

interface OptionButtonProps {
  title: string
  detail: string | null
  selected: boolean
  disabled: boolean
  onClick: () => void
}

function OptionButton({ title, detail, selected, disabled, onClick }: OptionButtonProps) {
  return (
    <button
      className="media__option"
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="media__option-title">{title}</span>
      {detail === null ? null : <span className="media__option-detail">{detail}</span>}
    </button>
  )
}

function Chip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      className="media__chip"
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

interface StepperProps {
  value: string
  /** 正负步长，渲染顺序是「负数升序 → 当前值 → 正数升序」。 */
  steps: number[]
  disabled: boolean
  format: (delta: number) => string
  onStep: (delta: number) => void
}

function Stepper({ value, steps, disabled, format, onStep }: StepperProps) {
  const negatives = steps.filter((step) => step < 0).sort((left, right) => right - left)
  const positives = steps.filter((step) => step > 0).sort((left, right) => left - right)

  return (
    <div className="media__stepper">
      {negatives.map((step) => (
        <StepButton key={step} label={format(step)} disabled={disabled} onClick={() => onStep(step)} />
      ))}

      <span className="media__value" data-testid="stepper-value">
        {value}
      </span>

      {positives.map((step) => (
        <StepButton key={step} label={format(step)} disabled={disabled} onClick={() => onStep(step)} />
      ))}
    </div>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      className="media__step"
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      {label}
    </button>
  )
}
