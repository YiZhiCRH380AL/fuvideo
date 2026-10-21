import type { CSSProperties } from 'react'

import { MOTION_MODES, type MotionPreference, type ThemeId, themeFor } from '../lib/theme'
import ThemePicker from './ThemePicker'

export interface AppearanceSettingsProps {
  theme: ThemeId
  motion: MotionPreference
  onThemeChange: (theme: ThemeId) => void
  onMotionChange: (motion: MotionPreference) => void
}

/** 设置页顶部的「外观」工作台：改一下，整个播放器立即换色。 */
export default function AppearanceSettings({
  theme,
  motion,
  onThemeChange,
  onMotionChange,
}: AppearanceSettingsProps) {
  const current = themeFor(theme)

  return (
    <section
      className="settings__section settings__section--appearance"
      id="settings-appearance"
      aria-labelledby="appearance-title"
    >
      <div className="settings__heading">
        <h3 className="settings__name" id="appearance-title">
          外观
        </h3>
        <span className="settings__note">点一下即时生效，选择会跟着设置一起保存</span>
      </div>

      <div className="appearance">
        <div
          className="appearance__preview"
          style={
            {
              '--preview-a': current.swatches[1],
              '--preview-b': current.swatches[2],
            } as CSSProperties
          }
        >
          <span className="appearance__preview-kicker">FUTUREVIDEO / {current.shortLabel}</span>
          <span className="appearance__preview-title">把片单放进自己的颜色里</span>
          <span className="appearance__preview-copy">本地播放 · 无广告 · 不打断</span>
          <span className="appearance__preview-track" aria-hidden="true">
            <span />
          </span>
        </div>

        <div className="appearance__controls">
          <span className="settings__label">颜色主题</span>
          <ThemePicker theme={theme} onChange={onThemeChange} />

          <span className="settings__label appearance__motion-label">动效</span>
          <div className="appearance__motion" role="group" aria-label="动效强度">
            {MOTION_MODES.map((mode) => (
              <button
                className="appearance__motion-option"
                key={mode.id}
                type="button"
                aria-pressed={motion === mode.id}
                onClick={() => onMotionChange(mode.id)}
              >
                <span>{mode.label}</span>
                <span className="appearance__motion-hint">{mode.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
