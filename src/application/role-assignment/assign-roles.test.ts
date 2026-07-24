import { describe, expect, it, vi } from 'vitest'

import type { GameSettings } from '@/domain/game/game-settings.ts'
import { gameId, playerId, roleInstanceId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import { DeterministicRandomSource } from '../../../tests/support/deterministic-random-source.ts'
import { SequentialRoleAssignmentIdentitySource } from '../../../tests/support/sequential-role-assignment-identity-source.ts'

import type { ValidatedGameSetup } from '../game-setup/game-setup-validation.ts'
import { assignRolesToValidatedSetup } from './assign-roles.ts'
import type { RoleAssignmentIdentitySource } from './identity-source.ts'

const settings: GameSettings = {
  godfatherAndSerialCanKillEachOther: true,
  godfatherAppearsSuspiciousToSheriff: false,
  doctorCanSelfProtect: true,
  doctorCannotRepeatPreviousTarget: false,
  doctorCannotProtectRevealedMayor: false,
  revealRoleOnDeath: true,
  allowFirstNightKills: false,
}

describe('role assignment and active game creation', () => {
  it('assigns every role exactly once and numbers duplicates by roster order', () => {
    const setup = setupWithPlayers(['Alice', 'Ben', 'Charlie', 'Dana'])
    const snapshot = JSON.stringify(setup)
    const result = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0, 0, 0]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected role assignment to succeed.')
    }

    expect(
      result.value.players.map(({ playerId: id, role }) => [id, role.roleId, role.ordinal]),
    ).toEqual([
      ['game-1-player-1', ROLE_IDS.doctor, 1],
      ['game-1-player-2', ROLE_IDS.doctor, 2],
      ['game-1-player-3', ROLE_IDS.citizen, null],
      ['game-1-player-4', ROLE_IDS.godfather, null],
    ])
    expect(new Set(result.value.players.map((player) => player.role.instanceId)).size).toBe(4)
    expect(JSON.stringify(setup)).toBe(snapshot)
  })

  it('produces exact deterministic assignments for different supplied sequences', () => {
    const setup = setupWithPlayers(['Alice', 'Ben', 'Charlie', 'Dana'])
    const lowResult = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0, 0, 0]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })
    const highResult = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0.999, 0.999, 0.999]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })

    expect(lowResult.ok).toBe(true)
    expect(highResult.ok).toBe(true)
    if (!lowResult.ok || !highResult.ok) {
      throw new Error('Expected both deterministic assignments to succeed.')
    }

    expect(lowResult.value.players.map((player) => player.role.roleId)).toEqual([
      ROLE_IDS.doctor,
      ROLE_IDS.doctor,
      ROLE_IDS.citizen,
      ROLE_IDS.godfather,
    ])
    expect(highResult.value.players.map((player) => player.role.roleId)).toEqual([
      ROLE_IDS.godfather,
      ROLE_IDS.doctor,
      ROLE_IDS.doctor,
      ROLE_IDS.citizen,
    ])
  })

  it('numbers three copies of two roles independently after a known shuffle', () => {
    const setup: ValidatedGameSetup = {
      participatingPlayers: Array.from({ length: 6 }, (_, index) => ({
        id: playerId(`same-name-${String(index + 1)}`),
        name: 'Alex',
        playing: true,
      })),
      roleCounts: [
        { roleId: ROLE_IDS.doctor, count: 3 },
        { roleId: ROLE_IDS.citizen, count: 3 },
      ],
      settings,
    }
    const result = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([
        1 - Number.EPSILON,
        1 - Number.EPSILON,
        1 - Number.EPSILON,
        1 - Number.EPSILON,
        1 - Number.EPSILON,
      ]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected duplicate role assignment to succeed.')
    }

    expect(result.value.players.map((player) => [player.role.roleId, player.role.ordinal])).toEqual(
      [
        [ROLE_IDS.doctor, 1],
        [ROLE_IDS.doctor, 2],
        [ROLE_IDS.doctor, 3],
        [ROLE_IDS.citizen, 1],
        [ROLE_IDS.citizen, 2],
        [ROLE_IDS.citizen, 3],
      ],
    )
  })

  it('creates a valid role-distribution game with only initial player state and copied settings', () => {
    const setup = setupWithPlayers(['Alex', 'Alex', 'Casey', 'Dana'])
    const result = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0.8, 0.4, 0.2]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected active game creation to succeed.')
    }

    expect(result.value).toMatchObject({
      id: 'game-1',
      phase: 'role-distribution',
      nightNumber: 0,
      dayNumber: 0,
      settings,
    })
    expect(result.value.settings).toEqual(setup.settings)
    expect(result.value.settings).not.toBe(setup.settings)
    expect(result.value.settings.godfatherAppearsSuspiciousToSheriff).toBe(false)
    expect(validateGameState(result.value)).toEqual({ ok: true, value: result.value })

    for (const player of result.value.players) {
      expect(player).toMatchObject({
        alive: true,
        publiclyRevealedRoleId: null,
      })
      expect(player).not.toHaveProperty('executionerTargetId')
      expect(player).not.toHaveProperty('personalWin')
    }

    expect(result.value.executionerTargets).toEqual([])
    expect(result.value.executionerBriefingStatus).toBe('not-started')
    expect(result.value).not.toHaveProperty('deaths')
    expect(result.value).not.toHaveProperty('trialVotes')
    expect(result.value).not.toHaveProperty('factionWinner')
    expect(result.value).not.toHaveProperty('nightActions')
  })

  it('never assigns a non-participating roster player from the validated Phase 2 value', () => {
    const participatingPlayers: readonly Player[] = [
      { id: playerId('playing'), name: 'Playing', playing: true },
    ]
    const setup: ValidatedGameSetup = {
      participatingPlayers,
      roleCounts: [{ roleId: ROLE_IDS.godfather, count: 1 }],
      settings,
    }
    const result = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0.5]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected the participating player to be assigned.')
    }

    expect(result.value.players.map((player) => player.playerId)).toEqual(['game-1-player-1'])
  })

  it('returns a structured domain rejection for a malformed non-participant boundary value', () => {
    const setup: ValidatedGameSetup = {
      participatingPlayers: [{ id: playerId('not-playing'), name: 'Not playing', playing: false }],
      roleCounts: [{ roleId: ROLE_IDS.godfather, count: 1 }],
      settings,
    }
    const result = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0.5]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'ACTIVE_GAME_REJECTED',
        error: { type: 'NON_PARTICIPATING_PLAYER', playerId: 'game-1-player-1' },
      },
    })
  })

  it('returns invalid random values as structured failures without using global randomness', () => {
    const setup = setupWithPlayers(['Alice', 'Bob', 'Casey', 'Dana'])
    let gameIdRequestCount = 0
    const sequentialIdentities = new SequentialRoleAssignmentIdentitySource()
    const trackingIdentitySource: RoleAssignmentIdentitySource = {
      nextGameId: () => {
        gameIdRequestCount += 1
        return sequentialIdentities.nextGameId()
      },
      nextRoleInstanceId: () => sequentialIdentities.nextRoleInstanceId(),
    }
    const globalRandom = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Global randomness must not be called.')
    })
    const invalidResult = assignRolesToValidatedSetup(setup, {
      randomSource: { next: () => 1 },
      identitySource: trackingIdentitySource,
    })
    const validResult = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0.5, 0.5, 0.5]),
      identitySource: new SequentialRoleAssignmentIdentitySource(),
    })

    expect(invalidResult).toEqual({
      ok: false,
      error: { type: 'INVALID_RANDOM_VALUE', value: 1 },
    })
    expect(gameIdRequestCount).toBe(0)
    expect(validResult.ok).toBe(true)
    expect(globalRandom).not.toHaveBeenCalled()
    globalRandom.mockRestore()
  })

  it('returns malformed and cross-kind identity values as structured failures', () => {
    const setup: ValidatedGameSetup = {
      participatingPlayers: [{ id: playerId('player-1'), name: 'Alice', playing: true }],
      roleCounts: [{ roleId: ROLE_IDS.godfather, count: 1 }],
      settings,
    }
    const invalidRoleId = roleInstanceId('   ')
    const invalidRoleResult = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0]),
      identitySource: {
        nextGameId: () => gameId('unused-game'),
        nextRoleInstanceId: () => invalidRoleId,
      },
    })
    const invalidGameId = gameId('')
    const invalidGameResult = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0]),
      identitySource: {
        nextGameId: () => invalidGameId,
        nextRoleInstanceId: () => roleInstanceId('valid-role'),
      },
    })
    const sharedIdentity = 'shared-identity'
    const crossKindResult = assignRolesToValidatedSetup(setup, {
      randomSource: new DeterministicRandomSource([0]),
      identitySource: {
        nextGameId: () => gameId(sharedIdentity),
        nextRoleInstanceId: () => roleInstanceId(sharedIdentity),
      },
    })

    expect(invalidRoleResult).toEqual({
      ok: false,
      error: {
        type: 'INVALID_IDENTIFIER',
        identityKind: 'role-instance',
        value: invalidRoleId,
      },
    })
    expect(invalidGameResult).toEqual({
      ok: false,
      error: { type: 'INVALID_IDENTIFIER', identityKind: 'game', value: invalidGameId },
    })
    expect(crossKindResult).toEqual({
      ok: false,
      error: {
        type: 'IDENTIFIER_COLLISION',
        identityKind: 'game',
        id: sharedIdentity,
      },
    })
  })

  it('rejects a role-instance identity that collides with a fresh match-player identity', () => {
    const setup: ValidatedGameSetup = {
      participatingPlayers: [{ id: playerId('setup-player'), name: 'Alice', playing: true }],
      roleCounts: [{ roleId: ROLE_IDS.godfather, count: 1 }],
      settings,
    }

    expect(
      assignRolesToValidatedSetup(setup, {
        randomSource: new DeterministicRandomSource([0]),
        identitySource: {
          nextGameId: () => gameId('fresh-game'),
          nextRoleInstanceId: () => roleInstanceId('fresh-game-player-1'),
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'IDENTIFIER_COLLISION',
        identityKind: 'player',
        id: 'fresh-game-player-1',
      },
    })
  })
})

function setupWithPlayers(names: readonly string[]): ValidatedGameSetup {
  return {
    participatingPlayers: names.map((name, index) => ({
      id: playerId(`player-${String(index + 1)}`),
      name,
      playing: true,
    })),
    roleCounts: [
      { roleId: ROLE_IDS.godfather, count: 1 },
      { roleId: ROLE_IDS.doctor, count: 2 },
      { roleId: ROLE_IDS.citizen, count: 1 },
    ],
    settings,
  }
}
