import type { GameInvariantError } from '../game/game-errors.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import type { PlayerId, RoleId } from '../identifiers.ts'

export type BeginDayDiscussionError =
  | Readonly<{ type: 'DAY_TRANSITION_ALREADY_COMPLETED' }>
  | Readonly<{
      type: 'INVALID_DAY_TRANSITION_PHASE'
      currentPhase: GamePhase
    }>
  | Readonly<{
      type: 'INVALID_DAY_TRANSITION_GAME'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'INVALID_DAWN_GAME_MATCH'
      reason:
        | 'invalid-announcement-shape'
        | 'night-number-mismatch'
        | 'death-list-mismatch'
        | 'public-reveal-mismatch'
    }>
  | Readonly<{
      type: 'INVALID_DAY_COUNTER_STATE'
      nightNumber: number
      dayNumber: number
    }>

export type ConfirmMayorRevealError =
  | Readonly<{
      type: 'MAYOR_REVEAL_GAME_REJECTED'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'INVALID_MAYOR_REVEAL_PHASE'
      currentPhase: GamePhase
    }>
  | Readonly<{
      type: 'UNKNOWN_MAYOR_PLAYER'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'NON_PARTICIPATING_MAYOR_PLAYER'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'DEAD_MAYOR_CANNOT_REVEAL'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'SELECTED_PLAYER_IS_NOT_MAYOR'
      playerId: PlayerId
      assignedRoleId: RoleId
    }>
  | Readonly<{
      type: 'MAYOR_ALREADY_REVEALED'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'INVALID_MAYOR_ROLE_METADATA'
      playerId: PlayerId
    }>
