import type { GameInvariantError } from '../game/game-errors.ts'
import type { GameId, RoleId } from '../identifiers.ts'
import type { InvestigationGroupError } from '../investigation/investigation-groups.ts'
import type { NightActionBatchError } from '../night-actions/night-action.ts'
import type { GamePhase } from '../phases/game-phase.ts'

export type InvalidResolutionRoleMetadataError = Readonly<{
  type: 'INVALID_RESOLUTION_ROLE_METADATA'
  roleId: RoleId
  reason:
    | 'game-definition-mismatch'
    | 'invalid-collection-order'
    | 'missing-sheriff-suspicion-rule'
    | 'missing-night-action-metadata'
    | 'missing-registry-entry'
}>

export type NightResolutionError =
  | Readonly<{
      type: 'INVALID_NIGHT_RESOLUTION_PHASE'
      currentPhase: GamePhase
    }>
  | Readonly<{
      type: 'NIGHT_RESOLUTION_GAME_ID_MISMATCH'
      expectedGameId: GameId
      batchGameId: GameId
    }>
  | Readonly<{
      type: 'NIGHT_RESOLUTION_NIGHT_NUMBER_MISMATCH'
      expectedNightNumber: number
      batchNightNumber: number
    }>
  | Readonly<{
      type: 'INVALID_GAME_STATE_FOR_NIGHT_RESOLUTION'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'INVALID_COLLECTED_NIGHT_ACTIONS'
      error: NightActionBatchError
    }>
  | InvalidResolutionRoleMetadataError
  | InvestigationGroupError
