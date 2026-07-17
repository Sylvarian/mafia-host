import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameState } from '../game/game-state.ts'
import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { findRoleDefinition } from '../roles/role-registry.ts'
import type { InvalidResolutionRoleMetadataError } from './night-resolution-errors.ts'

export function validateResolutionRoleMetadata(
  game: GameState,
): DomainResult<true, InvalidResolutionRoleMetadataError> {
  for (const definition of game.roleDefinitions) {
    const registeredRole = findRoleDefinition(definition.id)

    if (registeredRole === undefined) {
      return fail({
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: definition.id,
        reason: 'missing-registry-entry',
      })
    }

    if (registeredRole.name !== definition.name || registeredRole.faction !== definition.faction) {
      return fail({
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: definition.id,
        reason: 'game-definition-mismatch',
      })
    }
  }

  return succeed(true)
}

export function orderNightActionsForResolution(
  game: GameState,
  actions: readonly SubmittedNightAction[],
): DomainResult<readonly SubmittedNightAction[], InvalidResolutionRoleMetadataError> {
  let orderedEntries: readonly OrderedAction[] = []

  for (const action of actions) {
    const actorIndex = game.players.findIndex((player) => player.playerId === action.actorPlayerId)
    const actor = game.players[actorIndex]
    const role = findRoleDefinition(action.actorRoleId)

    if (role === undefined) {
      return fail({
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: action.actorRoleId,
        reason: 'missing-registry-entry',
      })
    }

    if (!role.nightAction.hasNightAction) {
      return fail({
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: action.actorRoleId,
        reason: 'missing-night-action-metadata',
      })
    }

    if (
      !Number.isInteger(role.nightAction.collectionOrder) ||
      role.nightAction.collectionOrder < 0
    ) {
      return fail({
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: action.actorRoleId,
        reason: 'invalid-collection-order',
      })
    }

    if (actor === undefined) {
      throw new Error(`Validated night actor ${action.actorPlayerId} is missing.`)
    }

    orderedEntries = [
      ...orderedEntries,
      {
        action,
        collectionOrder: role.nightAction.collectionOrder,
        ordinal: actor.role.ordinal,
        rosterIndex: actorIndex,
      },
    ]
  }

  return succeed(
    Object.freeze(orderedEntries.toSorted(compareOrderedActions).map((entry) => entry.action)),
  )
}

type OrderedAction = Readonly<{
  action: SubmittedNightAction
  collectionOrder: number
  ordinal: number | null
  rosterIndex: number
}>

function compareOrderedActions(left: OrderedAction, right: OrderedAction): number {
  return (
    left.collectionOrder - right.collectionOrder ||
    (left.ordinal ?? 0) - (right.ordinal ?? 0) ||
    left.rosterIndex - right.rosterIndex
  )
}
