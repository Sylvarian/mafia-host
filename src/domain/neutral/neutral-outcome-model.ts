import type { GameId, PlayerId, RoleInstanceId } from '../identifiers.ts'

export type PendingJesterRevengeId = string
export type JesterRevengeResolutionId = string

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
  id: PendingJesterRevengeId
  gameId: GameId
  jesterPlayerId: PlayerId
  jesterRoleInstanceId: RoleInstanceId
  triggeredOnDay: number
  status: 'pending'
}>

export type JesterRevengeResolution =
  | Readonly<{
      id: JesterRevengeResolutionId
      kind: 'victim-killed'
      gameId: GameId
      obligationId: PendingJesterRevengeId
      jesterPlayerId: PlayerId
      jesterRoleInstanceId: RoleInstanceId
      victimPlayerId: PlayerId
      resolvedAtNightNumber: number
    }>
  | Readonly<{
      id: JesterRevengeResolutionId
      kind: 'no-survivor'
      gameId: GameId
      obligationId: PendingJesterRevengeId
      jesterPlayerId: PlayerId
      jesterRoleInstanceId: RoleInstanceId
      resolvedAtNightNumber: number
    }>

export type SelectedJesterRevenge = Readonly<{
  id: JesterRevengeResolutionId
  kind: 'victim-selected'
  gameId: GameId
  obligationId: PendingJesterRevengeId
  jesterPlayerId: PlayerId
  jesterRoleInstanceId: RoleInstanceId
  victimPlayerId: PlayerId
  resolvedAtNightNumber: number
}>
