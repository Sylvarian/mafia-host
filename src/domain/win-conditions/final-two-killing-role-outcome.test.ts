import { describe, expect, it } from 'vitest'

import { endDayWithoutExecution, executePlayerDuringDay } from '../day/day-outcome.ts'
import { validateGameState } from '../game/game-invariants.ts'
import { handleGameCommand } from '../game/game-reducer.ts'
import type { GameState } from '../game/game-state.ts'
import { roleId } from '../identifiers.ts'
import { applyGodfatherSuccessionForStartedNight } from '../mafia/godfather-succession.ts'
import { applySelectedJesterRevenge, selectJesterRevengeVictim } from '../neutral/jester-revenge.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createNightFixture,
  type NightFixtureRole,
} from '../../../tests/support/night-action-fixtures.ts'
import {
  evaluateAndFinalizeFactionVictory,
  evaluateAndFinalizePostPromotionFinalTwoKillingRoleOutcome,
  evaluateFactionVictory,
  validateStoredTerminalFactionResult,
} from './faction-victory.ts'

function completeDay(
  roles: readonly NightFixtureRole[],
  settings: Readonly<{
    godfatherAndSerialCanKillEachOther?: boolean
    revealRoleOnDeath?: boolean
  }> = {},
): GameState {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
    settings,
  })
  const result = endDayWithoutExecution({ ...fixture.game, dayNumber: 1 })
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

describe('opposing killing-role final two', () => {
  it.each([
    [ROLE_IDS.godfather, ROLE_IDS.serialKiller],
    [ROLE_IDS.serialKiller, ROLE_IDS.godfather],
  ] as const)(
    'draws immediately as a stalemate for %s and %s without deaths or input mutation',
    (firstRoleId, secondRoleId) => {
      const game = completeDay([{ roleId: firstRoleId }, { roleId: secondRoleId }])
      const snapshot = JSON.stringify(game)

      expect(requireEvaluation(game)).toEqual({
        kind: 'draw',
        gameId: game.id,
        reason: 'opposing-killers-stalemate',
      })
      const finalized = evaluateAndFinalizeFactionVictory(game)
      expect(finalized.ok).toBe(true)
      if (!finalized.ok || finalized.value.status !== 'game-over') {
        throw new Error('Expected final-two game over.')
      }
      expect(finalized.value.game.players.every((player) => player.alive)).toBe(true)
      expect(finalized.value.game.deathRecords).toEqual([])
      expect(finalized.value.game.phase).toBe('game-over')
      expect(JSON.stringify(game)).toBe(snapshot)
    },
  )

  it.each([
    [ROLE_IDS.godfather, ROLE_IDS.serialKiller],
    [ROLE_IDS.serialKiller, ROLE_IDS.godfather],
  ] as const)(
    'applies atomic mutual elimination for %s and %s with canonical linked evidence',
    (firstRoleId, secondRoleId) => {
      const game = completeDay([{ roleId: firstRoleId }, { roleId: secondRoleId }], {
        godfatherAndSerialCanKillEachOther: true,
        revealRoleOnDeath: true,
      })
      const snapshot = JSON.stringify(game)
      const finalized = evaluateAndFinalizeFactionVictory(game)

      expect(finalized.ok).toBe(true)
      if (!finalized.ok || finalized.value.status !== 'game-over') {
        throw new Error('Expected mutual-elimination game over.')
      }
      expect(finalized.value.result).toEqual({
        kind: 'draw',
        gameId: game.id,
        reason: 'opposing-killers-mutual-elimination',
      })
      expect(finalized.value.game.players.every((player) => !player.alive)).toBe(true)
      expect(finalized.value.game.players.map((player) => player.publiclyRevealedRoleId)).toEqual([
        firstRoleId,
        secondRoleId,
      ])
      expect(finalized.value.game.deathRecords).toEqual([
        {
          gameId: game.id,
          playerId: game.players[0]?.playerId,
          roleInstanceId: game.players[0]?.role.instanceId,
          cause: {
            kind: 'final-killing-role-showdown',
            boundary: { kind: 'post-day', dayNumber: 1 },
            opponentPlayerId: game.players[1]?.playerId,
          },
        },
        {
          gameId: game.id,
          playerId: game.players[1]?.playerId,
          roleInstanceId: game.players[1]?.role.instanceId,
          cause: {
            kind: 'final-killing-role-showdown',
            boundary: { kind: 'post-day', dayNumber: 1 },
            opponentPlayerId: game.players[0]?.playerId,
          },
        },
      ])
      expect(Object.isFrozen(finalized.value.game)).toBe(true)
      expect(JSON.stringify(game)).toBe(snapshot)
    },
  )

  it('rejects showdown evidence that was already applied before faction settlement', () => {
    const game = completeDay([{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }], {
      godfatherAndSerialCanKillEachOther: true,
    })
    const finalized = evaluateAndFinalizeFactionVictory(game)
    if (!finalized.ok || finalized.value.status !== 'game-over') {
      throw new Error('Expected mutual-elimination game over.')
    }
    const forgedBoundary = validateGameState({
      ...finalized.value.game,
      phase: 'execution-resolution',
    })
    if (!forgedBoundary.ok) {
      throw new Error(`Expected structurally valid forged boundary: ${forgedBoundary.error.type}`)
    }

    expect(evaluateFactionVictory(forgedBoundary.value)).toEqual({
      ok: false,
      error: { type: 'PREEXISTING_FINAL_TWO_KILLING_ROLE_SHOWDOWN' },
    })
  })

  it.each([
    {
      name: 'two Godfathers',
      roles: [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.godfather }],
      expectedKind: 'mafia-victory',
    },
    {
      name: 'Godfather and Framer',
      roles: [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.framer }],
      expectedKind: 'mafia-victory',
    },
    {
      name: 'two Serial Killers',
      roles: [{ roleId: ROLE_IDS.serialKiller }, { roleId: ROLE_IDS.serialKiller }],
      expectedKind: 'none',
    },
    {
      name: 'Godfather and Town',
      roles: [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      expectedKind: 'mafia-victory',
    },
    {
      name: 'Serial Killer and Town',
      roles: [{ roleId: ROLE_IDS.serialKiller }, { roleId: ROLE_IDS.citizen }],
      expectedKind: 'none',
    },
    {
      name: 'killer and Jester',
      roles: [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.jester }],
      expectedKind: 'none',
    },
    {
      name: 'more than two survivors',
      roles: [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
      expectedKind: 'none',
    },
    {
      name: 'dead opposing killer',
      roles: [{ roleId: ROLE_IDS.godfather, alive: false }, { roleId: ROLE_IDS.serialKiller }],
      expectedKind: 'serial-killer-victory',
    },
  ] satisfies readonly {
    name: string
    roles: readonly NightFixtureRole[]
    expectedKind: string
  }[])('does not use the special draw for $name', ({ roles, expectedKind }) => {
    expect(requireEvaluation(completeDay(roles)).kind).toBe(expectedKind)
  })

  it('rejects unknown active-role metadata with a structured final-two error', () => {
    const game = completeDay([{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }])
    const unknownRoleId = roleId('unknown-killing-role')
    const unknownPlayer = game.players[1]
    if (unknownPlayer === undefined) throw new Error('Expected the second finalist.')
    const malformed = {
      ...game,
      roleDefinitions: [
        ...game.roleDefinitions,
        { id: unknownRoleId, name: 'Unknown killing role', faction: 'neutral' as const },
      ],
      players: game.players.map((player) =>
        player.playerId === unknownPlayer.playerId
          ? { ...player, role: { ...player.role, roleId: unknownRoleId } }
          : player,
      ),
    }

    expect(evaluateFactionVictory(malformed)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_FINAL_TWO_KILLING_ROLE_ACTIVE_ROLE',
        playerId: unknownPlayer.playerId,
        roleId: unknownRoleId,
      },
    })
  })

  it('rejects unknown active-role metadata outside the final-two branch without throwing', () => {
    const game = completeDay([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.serialKiller },
      { roleId: ROLE_IDS.citizen },
    ])
    const unknownRoleId = roleId('unknown-passive-role')
    const unknownPlayer = game.players[2]
    if (unknownPlayer === undefined) throw new Error('Expected the third player.')
    const malformed = {
      ...game,
      roleDefinitions: [
        ...game.roleDefinitions,
        { id: unknownRoleId, name: 'Unknown passive role', faction: 'neutral' as const },
      ],
      players: game.players.map((player) =>
        player.playerId === unknownPlayer.playerId
          ? { ...player, role: { ...player.role, roleId: unknownRoleId } }
          : player,
      ),
    }

    expect(evaluateFactionVictory(malformed)).toEqual({
      ok: false,
      error: {
        type: 'VICTORY_EVALUATION_UNKNOWN_ACTIVE_ROLE',
        playerId: unknownPlayer.playerId,
        roleId: unknownRoleId,
      },
    })
  })

  it.each([
    {
      setting: false,
      reason: 'opposing-killers-stalemate',
      deathCount: 0,
    },
    {
      setting: true,
      reason: 'opposing-killers-mutual-elimination',
      deathCount: 2,
    },
  ] as const)(
    'recognizes a promoted Godfather for the $reason branch while preserving the assignment',
    ({ setting, reason, deathCount }) => {
      const fixture = createNightFixture(
        [{ roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.serialKiller }],
        {
          phase: 'night-action-collection',
          nightNumber: 2,
          settings: { godfatherAndSerialCanKillEachOther: setting },
        },
      )
      const promotion = applyGodfatherSuccessionForStartedNight(fixture.game, { next: () => 0 })
      if (!promotion.ok) throw new Error(`Expected promotion: ${promotion.error.type}`)
      const finalized = evaluateAndFinalizePostPromotionFinalTwoKillingRoleOutcome(
        promotion.value.game,
      )
      if (!finalized.ok || finalized.value.status !== 'game-over') {
        throw new Error('Expected immediate post-promotion final-two draw.')
      }

      expect(finalized.value.result).toMatchObject({ kind: 'draw', reason })
      expect(finalized.value.game.deathRecords).toHaveLength(deathCount)
      expect(finalized.value.game.players[0]?.role.roleId).toBe(ROLE_IDS.framer)
      expect(finalized.value.game.phase).toBe('game-over')
      if (setting) {
        expect(
          finalized.value.game.deathRecords.map((record) =>
            record.cause.kind === 'final-killing-role-showdown' ? record.cause.boundary : null,
          ),
        ).toEqual([
          { kind: 'post-dawn', nightNumber: 2 },
          { kind: 'post-dawn', nightNumber: 2 },
        ])
      }
    },
  )

  it('does not settle a post-promotion final two while Jester revenge remains pending', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.jester }, { roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.serialKiller }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const jester = fixture.game.players[0]
    if (jester === undefined) throw new Error('Expected Jester.')
    const execution = executePlayerDuringDay({ ...fixture.game, dayNumber: 1 }, jester.playerId)
    if (!execution.ok) throw new Error(`Expected Jester execution: ${execution.error.type}`)
    const startedNight = handleGameCommand(execution.value, {
      type: 'ADVANCE_PHASE',
      targetPhase: 'night-action-collection',
    })
    if (!startedNight.ok) throw new Error(`Expected Night 2: ${startedNight.error.type}`)
    const promotion = applyGodfatherSuccessionForStartedNight(startedNight.value.state, {
      next: () => 0,
    })
    if (!promotion.ok) throw new Error(`Expected promotion: ${promotion.error.type}`)

    const evaluated = evaluateAndFinalizePostPromotionFinalTwoKillingRoleOutcome(
      promotion.value.game,
    )

    expect(evaluated).toEqual({
      ok: true,
      value: {
        status: 'non-terminal',
        game: promotion.value.game,
        result: { kind: 'none', gameId: promotion.value.game.id },
      },
    })
    expect(promotion.value.game.pendingJesterRevenges).toHaveLength(1)
  })

  it('preserves an earlier Jester win through a post-Dawn final-two draw', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.jester },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
      ],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const jester = fixture.game.players[0]
    if (jester === undefined) throw new Error('Expected Jester.')
    const execution = executePlayerDuringDay(fixture.game, jester.playerId)
    if (!execution.ok) throw new Error(`Expected execution: ${execution.error.type}`)
    const dawn = validateGameState({
      ...execution.value,
      phase: 'dawn-resolution',
      nightNumber: 2,
    })
    if (!dawn.ok) throw new Error(`Expected Dawn: ${dawn.error.type}`)
    const selected = selectJesterRevengeVictim(dawn.value, { next: () => 0 })
    if (!selected.ok || selected.value === null) throw new Error('Expected revenge victim.')
    const revenge = applySelectedJesterRevenge(dawn.value, selected.value)
    if (!revenge.ok) throw new Error(`Expected revenge: ${revenge.error.type}`)

    const finalized = evaluateAndFinalizeFactionVictory(revenge.value)
    expect(finalized.ok).toBe(true)
    if (!finalized.ok || finalized.value.status !== 'game-over') {
      throw new Error('Expected final-two game over.')
    }
    expect(finalized.value.result).toMatchObject({
      kind: 'draw',
      reason: 'opposing-killers-stalemate',
    })
    expect(finalized.value.game.personalWins).toEqual(execution.value.personalWins)
    expect(finalized.value.game.personalWins).toHaveLength(1)
  })

  it('preserves multiple earlier Executioner wins through mutual elimination', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
      ],
      {
        phase: 'day-discussion',
        nightNumber: 1,
        settings: { godfatherAndSerialCanKillEachOther: true },
      },
    )
    const target = fixture.game.players[2]
    if (target === undefined) throw new Error('Expected shared Executioner target.')
    const execution = executePlayerDuringDay(fixture.game, target.playerId)
    if (!execution.ok) throw new Error(`Expected target execution: ${execution.error.type}`)
    const deadExecutioners = execution.value.players.slice(0, 2)
    const nightDeaths = deadExecutioners.map((player) => ({
      gameId: execution.value.id,
      playerId: player.playerId,
      roleInstanceId: player.role.instanceId,
      cause: { kind: 'night-death' as const, nightNumber: 2 },
    }))
    const dawn = validateGameState({
      ...execution.value,
      phase: 'dawn-resolution',
      nightNumber: 2,
      players: execution.value.players.map((player) =>
        deadExecutioners.some((executioner) => executioner.playerId === player.playerId)
          ? { ...player, alive: false }
          : player,
      ),
      deathRecords: [...execution.value.deathRecords, ...nightDeaths],
    })
    if (!dawn.ok) throw new Error(`Expected final-two Dawn: ${dawn.error.type}`)

    const finalized = evaluateAndFinalizeFactionVictory(dawn.value)
    expect(finalized.ok).toBe(true)
    if (!finalized.ok || finalized.value.status !== 'game-over') {
      throw new Error('Expected mutual-elimination game over.')
    }
    expect(finalized.value.result).toMatchObject({
      kind: 'draw',
      reason: 'opposing-killers-mutual-elimination',
    })
    expect(finalized.value.game.personalWins).toEqual(execution.value.personalWins)
    expect(finalized.value.game.personalWins).toHaveLength(2)
  })

  it('validates the exact stored draw branch and rejects a forged replacement reason', () => {
    const game = completeDay([{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }], {
      godfatherAndSerialCanKillEachOther: true,
    })
    const finalized = evaluateAndFinalizeFactionVictory(game)
    if (!finalized.ok || finalized.value.status !== 'game-over') {
      throw new Error('Expected mutual-elimination game over.')
    }

    expect(
      validateStoredTerminalFactionResult(finalized.value.game, finalized.value.result),
    ).toEqual({ ok: true, value: finalized.value.result })
    expect(
      validateStoredTerminalFactionResult(finalized.value.game, {
        kind: 'draw',
        gameId: game.id,
        reason: 'no-survivors',
      }),
    ).toEqual({
      ok: false,
      error: { type: 'FACTION_RESULT_CONFLICTS_WITH_FINAL_TWO_DRAW' },
    })
  })

  it('never treats a partial linked showdown as a valid stored game', () => {
    const game = completeDay([{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }], {
      godfatherAndSerialCanKillEachOther: true,
    })
    const first = game.players[0]
    const second = game.players[1]
    if (first === undefined || second === undefined) throw new Error('Expected final pair.')
    const forged: GameState = {
      ...game,
      phase: 'game-over',
      players: game.players.map((player) =>
        player.playerId === first.playerId ? { ...player, alive: false } : player,
      ),
      deathRecords: [
        {
          gameId: game.id,
          playerId: first.playerId,
          roleInstanceId: first.role.instanceId,
          cause: {
            kind: 'final-killing-role-showdown',
            boundary: { kind: 'post-day', dayNumber: 1 },
            opponentPlayerId: second.playerId,
          },
        },
      ],
    }

    expect(
      validateStoredTerminalFactionResult(forged, {
        kind: 'draw',
        gameId: game.id,
        reason: 'opposing-killers-mutual-elimination',
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'VICTORY_EVALUATION_GAME_REJECTED',
        error: {
          type: 'INVALID_DEATH_RECORDS',
          reason: 'partial-final-showdown',
        },
      },
    })
  })
})
