import { describe, expect, it } from 'vitest'

import {
  createNightFixture,
  nightFixturePlayerId,
} from '../../../tests/support/night-action-fixtures.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import {
  isExecutionerRoleInstanceConverted,
  selectActiveRoleId,
} from '../neutral/executioner-conversion.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { endDayWithoutExecution, executePlayerDuringDay } from './day-outcome.ts'

function dayGame(
  roles: Parameters<typeof createNightFixture>[0],
  revealRoleOnDeath = false,
): GameState {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
    settings: { revealRoleOnDeath },
  })
  return { ...fixture.game, dayNumber: 1 }
}

describe('final day outcome', () => {
  it('executes one living player atomically with an explicit cause and configured reveal', () => {
    const game = dayGame(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.mayor }],
      true,
    )
    const original = JSON.stringify(game)
    const executed = game.players[1]
    if (executed === undefined) throw new Error('Expected an execution player.')

    const result = executePlayerDuringDay(game, executed.playerId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected execution: ${result.error.type}`)
    expect(result.value).toMatchObject({
      phase: 'execution-resolution',
      nightNumber: 1,
      dayNumber: 1,
      dayOutcomes: [
        {
          kind: 'player-executed',
          gameId: game.id,
          dayNumber: 1,
          playerId: executed.playerId,
        },
      ],
    })
    expect(result.value.players[1]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: ROLE_IDS.citizen,
    })
    expect(result.value.deathRecords).toContainEqual({
      gameId: game.id,
      playerId: executed.playerId,
      roleInstanceId: executed.role.instanceId,
      cause: { kind: 'day-execution', dayNumber: 1 },
    })
    expect(result.value.players[0]).toEqual(game.players[0])
    expect(result.value.players[2]).toEqual(game.players[2])
    expect(result.value.personalWins).toEqual([])
    expect(result.value.pendingJesterRevenges).toEqual([])
    expect(result.value.executionerConversions).toEqual([])
    expect(result.value.settings).toEqual(game.settings)
    expect(result.value.doctorPreviousTargets).toEqual(game.doctorPreviousTargets)
    expect(JSON.stringify(game)).toBe(original)
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.deathRecords[0])).toBe(true)
  })

  it('preserves an earlier Mayor reveal even when death reveals are disabled', () => {
    const game = dayGame([{ roleId: ROLE_IDS.mayor }, { roleId: ROLE_IDS.godfather }])
    const mayor = game.players[0]
    if (mayor === undefined) throw new Error('Expected a Mayor.')
    const revealedGame: GameState = {
      ...game,
      players: game.players.map((player) =>
        player.playerId === mayor.playerId
          ? { ...player, publiclyRevealedRoleId: ROLE_IDS.mayor }
          : player,
      ),
    }

    const result = executePlayerDuringDay(revealedGame, mayor.playerId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected revealed Mayor execution.')
    expect(result.value.players[0]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: ROLE_IDS.mayor,
    })
  })

  it('records one Jester win and one victim-free pending revenge', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.citizen },
    ])
    const jester = game.players[0]
    if (jester === undefined) throw new Error('Expected a Jester.')

    const result = executePlayerDuringDay(game, jester.playerId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected Jester execution.')
    expect(result.value.personalWins).toEqual([
      {
        kind: 'jester-executed',
        gameId: game.id,
        playerId: jester.playerId,
        roleInstanceId: jester.role.instanceId,
        dayNumber: 1,
      },
    ])
    expect(result.value.pendingJesterRevenges).toEqual([
      {
        id: `jester-revenge:1:${jester.role.instanceId}`,
        gameId: game.id,
        jesterPlayerId: jester.playerId,
        jesterRoleInstanceId: jester.role.instanceId,
        triggeredOnDay: 1,
        status: 'pending',
      },
    ])
    expect(result.value.pendingJesterRevenges[0]).not.toHaveProperty('victimPlayerId')
    expect(result.value.players.filter((player) => !player.alive)).toHaveLength(1)
  })

  it('awards every shared-target Executioner, including a dead owner, without conversion', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.executioner, alive: false },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.godfather },
    ])
    const target = game.players[2]
    if (target === undefined) throw new Error('Expected the shared target.')

    const result = executePlayerDuringDay(game, target.playerId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected target execution.')
    expect(result.value.personalWins).toEqual(
      game.executionerTargets.map((relationship) => ({
        kind: 'executioner-target-executed',
        gameId: game.id,
        playerId: relationship.executionerPlayerId,
        roleInstanceId: relationship.executionerRoleInstanceId,
        targetPlayerId: target.playerId,
        dayNumber: 1,
      })),
    )
    expect(result.value.executionerConversions).toEqual([])
  })

  it('derives shared-target night-death conversions once for living and dead owners', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.executioner, alive: false },
      { roleId: ROLE_IDS.citizen, alive: false },
      { roleId: ROLE_IDS.godfather },
    ])

    expect(game.executionerConversions).toHaveLength(2)
    for (const relationship of game.executionerTargets) {
      expect(isExecutionerRoleInstanceConverted(game, relationship.executionerRoleInstanceId)).toBe(
        true,
      )
      expect(selectActiveRoleId(game, relationship.executionerPlayerId)).toBe(ROLE_IDS.jester)
    }
    expect(game.players[0]?.role.roleId).toBe(ROLE_IDS.executioner)
    expect(game.players[1]?.role.roleId).toBe(ROLE_IDS.executioner)

    const noExecution = endDayWithoutExecution(game)
    expect(noExecution.ok).toBe(true)
    if (!noExecution.ok) throw new Error('Expected no-execution completion.')
    expect(noExecution.value.executionerConversions).toEqual(game.executionerConversions)
    expect(noExecution.value.personalWins).toEqual([])
    expect(noExecution.value.pendingJesterRevenges).toEqual([])
  })

  it('lets a converted living Executioner qualify as Jester while preserving assignment identity', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.citizen, alive: false },
      { roleId: ROLE_IDS.godfather },
    ])
    const converted = game.players[0]
    if (converted === undefined) throw new Error('Expected a converted Executioner.')

    const result = executePlayerDuringDay(game, converted.playerId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected converted Jester execution.')
    expect(result.value.players[0]?.role).toEqual(converted.role)
    expect(result.value.players[0]?.role.roleId).toBe(ROLE_IDS.executioner)
    expect(result.value.personalWins).toContainEqual({
      kind: 'jester-executed',
      gameId: game.id,
      playerId: converted.playerId,
      roleInstanceId: converted.role.instanceId,
      dayNumber: 1,
    })
    expect(result.value.pendingJesterRevenges).toHaveLength(1)
  })

  it('records no execution without changing players or creating neutral effects', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.godfather },
    ])

    const result = endDayWithoutExecution(game)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected no-execution completion.')
    expect(result.value.phase).toBe('execution-resolution')
    expect(result.value.dayOutcomes).toEqual([
      {
        kind: 'no-execution',
        gameId: game.id,
        dayNumber: 1,
      },
    ])
    expect(result.value.players).toEqual(game.players)
    expect(result.value.deathRecords).toEqual(game.deathRecords)
    expect(result.value.personalWins).toEqual([])
    expect(result.value.pendingJesterRevenges).toEqual([])
  })

  it('rejects wrong-phase, unknown, dead, and repeated completion without mutation', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.mayor, alive: false },
    ])
    const dead = game.players[2]
    if (dead === undefined) throw new Error('Expected a dead player.')
    const original = JSON.stringify(game)

    expect(
      executePlayerDuringDay(
        { ...game, phase: 'dawn-announcement', dayNumber: 0 },
        game.players[0]?.playerId ?? nightFixturePlayerId('missing'),
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_DAY_OUTCOME_PHASE' },
    })
    expect(executePlayerDuringDay(game, nightFixturePlayerId('unknown-player'))).toMatchObject({
      ok: false,
      error: { type: 'NON_PARTICIPATING_EXECUTION_PLAYER' },
    })
    expect(executePlayerDuringDay(game, dead.playerId)).toMatchObject({
      ok: false,
      error: { type: 'DEAD_EXECUTION_PLAYER' },
    })

    const completed = endDayWithoutExecution(game)
    if (!completed.ok) throw new Error('Expected initial day completion.')
    expect(endDayWithoutExecution(completed.value)).toEqual({
      ok: false,
      error: { type: 'DAY_OUTCOME_ALREADY_RECORDED' },
    })
    expect(JSON.stringify(game)).toBe(original)
  })
})

describe('Phase 7C outcome invariants', () => {
  it('rejects a missing cause, forged Jester win, and missing revenge', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.citizen },
    ])
    const jester = game.players[0]
    if (jester === undefined) throw new Error('Expected a Jester.')
    const execution = executePlayerDuringDay(game, jester.playerId)
    if (!execution.ok) throw new Error('Expected Jester execution.')

    expect(validateGameState({ ...execution.value, deathRecords: [] })).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_DEATH_RECORDS',
        reason: 'missing-dead-player',
      },
    })
    expect(
      validateGameState({
        ...execution.value,
        personalWins: execution.value.personalWins.map((win) => ({
          ...win,
          publicLabel: 'Jester won',
        })),
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_PERSONAL_WINS', reason: 'invalid-record' },
    })
    expect(validateGameState({ ...execution.value, pendingJesterRevenges: [] })).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PENDING_JESTER_REVENGES',
        reason: 'missing-required-revenge',
      },
    })
  })

  it('rejects a death that omits the configured public role reveal', () => {
    const game = dayGame([{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather }], true)
    const citizen = game.players[0]
    if (citizen === undefined) throw new Error('Expected a Citizen.')
    const execution = executePlayerDuringDay(game, citizen.playerId)
    if (!execution.ok) throw new Error('Expected Citizen execution.')

    expect(
      validateGameState({
        ...execution.value,
        players: execution.value.players.map((player) =>
          player.playerId === citizen.playerId
            ? { ...player, publiclyRevealedRoleId: null }
            : player,
        ),
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_DEATH_RECORDS',
        reason: 'public-reveal-mismatch',
      },
    })
  })

  it('rejects duplicate neutral effects and execution/conversion contradictions', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.godfather },
    ])
    const target = game.players[1]
    const relationship = game.executionerTargets[0]
    if (target === undefined || relationship === undefined) {
      throw new Error('Expected an Executioner target.')
    }
    const execution = executePlayerDuringDay(game, target.playerId)
    if (!execution.ok) throw new Error('Expected target execution.')
    const win = execution.value.personalWins[0]
    if (win === undefined) throw new Error('Expected an Executioner win.')

    expect(
      validateGameState({
        ...execution.value,
        personalWins: [win, win],
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_PERSONAL_WINS', reason: 'duplicate-record' },
    })
    expect(
      validateGameState({
        ...execution.value,
        executionerConversions: [
          {
            kind: 'executioner-to-jester',
            gameId: game.id,
            playerId: relationship.executionerPlayerId,
            roleInstanceId: relationship.executionerRoleInstanceId,
            targetPlayerId: relationship.targetPlayerId,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_EXECUTIONER_CONVERSIONS',
        reason: 'target-executed',
      },
    })
    expect(
      validateGameState({
        ...execution.value,
        dayOutcomes: [
          {
            kind: 'no-execution',
            gameId: game.id,
            dayNumber: 1,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_DAY_OUTCOMES',
        reason: 'no-execution-with-execution-death',
      },
    })
  })
})
