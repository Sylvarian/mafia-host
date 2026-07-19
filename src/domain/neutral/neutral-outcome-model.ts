import type { GameId, PlayerId, RoleInstanceId } from '../identifiers.ts'

export type PersonalWinRecord =
  | Readonly<{
      kind: 'jester-executed'
      gameId: GameId
      playerId: PlayerId
      roleInstanceId: RoleInstanceId
      dayNumber: number
    }>
  | Readonly<{
      kind: 'executioner-target-executed'
      gameId: GameId
      playerId: PlayerId
      roleInstanceId: RoleInstanceId
      targetPlayerId: PlayerId
      dayNumber: number
    }>

export type ExecutionerToJesterConversion = Readonly<{
  kind: 'executioner-to-jester'
  gameId: GameId
  playerId: PlayerId
  roleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
}>

export type PendingJesterRevenge = Readonly<{
  gameId: GameId
  jesterPlayerId: PlayerId
  jesterRoleInstanceId: RoleInstanceId
  triggeredOnDay: number
  status: 'pending'
}>
