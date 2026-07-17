import { useReducer } from 'react'

import {
  createGameSetupWorkflow,
  getParticipatingPlayerCount,
  inspectGameSetupDraft,
  reduceGameSetupWorkflow,
  type GameSettingKey,
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

export function GameSetup() {
  const [workflow, dispatch] = useReducer(
    reduceGameSetupWorkflow,
    undefined,
    createGameSetupWorkflow,
  )

  if (workflow.status === 'ready') {
    return (
      <PreparedSetupSummary
        setup={workflow.validatedSetup}
        onReturnToSetup={() => {
          dispatch({ type: 'RETURN_TO_SETUP' })
        }}
      />
    )
  }

  const validation = inspectGameSetupDraft(workflow.draft)
  const rosterEditError = selectRosterEditError(workflow.editError)
  const roleCountEditError = selectRoleCountEditError(workflow.editError)

  function setRoleCount(roleId: RoleId, count: number): void {
    dispatch({ type: 'SET_ROLE_COUNT', roleId, count })
  }

  function setGameSetting(setting: GameSettingKey, value: boolean): void {
    dispatch({ type: 'SET_GAME_SETTING', setting, value })
  }

  return (
    <div className="game-setup">
      <PlayerRoster
        players={workflow.draft.roster}
        participatingPlayerCount={getParticipatingPlayerCount(workflow.draft)}
        editError={rosterEditError}
        errorMessage={getRosterEditErrorMessage(rosterEditError)}
        onAddPlayer={(name) => {
          dispatch({ type: 'ADD_PLAYER', name })
        }}
        onRenamePlayer={(playerId, name) => {
          dispatch({ type: 'RENAME_PLAYER', playerId, name })
        }}
        onRemovePlayer={(playerId) => {
          dispatch({ type: 'REMOVE_PLAYER', playerId })
        }}
        onToggleParticipation={(playerId) => {
          dispatch({ type: 'TOGGLE_PLAYER_PARTICIPATION', playerId })
        }}
      />

      <RoleCountSetup
        roleCounts={workflow.draft.roleCounts}
        editError={roleCountEditError}
        errorMessage={getRoleEditErrorMessage(roleCountEditError)}
        onSetRoleCount={setRoleCount}
        onIncrementRoleCount={(roleId) => {
          dispatch({ type: 'INCREMENT_ROLE_COUNT', roleId })
        }}
        onDecrementRoleCount={(roleId) => {
          dispatch({ type: 'DECREMENT_ROLE_COUNT', roleId })
        }}
      />

      <GameSettingsForm settings={workflow.draft.settings} onSettingChange={setGameSetting} />

      <SetupReadiness
        validation={validation}
        onPrepareGame={() => {
          dispatch({ type: 'PREPARE_GAME' })
        }}
      />
    </div>
  )
}
