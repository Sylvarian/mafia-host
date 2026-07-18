import type { GameId, PlayerId, RoleInstanceId } from '../identifiers.ts'

export type ExecutionerTarget = Readonly<{
  gameId: GameId
  executionerPlayerId: PlayerId
  executionerRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
}>
