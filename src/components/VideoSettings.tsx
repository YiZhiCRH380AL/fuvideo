import { useState, type CSSProperties } from 'react'
import {
  setHwdec,
  setScreenshotFormat,
  setScreenshotSubtitles,
  setVideoAspect,
  setVideoColor,
  setVideoFill,
  setVideoFilterMode,
  setVideoFlip,
  setVideoHdrRecovery,
  setVideoProfile,
  setVideoRotate,
  setVideoSharpen,
  setVideoSwitch,
  setVideoTargetPeak,
  setVideoToneMapping,
  setVideoZoom,
  takeScreenshot,
  type PlayerSettings,
  type VideoColorChannel,
  type VideoOptions,
  type VideoSwitchKind,
} from '../lib/backend'
import { stepNumber } from '../lib/media'

export interface VideoSettingsProps {
  settings: PlayerSettings
  options: VideoOptions
  /** mpv 报出来的、当前真正在用的硬解后端。 */
  hwdecCurrent: string | null
  busy: boolean
  run: (action: () => Promise<PlayerSettings>) => void
  onError: (cause: unknown) => void
}

const COLOR_CHANNELS: { channel: VideoColorChannel; label: string }[] = [
  { channel: 'brightness', label: '亮度' },
  { channel: 'contrast', label: '对比度' },
  { channel: 'saturation', label: '饱和度' },
  { channel: 'hue', label: '色相' },
  { channel: 'gamma', label: '伽马' },
]

const COLOR_KEYS: Record<
  VideoColorChannel,
  'videoBrightness' | 'videoContrast' | 'videoSaturation' | 'videoHue' | 'videoGamma'
> = {
  brightness: 'videoBrightness',
  contrast: 'videoContrast',
  saturation: 'videoSaturation',
  hue: 'videoHue',
  gamma: 'videoGamma',
}

const SWITCHES: { kind: VideoSwitchKind; label: string; hint: string }[] = [
  { kind: 'deband', label: '去色带', hint: '抹掉平滑渐变上的条纹，动画的暗部最明显' },
  { kind: 'interpolation', label: '补帧', hint: '把帧率补到显示器刷新率，运动更顺（费显卡）' },
  { kind: 'icc', label: '跟随显示器色彩', hint: '按系统里的显示器 ICC 配置校正颜色' },
]

const SWITCH_KEYS: Record<VideoSwitchKind, 'videoDeband' | 'videoInterpolation' | 'videoIcc'> = {
  deband: 'videoDeband',
  interpolation: 'videoInterpolation',
  icc: 'videoIcc',
}

/** 每一格挪多少。缩放的取值是 log2 倍率，所以 0.1 大约是一成。 */
const ZOOM_STEP = 0.1
const SHARPEN_STEP = 0.5
const HDR_STEP = 0.1
const PEAK_STEP = 20
const ZOOM_RANGE = { min: -20, max: 20 }

/** `video-zoom` 是对数倍率：0 是原样、1 是放大一倍。展示时换成看得懂的倍率。 */
function formatZoom(zoom: number): string {
  return `${(2 ** zoom).toFixed(2)}×`
}

/**
 * 设置页的「画面」一节。
 *
 * 和音效那边一样分简单 / 高级：简单只摆常用的（比例、填满、旋转、缩放、截图），
 * 高级才把色彩、画质、硬解、HDR 这些摊开。
 *
 * 色彩滑块拖动时只改界面，松手才提交——写属性本身很便宜，但管道是串行的，
 * 拖一次发几十条只会互相排队。
 */
export default function VideoSettings({
  settings,
  options,
  hwdecCurrent,
  busy,
  run,
  onError,
}: VideoSettingsProps) {
  const [saved, setSaved] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ channel: VideoColorChannel; value: number } | null>(null)

  const advanced = settings.videoFilterMode === 'advanced'
  const aspect = settings.videoAspect ?? 'auto'
  const zoom = settings.videoZoom ?? 0
  const rotate = settings.videoRotate ?? 0
  const flip = settings.videoFlip
  const sharpen = settings.videoSharpen ?? 0
  const hdrRecovery = settings.videoHdrRecovery ?? 0
  const peak = settings.videoTargetPeak

  const colorValue = (channel: VideoColorChannel): number => {
    if (dragging !== null && dragging.channel === channel) {
      return dragging.value
    }

    return settings[COLOR_KEYS[channel]] ?? 0
  }

  const commitColor = (channel: VideoColorChannel) => {
    if (dragging === null || dragging.channel !== channel) {
      return
    }

    const value = dragging.value
    setDragging(null)
    run(() => setVideoColor(channel, value))
  }

  const shoot = () => {
    setSaved(null)
    takeScreenshot()
      .then(setSaved)
      .catch(onError)
  }

  return (
    <section className="settings__section">
      <div className="settings__heading">
        <h3 className="settings__name">画面</h3>
        <span className="settings__note">只影响看到的画面，声音和字幕不受影响</span>
      </div>

      <div className="settings__chips" role="group" aria-label="画面模式">
        {options.modes.map((mode) => (
          <button
            className="settings__chip"
            key={mode.id}
            type="button"
            aria-pressed={settings.videoFilterMode === mode.id}
            disabled={busy}
            onClick={() => run(() => setVideoFilterMode(mode.id))}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="settings__block">
        <span className="settings__label">画面比例</span>
        <div className="settings__chips" role="group" aria-label="画面比例">
          {options.aspects.map((item) => (
            <button
              className="settings__chip"
              key={item.id}
              type="button"
              aria-pressed={aspect === item.id}
              disabled={busy}
              onClick={() => run(() => setVideoAspect(item.id))}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.videoFill}
            disabled={busy}
            onChange={(event) => run(() => setVideoFill(event.target.checked))}
          />
          填满窗口（裁掉黑边）
        </label>
      </div>

      <div className="settings__block">
        <span className="settings__label">旋转</span>
        <div className="settings__chips" role="group" aria-label="旋转">
          {options.rotations.map((degrees) => (
            <button
              className="settings__chip"
              key={degrees}
              type="button"
              aria-pressed={rotate === degrees}
              disabled={busy}
              onClick={() => run(() => setVideoRotate(degrees))}
            >
              {degrees}°
            </button>
          ))}
        </div>

        <div className="settings__stepper">
          <button
            className="settings__step"
            type="button"
            aria-label="缩小"
            disabled={busy}
            onClick={() =>
              run(() => setVideoZoom(stepNumber(zoom, -ZOOM_STEP, ZOOM_RANGE.min, ZOOM_RANGE.max)))
            }
          >
            −
          </button>
          <span className="settings__value" data-testid="zoom-value">
            {formatZoom(zoom)}
          </span>
          <button
            className="settings__step"
            type="button"
            aria-label="放大"
            disabled={busy}
            onClick={() =>
              run(() => setVideoZoom(stepNumber(zoom, ZOOM_STEP, ZOOM_RANGE.min, ZOOM_RANGE.max)))
            }
          >
            +
          </button>
        </div>
      </div>

      <div className="settings__block">
        <span className="settings__label">快照</span>
        <button className="settings__action" type="button" disabled={busy} onClick={shoot}>
          截一张当前画面
        </button>

        <label className="settings__field">
          格式
          <select
            className="settings__select"
            value={settings.screenshotFormat ?? 'jpg'}
            disabled={busy}
            onChange={(event) => run(() => setScreenshotFormat(event.target.value))}
          >
            {options.screenshotFormats.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={settings.screenshotSubtitles}
            disabled={busy}
            onChange={(event) => run(() => setScreenshotSubtitles(event.target.checked))}
          />
          连字幕一起截
        </label>

        {saved === null ? null : (
          <p className="settings__hint" data-testid="screenshot-saved">
            已存到 {saved}
          </p>
        )}
      </div>

      {advanced ? (
        <>
          <div className="settings__block">
            <span className="settings__label">色彩</span>
            {COLOR_CHANNELS.map(({ channel, label }) => {
              const value = colorValue(channel)
              const limit = options.colorLimit
              const fill = ((value + limit) / (limit * 2)) * 100

              return (
                <div className="settings__band" key={channel}>
                  <span className="settings__frequency">{label}</span>
                  <input
                    className="settings__range"
                    type="range"
                    min={-limit}
                    max={limit}
                    step={1}
                    value={value}
                    disabled={busy}
                    aria-label={label}
                    style={{ '--fill': `${fill}%` } as CSSProperties}
                    onChange={(event) =>
                      setDragging({ channel, value: Number(event.target.value) })
                    }
                    onPointerUp={() => commitColor(channel)}
                    onKeyUp={() => commitColor(channel)}
                    onBlur={() => commitColor(channel)}
                  />
                  <span className="settings__gain">{value.toFixed(0)}</span>
                </div>
              )
            })}
          </div>

          <div className="settings__block">
            <span className="settings__label">镜像</span>
            <div className="settings__chips" role="group" aria-label="镜像">
              <button
                className="settings__chip"
                type="button"
                aria-pressed={flip === null}
                disabled={busy}
                onClick={() => run(() => setVideoFlip(null))}
              >
                不镜像
              </button>
              {options.flips.map((item) => (
                <button
                  className="settings__chip"
                  key={item.id}
                  type="button"
                  aria-pressed={flip === item.id}
                  disabled={busy}
                  onClick={() => run(() => setVideoFlip(item.id))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings__block">
            {SWITCHES.map(({ kind, label, hint }) => (
              <label className="settings__toggle" key={kind}>
                <input
                  type="checkbox"
                  checked={settings[SWITCH_KEYS[kind]] === true}
                  disabled={busy}
                  onChange={(event) => run(() => setVideoSwitch(kind, event.target.checked))}
                />
                <span className="settings__effect">
                  {label}
                  <span className="settings__effect-hint">{hint}</span>
                </span>
              </label>
            ))}

            <div className="settings__stepper">
              <button
                className="settings__step"
                type="button"
                aria-label="降低锐化"
                disabled={busy}
                onClick={() =>
                  run(() => setVideoSharpen(stepNumber(sharpen, -SHARPEN_STEP, 0, options.sharpenLimit)))
                }
              >
                −
              </button>
              <span className="settings__value" data-testid="sharpen-value">
                锐化 {sharpen.toFixed(1)}
              </span>
              <button
                className="settings__step"
                type="button"
                aria-label="提高锐化"
                disabled={busy}
                onClick={() =>
                  run(() => setVideoSharpen(stepNumber(sharpen, SHARPEN_STEP, 0, options.sharpenLimit)))
                }
              >
                +
              </button>
            </div>
          </div>

          <div className="settings__block">
            <span className="settings__label">画质档位</span>
            <div className="settings__chips" role="group" aria-label="画质档位">
              <button
                className="settings__chip"
                type="button"
                aria-pressed={settings.videoProfile === null}
                disabled={busy}
                onClick={() => run(() => setVideoProfile(null))}
              >
                默认
              </button>
              {options.profiles.map((item) => (
                <button
                  className="settings__chip"
                  key={item.id}
                  type="button"
                  aria-pressed={settings.videoProfile === item.id}
                  disabled={busy}
                  onClick={() => run(() => setVideoProfile(item.id))}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings__block">
            <span className="settings__label">硬件解码</span>
            <label className="settings__field">
              方式
              <select
                className="settings__select"
                value={settings.hwdec}
                disabled={busy}
                onChange={(event) => run(() => setHwdec(event.target.value))}
              >
                {options.hwdec.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {/* 显示 mpv 报的「真正在用」的那个，而不是用户选了什么 */}
            <p className="settings__hint" data-testid="hwdec-current">
              当前生效：{hwdecCurrent ?? '还没开始播放'}
            </p>
          </div>

          <div className="settings__block">
            <span className="settings__label">HDR</span>
            <label className="settings__field">
              色调映射
              <select
                className="settings__select"
                value={settings.videoToneMapping ?? 'auto'}
                disabled={busy}
                onChange={(event) => run(() => setVideoToneMapping(event.target.value))}
              >
                {options.toneMappings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="settings__stepper">
              <button
                className="settings__step"
                type="button"
                aria-label="降低目标亮度"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    setVideoTargetPeak(stepNumber(peak ?? 100, -PEAK_STEP, 10, 10_000)),
                  )
                }
              >
                −
              </button>
              <span className="settings__value" data-testid="peak-value">
                亮度 {peak === null ? '自动' : `${Math.round(peak)} nits`}
              </span>
              <button
                className="settings__step"
                type="button"
                aria-label="提高目标亮度"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    setVideoTargetPeak(stepNumber(peak ?? 100, PEAK_STEP, 10, 10_000)),
                  )
                }
              >
                +
              </button>
            </div>

            <div className="settings__stepper">
              <button
                className="settings__step"
                type="button"
                aria-label="降低对比度恢复"
                disabled={busy}
                onClick={() =>
                  run(() => setVideoHdrRecovery(stepNumber(hdrRecovery, -HDR_STEP, 0, 2)))
                }
              >
                −
              </button>
              <span className="settings__value" data-testid="hdr-recovery-value">
                高光细节 {hdrRecovery.toFixed(1)}
              </span>
              <button
                className="settings__step"
                type="button"
                aria-label="提高对比度恢复"
                disabled={busy}
                onClick={() =>
                  run(() => setVideoHdrRecovery(stepNumber(hdrRecovery, HDR_STEP, 0, 2)))
                }
              >
                +
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="settings__hint">想要色彩、画质、硬解这些细调，切到「高级」。</p>
      )}
    </section>
  )
}
