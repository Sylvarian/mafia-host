import type { GameId, PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'

export type GodfatherPromotion = Readonly<{
  gameId: GameId
  playerId: PlayerId
  originalRoleInstanceId: RoleInstanceId
  promotedAtNightNumber: number
  activeRoleId: RoleId
}>
