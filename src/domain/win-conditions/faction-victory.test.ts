import { describe, expect, it } from 'vitest'

import { endDayWithoutExecution, executePlayerDuringDay } from '../day/day-outcome.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId } from '../identifiers.ts'
import { createPendingJesterRevengeId } from '../neutral/jester-revenge-identity.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createNightFixture,
  type NightFixtureRole,
} from '../../../tests/support/night-action-fixtures.ts'
import {
  evaluateFactionVictory,
  finalizeFactionVictory,
  validateFactionVictoryEvaluationGate,
  validateStoredTerminalFactionResult,
} from './faction-victory.ts'

function completeDay(roles: readonly NightFixtureRole[], executedIndex?: number): GameState {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
  })
  const dayGame = { ...fixture.game, dayNumber: 1 }
  const result =
    executedIndex === undefined
      ? endDayWithoutExecution(dayGame)
      : executePlayerDuringDay(
          dayGame,
          dayGame.players[executedIndex]?.playerId ??
            dayGame.players[0]?.playerId ??
            ('' as PlayerId),
        )
  if (!result.ok) {
    throw new Error(`Could not complete fixture day: ${result.error.type}`)
  }
  return result.value
}

function requireEvaluation(game: GameState) {
  const result = evaluateFactionVictory(game)
  if (!result.ok) {
    throw new Error(`Could not evaluate fixture: ${result.error.type}`)
  }
  return result.value
}

describe('faction victory evaluation', () => {
  it.each([
    {
      name: 'living original Jester',
      roles: [{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.jester }],
    },
    {
      name: 'living original Executioner',
      roles: [{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.executioner }],
    },
    {
      name: 'living converted Jester',
      roles: [
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen, alive: false },
        { roleId: ROLE_IDS.citizen },
      ],
    },
    {
      name: 'duplicate Town roles',
      roles: [
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.mayor },
      ],
    },
  ] satisfies readonly { name: string; roles: readonly NightFixtureRole[] }[])(
    'awards Town with hostile factions eliminated despite $name',
    ({ roles }) => {
      expect(requireEvaluation(completeDay(roles))).toEqual({
        kind: 'town-victory',
        gameId: 'night-fixture-game',
      })
    },
  )

  it.each([
    {
      name: 'living Mafia',
      roles: [{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather }],
    },
    {
      name: 'living Serial Killer',
      roles: [
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
    },
    {
      name: 'zero living Town',
      roles: [{ roleId: ROLE_IDS.citizen, alive: false }, { roleId: ROLE_IDS.jester }],
    },
  ] satisfies readonly { name: string; roles: readonly NightFixtureRole[] }[])(
    'does not award Town with $name',
    ({ roles }) => {
      expect(requireEvaluation(completeDay(roles)).kind).not.toBe('town-victory')
    },
  )

  it('uses exact Mafia parity against Town, excludes a living Executioner, and needs no Godfather', () => {
    const game = completeDay([
      { roleId: ROLE_IDS.framer },
      { roleId: ROLE_IDS.consort },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.mayor },
      { roleId: ROLE_IDS.executioner },
    ])
    const result = requireEvaluation(game)
    expect(result).toEqual({
      kind: 'mafia-victory',
      gameId: game.id,
      winnerPlayerIds: [game.players[0]?.playerId, game.players[1]?.playerId],
    })
    expect(game.personalWins).toEqual([])
  })

  it.each([
    {
      name: 'Mafia below Town parity',
      roles: [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
    },
    {
      name: 'a living Serial Killer',
      roles: [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.serialKiller },
      ],
    },
    {
      name: 'multiple living Serial Killers',
      roles: [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.serialKiller },
      ],
    },
    {
      name: 'a living Jester',
      roles: [
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.mayor },
        { roleId: ROLE_IDS.jester },
      ],
    },
    {
      name: 'a living converted Jester',
      roles: [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen, alive: false },
      ],
    },
  ] satisfies readonly { name: string; roles: readonly NightFixtureRole[] }[])(
    'does not award Mafia with $name',
    ({ roles }) => {
      expect(requireEvaluation(completeDay(roles)).kind).toBe('none')
    },
  )

  it('awards Serial Killer only as the sole survivor and records that stable identity', () => {
    const game = completeDay([
      { roleId: ROLE_IDS.serialKiller },
      { roleId: ROLE_IDS.citizen, alive: false },
      { roleId: ROLE_IDS.godfather, alive: false },
    ])
    expect(requireEvaluation(game)).toEqual({
      kind: 'serial-killer-victory',
      gameId: game.id,
      winnerPlayerIds: [game.players[0]?.playerId],
    })
  })

  it.each([
    {
      name: 'living Town',
      roles: [{ roleId: ROLE_IDS.serialKiller }, { roleId: ROLE_IDS.citizen }],
    },
    {
      name: 'living neutral',
      roles: [{ roleId: ROLE_IDS.serialKiller }, { roleId: ROLE_IDS.jester }],
    },
    {
      name: 'living converted Jester',
      roles: [
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen, alive: false },
      ],
    },
    {
      name: 'multiple living Serial Killers',
      roles: [{ roleId: ROLE_IDS.serialKiller }, { roleId: ROLE_IDS.serialKiller }],
    },
    {
      name: 'only a dead Serial Killer',
      roles: [{ roleId: ROLE_IDS.serialKiller, alive: false }, { roleId: ROLE_IDS.jester }],
    },
  ] satisfies readonly { name: string; roles: readonly NightFixtureRole[] }[])(
    'does not award Serial Killer with $name',
    ({ roles }) => {
      expect(requireEvaluation(completeDay(roles)).kind).toBe('none')
    },
  )

  it('uses only the documented no-survivors draw and leaves neutral-only survival non-terminal', () => {
    expect(
      requireEvaluation(
        completeDay([
          { roleId: ROLE_IDS.citizen, alive: false },
          { roleId: ROLE_IDS.godfather, alive: false },
        ]),
      ),
    ).toEqual({ kind: 'draw', gameId: 'night-fixture-game', reason: 'no-survivors' })

    expect(
      requireEvaluation(
        completeDay([{ roleId: ROLE_IDS.jester }, { roleId: ROLE_IDS.citizen, alive: false }]),
      ).kind,
    ).toBe('none')
  })

  it('blocks all evaluation before predicates when revenge is pending and preserves authority', () => {
    const game = completeDay(
      [{ roleId: ROLE_IDS.jester }, { roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      0,
    )
    const snapshot = JSON.stringify(game)

    expect(validateFactionVictoryEvaluationGate(game)).toEqual({
      ok: false,
      error: { type: 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY' },
    })
    expect(evaluateFactionVictory(game)).toEqual({
      ok: false,
      error: { type: 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY' },
    })
    expect(JSON.stringify(game)).toBe(snapshot)
    expect(game.pendingJesterRevenges).toHaveLength(1)
    expect(game.personalWins).toHaveLength(1)
    expect(game.deathRecords).toHaveLength(1)
    expect(game.phase).toBe('execution-resolution')
  })

  it('defers a no-survivors state while revenge is still pending instead of deriving a draw', () => {
    const game = completeDay(
      [
        { roleId: ROLE_IDS.jester },
        { roleId: ROLE_IDS.citizen, alive: false },
        { roleId: ROLE_IDS.godfather, alive: false },
      ],
      0,
    )

    expect(game.players.every((player) => !player.alive)).toBe(true)
    expect(evaluateFactionVictory(game)).toEqual({
      ok: false,
      error: { type: 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY' },
    })
  })

  it('rejects an impossible accumulated revenge obligation before victory evaluation', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.jester, alive: false },
        { roleId: ROLE_IDS.jester, alive: false },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'execution-resolution', nightNumber: 2 },
    )
    const firstJester = fixture.game.players[0]
    const secondJester = fixture.game.players[1]
    if (firstJester === undefined || secondJester === undefined) {
      throw new Error('Expected duplicate Jesters.')
    }
    const game: GameState = {
      ...fixture.game,
      dayNumber: 2,
      deathRecords: [
        {
          gameId: fixture.game.id,
          playerId: firstJester.playerId,
          roleInstanceId: firstJester.role.instanceId,
          cause: { kind: 'day-execution', dayNumber: 1 },
        },
        {
          gameId: fixture.game.id,
          playerId: secondJester.playerId,
          roleInstanceId: secondJester.role.instanceId,
          cause: { kind: 'day-execution', dayNumber: 2 },
        },
      ],
      personalWins: [
        {
          kind: 'jester-executed',
          gameId: fixture.game.id,
          playerId: firstJester.playerId,
          roleInstanceId: firstJester.role.instanceId,
          dayNumber: 1,
        },
        {
          kind: 'jester-executed',
          gameId: fixture.game.id,
          playerId: secondJester.playerId,
          roleInstanceId: secondJester.role.instanceId,
          dayNumber: 2,
        },
      ],
      pendingJesterRevenges: [
        {
          id: createPendingJesterRevengeId(firstJester.role.instanceId, 1),
          gameId: fixture.game.id,
          jesterPlayerId: firstJester.playerId,
          jesterRoleInstanceId: firstJester.role.instanceId,
          triggeredOnDay: 1,
          status: 'pending',
        },
        {
          id: createPendingJesterRevengeId(secondJester.role.instanceId, 2),
          gameId: fixture.game.id,
          jesterPlayerId: secondJester.playerId,
          jesterRoleInstanceId: secondJester.role.instanceId,
          triggeredOnDay: 2,
          status: 'pending',
        },
      ],
      jesterRevengeResolutions: [],
      dayOutcomes: [
        {
          kind: 'player-executed',
          gameId: fixture.game.id,
          dayNumber: 1,
          playerId: firstJester.playerId,
        },
        {
          kind: 'player-executed',
          gameId: fixture.game.id,
          dayNumber: 2,
          playerId: secondJester.playerId,
        },
      ],
    }

    expect(evaluateFactionVictory(game)).toEqual({
      ok: false,
      error: {
        type: 'VICTORY_EVALUATION_GAME_REJECTED',
        error: {
          type: 'INVALID_PENDING_JESTER_REVENGES',
          reason: 'overdue',
          index: 0,
          roleInstanceId: firstJester.role.instanceId,
        },
      },
    })
    expect(game.pendingJesterRevenges).toHaveLength(2)
  })

  it('is independent of composition array order while winner IDs remain canonical roster order', () => {
    const first = completeDay([
      { roleId: ROLE_IDS.framer },
      { roleId: ROLE_IDS.consort },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.citizen },
    ])
    const second = completeDay([
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.consort },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.framer },
    ])
    const firstResult = requireEvaluation(first)
    const secondResult = requireEvaluation(second)

    expect(firstResult.kind).toBe('mafia-victory')
    expect(secondResult.kind).toBe('mafia-victory')
    if (secondResult.kind !== 'mafia-victory') throw new Error('Expected Mafia victory.')
    expect(secondResult.winnerPlayerIds).toEqual([
      second.players[1]?.playerId,
      second.players[3]?.playerId,
    ])
  })

  it('finalizes once without deleting personal wins and rejects forged replacement results', () => {
    const game = completeDay(
      [
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather },
      ],
      1,
    )
    const evaluated = requireEvaluation(game)
    if (evaluated.kind !== 'mafia-victory') throw new Error('Expected Mafia victory.')
    const finalized = finalizeFactionVictory(game, evaluated)
    expect(finalized.ok).toBe(true)
    if (!finalized.ok) throw new Error('Expected finalization.')
    expect(finalized.value.phase).toBe('game-over')
    expect(finalized.value.personalWins).toEqual(game.personalWins)
    expect(finalized.value.deathRecords).toEqual(game.deathRecords)
    expect(finalized.value.executionerTargets).toEqual(game.executionerTargets)
    expect(finalized.value.pendingJesterRevenges).toEqual([])

    expect(
      validateStoredTerminalFactionResult(finalized.value, {
        kind: 'town-victory',
        gameId: game.id,
      }),
    ).toEqual({ ok: false, error: { type: 'INVALID_TOWN_RESULT' } })
    expect(
      validateStoredTerminalFactionResult(finalized.value, {
        ...evaluated,
        winnerPlayerIds: [evaluated.winnerPlayerIds[0], evaluated.winnerPlayerIds[0]],
      }),
    ).toMatchObject({ ok: false, error: { type: 'DUPLICATE_WINNER_PLAYER' } })
  })

  it('rejects a malformed draw reason instead of accepting any same-game draw', () => {
    const game = completeDay([
      { roleId: ROLE_IDS.citizen, alive: false },
      { roleId: ROLE_IDS.godfather, alive: false },
    ])

    expect(
      finalizeFactionVictory(game, {
        kind: 'draw',
        gameId: game.id,
        reason: 'undocumented-stalemate',
      }),
    ).toEqual({ ok: false, error: { type: 'INVALID_DRAW' } })
  })

  it.each([
    {
      name: 'Town',
      roles: [
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather, alive: false },
      ],
      kind: 'town-victory',
    },
    {
      name: 'Mafia',
      roles: [
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather },
      ],
      kind: 'mafia-victory',
    },
    {
      name: 'Serial Killer',
      roles: [
        { roleId: ROLE_IDS.executioner, alive: false },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.serialKiller },
      ],
      kind: 'serial-killer-victory',
    },
    {
      name: 'draw',
      roles: [{ roleId: ROLE_IDS.executioner, alive: false }, { roleId: ROLE_IDS.citizen }],
      kind: 'draw',
    },
  ] as const)('keeps an Executioner personal win alongside $name', ({ roles, kind }) => {
    const game = completeDay(roles, 1)
    const result = requireEvaluation(game)
    expect(result.kind).toBe(kind)
    expect(game.personalWins).toHaveLength(1)
    if (result.kind === 'none') throw new Error('Expected terminal result.')
    const finalized = finalizeFactionVictory(game, result)
    expect(finalized.ok).toBe(true)
    if (!finalized.ok) throw new Error('Expected terminal finalization.')
    expect(finalized.value.personalWins).toEqual(game.personalWins)
  })

  it('rejects evaluation in editable day discussion and never advances counters', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const game = { ...fixture.game, dayNumber: 1 }
    expect(evaluateFactionVictory(game)).toEqual({
      ok: false,
      error: { type: 'VICTORY_EVALUATION_WRONG_PHASE', currentPhase: 'day-discussion' },
    })
    expect(game.nightNumber).toBe(1)
    expect(game.dayNumber).toBe(1)
  })

  it('rejects an execution-resolution state outside a complete post-day counter boundary', () => {
    const game = {
      ...completeDay([{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather, alive: false }]),
      nightNumber: 2,
    }

    expect(evaluateFactionVictory(game)).toEqual({
      ok: false,
      error: {
        type: 'VICTORY_EVALUATION_GAME_REJECTED',
        error: {
          type: 'INVALID_GAME_STATE',
          reason: {
            type: 'PHASE_COUNTER_MISMATCH',
            phase: 'execution-resolution',
            nightNumber: 2,
            dayNumber: 1,
          },
        },
      },
    })
    expect(game.phase).toBe('execution-resolution')
  })
})
