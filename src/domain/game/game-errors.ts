import type { PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import type { InvalidGameSettingError } from './game-settings.ts'

export type InvalidPhaseTransitionError = Readonly<{
  type: 'INVALID_PHASE_TRANSITION'
  fromPhase: GamePhase
  targetPhase: GamePhase
}>

export type EventPhaseMismatchError = Readonly<{
  type: 'EVENT_PHASE_MISMATCH'
  statePhase: GamePhase
  eventFromPhase: GamePhase
}>

export type DuplicateRosterPlayerError = Readonly<{
  type: 'DUPLICATE_ROSTER_PLAYER'
  playerId: PlayerId
}>

export type DuplicateParticipatingPlayerError = Readonly<{
  type: 'DUPLICATE_PARTICIPATING_PLAYER'
  playerId: PlayerId
}>

export type NoParticipatingPlayersError = Readonly<{
  type: 'NO_PARTICIPATING_PLAYERS'
}>

export type DuplicateRoleAssignmentError = Readonly<{
  type: 'DUPLICATE_ROLE_ASSIGNMENT'
  roleInstanceId: RoleInstanceId
}>

export type DuplicateRoleDefinitionError = Readonly<{
  type: 'DUPLICATE_ROLE_DEFINITION'
  roleId: RoleId
}>

export type MissingParticipatingPlayerError = Readonly<{
  type: 'MISSING_PARTICIPATING_PLAYER'
  playerId: PlayerId
}>

export type ParticipatingPlayerOrderMismatchError = Readonly<{
  type: 'PARTICIPATING_PLAYER_ORDER_MISMATCH'
  index: number
  expectedPlayerId: PlayerId
  actualPlayerId: PlayerId
}>

export type MissingRoleAssignmentError = Readonly<{
  type: 'MISSING_ROLE_ASSIGNMENT'
  playerId: PlayerId
}>

export type NonParticipatingPlayerError = Readonly<{
  type: 'NON_PARTICIPATING_PLAYER'
  playerId: PlayerId
}>

export type UnknownPlayerReferenceError = Readonly<{
  type: 'UNKNOWN_PLAYER_REFERENCE'
  playerId: PlayerId
  reference: 'game-player' | 'executioner-target'
}>

export type UnknownRoleReferenceError = Readonly<{
  type: 'UNKNOWN_ROLE_REFERENCE'
  playerId: PlayerId
  roleId: RoleId
  reference: 'assigned-role' | 'public-role-reveal'
}>

export type InvalidGameStateError = Readonly<{
  type: 'INVALID_GAME_STATE'
  reason:
    | InvalidGameSettingError
    | Readonly<{ type: 'INVALID_PHASE'; phase: string }>
    | Readonly<{ type: 'INVALID_COUNTER'; counter: 'day' | 'night'; value: number }>
    | Readonly<{
        type: 'INVALID_ROLE_ORDINAL'
        roleInstanceId: RoleInstanceId
        ordinal: number
      }>
    | Readonly<{
        type: 'ROLE_ORDINAL_MISMATCH'
        roleInstanceId: RoleInstanceId
        roleId: RoleId
        ordinal: number | null
        expectedOrdinal: number | null
      }>
}>

export type GameInvariantError =
  | DuplicateParticipatingPlayerError
  | DuplicateRoleAssignmentError
  | DuplicateRoleDefinitionError
  | NoParticipatingPlayersError
  | MissingRoleAssignmentError
  | UnknownPlayerReferenceError
  | UnknownRoleReferenceError
  | InvalidGameStateError

export type CreateGameError =
  | GameInvariantError
  | DuplicateRosterPlayerError
  | MissingParticipatingPlayerError
  | NonParticipatingPlayerError
  | ParticipatingPlayerOrderMismatchError

export type GameCommandError = GameInvariantError | InvalidPhaseTransitionError

export type ApplyGameEventError = GameCommandError | EventPhaseMismatchError
