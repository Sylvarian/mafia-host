import { ROLE_REGISTRY, type ValidatedGameSetup } from '@/application/game-setup/index.ts'

import { GAME_SETTING_OPTIONS } from './game-setting-options.ts'

type PreparedSetupSummaryProps = Readonly<{
  setup: ValidatedGameSetup
  assignmentErrorMessage: string | null
  onAssignRoles: () => void
  onReturnToSetup: () => void
}>

export function PreparedSetupSummary({
  setup,
  assignmentErrorMessage,
  onAssignRoles,
  onReturnToSetup,
}: PreparedSetupSummaryProps) {
  const selectedRoles = setup.roleCounts.filter((roleCount) => roleCount.count > 0)

  return (
    <section className="prepared-setup" aria-labelledby="prepared-heading">
      <p className="prepared-setup__eyebrow">Validated pre-game draft</p>
      <h2 id="prepared-heading">Setup prepared</h2>
      <p className="prepared-setup__lead">
        The player count, role composition, and settings are valid. This read-only snapshot is held
        in memory while you review it.
      </p>

      <div className="prepared-setup__notice">
        <strong>Ready for private assignment.</strong>
        <span>No active game exists until you deliberately assign roles.</span>
      </div>

      {assignmentErrorMessage === null ? null : (
        <p className="inline-error" role="alert">
          {assignmentErrorMessage}
        </p>
      )}

      <div className="prepared-setup__grid">
        <section aria-labelledby="prepared-players-heading">
          <h3 id="prepared-players-heading">
            Participating players <span>{setup.participatingPlayers.length}</span>
          </h3>
          <ol>
            {setup.participatingPlayers.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="prepared-roles-heading">
          <h3 id="prepared-roles-heading">
            Selected roles <span>{sumSelectedRoles(setup)}</span>
          </h3>
          <ul>
            {selectedRoles.map((roleCount) => {
              const role = ROLE_REGISTRY.find((entry) => entry.id === roleCount.roleId)

              return (
                <li key={roleCount.roleId}>
                  <span>{role?.name ?? roleCount.roleId}</span>
                  <strong>{roleCount.count}</strong>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <section className="prepared-settings" aria-labelledby="prepared-settings-heading">
        <h3 id="prepared-settings-heading">Game settings</h3>
        <dl>
          {GAME_SETTING_OPTIONS.map((option) => (
            <div key={option.key}>
              <dt>{option.label}</dt>
              <dd>{setup.settings[option.key] ? 'Enabled' : 'Disabled'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="prepared-setup__actions">
        <button type="button" className="button button--secondary" onClick={onReturnToSetup}>
          Return to setup
        </button>
        <button type="button" className="button button--prepare" onClick={onAssignRoles}>
          Assign Roles
        </button>
      </div>
    </section>
  )
}

function sumSelectedRoles(setup: ValidatedGameSetup): number {
  return setup.roleCounts.reduce((total, roleCount) => total + roleCount.count, 0)
}
