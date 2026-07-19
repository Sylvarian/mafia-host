import { describe, expect, it } from 'vitest'

import { confirmMayorReveal } from '../day/day-discussion.ts'
import { executePlayerDuringDay } from '../day/day-outcome.ts'
import type { DeathRecord } from '../game/death-record.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  applySelectedJesterRevenge,
  exhaustJesterRevengeWithoutSurvivor,
  selectEligibleJesterRevengeVictims,
  selectJesterRevengeVictim,
} from './jester-revenge.ts'

function dueRevengeGame(revealRoleOnDeath = true): GameState {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.godfather },
    ],
    {
      phase: 'day-discussion',
      nightNumber: 1,
      settings: { revealRoleOnDeath },
    },
  )
  const jester = fixture.game.players[0]
  if (jester === undefined) throw new Error('Expected a Jester.')
  const execution = executePlayerDuringDay(fixture.game, jester.playerId)
  if (!execution.ok) throw new Error(`Expected Jester execution: ${execution.error.type}`)
  const result = validateGameState({
    ...execution.value,
    phase: 'dawn-resolution',
    nightNumber: 2,
  })
  if (!result.ok) throw new Error(`Expected due revenge game: ${result.error.type}`)
  return result.value
}

describe('next-Dawn Jester revenge', () => {
  it('selects once from living post-ordinary survivors in canonical roster order', () => {
    const game = dueRevengeGame()
    const obligation = game.pendingJesterRevenges[0]
    if (obligation === undefined) throw new Error('Expected a pending revenge.')
    const survivors = selectEligibleJesterRevengeVictims(game, obligation)

    expect(survivors).toEqual([
      game.players[1]?.playerId,
      game.players[2]?.playerId,
      game.players[3]?.playerId,
    ])
    let calls = 0
    const selection = selectJesterRevengeVictim(game, {
      next: () => {
        calls += 1
        return 0.34
      },
    })

    expect(selection.ok).toBe(true)
    if (!selection.ok || selection.value === null) throw new Error('Expected a victim selection.')
    expect(calls).toBe(1)
    expect(selection.value).toMatchObject({
      kind: 'victim-selected',
      obligationId: obligation.id,
      victimPlayerId: game.players[2]?.playerId,
      resolvedAtNightNumber: 2,
    })
    expect(selection.value).not.toHaveProperty('victimRoleId')
  })

  it('rejects selection before Dawn resolution without consuming randomness', () => {
    const game = dueRevengeGame()
    let calls = 0
    const result = selectJesterRevengeVictim(
      { ...game, phase: 'night-action-collection' },
      {
        next: () => {
          calls += 1
          return 0
        },
      },
    )

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'INVALID_JESTER_REVENGE_PHASE',
        currentPhase: 'night-action-collection',
      },
    })
    expect(calls).toBe(0)
  })

  it('applies one unavoidable death, records its authority, reveals by policy, and converts matching Executioners', () => {
    const game = dueRevengeGame()
    const selected = selectJesterRevengeVictim(game, { next: () => 0.34 })
    if (!selected.ok || selected.value === null) throw new Error('Expected a victim selection.')
    const result = applySelectedJesterRevenge(game, selected.value)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected revenge application: ${result.error.type}`)
    const victim = result.value.players[2]
    const executioner = result.value.players[1]
    expect(victim).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: ROLE_IDS.citizen,
    })
    expect(result.value.pendingJesterRevenges).toEqual([])
    expect(result.value.jesterRevengeResolutions).toEqual([
      {
        ...selected.value,
        kind: 'victim-killed',
      },
    ])
    expect(result.value.deathRecords.at(-1)).toMatchObject({
      playerId: victim?.playerId,
      cause: {
        kind: 'jester-revenge',
        nightNumber: 2,
        jesterPlayerId: game.players[0]?.playerId,
        obligationId: selected.value.obligationId,
        resolutionId: selected.value.id,
      },
    })
    expect(result.value.executionerConversions).toContainEqual({
      kind: 'executioner-to-jester',
      gameId: game.id,
      playerId: executioner?.playerId,
      roleInstanceId: executioner?.role.instanceId,
      targetPlayerId: victim?.playerId,
    })
    expect(result.value.personalWins).toEqual(game.personalWins)
    expect(applySelectedJesterRevenge(result.value, selected.value)).toEqual({
      ok: false,
      error: { type: 'NO_PENDING_JESTER_REVENGE' },
    })
  })

  it('rejects a dead or altered victim and accepts every living role or faction', () => {
    const game = dueRevengeGame(false)
    const selected = selectJesterRevengeVictim(game, { next: () => 0 })
    if (!selected.ok || selected.value === null) throw new Error('Expected a victim selection.')
    const deadVictim = game.players[0]
    if (deadVictim === undefined) throw new Error('Expected the executed Jester.')

    expect(
      applySelectedJesterRevenge(game, {
        ...selected.value,
        victimPlayerId: deadVictim.playerId,
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_JESTER_REVENGE_VICTIM',
        victimPlayerId: deadVictim.playerId,
      },
    })

    const mafiaSelection = selectJesterRevengeVictim(game, { next: () => 0.99 })
    if (!mafiaSelection.ok || mafiaSelection.value === null) {
      throw new Error('Expected a Mafia victim selection.')
    }
    const applied = applySelectedJesterRevenge(game, mafiaSelection.value)
    expect(applied.ok).toBe(true)
    if (!applied.ok) throw new Error('Expected unrestricted victim eligibility.')
    expect(applied.value.players[3]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: null,
    })
  })

  it('preserves a legitimate Mayor reveal when revenge kills that Mayor with death reveal off', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.jester },
        { roleId: ROLE_IDS.mayor },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather },
      ],
      {
        phase: 'day-discussion',
        nightNumber: 1,
        settings: { revealRoleOnDeath: false },
      },
    )
    const jester = fixture.game.players[0]
    const mayor = fixture.game.players[1]
    if (jester === undefined || mayor === undefined) {
      throw new Error('Expected a Jester and Mayor.')
    }
    const revealed = confirmMayorReveal(fixture.game, mayor.playerId)
    if (!revealed.ok) throw new Error(`Expected Mayor reveal: ${revealed.error.type}`)
    const execution = executePlayerDuringDay(revealed.value, jester.playerId)
    if (!execution.ok) throw new Error(`Expected Jester execution: ${execution.error.type}`)
    const dawn = validateGameState({
      ...execution.value,
      phase: 'dawn-resolution',
      nightNumber: 2,
    })
    if (!dawn.ok) throw new Error(`Expected Dawn resolution: ${dawn.error.type}`)
    const selected = selectJesterRevengeVictim(dawn.value, { next: () => 0 })
    if (!selected.ok || selected.value === null) throw new Error('Expected the Mayor selection.')
    expect(selected.value.victimPlayerId).toBe(mayor.playerId)

    const result = applySelectedJesterRevenge(dawn.value, selected.value)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected Mayor revenge death: ${result.error.type}`)
    expect(result.value.players[1]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: ROLE_IDS.mayor,
    })
  })

  it('records a no-survivor resolution without drawing randomness', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.jester }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const jester = fixture.game.players[0]
    if (jester === undefined) throw new Error('Expected a Jester.')
    const execution = executePlayerDuringDay(fixture.game, jester.playerId)
    if (!execution.ok) throw new Error('Expected Jester execution.')
    const ordinaryDeaths: readonly DeathRecord[] = execution.value.players
      .slice(1)
      .map((player) => ({
        gameId: execution.value.id,
        playerId: player.playerId,
        roleInstanceId: player.role.instanceId,
        cause: { kind: 'night-death', nightNumber: 2 },
      }))
    const candidate = validateGameState({
      ...execution.value,
      phase: 'dawn-resolution',
      nightNumber: 2,
      players: execution.value.players.map((player) => ({ ...player, alive: false })),
      deathRecords: [...execution.value.deathRecords, ...ordinaryDeaths],
    })
    if (!candidate.ok) throw new Error(`Expected all-dead Dawn: ${candidate.error.type}`)
    let calls = 0
    const selected = selectJesterRevengeVictim(candidate.value, {
      next: () => {
        calls += 1
        return 0
      },
    })
    expect(selected).toEqual({ ok: true, value: null })
    expect(calls).toBe(0)

    const result = exhaustJesterRevengeWithoutSurvivor(candidate.value)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected exhausted revenge.')
    expect(result.value.pendingJesterRevenges).toEqual([])
    expect(result.value.jesterRevengeResolutions).toMatchObject([
      {
        kind: 'no-survivor',
        jesterPlayerId: jester.playerId,
        resolvedAtNightNumber: 2,
      },
    ])
    expect(result.value.deathRecords).toHaveLength(3)
  })
})
