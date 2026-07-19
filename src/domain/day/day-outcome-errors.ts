import type { GameInvariantError } from '../game/game-errors.ts'
import type { PlayerId } from '../identifiers.ts'
import type { GamePhase } from '../phases/game-phase.ts'

export type CompleteDayOutcomeError =
  | Readonly<{
      type: 'DAY_OUTCOME_GAME_REJECTED'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'INVALID_DAY_OUTCOME_PHASE'
      currentPhase: GamePhase
    }>
  | Readonly<{ type: 'DAY_OUTCOME_ALREADY_RECORDED' }>
  | Readonly<{
      type: 'INVALID_DAY_OUTCOME_COUNTERS'
      nightNumber: number
      dayNumber: number
    }>
  | Readonly<{
      type: 'INVALID_EXECUTION_PLAYER_ID'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'NON_PARTICIPATING_EXECUTION_PLAYER'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'DEAD_EXECUTION_PLAYER'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'INVALID_EXECUTION_ROLE_METADATA'
      playerId: PlayerId
    }>
