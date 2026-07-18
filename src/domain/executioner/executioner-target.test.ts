import { describe, expect, it } from 'vitest'

import type { GameState } from '../game/game-state.ts'
import { createGame, validateGameState } from '../game/game-invariants.ts'
import { gameId, playerId, roleInstanceId, type PlayerId, type RoleId } from '../identifiers.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import { finalizeRoleDistributionForFirstNight } from './executioner-target.ts'

const SETTINGS = {
  godfatherAndSerialCanKillEachOther: false,
  godfatherAppearsSuspiciousToSheriff: true,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: false,
  revealRoleOnDeath: false,
  allowFirstNightKills: false,
} as const

describe('Executioner target assignment', () => {
  it('skips briefing and randomness when the final distribution has no Executioner', () => {
    const game = createDistributionGame([ROLE_IDS.godfather, ROLE_IDS.citizen])
    let randomCalls = 0

    const result = finalizeRoleDistributionForFirstNight(game, true, {
      next: () => {
        randomCalls += 1
        return 0
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected the no-Executioner game to start Night 1.')
    expect(result.value).toMatchObject({
      phase: 'night-action-collection',
      nightNumber: 1,
      dayNumber: 0,
      executionerBriefingStatus: 'not-required',
      executionerTargets: [],
    })
    expect(randomCalls).toBe(0)
  })

  it('selects only from the canonical participating Town list', () => {
    const game = createDistributionGame([
      ROLE_IDS.godfather,
      ROLE_IDS.jester,
      ROLE_IDS.citizen,
      ROLE_IDS.executioner,
      ROLE_IDS.sheriff,
      ROLE_IDS.serialKiller,
    ])

    const result = finalizeRoleDistributionForFirstNight(game, true, { next: () => 0.5 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected target assignment to succeed.')
    expect(result.value.executionerTargets).toEqual([
      {
        gameId: 'target-test-game',
        executionerPlayerId: 'player-4',
        executionerRoleInstanceId: 'role-4',
        targetPlayerId: 'player-5',
      },
    ])
    expect(result.value.phase).toBe('executioner-briefing')
    expect(result.value.executionerBriefingStatus).toBe('pending')
    expect(result.value.players).toEqual(game.players)
    expect(result.value.settings).toEqual(game.settings)
    expect(result.value.dayNumber).toBe(0)
  })

  it('assigns every duplicate Executioner independently and permits a shared target', () => {
    const game = createDistributionGame([
      ROLE_IDS.executioner,
      ROLE_IDS.citizen,
      ROLE_IDS.executioner,
      ROLE_IDS.godfather,
    ])
    let randomCalls = 0

    const result = finalizeRoleDistributionForFirstNight(game, true, {
      next: () => {
        randomCalls += 1
        return 0
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected duplicate Executioner assignment to succeed.')
    expect(result.value.executionerTargets).toEqual([
      {
        gameId: 'target-test-game',
        executionerPlayerId: 'player-1',
        executionerRoleInstanceId: 'role-1',
        targetPlayerId: 'player-2',
      },
      {
        gameId: 'target-test-game',
        executionerPlayerId: 'player-3',
        executionerRoleInstanceId: 'role-3',
        targetPlayerId: 'player-2',
      },
    ])
    expect(randomCalls).toBe(2)
  })

  it('uses one validated random value per Executioner against the full Town list', () => {
    const game = createDistributionGame([
      ROLE_IDS.executioner,
      ROLE_IDS.citizen,
      ROLE_IDS.executioner,
      ROLE_IDS.sheriff,
      ROLE_IDS.godfather,
    ])
    const values = [0, 1 - Number.EPSILON]
    let nextIndex = 0

    const result = finalizeRoleDistributionForFirstNight(game, true, {
      next: () => values[nextIndex++] ?? Number.NaN,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected deterministic target assignment to succeed.')
    expect(result.value.executionerTargets.map((target) => target.targetPlayerId)).toEqual([
      'player-2',
      'player-4',
    ])
    expect(nextIndex).toBe(2)
  })

  it.each([-0.01, Number.NEGATIVE_INFINITY, 1, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects malformed random output %s without clamping it',
    (value) => {
      const result = finalizeRoleDistributionForFirstNight(
        createDistributionGame([ROLE_IDS.executioner, ROLE_IDS.citizen]),
        true,
        { next: () => value },
      )

      expect(result).toEqual({
        ok: false,
        error: { type: 'INVALID_EXECUTIONER_RANDOM_OUTPUT', value },
      })
    },
  )

  it('discards every local target when a later random sample fails and resamples on retry', () => {
    const game = createDistributionGame([
      ROLE_IDS.executioner,
      ROLE_IDS.citizen,
      ROLE_IDS.executioner,
      ROLE_IDS.sheriff,
      ROLE_IDS.godfather,
    ])
    const samples = [0, 1, 1 - Number.EPSILON, 0]
    let sampleIndex = 0
    const randomSource = {
      next: () => samples[sampleIndex++] ?? Number.NaN,
    }

    const failed = finalizeRoleDistributionForFirstNight(game, true, randomSource)

    expect(failed).toEqual({
      ok: false,
      error: { type: 'INVALID_EXECUTIONER_RANDOM_OUTPUT', value: 1 },
    })
    expect(game.executionerTargets).toEqual([])
    expect(game.executionerBriefingStatus).toBe('not-started')
    expect(game.phase).toBe('role-distribution')

    const retried = finalizeRoleDistributionForFirstNight(game, true, randomSource)
    expect(retried.ok).toBe(true)
    if (!retried.ok) throw new Error('Expected a fresh retry to assign both targets.')
    expect(retried.value.executionerTargets.map((target) => target.targetPlayerId)).toEqual([
      'player-4',
      'player-2',
    ])
    expect(sampleIndex).toBe(4)
  })

  it('rejects the wrong phase, unfinalized distribution, and stale targets before randomness', () => {
    const game = createDistributionGame([ROLE_IDS.executioner, ROLE_IDS.citizen])
    let randomCalls = 0
    const randomSource = {
      next: () => {
        randomCalls += 1
        return 0
      },
    }
    const wrongPhase = { ...game, phase: 'setup' as const }
    const staleTarget = {
      gameId: game.id,
      executionerPlayerId: playerId('player-1'),
      executionerRoleInstanceId: roleInstanceId('role-1'),
      targetPlayerId: playerId('player-2'),
    }

    expect(finalizeRoleDistributionForFirstNight(wrongPhase, true, randomSource)).toEqual({
      ok: false,
      error: { type: 'WRONG_EXECUTIONER_ASSIGNMENT_PHASE', currentPhase: 'setup' },
    })
    expect(finalizeRoleDistributionForFirstNight(game, false, randomSource)).toEqual({
      ok: false,
      error: { type: 'DISTRIBUTION_NOT_FINALIZED' },
    })
    expect(
      finalizeRoleDistributionForFirstNight(
        { ...game, executionerTargets: [staleTarget] },
        true,
        randomSource,
      ),
    ).toEqual({ ok: false, error: { type: 'EXISTING_EXECUTIONER_TARGETS' } })
    expect(randomCalls).toBe(0)
  })

  it('rejects a dead Executioner and an impossible no-Town distribution defensively', () => {
    const deadGame = createDistributionGame([ROLE_IDS.executioner, ROLE_IDS.citizen])
    const deadExecutioner = {
      ...deadGame,
      players: deadGame.players.map((player) =>
        player.role.roleId === ROLE_IDS.executioner ? { ...player, alive: false } : player,
      ),
    }
    const noTownGame = createDistributionGame([ROLE_IDS.executioner, ROLE_IDS.godfather])

    expect(finalizeRoleDistributionForFirstNight(deadExecutioner, true, { next: () => 0 })).toEqual(
      {
        ok: false,
        error: {
          type: 'DEAD_EXECUTIONER_BEFORE_ASSIGNMENT',
          executionerPlayerId: 'player-1',
          executionerRoleInstanceId: 'role-1',
        },
      },
    )
    expect(finalizeRoleDistributionForFirstNight(noTownGame, true, { next: () => 0 })).toEqual({
      ok: false,
      error: { type: 'NO_ELIGIBLE_TOWN_TARGETS' },
    })
  })

  it('leaves frozen input unchanged and returns a deeply immutable result', () => {
    const game = deepFreeze(
      createDistributionGame([ROLE_IDS.executioner, ROLE_IDS.citizen, ROLE_IDS.godfather]),
    )
    const snapshot = JSON.stringify(game)

    const result = finalizeRoleDistributionForFirstNight(game, true, { next: () => 0 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected frozen input to be supported.')
    expect(JSON.stringify(game)).toBe(snapshot)
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.executionerTargets)).toBe(true)
    expect(Object.isFrozen(result.value.executionerTargets[0])).toBe(true)
    expect(Object.isFrozen(result.value.players)).toBe(true)
    expect(Object.isFrozen(result.value.players[0])).toBe(true)
    expect(Object.isFrozen(result.value.players[0]?.role)).toBe(true)
  })
})

describe('Executioner target invariants', () => {
  it('requires one target per Executioner after the assignment boundary', () => {
    const game = assignedGame()
    const executioner = game.players.find((player) => player.role.roleId === ROLE_IDS.executioner)
    if (executioner === undefined) throw new Error('Expected an Executioner fixture player.')

    expect(validateGameState({ ...game, executionerTargets: [] })).toEqual({
      ok: false,
      error: {
        type: 'MISSING_EXECUTIONER_TARGET',
        executionerPlayerId: executioner.playerId,
        executionerRoleInstanceId: executioner.role.instanceId,
      },
    })
  })

  it('rejects duplicate owners while allowing duplicate Executioners to share a target', () => {
    const game = assignedGame([
      ROLE_IDS.executioner,
      ROLE_IDS.citizen,
      ROLE_IDS.executioner,
      ROLE_IDS.godfather,
    ])
    expect(validateGameState(game).ok).toBe(true)

    const firstTarget = game.executionerTargets[0]
    if (firstTarget === undefined) throw new Error('Expected a target fixture.')
    const duplicateOwner = {
      ...firstTarget,
      targetPlayerId: playerId('player-2'),
    }

    expect(
      validateGameState({
        ...game,
        executionerTargets: [firstTarget, duplicateOwner, game.executionerTargets[1]],
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'DUPLICATE_EXECUTIONER_TARGET',
        executionerRoleInstanceId: firstTarget.executionerRoleInstanceId,
      },
    })
  })

  it('rejects unknown owners, role instances, targets, and cross-game records', () => {
    const game = assignedGame()
    const target = requireTarget(game)
    const cases = [
      {
        target: { ...target, executionerPlayerId: playerId('unknown-owner') },
        error: { type: 'UNKNOWN_EXECUTIONER_PLAYER', executionerPlayerId: 'unknown-owner' },
      },
      {
        target: {
          ...target,
          executionerRoleInstanceId: roleInstanceId('unknown-role-instance'),
        },
        error: {
          type: 'UNKNOWN_EXECUTIONER_ROLE_INSTANCE',
          executionerRoleInstanceId: 'unknown-role-instance',
        },
      },
      {
        target: { ...target, targetPlayerId: playerId('unknown-target') },
        error: {
          type: 'UNKNOWN_EXECUTIONER_TARGET_PLAYER',
          targetPlayerId: 'unknown-target',
        },
      },
      {
        target: { ...target, gameId: gameId('another-game') },
        error: {
          type: 'EXECUTIONER_TARGET_GAME_MISMATCH',
          expectedGameId: 'target-test-game',
          actualGameId: 'another-game',
        },
      },
    ] as const

    for (const testCase of cases) {
      expect(validateGameState({ ...game, executionerTargets: [testCase.target] })).toEqual({
        ok: false,
        error: testCase.error,
      })
    }
  })

  it('rejects a non-Town target, a mismatched owner role, and a non-Executioner owner', () => {
    const game = assignedGame([ROLE_IDS.executioner, ROLE_IDS.citizen, ROLE_IDS.godfather])
    const target = requireTarget(game)
    const mafia = game.players[2]
    const town = game.players[1]
    if (mafia === undefined || town === undefined) throw new Error('Expected fixture players.')

    expect(
      validateGameState({
        ...game,
        executionerTargets: [{ ...target, targetPlayerId: mafia.playerId }],
      }),
    ).toEqual({
      ok: false,
      error: { type: 'INELIGIBLE_EXECUTIONER_TARGET', targetPlayerId: mafia.playerId },
    })
    expect(
      validateGameState({
        ...game,
        executionerTargets: [
          {
            ...target,
            executionerRoleInstanceId: town.role.instanceId,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'EXECUTIONER_ROLE_INSTANCE_MISMATCH',
        executionerPlayerId: target.executionerPlayerId,
        executionerRoleInstanceId: town.role.instanceId,
        actualRoleInstanceId: target.executionerRoleInstanceId,
      },
    })
    expect(
      validateGameState({
        ...game,
        executionerTargets: [
          {
            ...target,
            executionerPlayerId: town.playerId,
            executionerRoleInstanceId: town.role.instanceId,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'NON_EXECUTIONER_TARGET_OWNER',
        executionerPlayerId: town.playerId,
        executionerRoleInstanceId: town.role.instanceId,
      },
    })
  })

  it.each([
    ['gameId', ''],
    ['executionerPlayerId', '   '],
    ['executionerRoleInstanceId', ''],
    ['targetPlayerId', '   '],
  ] as const)('rejects a blank %s without trimming it into authority', (field, value) => {
    const game = assignedGame()
    const target = requireTarget(game)

    expect(
      validateGameState({
        ...game,
        executionerTargets: [{ ...target, [field]: value }],
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_EXECUTIONER_TARGET_RECORD',
        index: 0,
        field,
        value,
      },
    })
  })

  it('rejects targets before finalization and strips extra runtime properties from records', () => {
    const distribution = createDistributionGame([ROLE_IDS.executioner, ROLE_IDS.citizen])
    const staleTarget = {
      gameId: distribution.id,
      executionerPlayerId: playerId('player-1'),
      executionerRoleInstanceId: roleInstanceId('role-1'),
      targetPlayerId: playerId('player-2'),
    }
    expect(validateGameState({ ...distribution, executionerTargets: [staleTarget] })).toEqual({
      ok: false,
      error: { type: 'EXECUTIONER_TARGETS_BEFORE_FINALIZATION' },
    })

    const game = assignedGame()
    const target = requireTarget(game)
    const result = validateGameState({
      ...game,
      executionerTargets: [{ ...target, targetRoleId: ROLE_IDS.citizen, displayName: 'Secret' }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected extra target properties to be ignored.')
    expect(result.value.executionerTargets[0]).toEqual(target)
    expect(result.value.executionerTargets[0]).not.toHaveProperty('targetRoleId')
    expect(result.value.executionerTargets[0]).not.toHaveProperty('displayName')
  })

  it('retains historical targets when the Executioner or original Town target is dead', () => {
    const game = assignedGame()
    const target = requireTarget(game)

    for (const deadPlayerId of [target.executionerPlayerId, target.targetPlayerId]) {
      const result = validateGameState({
        ...game,
        phase: 'dawn-announcement',
        executionerBriefingStatus: 'completed',
        players: game.players.map((player) =>
          player.playerId === deadPlayerId ? { ...player, alive: false } : player,
        ),
      })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('Expected a dead player to retain the historical target.')
      expect(result.value.executionerTargets).toEqual(game.executionerTargets)
    }
  })
})

function createDistributionGame(
  roleIds: readonly RoleId[],
  playerIds: readonly PlayerId[] = roleIds.map((_roleId, index) =>
    playerId(`player-${String(index + 1)}`),
  ),
): GameState {
  const counts = new Map<RoleId, number>()
  for (const selectedRoleId of roleIds) {
    counts.set(selectedRoleId, (counts.get(selectedRoleId) ?? 0) + 1)
  }
  const nextOrdinals = new Map<RoleId, number>()
  const players = roleIds.map((selectedRoleId, index) => {
    const duplicateCount = counts.get(selectedRoleId) ?? 0
    const ordinal = duplicateCount > 1 ? (nextOrdinals.get(selectedRoleId) ?? 0) + 1 : null
    if (ordinal !== null) nextOrdinals.set(selectedRoleId, ordinal)

    return {
      playerId: playerIds[index] ?? playerId(`missing-player-${String(index + 1)}`),
      role: {
        instanceId: roleInstanceId(`role-${String(index + 1)}`),
        roleId: selectedRoleId,
        ordinal,
      },
      alive: true,
      publiclyRevealedRoleId: null,
      mayorRevealed: false,
    }
  })
  const roleDefinitions = [...new Set(roleIds)].map((selectedRoleId) => {
    const role = findRoleDefinition(selectedRoleId)
    if (role === undefined) throw new Error(`Unknown fixture role ${selectedRoleId}.`)
    return { id: role.id, name: role.name, faction: role.faction }
  })
  const roster = players.map((player, index) => ({
    id: player.playerId,
    name: `Player ${String(index + 1)}`,
    playing: true,
  }))
  const result = createGame({
    id: gameId('target-test-game'),
    roster,
    players,
    roleDefinitions,
    settings: SETTINGS,
  })
  if (!result.ok) {
    throw new Error(`Expected target fixture game: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

function assignedGame(
  roles: readonly RoleId[] = [ROLE_IDS.executioner, ROLE_IDS.citizen],
): GameState {
  const result = finalizeRoleDistributionForFirstNight(createDistributionGame(roles), true, {
    next: () => 0,
  })
  if (!result.ok) {
    throw new Error(`Expected assigned target fixture: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

function requireTarget(game: GameState) {
  const target = game.executionerTargets[0]
  if (target === undefined) throw new Error('Expected an Executioner target fixture.')
  return target
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
