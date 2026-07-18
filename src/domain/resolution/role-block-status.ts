import type { GameState } from '../game/game-state.ts'
import type { PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'

export type RoleBlockAction = Readonly<{
  actorPlayerId: PlayerId
  actorRoleInstanceId: RoleInstanceId
  actorRoleId: RoleId
  targetPlayerId: PlayerId
}>

export function selectBlockedRoleInstanceIds(
  game: GameState,
  actions: readonly RoleBlockAction[],
): ReadonlySet<RoleInstanceId> {
  const consortTargetPlayerIds = new Set(
    actions
      .filter((action) => action.actorRoleId === ROLE_IDS.consort)
      .map((action) => action.targetPlayerId),
  )

  return new Set(
    game.players.flatMap((player): readonly RoleInstanceId[] =>
      player.role.roleId !== ROLE_IDS.consort && consortTargetPlayerIds.has(player.playerId)
        ? [player.role.instanceId]
        : [],
    ),
  )
}
