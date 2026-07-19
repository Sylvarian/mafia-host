import type { DeathRecord } from '../game/death-record.ts'
import { orderExecutionerConversions } from '../game/outcome-state-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { ExecutionerToJesterConversion } from './neutral-outcome-model.ts'

export function addConversionsForProvenNonExecutionDeaths(
  game: GameState,
  newDeathRecords: readonly DeathRecord[],
): readonly ExecutionerToJesterConversion[] {
  const convertedRoleInstanceIds = new Set(
    game.executionerConversions.map((conversion) => conversion.roleInstanceId),
  )
  const nonExecutionDeathPlayerIds = new Set(
    newDeathRecords.flatMap((death) =>
      death.cause.kind === 'day-execution' ? [] : [death.playerId],
    ),
  )
  const conversions: ExecutionerToJesterConversion[] = [...game.executionerConversions]

  for (const target of game.executionerTargets) {
    if (
      !nonExecutionDeathPlayerIds.has(target.targetPlayerId) ||
      convertedRoleInstanceIds.has(target.executionerRoleInstanceId)
    ) {
      continue
    }
    conversions.push(
      Object.freeze({
        kind: 'executioner-to-jester',
        gameId: game.id,
        playerId: target.executionerPlayerId,
        roleInstanceId: target.executionerRoleInstanceId,
        targetPlayerId: target.targetPlayerId,
      }),
    )
    convertedRoleInstanceIds.add(target.executionerRoleInstanceId)
  }

  return orderExecutionerConversions(conversions, game.players, [
    ...game.deathRecords,
    ...newDeathRecords,
  ])
}

export function selectActiveRoleId(game: GameState, selectedPlayerId: PlayerId): RoleId | null {
  const player = game.players.find((candidate) => candidate.playerId === selectedPlayerId)
  if (player === undefined) {
    return null
  }
  const convertedToJester = game.executionerConversions.some(
    (conversion) => conversion.roleInstanceId === player.role.instanceId,
  )
  const promotedToGodfather = game.godfatherPromotions.some(
    (promotion) => promotion.originalRoleInstanceId === player.role.instanceId,
  )
  if (convertedToJester && promotedToGodfather) {
    throw new Error('A role instance cannot be both a converted Jester and a promoted Godfather.')
  }
  return convertedToJester
    ? ROLE_IDS.jester
    : promotedToGodfather
      ? ROLE_IDS.godfather
      : player.role.roleId
}

export function isExecutionerRoleInstanceConverted(
  game: GameState,
  selectedRoleInstanceId: RoleInstanceId,
): boolean {
  return game.executionerConversions.some(
    (conversion) => conversion.roleInstanceId === selectedRoleInstanceId,
  )
}

export function selectActiveExecutionerTarget(
  game: GameState,
  selectedRoleInstanceId: RoleInstanceId,
) {
  return isExecutionerRoleInstanceConverted(game, selectedRoleInstanceId)
    ? undefined
    : game.executionerTargets.find(
        (target) => target.executionerRoleInstanceId === selectedRoleInstanceId,
      )
}
