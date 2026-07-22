import { describe, expect, it } from 'vitest'

import { endDayWithoutExecution, executePlayerDuringDay } from '@/domain/day/day-outcome.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import {
  evaluateFactionVictory,
  finalizeFactionVictory,
} from '@/domain/win-conditions/faction-victory.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { selectHostGameOverView, validateGameOverState } from './game-over.ts'

describe('host game-over application view', () => {
  it('shows exact roles and duplicate-safe names even when death reveal is disabled', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.citizen, name: 'Alex' },
        { roleId: ROLE_IDS.godfather, name: 'Alex', alive: false },
        { roleId: ROLE_IDS.jester, name: 'Jordan' },
      ],
      { phase: 'day-discussion', nightNumber: 1, settings: { revealRoleOnDeath: false } },
    )
    const final = finalize(fixture.game)
    const view = selectHostGameOverView({
      game: final.game,
      participants: fixture.participants,
      result: final.result,
    })

    expect(view.heading).toBe('Town wins')
    expect(view.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerDisplayLabel: 'Alex (Player 1)',
          activeRoleDisplayName: 'Citizen',
          alignmentDisplayName: 'Town',
          alive: true,
        }),
        expect.objectContaining({
          playerDisplayLabel: 'Alex (Player 2)',
          activeRoleDisplayName: 'Godfather',
          alignmentDisplayName: 'Mafia',
          alive: false,
          deathCause: { kind: 'night-death', nightNumber: 1 },
        }),
      ]),
    )
  })

  it('shows Executioner targets, conversions, and personal wins', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner, name: 'Executioner' },
        { roleId: ROLE_IDS.citizen, name: 'Target' },
        { roleId: ROLE_IDS.godfather, name: 'Mafia' },
      ],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const target = fixture.game.players[1]
    if (target === undefined) throw new Error('Expected target.')
    const completed = executePlayerDuringDay({ ...fixture.game, dayNumber: 1 }, target.playerId)
    if (!completed.ok) throw new Error(`Expected execution: ${completed.error.type}`)
    const evaluated = evaluateFactionVictory(completed.value)
    if (!evaluated.ok || evaluated.value.kind !== 'mafia-victory') {
      throw new Error('Expected Mafia victory.')
    }
    const finalized = finalizeFactionVictory(completed.value, evaluated.value)
    if (!finalized.ok) throw new Error('Expected final game.')
    const view = selectHostGameOverView({
      game: finalized.value,
      participants: fixture.participants,
      result: evaluated.value,
    })
    const executioner = view.players[0]

    expect(executioner).toMatchObject({
      activeRoleDisplayName: 'Executioner',
      executionerTargetDisplayLabel: 'Target',
      personalWins: [
        {
          kind: 'executioner-target-executed',
          dayNumber: 1,
          targetPlayerDisplayLabel: 'Target',
        },
      ],
    })
  })

  it.each([
    [false, 'The final two players could not eliminate each other.'],
    [true, 'The final two players eliminated each other.'],
  ] as const)('keeps the exact draw explanation (mutual killing: %s)', (setting, explanation) => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, name: 'Godfather player' },
        { roleId: ROLE_IDS.serialKiller, name: 'Serial Killer player' },
      ],
      {
        phase: 'day-discussion',
        nightNumber: 1,
        settings: { godfatherAndSerialCanKillEachOther: setting },
      },
    )
    const final = finalize(fixture.game)
    const view = selectHostGameOverView({
      game: final.game,
      participants: fixture.participants,
      result: final.result,
    })

    expect(view).toMatchObject({ heading: 'Draw', status: 'draw', explanation })
    expect(view.players.map((player) => player.activeRoleDisplayName)).toEqual([
      'Godfather',
      'Serial Killer',
    ])
  })

  it('rejects a result from the wrong game', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const final = finalize(fixture.game)
    expect(
      validateGameOverState({
        game: final.game,
        participants: fixture.participants,
        result: { ...final.result, gameId: 'other-game' },
      }),
    ).toMatchObject({ ok: false, error: { type: 'INVALID_GAME_OVER_RESULT' } })
  })
})

function finalize(game: Parameters<typeof endDayWithoutExecution>[0]) {
  const completed = endDayWithoutExecution({ ...game, dayNumber: 1 })
  if (!completed.ok) throw new Error(`Expected day completion: ${completed.error.type}`)
  const evaluated = evaluateFactionVictory(completed.value)
  if (!evaluated.ok || evaluated.value.kind === 'none') {
    throw new Error('Expected terminal result.')
  }
  const finalized = finalizeFactionVictory(completed.value, evaluated.value)
  if (!finalized.ok) throw new Error(`Expected finalization: ${finalized.error.type}`)
  return { game: finalized.value, result: evaluated.value }
}
