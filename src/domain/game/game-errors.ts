import type { PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import type { InvalidGameSettingError } from './game-settings.ts'
import type { ExecutionerTargetInvariantError } from '../executioner/executioner-target-errors.ts'
import type { OutcomeStateInvariantError } from './outcome-state-invariants.ts'

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
  reference: 'game-player'
}>

export type UnknownRoleReferenceError = Readonly<{
  type: 'UNKNOWN_ROLE_REFERENCE'
  playerId: PlayerId
  roleId: RoleId
  reference: 'assigned-role' | 'public-role-reveal'
}>

export type InvalidPublicRoleRevealError = Readonly<{
  type: 'INVALID_PUBLIC_ROLE_REVEAL'
  playerId: PlayerId
}> &
  (
    | Readonly<{
        reason: 'invalid-type'
        value: unknown
      }>
    | Readonly<{
        reason: 'assigned-role-mismatch'
        assignedRoleId: RoleId
        revealedRoleId: RoleId
      }>
  )

export type InvalidGameStateError = Readonly<{
  type: 'INVALID_GAME_STATE'
  reason:
    | InvalidGameSettingError
    | Readonly<{ type: 'INVALID_PHASE'; phase: string }>
    | Readonly<{ type: 'INVALID_COUNTER'; counter: 'day' | 'night'; value: number }>
    | Readonly<{
        type: 'INVALID_IDENTITY'
        field: 'gameId' | 'playerId' | 'roleDefinitionId' | 'roleId' | 'roleInstanceId'
        index?: number
        value: unknown
      }>
    | Readonly<{
        type: 'INVALID_PLAYER_ALIVE_STATE'
        playerId: PlayerId
        value: unknown
      }>
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

export type DoctorPreviousTargetInvariantError =
  | Readonly<{ type: 'INVALID_DOCTOR_HISTORY'; value: unknown }>
  | Readonly<{
      type: 'INVALID_DOCTOR_HISTORY_ENTRY'
      index: number
      field: 'doctorRoleInstanceId' | 'targetPlayerId' | 'nightNumber'
      value: unknown
    }>
  | Readonly<{
      type: 'UNKNOWN_DOCTOR_ROLE_INSTANCE'
      doctorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'NON_DOCTOR_HISTORY_ENTRY'
      doctorRoleInstanceId: RoleInstanceId
      roleId: RoleId
    }>
  | Readonly<{
      type: 'UNKNOWN_DOCTOR_TARGET'
      doctorRoleInstanceId: RoleInstanceId
      targetPlayerId: PlayerId
    }>
  | Readonly<{
      type: 'INVALID_DOCTOR_HISTORY_NIGHT'
      doctorRoleInstanceId: RoleInstanceId
      nightNumber: number
      currentNightNumber: number
    }>
  | Readonly<{
      type: 'DUPLICATE_DOCTOR_HISTORY'
      doctorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'DOCTOR_HISTORY_ORDER_MISMATCH'
      doctorRoleInstanceId: RoleInstanceId
      expectedIndex: number
      actualIndex: number
    }>

export type GameInvariantError =
  | DuplicateParticipatingPlayerError
  | DuplicateRoleAssignmentError
  | DuplicateRoleDefinitionError
  | NoParticipatingPlayersError
  | MissingRoleAssignmentError
  | UnknownPlayerReferenceError
  | UnknownRoleReferenceError
  | InvalidPublicRoleRevealError
  | DoctorPreviousTargetInvariantError
  | ExecutionerTargetInvariantError
  | OutcomeStateInvariantError
  | InvalidGameStateError

export type CreateGameError =
  | GameInvariantError
  | DuplicateRosterPlayerError
  | MissingParticipatingPlayerError
  | NonParticipatingPlayerError
  | ParticipatingPlayerOrderMismatchError

export type GameCommandError = GameInvariantError | InvalidPhaseTransitionError

export type ApplyGameEventError = GameCommandError | EventPhaseMismatchError
