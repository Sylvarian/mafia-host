import type { GameId, PlayerId, RoleInstanceId } from '../identifiers.ts'
import type {
  JesterRevengeResolutionId,
  PendingJesterRevengeId,
} from '../neutral/neutral-outcome-model.ts'

export type DeathCause =
  | Readonly<{
      kind: 'night-death'
      nightNumber: number
    }>
  | Readonly<{
      kind: 'day-execution'
      dayNumber: number
    }>
  | Readonly<{
      kind: 'jester-revenge'
      nightNumber: number
      jesterPlayerId: PlayerId
      jesterRoleInstanceId: RoleInstanceId
      obligationId: PendingJesterRevengeId
      resolutionId: JesterRevengeResolutionId
    }>

export type DeathRecord = Readonly<{
  gameId: GameId
  playerId: PlayerId
  roleInstanceId: RoleInstanceId
  cause: DeathCause
}>
