import type { GameInvariantError } from '../game/game-errors.ts'
import type { GameId, PlayerId, RoleId } from '../identifiers.ts'
import type { NightActionBatchError } from '../night-actions/night-action.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import type { NightResolutionError } from './night-resolution-errors.ts'

export type NightApplicationError =
  | Readonly<{
      type: 'INVALID_NIGHT_APPLICATION_PHASE'
      operation: 'begin-night-resolution' | 'apply-resolved-night'
      currentPhase: GamePhase
    }>
  | Readonly<{
      type: 'NIGHT_APPLICATION_GAME_ID_MISMATCH'
      expectedGameId: GameId
      resolutionGameId: GameId
    }>
  | Readonly<{
      type: 'NIGHT_APPLICATION_NIGHT_NUMBER_MISMATCH'
      expectedNightNumber: number
      resolutionNightNumber: number
    }>
  | Readonly<{
      type: 'INVALID_GAME_STATE_FOR_NIGHT_APPLICATION'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'INVALID_NIGHT_RESOLUTION'
      reason: 'missing-array' | 'invalid-provisional-death'
    }>
  | Readonly<{
      type: 'UNKNOWN_PROVISIONAL_DEATH_PLAYER'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'DUPLICATE_PROVISIONAL_DEATH'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'PROVISIONAL_DEATH_PLAYER_ALREADY_DEAD'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'INVALID_PROVISIONAL_DEATH_ROLE'
      playerId: PlayerId
      expectedRoleId: RoleId
      actualRoleId: RoleId
    }>
  | Readonly<{
      type: 'INVALID_COLLECTED_ACTIONS_FOR_NIGHT_APPLICATION'
      error: NightActionBatchError
    }>
  | Readonly<{
      type: 'NIGHT_RESOLUTION_REVALIDATION_FAILED'
      error: NightResolutionError
    }>
  | Readonly<{ type: 'NIGHT_RESOLUTION_CONTENT_MISMATCH' }>
  | Readonly<{ type: 'INVALID_DAWN_ANNOUNCEMENT' }>
