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
  confirmAllRoleCardsDelivered,
  createRoleDistributionWorkflow,
  reassignRoleDistribution,
  type DistributingRolesWorkflow,
} from './role-distribution-workflow.ts'

const settings: GameSettings = {
  godfatherAndSerialCanKillEachOther: false,
  godfatherAppearsSuspiciousToSheriff: false,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: false,
  revealRoleOnDeath: false,
  allowFirstNightKills: false,
}

describe('role-distribution workflow', () => {
  it('assigns once and exposes no per-player delivery authority', () => {
    const setup = createSetup()
    const unassigned = createRoleDistributionWorkflow(setup)
    const assigned = expectSuccess(assignRoleDistribution(unassigned, dependencies([0.5, 0.5])))

    expect(unassigned).toEqual({ status: 'unassigned', setup })
    expect(assigned).toMatchObject({ status: 'distributing' })
    expect(assigned.setup.participatingPlayers.map((player) => player.name)).toEqual([
      'Alice',
      'Bob',
      'Casey',
    ])
    expect(assigned.setup.participatingPlayers.map((player) => player.id)).toEqual(
      assigned.game.players.map((player) => player.playerId),
    )
    expect(assigned.game.phase).toBe('role-distribution')
    expect(assigned).not.toHaveProperty('deliveredPlayerIds')
  })

  it('confirms every available private card in one atomic boundary', () => {
    const assigned = createDistributingWorkflow()
    const snapshot = JSON.stringify(assigned)
    const confirmed = expectSuccess(confirmAllRoleCardsDelivered(assigned))

    expect(confirmed).toEqual({
      status: 'confirmed',
      setup: assigned.setup,
      game: assigned.game,
    })
    expect(confirmed.game.phase).toBe('role-distribution')
    expect(JSON.stringify(assigned)).toBe(snapshot)
    expect(confirmAllRoleCardsDelivered(confirmed)).toEqual({
      ok: false,
      error: { type: 'ROLE_CARD_DELIVERY_ALREADY_COMPLETE' },
    })
  })

  it('rejects the bulk boundary from the wrong stage and without complete card authority', () => {
    const unassigned = createRoleDistributionWorkflow(createSetup())
    expect(confirmAllRoleCardsDelivered(unassigned)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_STATE',
        operation: 'confirm-all-role-cards-delivered',
        status: 'unassigned',
      },
    })

    const assigned = createDistributingWorkflow()
    expect(
      confirmAllRoleCardsDelivered({
        ...assigned,
        game: { ...assigned.game, phase: 'setup' },
      }),
    ).toEqual({
      ok: false,
      error: { type: 'INVALID_ROLE_DISTRIBUTION_AUTHORITY' },
    })

    const unavailable: DistributingRolesWorkflow = {
      ...assigned,
      setup: {
        ...assigned.setup,
        participatingPlayers: assigned.setup.participatingPlayers.slice(1),
      },
    }
    expect(confirmAllRoleCardsDelivered(unavailable)).toEqual({
      ok: false,
      error: { type: 'ROLE_CARDS_UNAVAILABLE' },
    })
  })

  it('reassigns immutably with fresh game and role-instance identities', () => {
    const deps = dependencies([0, 0, 0.999, 0.999])
    const assigned = createDistributingWorkflow(deps)
    const snapshot = JSON.stringify(assigned)
    const reassigned = expectSuccess(reassignRoleDistribution(assigned, deps))

    expect(reassigned.setup.roleCounts).toBe(assigned.setup.roleCounts)
    expect(reassigned.setup.settings).toBe(assigned.setup.settings)
    expect(reassigned.setup.participatingPlayers.map((player) => player.name)).toEqual(
      assigned.setup.participatingPlayers.map((player) => player.name),
    )
    expect(reassigned.setup.participatingPlayers.map((player) => player.id)).not.toEqual(
      assigned.setup.participatingPlayers.map((player) => player.id),
    )
    expect(reassigned.game.id).not.toBe(assigned.game.id)
    expect(reassigned.game.executionerTargets).toEqual([])
    expect(reassigned.game.executionerBriefingStatus).toBe('not-started')
    expect(reassigned.game.settings).toEqual(assigned.game.settings)
    expect(reassigned.game.players.map((player) => player.role.roleId)).not.toEqual(
      assigned.game.players.map((player) => player.role.roleId),
    )
    const priorRoleInstanceIds = new Set(
      assigned.game.players.map((player) => player.role.instanceId),
    )
    expect(
      reassigned.game.players.every((player) => !priorRoleInstanceIds.has(player.role.instanceId)),
    ).toBe(true)
    expect(JSON.stringify(assigned)).toBe(snapshot)
  })

  it('rejects reassignment after delivery completion', () => {
    const confirmed = expectSuccess(confirmAllRoleCardsDelivered(createDistributingWorkflow()))
    expect(reassignRoleDistribution(confirmed, dependencies([0.5, 0.5]))).toEqual({
      ok: false,
      error: { type: 'REASSIGNMENT_AFTER_CONFIRMATION' },
    })
  })

  it('rejects assignment and reassignment from incompatible workflow stages', () => {
    const unassigned = createRoleDistributionWorkflow(createSetup())
    const assigned = createDistributingWorkflow()

    expect(reassignRoleDistribution(unassigned, dependencies([0.5]))).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_STATE',
        operation: 'reassign',
        status: 'unassigned',
      },
    })
    expect(assignRoleDistribution(assigned, dependencies([0.5]))).toEqual({
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
        return () => roleInstanceId(`role-${String(next++)}`)
      })(),
    }
    const deps: RoleAssignmentDependencies = {
      randomSource: new DeterministicRandomSource([0.5, 0.5, 0.5, 0.5]),
      identitySource,
    }
    const assigned = expectSuccess(
      assignRoleDistribution(createRoleDistributionWorkflow(createSetup()), deps),
    )

    expect(reassignRoleDistribution(assigned, deps)).toEqual({
      ok: false,
      error: {
        type: 'IDENTIFIER_COLLISION',
        identityKind: 'game',
        id: duplicateGameId,
      },
    })
  })

  it('returns a structured collision for a reused role-instance identity', () => {
    let nextGameNumber = 1
    let nextRoleNumber = 0
    const identitySource: RoleAssignmentIdentitySource = {
      nextGameId: () => gameId(`fresh-game-${String(nextGameNumber++)}`),
      nextRoleInstanceId: () => roleInstanceId(`reused-role-${String((nextRoleNumber++ % 3) + 1)}`),
    }
    const deps: RoleAssignmentDependencies = {
      randomSource: new DeterministicRandomSource([0.5, 0.5]),
      identitySource,
    }
    const assigned = createDistributingWorkflow(deps)
    const reusedRoleInstanceId = assigned.game.players[0]?.role.instanceId
    if (reusedRoleInstanceId === undefined) {
      throw new Error('Expected a role instance.')
    }

    expect(reassignRoleDistribution(assigned, deps)).toEqual({
      ok: false,
      error: {
        type: 'IDENTIFIER_COLLISION',
        identityKind: 'role-instance',
        id: reusedRoleInstanceId,
      },
    })
  })

  it('accepts deeply frozen workflow records without mutation', () => {
    const assigned = createDistributingWorkflow()
    const frozen = Object.freeze({
      ...assigned,
      setup: Object.freeze({
        ...assigned.setup,
        participatingPlayers: Object.freeze(
          assigned.setup.participatingPlayers.map((player) => Object.freeze({ ...player })),
        ),
        roleCounts: Object.freeze(
          assigned.setup.roleCounts.map((entry) => Object.freeze({ ...entry })),
        ),
        settings: Object.freeze({ ...assigned.setup.settings }),
      }),
      game: Object.freeze({
        ...assigned.game,
        players: Object.freeze(
          assigned.game.players.map((player) =>
            Object.freeze({ ...player, role: Object.freeze({ ...player.role }) }),
          ),
        ),
      }),
    })
    const snapshot = JSON.stringify(frozen)
    expect(confirmAllRoleCardsDelivered(frozen).ok).toBe(true)
    expect(JSON.stringify(frozen)).toBe(snapshot)
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
  deps: RoleAssignmentDependencies = dependencies([0.5, 0.5]),
): DistributingRolesWorkflow {
  return expectSuccess(assignRoleDistribution(createRoleDistributionWorkflow(createSetup()), deps))
}

function expectSuccess<Value>(result: DomainResult<Value, unknown>): Value {
  if (!result.ok) {
    throw new Error('Expected the workflow operation to succeed.')
  }
  return result.value
}
