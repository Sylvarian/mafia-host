import type { GameSettingKey, GameSettings } from '@/application/game-setup/index.ts'

import { GAME_SETTING_OPTIONS } from './game-setting-options.ts'

type GameSettingsFormProps = Readonly<{
  settings: GameSettings
  onSettingChange: (setting: GameSettingKey, value: boolean) => void
}>

export function GameSettingsForm({ settings, onSettingChange }: GameSettingsFormProps) {
  return (
    <section className="setup-section" aria-labelledby="settings-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Step 3</p>
          <h2 id="settings-heading">Game settings</h2>
          <p>Choose the rule switches that govern this game.</p>
        </div>
        <span className="setup-only-note">Applied during play</span>
      </div>

      <div className="settings-list">
        {GAME_SETTING_OPTIONS.map((option) => {
          const enabled = settings[option.key]

          return (
            <label className="setting-option" key={option.key}>
              <span className="setting-option__copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
              <span className="setting-option__control">
                <span className={`setting-option__value${enabled ? ' is-enabled' : ''}`}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  aria-label={option.label}
                  onChange={(event) => {
                    onSettingChange(option.key, event.currentTarget.checked)
                  }}
                />
                <span className="setting-option__switch" aria-hidden="true" />
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
