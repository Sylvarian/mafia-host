import { describe, expect, it } from 'vitest'

import type { DomainResult } from '@/domain/game/domain-result.ts'
import type { GameSettings } from '@/domain/game/game-settings.ts'
import { gameId, playerId, roleInstanceId, type GameId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { DeterministicRandomSource } from '../../../tests/support/deterministic-random-source.ts'
import { SequentialRoleAssignmentIdentitySource } from '../../../tests/support/sequential-role-assignment-identity-source.ts'

import type { ValidatedGameSetup } from '../game-setup/game-setup-validation.ts'
import type { RoleAssignmentDependencies } from './assign-roles.ts'
import type { RoleAssignmentIdentitySource } from './identity-source.ts'
import {
  assignRoleDistribution,
  confirmRoleDistribution,
  createRoleDistributionWorkflow,
  getRoleDistributionProgress,
  reassignRoleDistribution,
  setCardDelivered,
  type DistributingRolesWorkflow,
} from './role-distribution-workflow.ts'

const settings: GameSettings = {
  godfatherAndSerialCanKillEachOther: false,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: false,
  revealRoleOnDeath: false,
  allowFirstNightKills: false,
}

describe('role-distribution workflow', () => {
  it('starts unassigned and enters distribution with derived zero progress', () => {
    const setup = createSetup()
    const unassigned = createRoleDistributionWorkflow(setup)
    const assigned = assignRoleDistribution(unassigned, dependencies([0.5, 0.5]))

    expect(unassigned).toEqual({ status: 'unassigned', setup })
    expect(getRoleDistributionProgress(unassigned)).toEqual({
      deliveredCount: 0,
      totalCount: 3,
      isComplete: false,
    })
    expect(assigned.ok).toBe(true)
    if (!assigned.ok) {
      throw new Error('Expected role distribution to begin.')
    }

    expect(assigned.value.status).toBe('distributing')
    expect(assigned.value.deliveredPlayerIds).toEqual([])
  })

  it('marks and unmarks cards without duplicates and rejects unknown players', () => {
    const assigned = createDistributingWorkflow()
    const aliceId = assigned.game.players[0]?.playerId ?? missingPlayerId()
    const delivered = expectSuccess(setCardDelivered(assigned, aliceId, true))
    const deliveredAgain = expectSuccess(setCardDelivered(delivered, aliceId, true))
    const unmarked = expectSuccess(setCardDelivered(deliveredAgain, aliceId, false))

    expect(delivered.deliveredPlayerIds).toEqual([aliceId])
    expect(deliveredAgain).toBe(delivered)
    expect(unmarked.deliveredPlayerIds).toEqual([])
    expect(setCardDelivered(assigned, playerId('unknown'), true)).toEqual({
      ok: false,
      error: { type: 'UNKNOWN_CARD_DELIVERY_PLAYER', playerId: 'unknown' },
    })
  })

  it('derives progress from unique participating delivery IDs and rejects unknown stored IDs', () => {
    const assigned = createDistributingWorkflow()
    const firstPlayerId = assigned.game.players[0]?.playerId ?? missingPlayerId()
    const duplicatedDeliveries: DistributingRolesWorkflow = {
      ...assigned,
      deliveredPlayerIds: [firstPlayerId, firstPlayerId],
    }
    const unknownPlayerId = playerId('unknown-stored-delivery')
    const malformedCompletedDeliveries: DistributingRolesWorkflow = {
      ...assigned,
      deliveredPlayerIds: [
        ...assigned.game.players.map((player) => player.playerId),
        unknownPlayerId,
      ],
    }

    expect(getRoleDistributionProgress(duplicatedDeliveries)).toEqual({
      deliveredCount: 1,
      totalCount: 3,
      isComplete: false,
    })
    expect(confirmRoleDistribution(malformedCompletedDeliveries)).toEqual({
      ok: false,
      error: { type: 'UNKNOWN_CARD_DELIVERY_PLAYER', playerId: unknownPlayerId },
    })
  })

  it('rejects early confirmation and confirms without entering a night phase', () => {
    const assigned = createDistributingWorkflow()
    const early = confirmRoleDistribution(assigned)

    expect(early.ok).toBe(false)
    if (early.ok) {
      throw new Error('Expected incomplete delivery to be rejected.')
    }
    expect(early.error.type).toBe('CARD_DELIVERY_INCOMPLETE')

    const delivered = assigned.game.players.reduce((workflow, player) => {
      return expectSuccess(setCardDelivered(workflow, player.playerId, true))
    }, assigned)
    const confirmed = confirmRoleDistribution(delivered)

    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) {
      throw new Error('Expected complete distribution to be confirmed.')
    }

    expect(confirmed.value.status).toBe('confirmed')
    expect(confirmed.value.game).toBe(assigned.game)
    expect(confirmed.value.game.phase).toBe('role-distribution')
    expect(getRoleDistributionProgress(confirmed.value)).toEqual({
      deliveredCount: 3,
      totalCount: 3,
      isComplete: true,
    })
  })

  it('requires the delivered-card confirmation path and reassigns immutably', () => {
    const assignmentDependencies = dependencies([0, 0, 0.999, 0.999])
    const assigned = createDistributingWorkflow(assignmentDependencies)
    const firstPlayerId = assigned.game.players[0]?.playerId ?? missingPlayerId()
    const delivered = expectSuccess(setCardDelivered(assigned, firstPlayerId, true))
    const originalSnapshot = JSON.stringify(delivered)
    const blocked = reassignRoleDistribution(delivered, assignmentDependencies, false)

    expect(blocked).toEqual({
      ok: false,
      error: {
        type: 'REASSIGNMENT_CONFIRMATION_REQUIRED',
        deliveredPlayerIds: [firstPlayerId],
      },
    })

    const reassigned = reassignRoleDistribution(delivered, assignmentDependencies, true)

    expect(reassigned.ok).toBe(true)
    if (!reassigned.ok) {
      throw new Error('Expected confirmed reassignment to succeed.')
    }

    expect(reassigned.value.setup).toBe(delivered.setup)
    expect(reassigned.value.game).not.toBe(delivered.game)
    expect(reassigned.value.game.id).not.toBe(delivered.game.id)
    expect(reassigned.value.deliveredPlayerIds).toEqual([])
    expect(reassigned.value.game.players.map((player) => player.role.roleId)).not.toEqual(
      delivered.game.players.map((player) => player.role.roleId),
    )
    const previousRoleInstanceIds = new Set(
      delivered.game.players.map((player) => player.role.instanceId),
    )
    expect(
      reassigned.value.game.players.every(
        (player) => !previousRoleInstanceIds.has(player.role.instanceId),
      ),
    ).toBe(true)
    expect(JSON.stringify(delivered)).toBe(originalSnapshot)
  })

  it('rejects reassignment after final confirmation', () => {
    const assigned = createDistributingWorkflow()
    const delivered = assigned.game.players.reduce((workflow, player) => {
      return expectSuccess(setCardDelivered(workflow, player.playerId, true))
    }, assigned)
    const confirmed = expectSuccess(confirmRoleDistribution(delivered))

    expect(reassignRoleDistribution(confirmed, dependencies([0.5, 0.5]), true)).toEqual({
      ok: false,
      error: { type: 'REASSIGNMENT_AFTER_CONFIRMATION' },
    })
    expect(assignRoleDistribution(confirmed, dependencies([0.5, 0.5]))).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_STATE',
        operation: 'assign',
        status: 'confirmed',
      },
    })
    expect(
      setCardDelivered(confirmed, confirmed.game.players[0]?.playerId ?? missingPlayerId(), false),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_STATE',
        operation: 'set-card-delivery',
        status: 'confirmed',
      },
    })
    expect(confirmRoleDistribution(confirmed)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_STATE',
        operation: 'confirm',
        status: 'confirmed',
      },
    })
  })

  it('rejects assignment and delivery operations from invalid workflow states', () => {
    const unassigned = createRoleDistributionWorkflow(createSetup())
    const assigned = createDistributingWorkflow()

    expect(setCardDelivered(unassigned, playerId('player-1'), true)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_STATE',
        operation: 'set-card-delivery',
        status: 'unassigned',
      },
    })
    expect(assignRoleDistribution(assigned, dependencies([0.5, 0.5]))).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_STATE',
        operation: 'assign',
        status: 'distributing',
      },
    })
  })

  it('returns a structured game identity collision during reassignment', () => {
    const duplicateGameId = gameId('duplicate-game')
    const identitySource: RoleAssignmentIdentitySource = {
      nextGameId(): GameId {
        return duplicateGameId
      },
      nextRoleInstanceId: (() => {
        let next = 1
        return () => {
          const id = roleInstanceId(`role-${String(next)}`)
          next += 1
          return id
        }
      })(),
    }
    const deps: RoleAssignmentDependencies = {
      randomSource: new DeterministicRandomSource([0.5, 0.5, 0.5, 0.5]),
      identitySource,
    }
    const assignedResult = assignRoleDistribution(
      createRoleDistributionWorkflow(createSetup()),
      deps,
    )

    if (!assignedResult.ok) {
      throw new Error('Expected the initial assignment to succeed.')
    }

    expect(reassignRoleDistribution(assignedResult.value, deps, true)).toEqual({
      ok: false,
      error: {
        type: 'IDENTIFIER_COLLISION',
        identityKind: 'game',
        id: duplicateGameId,
      },
    })
  })

  it('returns a structured collision when reassignment reuses a previous role-instance ID', () => {
    let nextGameNumber = 1
    let nextRoleNumber = 0
    const identitySource: RoleAssignmentIdentitySource = {
      nextGameId() {
        const id = gameId(`fresh-game-${String(nextGameNumber)}`)
        nextGameNumber += 1
        return id
      },
      nextRoleInstanceId() {
        const id = roleInstanceId(`reused-role-${String((nextRoleNumber % 3) + 1)}`)
        nextRoleNumber += 1
        return id
      },
    }
    const deps: RoleAssignmentDependencies = {
      randomSource: new DeterministicRandomSource([0.5, 0.5]),
      identitySource,
    }
    const assigned = createDistributingWorkflow(deps)
    const reusedRoleInstanceId =
      assigned.game.players[0]?.role.instanceId ?? missingRoleInstanceId()

    expect(reassignRoleDistribution(assigned, deps, true)).toEqual({
      ok: false,
      error: {
        type: 'IDENTIFIER_COLLISION',
        identityKind: 'role-instance',
        id: reusedRoleInstanceId,
      },
    })
  })

  it('operates without mutating deeply frozen workflow records', () => {
    const assigned = createDistributingWorkflow()
    const frozenPlayers = Object.freeze(
      assigned.game.players.map((player) =>
        Object.freeze({ ...player, role: Object.freeze({ ...player.role }) }),
      ),
    )
    const frozenWorkflow: DistributingRolesWorkflow = Object.freeze({
      ...assigned,
      setup: Object.freeze({
        ...assigned.setup,
        participatingPlayers: Object.freeze(
          assigned.setup.participatingPlayers.map((player) => Object.freeze({ ...player })),
        ),
        roleCounts: Object.freeze(
          assigned.setup.roleCounts.map((roleCount) => Object.freeze({ ...roleCount })),
        ),
        settings: Object.freeze({ ...assigned.setup.settings }),
      }),
      game: Object.freeze({
        ...assigned.game,
        players: frozenPlayers,
        roleDefinitions: Object.freeze(
          assigned.game.roleDefinitions.map((role) => Object.freeze({ ...role })),
        ),
        settings: Object.freeze({ ...assigned.game.settings }),
      }),
      deliveredPlayerIds: Object.freeze([]),
    })
    const firstPlayerId = frozenWorkflow.game.players[0]?.playerId ?? missingPlayerId()
    const delivered = setCardDelivered(frozenWorkflow, firstPlayerId, true)

    expect(delivered.ok).toBe(true)
    expect(frozenWorkflow.deliveredPlayerIds).toEqual([])
    expect(confirmRoleDistribution(frozenWorkflow).ok).toBe(false)
  })
})

function createSetup(): ValidatedGameSetup {
  return {
    participatingPlayers: ['Alice', 'Bob', 'Casey'].map((name, index) => ({
      id: playerId(`player-${String(index + 1)}`),
      name,
      playing: true,
    })),
    roleCounts: [
      { roleId: ROLE_IDS.godfather, count: 1 },
      { roleId: ROLE_IDS.doctor, count: 2 },
    ],
    settings,
  }
}

function dependencies(values: readonly number[]): RoleAssignmentDependencies {
  return {
    randomSource: new DeterministicRandomSource(values),
    identitySource: new SequentialRoleAssignmentIdentitySource(),
  }
}

function createDistributingWorkflow(
  assignmentDependencies: RoleAssignmentDependencies = dependencies([0.5, 0.5]),
): DistributingRolesWorkflow {
  return expectSuccess(
    assignRoleDistribution(createRoleDistributionWorkflow(createSetup()), assignmentDependencies),
  )
}

function expectSuccess<Value>(result: DomainResult<Value, unknown>): Value {
  if (!result.ok) {
    throw new Error('Expected the workflow operation to succeed.')
  }

  return result.value
}

function missingPlayerId(): never {
  throw new Error('Expected the game player to exist.')
}

function missingRoleInstanceId(): never {
  throw new Error('Expected the role instance to exist.')
}
