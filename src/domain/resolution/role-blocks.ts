import type { GameState } from '../game/game-state.ts'
import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type {
  BlockedActorRecord,
  RoleBlockAttempt,
  RoleBlockSource,
} from './night-resolution-models.ts'
import { selectBlockedRoleInstanceIds } from './role-block-status.ts'
import { freezeResolutionSources } from './resolution-sources.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'

export type RoleBlockResolution = Readonly<{
  attempts: readonly RoleBlockAttempt[]
  blockedActors: readonly BlockedActorRecord[]
}>

export function resolveRoleBlocks(
  game: GameState,
  orderedActions: readonly SubmittedNightAction[],
): RoleBlockResolution {
  const consortActions = orderedActions.filter((action) => action.actorRoleId === ROLE_IDS.consort)
  const attempts: readonly RoleBlockAttempt[] = Object.freeze(
    consortActions.map((action) => {
      const target = game.players.find((player) => player.playerId === action.targetPlayerId)
      if (target === undefined) {
        throw new Error(`Validated role-block target ${action.targetPlayerId} is missing.`)
      }

      return Object.freeze({
        actorPlayerId: action.actorPlayerId,
        actorRoleInstanceId: action.actorRoleInstanceId,
        targetPlayerId: target.playerId,
        targetRoleInstanceId: target.role.instanceId,
        outcome:
          selectActiveRoleId(game, target.playerId) === ROLE_IDS.consort
            ? 'target-immune'
            : 'blocked-target',
      })
    }),
  )

  const blockedActors = game.players.flatMap((player): readonly BlockedActorRecord[] => {
    if (selectActiveRoleId(game, player.playerId) === ROLE_IDS.consort) {
      return []
    }

    const sources: readonly RoleBlockSource[] = consortActions
      .filter((action) => action.targetPlayerId === player.playerId)
      .map((action) =>
        Object.freeze({
          consortPlayerId: action.actorPlayerId,
          consortRoleInstanceId: action.actorRoleInstanceId,
        }),
      )
    const firstSource = sources[0]
    return firstSource === undefined
      ? []
      : [
          Object.freeze({
            blockedPlayerId: player.playerId,
            blockedRoleInstanceId: player.role.instanceId,
            sources: freezeResolutionSources(firstSource, sources.slice(1)),
          }),
        ]
  })

  return Object.freeze({
    attempts,
    blockedActors: Object.freeze(blockedActors),
  })
}

export function selectEffectiveActions(
  orderedActions: readonly SubmittedNightAction[],
  blockedActors: readonly BlockedActorRecord[],
): readonly SubmittedNightAction[] {
  const blockedRoleInstanceIds = new Set(
    blockedActors.map((record) => record.blockedRoleInstanceId),
  )

  return Object.freeze(
    orderedActions.filter((action) => !blockedRoleInstanceIds.has(action.actorRoleInstanceId)),
  )
}

export function isActorBlockedByConfirmedConsortActions(
  game: GameState,
  actorRoleInstanceId: SubmittedNightAction['actorRoleInstanceId'],
  confirmedActions: readonly SubmittedNightAction[],
): boolean {
  return selectBlockedRoleInstanceIds(game, confirmedActions).has(actorRoleInstanceId)
}
