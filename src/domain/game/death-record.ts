import type { GameId, PlayerId, RoleInstanceId } from '../identifiers.ts'

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
      jesterRoleInstanceId: RoleInstanceId
    }>

export type DeathRecord = Readonly<{
  gameId: GameId
  playerId: PlayerId
  roleInstanceId: RoleInstanceId
  cause: DeathCause
}>
