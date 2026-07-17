import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'

import type { ValidatedGameSetup } from '../game-setup/game-setup-validation.ts'
import { assignRolesToValidatedSetup, type RoleAssignmentDependencies } from './assign-roles.ts'
import type { RoleDistributionError } from './role-assignment-errors.ts'

export type RoleDistributionWorkflow =
  | Readonly<{
      status: 'unassigned'
      setup: ValidatedGameSetup
    }>
  | Readonly<{
      status: 'distributing'
      setup: ValidatedGameSetup
      game: GameState
      deliveredPlayerIds: readonly PlayerId[]
    }>
  | Readonly<{
      status: 'confirmed'
      setup: ValidatedGameSetup
      game: GameState
    }>

export type DistributingRolesWorkflow = Extract<
  RoleDistributionWorkflow,
  Readonly<{ status: 'distributing' }>
>

export type ConfirmedRoleDistributionWorkflow = Extract<
  RoleDistributionWorkflow,
  Readonly<{ status: 'confirmed' }>
>

export function createRoleDistributionWorkflow(
  setup: ValidatedGameSetup,
): RoleDistributionWorkflow {
  return { status: 'unassigned', setup }
}

export function assignRoleDistribution(
  workflow: RoleDistributionWorkflow,
  dependencies: RoleAssignmentDependencies,
): DomainResult<DistributingRolesWorkflow, RoleDistributionError> {
  if (workflow.status !== 'unassigned') {
    return fail({
      type: 'INVALID_ROLE_DISTRIBUTION_STATE',
      operation: 'assign',
      status: workflow.status,
    })
  }

  const assignmentResult = assignRolesToValidatedSetup(workflow.setup, dependencies)

  return assignmentResult.ok
    ? succeed({
        status: 'distributing',
        setup: workflow.setup,
        game: assignmentResult.value,
        deliveredPlayerIds: [],
      })
    : assignmentResult
}

export function setCardDelivered(
  workflow: RoleDistributionWorkflow,
  playerId: PlayerId,
  delivered: boolean,
): DomainResult<DistributingRolesWorkflow, RoleDistributionError> {
  if (workflow.status !== 'distributing') {
    return fail({
      type: 'INVALID_ROLE_DISTRIBUTION_STATE',
      operation: 'set-card-delivery',
      status: workflow.status,
    })
  }

  if (!workflow.game.players.some((player) => player.playerId === playerId)) {
    return fail({ type: 'UNKNOWN_CARD_DELIVERY_PLAYER', playerId })
  }

  const alreadyDelivered = workflow.deliveredPlayerIds.some(
    (deliveredPlayerId) => deliveredPlayerId === playerId,
  )

  if (delivered === alreadyDelivered) {
    return succeed(workflow)
  }

  return succeed({
    ...workflow,
    deliveredPlayerIds: delivered
      ? [...workflow.deliveredPlayerIds, playerId]
      : workflow.deliveredPlayerIds.filter((deliveredPlayerId) => deliveredPlayerId !== playerId),
  })
}

export function confirmRoleDistribution(
  workflow: RoleDistributionWorkflow,
): DomainResult<ConfirmedRoleDistributionWorkflow, RoleDistributionError> {
  if (workflow.status !== 'distributing') {
    return fail({
      type: 'INVALID_ROLE_DISTRIBUTION_STATE',
      operation: 'confirm',
      status: workflow.status,
    })
  }

  const participatingPlayerIds = new Set(workflow.game.players.map((player) => player.playerId))

  for (const deliveredPlayerId of workflow.deliveredPlayerIds) {
    if (!participatingPlayerIds.has(deliveredPlayerId)) {
      return fail({ type: 'UNKNOWN_CARD_DELIVERY_PLAYER', playerId: deliveredPlayerId })
    }
  }

  const deliveredPlayerIds = new Set(workflow.deliveredPlayerIds)
  const undeliveredPlayerIds = workflow.game.players
    .filter((player) => !deliveredPlayerIds.has(player.playerId))
    .map((player) => player.playerId)

  if (undeliveredPlayerIds.length > 0) {
    return fail({ type: 'CARD_DELIVERY_INCOMPLETE', undeliveredPlayerIds })
  }

  return succeed({
    status: 'confirmed',
    setup: workflow.setup,
    game: workflow.game,
  })
}

export function reassignRoleDistribution(
  workflow: RoleDistributionWorkflow,
  dependencies: RoleAssignmentDependencies,
  deliveredCardsResetConfirmed: boolean,
): DomainResult<DistributingRolesWorkflow, RoleDistributionError> {
  if (workflow.status === 'confirmed') {
    return fail({ type: 'REASSIGNMENT_AFTER_CONFIRMATION' })
  }

  if (workflow.status !== 'distributing') {
    return fail({
      type: 'INVALID_ROLE_DISTRIBUTION_STATE',
      operation: 'reassign',
      status: workflow.status,
    })
  }

  if (workflow.deliveredPlayerIds.length > 0 && !deliveredCardsResetConfirmed) {
    return fail({
      type: 'REASSIGNMENT_CONFIRMATION_REQUIRED',
      deliveredPlayerIds: [...workflow.deliveredPlayerIds],
    })
  }

  const assignmentResult = assignRolesToValidatedSetup(workflow.setup, dependencies, {
    gameIds: [workflow.game.id],
    roleInstanceIds: workflow.game.players.map((player) => player.role.instanceId),
  })

  return assignmentResult.ok
    ? succeed({
        status: 'distributing',
        setup: workflow.setup,
        game: assignmentResult.value,
        deliveredPlayerIds: [],
      })
    : assignmentResult
}

export function getRoleDistributionProgress(
  workflow: RoleDistributionWorkflow,
): Readonly<{ deliveredCount: number; totalCount: number; isComplete: boolean }> {
  switch (workflow.status) {
    case 'unassigned':
      return {
        deliveredCount: 0,
        totalCount: workflow.setup.participatingPlayers.length,
        isComplete: false,
      }
    case 'distributing': {
      const participatingPlayerIds = new Set(workflow.game.players.map((player) => player.playerId))
      const deliveredCount = new Set(
        workflow.deliveredPlayerIds.filter((playerId) => participatingPlayerIds.has(playerId)),
      ).size
      const totalCount = workflow.game.players.length
      return { deliveredCount, totalCount, isComplete: deliveredCount === totalCount }
    }
    case 'confirmed': {
      const totalCount = workflow.game.players.length
      return { deliveredCount: totalCount, totalCount, isComplete: true }
    }
  }
}
