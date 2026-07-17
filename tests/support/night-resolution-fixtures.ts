import type { GameSettings } from '../../src/domain/game/game-settings.ts'
import type { Player } from '../../src/domain/players/player.ts'
import type {
  PreviousNightTarget,
  SubmittedNightAction,
} from '../../src/domain/night-actions/night-action.ts'
import {
  createCollectedNightActions,
  isNightActionRequiredForPlayer,
} from '../../src/domain/night-actions/night-action.ts'
import { findRoleDefinition } from '../../src/domain/roles/role-registry.ts'
import {
  resolveNight,
  type NightResolutionInput,
} from '../../src/domain/resolution/night-resolution.ts'
import type { NightResolution } from '../../src/domain/resolution/night-resolution-models.ts'
import { buildNightActionSequence } from '../../src/application/night-actions/night-sequence.ts'
import type { CompleteNightActionsWorkflow } from '../../src/application/night-actions/night-action-workflow.ts'
import { createNightFixture, type NightFixtureRole } from './night-action-fixtures.ts'

export type ResolutionFixture = Readonly<NightResolutionInput>

export function createResolutionFixture(
  roles: readonly NightFixtureRole[],
  targetIndexes: readonly (number | null)[],
  options: Readonly<{
    nightNumber?: number
    settings?: Partial<GameSettings>
    previousTargets?: readonly PreviousNightTarget[]
  }> = {},
): ResolutionFixture {
  const fixture = createNightFixture(roles, {
    phase: 'night-action-collection',
    nightNumber: options.nightNumber ?? 2,
    settings: { allowFirstNightKills: true, ...options.settings },
  })
  const actions: SubmittedNightAction[] = []

  for (const [actorIndex, actor] of fixture.game.players.entries()) {
    if (!isNightActionRequiredForPlayer(fixture.game, actor.playerId)) {
      continue
    }

    const targetIndex = targetIndexes[actorIndex]
    const target =
      targetIndex === null || targetIndex === undefined
        ? undefined
        : fixture.game.players[targetIndex]
    const role = findRoleDefinition(actor.role.roleId)

    if (target === undefined || role?.nightAction.hasNightAction !== true) {
      throw new Error(`Resolution fixture actor ${actor.playerId} needs a valid target.`)
    }

    actions.push({
      actorPlayerId: actor.playerId,
      actorRoleId: actor.role.roleId,
      actorRoleInstanceId: actor.role.instanceId,
      actionKind: role.nightAction.actionKind,
      targetPlayerId: target.playerId,
    })
  }

  const previousTargets = options.previousTargets ?? []
  const batchResult = createCollectedNightActions(fixture.game, actions, previousTargets)
  if (!batchResult.ok) {
    throw new Error(`Resolution fixture batch was invalid: ${JSON.stringify(batchResult.error)}`)
  }

  return Object.freeze({
    game: fixture.game,
    collectedActions: batchResult.value,
    previousTargets: Object.freeze([...previousTargets]),
  })
}

export function resolveFixture(fixture: ResolutionFixture): NightResolution {
  const result = resolveNight(fixture)
  if (!result.ok) {
    throw new Error(`Expected night resolution success: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

export function createCompleteNightWorkflow(
  fixture: ResolutionFixture,
  names: readonly string[] = [],
): CompleteNightActionsWorkflow {
  const sequenceResult = buildNightActionSequence(fixture.game)
  if (!sequenceResult.ok) {
    throw new Error(`Expected a valid night sequence: ${JSON.stringify(sequenceResult.error)}`)
  }

  const participants: readonly Player[] = Object.freeze(
    fixture.game.players.map((player, index) =>
      Object.freeze({
        id: player.playerId,
        name: names[index] ?? `Player ${String(index + 1)}`,
        playing: true,
      }),
    ),
  )

  return Object.freeze({
    status: 'complete',
    game: fixture.game,
    participants,
    steps: sequenceResult.value,
    previousTargets: fixture.previousTargets,
    collectedActions: fixture.collectedActions,
  })
}
