import {
  findRoleDefinition,
  type GameSetupValidation,
  type GameSetupValidationError,
  type RoleId,
} from '@/application/game-setup/index.ts'

type SetupReadinessProps = Readonly<{
  validation: GameSetupValidation
  onPrepareGame: () => void
}>

export function SetupReadiness({ validation, onPrepareGame }: SetupReadinessProps) {
  return (
    <section
      className={`setup-readiness${validation.isValid ? ' setup-readiness--valid' : ''}`}
      aria-labelledby="readiness-heading"
    >
      <div className="section-heading">
        <div>
          <p className="section-kicker">Final check</p>
          <h2 id="readiness-heading">
            {validation.isValid ? 'Setup is ready' : 'Setup needs attention'}
          </h2>
        </div>
        <span className={`readiness-badge${validation.isValid ? ' is-valid' : ''}`}>
          {validation.isValid ? 'Valid setup' : 'Not ready'}
        </span>
      </div>

      <dl className="readiness-counts" aria-label="Setup count comparison">
        <div>
          <dt>Participating players</dt>
          <dd>{validation.participatingPlayerCount}</dd>
        </div>
        <div>
          <dt>Selected roles</dt>
          <dd>{validation.selectedRoleCount}</dd>
        </div>
        <div>
          <dt>Difference</dt>
          <dd>{formatDifference(validation.roleCountDifference)}</dd>
        </div>
      </dl>

      <div className="readiness-status" aria-live="polite">
        {validation.isValid ? (
          <p>Counts match and at least one Mafia role is selected.</p>
        ) : (
          <ul>
            {validation.errors.map((error) => (
              <li key={getValidationErrorKey(error)}>{formatValidationError(error)}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="prepare-action">
        <div>
          <strong>Next: validate the pre-game draft</strong>
          <span>Preparation only validates roster, role-count, and setting data.</span>
        </div>
        <button
          type="button"
          className="button button--prepare"
          disabled={!validation.isValid}
          onClick={onPrepareGame}
        >
          Prepare Game
        </button>
      </div>
    </section>
  )
}

function formatDifference(difference: number): string {
  if (difference === 0) {
    return '0 — matched'
  }

  const magnitude = Math.abs(difference)
  const roleLabel = magnitude === 1 ? 'role' : 'roles'

  return difference > 0
    ? `${String(magnitude)} extra ${roleLabel}`
    : `${String(magnitude)} ${roleLabel} short`
}

function formatValidationError(error: GameSetupValidationError): string {
  switch (error.type) {
    case 'INVALID_GAME_SETTING':
      return `The ${error.setting} setting must have an explicit Enabled or Disabled value.`
    case 'INVALID_PLAYER_ID':
      return 'Every roster entry must have a non-empty stable player ID.'
    case 'INVALID_PLAYER_NAME':
      return 'Every roster name must contain at least one non-whitespace character.'
    case 'DUPLICATE_PLAYER_ID':
      return `The stable player ID ${error.playerId} appears more than once.`
    case 'UNKNOWN_ROLE_COUNT':
      return `The role ID ${error.roleId} is not in the role registry.`
    case 'DUPLICATE_ROLE_COUNT':
      return `${getRoleName(error.roleId)} has more than one count entry.`
    case 'MISSING_ROLE_COUNT':
      return `${getRoleName(error.roleId)} is missing a count entry.`
    case 'INVALID_ROLE_COUNT':
      return `${getRoleName(error.roleId)} must have a non-negative whole-number count within the supported numeric range.`
    case 'NO_PARTICIPATING_PLAYERS':
      return 'Switch at least one player to Playing.'
    case 'ROLE_COUNT_MISMATCH': {
      const difference = error.selectedRoleCount - error.participatingCount

      return difference > 0
        ? `Remove ${String(difference)} selected ${difference === 1 ? 'role' : 'roles'} to match the participating players.`
        : `Add ${String(Math.abs(difference))} more selected ${difference === -1 ? 'role' : 'roles'} to match the participating players.`
    }
    case 'NO_MAFIA_ROLE':
      return 'Select at least one Mafia role.'
  }
}

function getValidationErrorKey(error: GameSetupValidationError): string {
  switch (error.type) {
    case 'INVALID_GAME_SETTING':
      return `${error.type}-${error.setting}`
    case 'INVALID_PLAYER_ID':
    case 'INVALID_PLAYER_NAME':
    case 'DUPLICATE_PLAYER_ID':
      return `${error.type}-${error.playerId}`
    case 'UNKNOWN_ROLE_COUNT':
    case 'DUPLICATE_ROLE_COUNT':
    case 'MISSING_ROLE_COUNT':
    case 'INVALID_ROLE_COUNT':
      return `${error.type}-${error.roleId}`
    case 'ROLE_COUNT_MISMATCH':
      return `${error.type}-${String(error.participatingCount)}-${String(error.selectedRoleCount)}`
    case 'NO_PARTICIPATING_PLAYERS':
    case 'NO_MAFIA_ROLE':
      return error.type
  }
}

function getRoleName(roleId: RoleId): string {
  const role = findRoleDefinition(roleId)
  return role?.name ?? roleId
}
