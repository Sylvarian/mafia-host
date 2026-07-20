import {
  getParticipatingPlayerCount,
  inspectGameSetupDraft,
  type GameSettingKey,
  type GameSetupEditError,
  type GameSetupWorkflowCommand,
  type GameSetupWorkflowState,
  type RoleId,
} from '@/application/game-setup/index.ts'
import { PlayerRoster } from '@/features/roster/index.ts'

import { GameSettingsForm } from './GameSettingsForm.tsx'
import { PreparedSetupSummary } from './PreparedSetupSummary.tsx'
import { RoleCountSetup } from './RoleCountSetup.tsx'
import { SetupReadiness } from './SetupReadiness.tsx'
import {
  getRoleEditErrorMessage,
  getRosterEditErrorMessage,
  selectRoleCountEditError,
  selectRosterEditError,
} from './setup-edit-error.ts'

import './GameSetup.css'

type GameSetupProps = Readonly<{
  workflow: GameSetupWorkflowState
  editError: GameSetupEditError | null
  assignmentErrorMessage: string | null
  savedSetupExists: boolean
  savedSetupMessage: string | null
  onCommand: (command: GameSetupWorkflowCommand) => void
  onAssignRoles: () => void
  onClearSavedSetup: () => void
}>

export function GameSetup({
  workflow,
  editError,
  assignmentErrorMessage,
  savedSetupExists,
  savedSetupMessage,
  onCommand,
  onAssignRoles,
  onClearSavedSetup,
}: GameSetupProps) {
  if (workflow.status === 'ready') {
    return (
      <PreparedSetupSummary
        setup={workflow.validatedSetup}
        assignmentErrorMessage={assignmentErrorMessage}
        onAssignRoles={onAssignRoles}
        onReturnToSetup={() => {
          onCommand({ type: 'RETURN_TO_SETUP' })
        }}
      />
    )
  }

  const validation = inspectGameSetupDraft(workflow.draft)
  const rosterEditError = selectRosterEditError(editError)
  const roleCountEditError = selectRoleCountEditError(editError)

  function setRoleCount(roleId: RoleId, count: number): void {
    onCommand({ type: 'SET_ROLE_COUNT', roleId, count })
  }

  function setGameSetting(setting: GameSettingKey, value: boolean): void {
    onCommand({ type: 'SET_GAME_SETTING', setting, value })
  }

  return (
    <div className="game-setup">
      {savedSetupExists || savedSetupMessage !== null ? (
        <section className="remembered-names" aria-labelledby="saved-setup-heading">
          <div>
            <p className="section-kicker">Local convenience</p>
            <h2 id="saved-setup-heading">Saved next-game setup</h2>
            <p>
              Player names, role quantities, and game settings are stored only in this browser
              profile. Match progress and assignments are never included.
            </p>
          </div>
          {savedSetupExists ? (
            <button type="button" className="button button--secondary" onClick={onClearSavedSetup}>
              Clear saved setup
            </button>
          ) : null}
          {savedSetupMessage === null ? null : (
            <p className="remembered-names__status" role="status">
              {savedSetupMessage}
            </p>
          )}
        </section>
      ) : null}

      <PlayerRoster
        players={workflow.draft.roster}
        participatingPlayerCount={getParticipatingPlayerCount(workflow.draft)}
        editError={rosterEditError}
        errorMessage={getRosterEditErrorMessage(rosterEditError)}
        onAddPlayer={(name) => {
          onCommand({ type: 'ADD_PLAYER', name })
        }}
        onRenamePlayer={(playerId, name) => {
          onCommand({ type: 'RENAME_PLAYER', playerId, name })
        }}
        onRemovePlayer={(playerId) => {
          onCommand({ type: 'REMOVE_PLAYER', playerId })
        }}
        onToggleParticipation={(playerId) => {
          onCommand({ type: 'TOGGLE_PLAYER_PARTICIPATION', playerId })
        }}
      />

      <RoleCountSetup
        roleCounts={workflow.draft.roleCounts}
        editError={roleCountEditError}
        errorMessage={getRoleEditErrorMessage(roleCountEditError)}
        onSetRoleCount={setRoleCount}
        onIncrementRoleCount={(roleId) => {
          onCommand({ type: 'INCREMENT_ROLE_COUNT', roleId })
        }}
        onDecrementRoleCount={(roleId) => {
          onCommand({ type: 'DECREMENT_ROLE_COUNT', roleId })
        }}
      />

      <GameSettingsForm settings={workflow.draft.settings} onSettingChange={setGameSetting} />

      <SetupReadiness
        validation={validation}
        onPrepareGame={() => {
          onCommand({ type: 'PREPARE_GAME' })
        }}
      />
    </div>
  )
}
