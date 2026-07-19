import { describe, expect, it } from 'vitest'

import {
  createNightFixture,
  nightFixturePlayerId,
} from '../../../tests/support/night-action-fixtures.ts'
import { ROLE_IDS } from '../../domain/roles/role-registry.ts'
import {
  completeDayWithoutExecution,
  executePlayerAndCompleteDay,
  selectDayExecutionCandidates,
  selectPublicDayOutcomeView,
} from './day-outcome.ts'

function dayState(revealRoleOnDeath = false): Parameters<typeof selectDayExecutionCandidates>[0] {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.jester, name: 'Alex' },
      { roleId: ROLE_IDS.executioner, name: 'Alex' },
      { roleId: ROLE_IDS.citizen, name: 'Taylor' },
      { roleId: ROLE_IDS.godfather, name: 'Morgan', alive: false },
    ],
    {
      phase: 'day-discussion',
      nightNumber: 1,
      settings: { revealRoleOnDeath },
    },
  )
  return {
    game: { ...fixture.game, dayNumber: 1 },
    participants: fixture.participants,
  }
}

describe('day-outcome application boundary', () => {
  it('selects only living participants with duplicate-safe labels and no private metadata', () => {
    const candidates = selectDayExecutionCandidates(dayState())

    expect(candidates).toEqual([
      { playerId: 'player-1', playerDisplayLabel: 'Alex (Player 1)' },
      { playerId: 'player-2', playerDisplayLabel: 'Alex (Player 2)' },
      { playerId: 'player-3', playerDisplayLabel: 'Taylor' },
    ])
    expect(JSON.stringify(candidates)).not.toMatch(
      /jester|executioner|citizen|godfather|target|faction|roleInstance/i,
    )
    expect(candidates.every(Object.isFrozen)).toBe(true)
  })

  it('returns a sanitized execution summary and obeys the death-reveal setting', () => {
    const hiddenState = dayState()
    const hiddenExecution = executePlayerAndCompleteDay(
      hiddenState,
      hiddenState.game.players[0]?.playerId ?? nightFixturePlayerId('missing-player'),
    )
    if (!hiddenExecution.ok) throw new Error('Expected hidden Jester execution.')

    const hiddenView = selectPublicDayOutcomeView(hiddenExecution.value)
    expect(hiddenView).toEqual({
      dayNumber: 1,
      dayLabel: 'Day 1',
      outcome: {
        kind: 'player-executed',
        playerDisplayLabel: 'Alex (Player 1)',
        revealedRoleDisplayName: null,
      },
    })
    expect(JSON.stringify(hiddenView)).not.toMatch(/jester|win|revenge|executioner|target/i)

    const revealedState = dayState(true)
    const revealedExecution = executePlayerAndCompleteDay(
      revealedState,
      revealedState.game.players[2]?.playerId ?? nightFixturePlayerId('missing-player'),
    )
    if (!revealedExecution.ok) throw new Error('Expected revealed Citizen execution.')
    expect(selectPublicDayOutcomeView(revealedExecution.value)).toMatchObject({
      outcome: {
        kind: 'player-executed',
        playerDisplayLabel: 'Taylor',
        revealedRoleDisplayName: 'Citizen',
      },
    })
  })

  it('returns a public no-execution summary without creating a later workflow', () => {
    const result = completeDayWithoutExecution(dayState())

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected no-execution completion.')
    expect(selectPublicDayOutcomeView(result.value)).toEqual({
      dayNumber: 1,
      dayLabel: 'Day 1',
      outcome: { kind: 'no-execution' },
    })
    expect(result.value).not.toHaveProperty('workflow')
    expect(result.value).not.toHaveProperty('winner')
  })
})
