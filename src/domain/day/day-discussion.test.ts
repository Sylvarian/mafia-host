import { describe, expect, it } from 'vitest'

import {
  createNightFixture,
  nightFixturePlayerId,
} from '../../../tests/support/night-action-fixtures.ts'
import type { GameState } from '../game/game-state.ts'
import { playerId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { beginDayDiscussion, confirmMayorReveal } from './day-discussion.ts'

function dawnGame(
  roles: Parameters<typeof createNightFixture>[0],
  publicRevealIndexes: readonly number[] = [],
  revealRoleOnDeath = false,
): GameState {
  const fixture = createNightFixture(roles, {
    phase: 'dawn-announcement',
    nightNumber: 1,
    settings: { revealRoleOnDeath },
  })
  return {
    ...fixture.game,
    players: fixture.game.players.map((player, index) =>
      publicRevealIndexes.includes(index)
        ? { ...player, publiclyRevealedRoleId: player.role.roleId }
        : player,
    ),
  }
}

function announcementFor(game: GameState) {
  const deaths = game.players
    .filter((player) => !player.alive)
    .map((player) => ({
      playerId: player.playerId,
      revealedRoleId: player.publiclyRevealedRoleId,
    }))
  return deaths.length === 0
    ? ({ outcome: 'no-deaths', nightNumber: game.nightNumber } as const)
    : ({ outcome: 'deaths', nightNumber: game.nightNumber, deaths } as const)
}

function dayGame(
  roles: Parameters<typeof createNightFixture>[0],
  publicRevealIndexes: readonly number[] = [],
): GameState {
  const game = dawnGame(roles, publicRevealIndexes)
  return { ...game, phase: 'day-discussion', dayNumber: 1 }
}

describe('Dawn-to-day domain transition', () => {
  it('atomically enters Day 1 while preserving every authoritative game value', () => {
    const game = dawnGame(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.mayor },
        { roleId: ROLE_IDS.doctor, alive: false },
        { roleId: ROLE_IDS.executioner },
      ],
      [],
      true,
    )
    const original = JSON.stringify(game)
    const result = beginDayDiscussion(game, announcementFor(game))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected the Dawn-to-day transition.')
    expect(result.value).toMatchObject({
      phase: 'day-discussion',
      nightNumber: 1,
      dayNumber: 1,
    })
    expect(result.value.players).toEqual(game.players)
    expect(result.value.settings).toEqual(game.settings)
    expect(result.value.executionerTargets).toEqual(game.executionerTargets)
    expect(result.value.doctorPreviousTargets).toEqual(game.doctorPreviousTargets)
    expect(result.value.roleDefinitions).toEqual(game.roleDefinitions)
    expect(result.value.personalWins).toEqual([])
    expect(result.value).not.toHaveProperty('factionWinner')
    expect(result.value.pendingJesterRevenges).toEqual([])
    expect(result.value.executionerConversions).toEqual(game.executionerConversions)
    expect(result.value).not.toHaveProperty('nightWorkflow')
    expect(JSON.stringify(game)).toBe(original)
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.players)).toBe(true)
  })

  it('rejects the wrong phase, a mismatched announcement, and repeat transition', () => {
    const game = dawnGame([{ roleId: ROLE_IDS.citizen }])

    expect(
      beginDayDiscussion({ ...game, phase: 'night-resolution' }, announcementFor(game)),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_DAY_TRANSITION_PHASE' },
    })
    expect(
      beginDayDiscussion(game, {
        outcome: 'no-deaths',
        nightNumber: 2,
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAWN_GAME_MATCH',
        reason: 'night-number-mismatch',
      },
    })
    const transitioned = beginDayDiscussion(game, announcementFor(game))
    if (!transitioned.ok) throw new Error('Expected the first transition.')
    expect(beginDayDiscussion(transitioned.value, announcementFor(game))).toEqual({
      ok: false,
      error: { type: 'DAY_TRANSITION_ALREADY_COMPLETED' },
    })
  })

  it('enforces the established counter convention without double incrementing', () => {
    const game = dawnGame([{ roleId: ROLE_IDS.citizen }])
    expect(beginDayDiscussion({ ...game, dayNumber: 1 }, announcementFor(game))).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_COUNTER_STATE',
        nightNumber: 1,
        dayNumber: 1,
      },
    })
  })

  it('safely enters day with zero living players without inventing a winner', () => {
    const game = dawnGame([
      { roleId: ROLE_IDS.citizen, alive: false },
      { roleId: ROLE_IDS.godfather, alive: false },
    ])
    const result = beginDayDiscussion(game, announcementFor(game))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected zero-survivor day robustness.')
    expect(result.value.players.every((player) => !player.alive)).toBe(true)
    expect(result.value).not.toHaveProperty('winner')
  })
})

describe('voluntary Mayor reveal domain operation', () => {
  it('reveals one living Mayor without changing any other authority', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.mayor },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.executioner },
    ])
    const selectedMayor = game.players[0]
    if (selectedMayor === undefined) throw new Error('Expected a Mayor.')
    const original = JSON.stringify(game)
    const result = confirmMayorReveal(game, selectedMayor.playerId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected Mayor reveal.')
    expect(result.value.players[0]).toEqual({
      ...selectedMayor,
      publiclyRevealedRoleId: ROLE_IDS.mayor,
    })
    expect(result.value.players[0]?.role).toEqual(selectedMayor.role)
    expect(result.value.players[0]?.alive).toBe(true)
    expect(result.value.players.slice(1)).toEqual(game.players.slice(1))
    expect(result.value.nightNumber).toBe(game.nightNumber)
    expect(result.value.dayNumber).toBe(game.dayNumber)
    expect(result.value.settings).toEqual(game.settings)
    expect(result.value.executionerTargets).toEqual(game.executionerTargets)
    expect(result.value.doctorPreviousTargets).toEqual(game.doctorPreviousTargets)
    expect(result.value.phase).toBe('day-discussion')
    expect(result.value.personalWins).toEqual([])
    expect(result.value.pendingJesterRevenges).toEqual([])
    expect(result.value).not.toHaveProperty('winner')
    expect(JSON.stringify(game)).toBe(original)
    expect(Object.isFrozen(result.value)).toBe(true)
  })

  it('reveals duplicate Mayors independently and preserves stable ordinals', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.mayor },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.mayor },
    ])
    const firstMayor = game.players[0]
    const secondMayor = game.players[2]
    if (firstMayor === undefined || secondMayor === undefined) {
      throw new Error('Expected two Mayors.')
    }

    const first = confirmMayorReveal(game, firstMayor.playerId)
    if (!first.ok) throw new Error('Expected first Mayor reveal.')
    expect(first.value.players[2]?.publiclyRevealedRoleId).toBeNull()
    const second = confirmMayorReveal(first.value, secondMayor.playerId)
    if (!second.ok) throw new Error('Expected second Mayor reveal.')

    expect(
      second.value.players.map((player) => ({
        ordinal: player.role.ordinal,
        reveal: player.publiclyRevealedRoleId,
      })),
    ).toEqual([
      { ordinal: 1, reveal: ROLE_IDS.mayor },
      { ordinal: null, reveal: null },
      { ordinal: 2, reveal: ROLE_IDS.mayor },
    ])
  })

  it('rejects dead, non-Mayor, unknown, already revealed, and wrong-phase selections', () => {
    const game = dayGame([
      { roleId: ROLE_IDS.mayor },
      { roleId: ROLE_IDS.mayor, alive: false },
      { roleId: ROLE_IDS.citizen },
    ])
    const livingMayor = game.players[0]
    const deadMayor = game.players[1]
    const citizen = game.players[2]
    if (livingMayor === undefined || deadMayor === undefined || citizen === undefined) {
      throw new Error('Expected reveal test players.')
    }

    expect(confirmMayorReveal(game, deadMayor.playerId)).toMatchObject({
      ok: false,
      error: { type: 'DEAD_MAYOR_CANNOT_REVEAL' },
    })
    expect(confirmMayorReveal(game, citizen.playerId)).toMatchObject({
      ok: false,
      error: { type: 'SELECTED_PLAYER_IS_NOT_MAYOR' },
    })
    expect(confirmMayorReveal(game, playerId(''))).toMatchObject({
      ok: false,
      error: { type: 'UNKNOWN_MAYOR_PLAYER' },
    })
    expect(confirmMayorReveal(game, playerId('non-participating-player'))).toMatchObject({
      ok: false,
      error: { type: 'NON_PARTICIPATING_MAYOR_PLAYER' },
    })
    const revealed = confirmMayorReveal(game, livingMayor.playerId)
    if (!revealed.ok) throw new Error('Expected initial reveal.')
    expect(confirmMayorReveal(revealed.value, livingMayor.playerId)).toEqual({
      ok: false,
      error: {
        type: 'MAYOR_ALREADY_REVEALED',
        playerId: livingMayor.playerId,
      },
    })
    expect(
      confirmMayorReveal(
        { ...game, phase: 'dawn-announcement', dayNumber: 0 },
        livingMayor.playerId,
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_MAYOR_REVEAL_PHASE' },
    })
  })

  it('fails invariant validation instead of overwriting an inconsistent public reveal', () => {
    const game = dayGame([{ roleId: ROLE_IDS.mayor }, { roleId: ROLE_IDS.citizen }])
    const mayor = game.players[0]
    if (mayor === undefined) throw new Error('Expected Mayor.')
    const inconsistent = {
      ...game,
      players: game.players.map((entry) =>
        entry.playerId === mayor.playerId
          ? { ...entry, publiclyRevealedRoleId: ROLE_IDS.citizen }
          : entry,
      ),
    }

    expect(confirmMayorReveal(inconsistent, mayor.playerId)).toMatchObject({
      ok: false,
      error: {
        type: 'MAYOR_REVEAL_GAME_REJECTED',
        error: {
          type: 'INVALID_PUBLIC_ROLE_REVEAL',
          reason: 'assigned-role-mismatch',
        },
      },
    })
  })

  it('rejects forged Mayor registry metadata', () => {
    const game = dayGame([{ roleId: ROLE_IDS.mayor }])
    const mayor = game.players[0]
    if (mayor === undefined) throw new Error('Expected Mayor.')

    expect(
      confirmMayorReveal(
        {
          ...game,
          roleDefinitions: game.roleDefinitions.map((definition) => ({
            ...definition,
            name: 'Forged Mayor',
          })),
        },
        mayor.playerId,
      ),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_MAYOR_ROLE_METADATA',
        playerId: nightFixturePlayerId('player-1'),
      },
    })
  })
})
