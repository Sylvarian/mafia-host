import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState } from '@/domain/game/game-state.ts'

import type { ValidatedGameSetup } from '../game-setup/game-setup-validation.ts'
import { assignRolesToValidatedSetup, type RoleAssignmentDependencies } from './assign-roles.ts'
import type { RoleDistributionError } from './role-assignment-errors.ts'
import {
  createRoleCardDistributionOrder,
  validateRoleCardDistributionOrder,
} from './role-card-distribution-order.ts'

export type RoleDistributionWorkflow =
  | Readonly<{
      status: 'unassigned'
      setup: ValidatedGameSetup
    }>
  | Readonly<{
      status: 'distributing'
      setup: ValidatedGameSetup
      game: GameState
      roleCardDistributionPlayerIds: readonly GameState['players'][number]['playerId'][]
    }>
  | Readonly<{
      status: 'confirmed'
      setup: ValidatedGameSetup
      game: GameState
      roleCardDistributionPlayerIds: readonly GameState['players'][number]['playerId'][]
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

  if (!assignmentResult.ok) {
    return assignmentResult
  }
  const orderResult = createRoleCardDistributionOrder(
    assignmentResult.value.players.map((player) => player.playerId),
    dependencies.randomSource,
  )
  return orderResult.ok
    ? succeed({
        status: 'distributing',
        setup: createAssignedSetup(workflow.setup, assignmentResult.value),
        game: assignmentResult.value,
        roleCardDistributionPlayerIds: orderResult.value,
      })
    : orderResult
}

export function confirmAllRoleCardsDelivered(
  workflow: RoleDistributionWorkflow,
): DomainResult<ConfirmedRoleDistributionWorkflow, RoleDistributionError> {
  if (workflow.status === 'confirmed') {
    return fail({ type: 'ROLE_CARD_DELIVERY_ALREADY_COMPLETE' })
  }
  if (workflow.status !== 'distributing') {
    return fail({
      type: 'INVALID_ROLE_DISTRIBUTION_STATE',
      operation: 'confirm-all-role-cards-delivered',
      status: workflow.status,
    })
  }

  const gameResult = validateGameState(workflow.game)
  if (!gameResult.ok || gameResult.value.phase !== 'role-distribution') {
    return fail({ type: 'INVALID_ROLE_DISTRIBUTION_AUTHORITY' })
  }
  if (
    gameResult.value.players.length === 0 ||
    gameResult.value.players.length !== workflow.setup.participatingPlayers.length ||
    gameResult.value.players.some(
      (player, index) => player.playerId !== workflow.setup.participatingPlayers[index]?.id,
    )
  ) {
    return fail({ type: 'ROLE_CARDS_UNAVAILABLE' })
  }
  const orderResult = validateRoleCardDistributionOrder(
    workflow.roleCardDistributionPlayerIds,
    gameResult.value.players.map((player) => player.playerId),
  )
  if (!orderResult.ok) {
    return orderResult
  }

  return succeed({
    status: 'confirmed',
    setup: workflow.setup,
    game: workflow.game,
    roleCardDistributionPlayerIds: orderResult.value,
  })
}

export function reassignRoleDistribution(
  workflow: RoleDistributionWorkflow,
  dependencies: RoleAssignmentDependencies,
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

  const assignmentResult = assignRolesToValidatedSetup(workflow.setup, dependencies, {
    gameIds: [workflow.game.id],
    playerIds: workflow.game.players.map((player) => player.playerId),
    roleInstanceIds: workflow.game.players.map((player) => player.role.instanceId),
  })

  if (!assignmentResult.ok) {
    return assignmentResult
  }
  const orderResult = createRoleCardDistributionOrder(
    assignmentResult.value.players.map((player) => player.playerId),
    dependencies.randomSource,
  )
  return orderResult.ok
    ? succeed({
        status: 'distributing',
        setup: createAssignedSetup(workflow.setup, assignmentResult.value),
        game: assignmentResult.value,
        roleCardDistributionPlayerIds: orderResult.value,
      })
    : orderResult
}

function createAssignedSetup(setup: ValidatedGameSetup, game: GameState): ValidatedGameSetup {
  if (setup.participatingPlayers.length !== game.players.length) {
    throw new Error('Assigned game and validated setup have different participant counts.')
  }
  return Object.freeze({
    ...setup,
    participatingPlayers: Object.freeze(
      setup.participatingPlayers.map((participant, index) => {
        const assignedPlayer = game.players[index]
        if (assignedPlayer === undefined) {
          throw new Error('Assigned game is missing a validated setup participant.')
        }
        return Object.freeze({ ...participant, id: assignedPlayer.playerId })
      }),
    ),
  })
}
