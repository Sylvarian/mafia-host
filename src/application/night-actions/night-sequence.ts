import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'
import {
  isNightActionRequiredForPlayer,
  type SubmittedNightAction,
} from '@/domain/night-actions/night-action.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

export type NightSequenceStep =
  | Readonly<{ type: 'night-opening' }>
  | Readonly<{ type: 'mafia-opening'; mafiaPlayerIds: readonly PlayerId[] }>
  | Readonly<{
      type: 'actor-action'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{ type: 'mafia-closing' }>
  | Readonly<{ type: 'review' }>

export type NightSequenceError = Readonly<{
  type: 'UNKNOWN_SEQUENCE_ROLE'
  actorPlayerId: PlayerId
}>

export function buildNightActionSequence(
  game: GameState,
): DomainResult<readonly NightSequenceStep[], NightSequenceError> {
  const mafiaPlayerIds: PlayerId[] = []
  const mafiaActors: ActorCollectionEntry[] = []
  const individualActors: ActorCollectionEntry[] = []

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

    if (!role.nightAction.hasNightAction) {
      continue
    }

    if (!isNightActionRequiredForPlayer(game, player.playerId)) {
      continue
    }

    const entry: ActorCollectionEntry = {
      actorPlayerId: player.playerId,
      actorRoleInstanceId: player.role.instanceId,
      collectionOrder: role.nightAction.collectionOrder,
      ordinal: player.role.ordinal,
      rosterIndex,
    }

    if (role.nightAction.collectionGroup === 'mafia') {
      mafiaActors.push(entry)
    } else {
      individualActors.push(entry)
    }
  }

  mafiaActors.sort(compareActorCollectionEntries)
  individualActors.sort(compareActorCollectionEntries)

  const steps: NightSequenceStep[] = [Object.freeze({ type: 'night-opening' })]

  if (mafiaPlayerIds.length > 0) {
    steps.push(
      Object.freeze({ type: 'mafia-opening', mafiaPlayerIds: Object.freeze(mafiaPlayerIds) }),
      ...mafiaActors.map(toActorStep),
      Object.freeze({ type: 'mafia-closing' }),
    )
  }

  steps.push(...individualActors.map(toActorStep), Object.freeze({ type: 'review' }))

  return succeed(Object.freeze(steps))
}

export function orderNightActionsBySequence(
  steps: readonly NightSequenceStep[],
  actions: readonly SubmittedNightAction[],
): readonly SubmittedNightAction[] {
  const actorStepIndexes = new Map<RoleInstanceId, number>()

  for (const [index, step] of steps.entries()) {
    if (step.type === 'actor-action') {
      actorStepIndexes.set(step.actorRoleInstanceId, index)
    }
  }

  return Object.freeze(
    [...actions].sort(
      (left, right) =>
        (actorStepIndexes.get(left.actorRoleInstanceId) ?? Number.MAX_SAFE_INTEGER) -
        (actorStepIndexes.get(right.actorRoleInstanceId) ?? Number.MAX_SAFE_INTEGER),
    ),
  )
}

type ActorCollectionEntry = Readonly<{
  actorPlayerId: PlayerId
  actorRoleInstanceId: RoleInstanceId
  collectionOrder: number
  ordinal: number | null
  rosterIndex: number
}>

function compareActorCollectionEntries(left: ActorCollectionEntry, right: ActorCollectionEntry) {
  return (
    left.collectionOrder - right.collectionOrder ||
    (left.ordinal ?? 0) - (right.ordinal ?? 0) ||
    left.rosterIndex - right.rosterIndex
  )
}

function toActorStep(entry: ActorCollectionEntry): NightSequenceStep {
  return Object.freeze({
    type: 'actor-action',
    actorPlayerId: entry.actorPlayerId,
    actorRoleInstanceId: entry.actorRoleInstanceId,
  })
}
