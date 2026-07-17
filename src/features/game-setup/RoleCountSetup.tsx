import type { RoleId } from '@/application/game-setup/index.ts'
import {
  ROLE_REGISTRY,
  type Faction,
  type GameplayImplementationStatus,
  type RoleCount,
  type RoleCountEditError,
} from '@/application/game-setup/index.ts'

type RoleCountSetupProps = Readonly<{
  roleCounts: readonly RoleCount[]
  editError: RoleCountEditError | null
  errorMessage: string | null
  onSetRoleCount: (roleId: RoleId, count: number) => void
  onIncrementRoleCount: (roleId: RoleId) => void
  onDecrementRoleCount: (roleId: RoleId) => void
}>

const FACTION_SECTIONS: readonly Readonly<{
  faction: Faction
  label: string
  description: string
}>[] = [
  {
    faction: 'mafia',
    label: 'Mafia',
    description: 'At least one Mafia role is required for a valid setup.',
  },
  {
    faction: 'town',
    label: 'Town',
    description: 'Town roles work toward removing hostile factions in later phases.',
  },
  {
    faction: 'neutral',
    label: 'Neutral',
    description: 'Neutral goals and interactions remain setup metadata in Phase 2.',
  },
]

const GAMEPLAY_STATUS_LABELS: Readonly<Record<GameplayImplementationStatus, string>> =
  Object.freeze({
    'setup-only': 'Setup only',
  })

export function RoleCountSetup({
  roleCounts,
  editError,
  errorMessage,
  onSetRoleCount,
  onIncrementRoleCount,
  onDecrementRoleCount,
}: RoleCountSetupProps) {
  return (
    <section className="setup-section" aria-labelledby="roles-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Step 2</p>
          <h2 id="roles-heading">Role composition</h2>
          <p>Select the count for each named role. These values remain setup data.</p>
        </div>
        <span className="setup-only-note">Fixed role counts</span>
      </div>

      {errorMessage === null ? null : (
        <p className="inline-error" id="role-count-edit-error" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="faction-sections">
        {FACTION_SECTIONS.map((section) => (
          <fieldset className={`faction faction--${section.faction}`} key={section.faction}>
            <legend>{section.label}</legend>
            <p className="faction__description">{section.description}</p>
            <div className="role-grid">
              {ROLE_REGISTRY.filter((role) => role.faction === section.faction).map((role) => {
                const count =
                  roleCounts.find((roleCount) => roleCount.roleId === role.id)?.count ?? 0
                const hasCountError =
                  editError?.type === 'INVALID_ROLE_COUNT' && editError.roleId === role.id

                return (
                  <article className="role-card" key={role.id}>
                    <div className="role-card__heading">
                      <h3>{role.name}</h3>
                      <span>{GAMEPLAY_STATUS_LABELS[role.gameplayImplementationStatus]}</span>
                    </div>
                    <p>{role.description}</p>
                    <div className="role-count-control">
                      <button
                        type="button"
                        className="role-count-control__button"
                        disabled={count === 0}
                        aria-label={`Decrease ${role.name} count`}
                        onClick={() => {
                          onDecrementRoleCount(role.id)
                        }}
                      >
                        −
                      </button>
                      <label>
                        <span>{role.name} count</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={count}
                          aria-invalid={hasCountError || undefined}
                          aria-describedby={hasCountError ? 'role-count-edit-error' : undefined}
                          onChange={(event) => {
                            onSetRoleCount(
                              role.id,
                              event.currentTarget.value.length === 0
                                ? 0
                                : event.currentTarget.valueAsNumber,
                            )
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="role-count-control__button"
                        aria-label={`Increase ${role.name} count`}
                        onClick={() => {
                          onIncrementRoleCount(role.id)
                        }}
                      >
                        +
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  )
}
