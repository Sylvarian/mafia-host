import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'
import { isNightActionRequiredForPlayer } from '@/domain/night-actions/night-action.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

export type NightSequenceStep =
  | Readonly<{ type: 'mafia-overview'; mafiaPlayerIds: readonly PlayerId[] }>
  | Readonly<{
      type: 'actor-action'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>

export type NightSequenceError = Readonly<{
  type: 'UNKNOWN_SEQUENCE_ROLE'
  actorPlayerId: PlayerId
}>

export function buildNightActionSequence(
  game: GameState,
): DomainResult<readonly NightSequenceStep[], NightSequenceError> {
  const mafiaPlayerIds: PlayerId[] = []
  const actors: ActorSequenceEntry[] = []

  for (const [rosterIndex, player] of game.players.entries()) {
    const role = findRoleDefinition(player.role.roleId)

    if (role === undefined) {
      return fail({ type: 'UNKNOWN_SEQUENCE_ROLE', actorPlayerId: player.playerId })
    }

    if (!player.alive) {
      continue
    }

    if (role.faction === 'mafia') {
      mafiaPlayerIds.push(player.playerId)
    }

    if (
      !role.nightAction.hasNightAction ||
      !isNightActionRequiredForPlayer(game, player.playerId)
    ) {
      continue
    }

    actors.push({
      actorPlayerId: player.playerId,
      actorRoleInstanceId: player.role.instanceId,
      collectionOrder: role.nightAction.collectionOrder,
      ordinal: player.role.ordinal,
      rosterIndex,
    })
  }

  actors.sort(compareActorSequenceEntries)

  return succeed(
    Object.freeze([
      Object.freeze({
        type: 'mafia-overview' as const,
        mafiaPlayerIds: Object.freeze(mafiaPlayerIds),
      }),
      ...actors.map(toActorStep),
    ]),
  )
}

type ActorSequenceEntry = Readonly<{
  actorPlayerId: PlayerId
  actorRoleInstanceId: RoleInstanceId
  collectionOrder: number
  ordinal: number | null
  rosterIndex: number
}>

function compareActorSequenceEntries(left: ActorSequenceEntry, right: ActorSequenceEntry): number {
  return (
    left.collectionOrder - right.collectionOrder ||
    (left.ordinal ?? 0) - (right.ordinal ?? 0) ||
    left.rosterIndex - right.rosterIndex
  )
}

function toActorStep(entry: ActorSequenceEntry): NightSequenceStep {
  return Object.freeze({
    type: 'actor-action',
    actorPlayerId: entry.actorPlayerId,
    actorRoleInstanceId: entry.actorRoleInstanceId,
  })
}
