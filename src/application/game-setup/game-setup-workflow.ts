import type { GameSettings } from '@/domain/game/game-settings.ts'
import type { PlayerId, RoleId } from '@/domain/identifiers.ts'

import {
  addPlayer,
  decrementRoleCount,
  incrementRoleCount,
  removePlayer,
  renamePlayer,
  setGameSetting,
  setRoleCount,
  togglePlayerParticipation,
  type GameSetupDraft,
  type GameSetupEditError,
} from './game-setup-draft.ts'
import { validateGameSetupDraft, type ValidatedGameSetup } from './game-setup-validation.ts'
import {
  createGameSetupDraftFromTemplate,
  type NextGameSetupTemplate,
} from './next-game-setup-template.ts'

export type GameSetupWorkflowState =
  | Readonly<{
      status: 'editing'
      draft: GameSetupDraft
      editError: GameSetupEditError | null
    }>
  | Readonly<{
      status: 'ready'
      draft: GameSetupDraft
      validatedSetup: ValidatedGameSetup
    }>

export type GameSetupWorkflowCommand =
  | Readonly<{ type: 'ADD_PLAYER'; name: string }>
  | Readonly<{ type: 'RENAME_PLAYER'; playerId: PlayerId; name: string }>
  | Readonly<{ type: 'REMOVE_PLAYER'; playerId: PlayerId }>
  | Readonly<{ type: 'TOGGLE_PLAYER_PARTICIPATION'; playerId: PlayerId }>
  | Readonly<{ type: 'SET_ROLE_COUNT'; roleId: RoleId; count: number }>
  | Readonly<{ type: 'INCREMENT_ROLE_COUNT'; roleId: RoleId }>
  | Readonly<{ type: 'DECREMENT_ROLE_COUNT'; roleId: RoleId }>
  | Readonly<{
      type: 'SET_GAME_SETTING'
      setting: keyof GameSettings
      value: boolean
    }>
  | Readonly<{ type: 'PREPARE_GAME' }>
  | Readonly<{ type: 'RETURN_TO_SETUP' }>

export function createGameSetupWorkflow(
  template: NextGameSetupTemplate | null = null,
): GameSetupWorkflowState {
  return {
    status: 'editing',
    draft: createGameSetupDraftFromTemplate(template),
    editError: null,
  }
}

export function reduceGameSetupWorkflow(
  state: GameSetupWorkflowState,
  command: GameSetupWorkflowCommand,
): GameSetupWorkflowState {
  if (state.status === 'ready') {
    return command.type === 'RETURN_TO_SETUP'
      ? { status: 'editing', draft: state.draft, editError: null }
      : state
  }

  switch (command.type) {
    case 'ADD_PLAYER':
      return applyDraftResult(state, addPlayer(state.draft, command.name))
    case 'RENAME_PLAYER':
      return applyDraftResult(state, renamePlayer(state.draft, command.playerId, command.name))
    case 'REMOVE_PLAYER':
      return applyDraftResult(state, removePlayer(state.draft, command.playerId))
    case 'TOGGLE_PLAYER_PARTICIPATION':
      return applyDraftResult(state, togglePlayerParticipation(state.draft, command.playerId))
    case 'SET_ROLE_COUNT':
      return applyDraftResult(state, setRoleCount(state.draft, command.roleId, command.count))
    case 'INCREMENT_ROLE_COUNT':
      return applyDraftResult(state, incrementRoleCount(state.draft, command.roleId))
    case 'DECREMENT_ROLE_COUNT':
      return applyDraftResult(state, decrementRoleCount(state.draft, command.roleId))
    case 'SET_GAME_SETTING':
      return {
        status: 'editing',
        draft: setGameSetting(state.draft, command.setting, command.value),
        editError: null,
      }
    case 'PREPARE_GAME': {
      const setupResult = validateGameSetupDraft(state.draft)

      return setupResult.ok
        ? {
            status: 'ready',
            draft: state.draft,
            validatedSetup: setupResult.value,
          }
        : state
    }
    case 'RETURN_TO_SETUP':
      return state
  }
}

function applyDraftResult(
  state: Extract<GameSetupWorkflowState, Readonly<{ status: 'editing' }>>,
  result:
    | Readonly<{ ok: true; value: GameSetupDraft }>
    | Readonly<{ ok: false; error: GameSetupEditError }>,
): GameSetupWorkflowState {
  return result.ok
    ? { status: 'editing', draft: result.value, editError: null }
    : { ...state, editError: result.error }
}
