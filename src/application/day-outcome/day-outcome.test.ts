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
  selectDayOutcomeView,
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
  it('selects living participants with duplicate-safe active role details and no neutral metadata', () => {
    const candidates = selectDayExecutionCandidates(dayState())

    expect(candidates).toEqual([
      {
        playerId: 'player-1',
        playerDisplayLabel: 'Alex (Player 1)',
        activeRoleDisplayName: 'Jester',
        originallyAssignedRoleDisplayName: null,
        alignment: 'neutral',
        alignmentDisplayName: 'Neutral',
      },
      {
        playerId: 'player-2',
        playerDisplayLabel: 'Alex (Player 2)',
        activeRoleDisplayName: 'Executioner',
        originallyAssignedRoleDisplayName: null,
        alignment: 'neutral',
        alignmentDisplayName: 'Neutral',
      },
      {
        playerId: 'player-3',
        playerDisplayLabel: 'Taylor',
        activeRoleDisplayName: 'Citizen',
        originallyAssignedRoleDisplayName: null,
        alignment: 'town',
        alignmentDisplayName: 'Town',
      },
    ])
    expect(JSON.stringify(candidates)).not.toMatch(
      /target|personalWin|pendingJester|revenge|roleInstance/i,
    )
    expect(candidates.every(Object.isFrozen)).toBe(true)
  })

  it('separates the rule-compliant announcement from the exact host result', () => {
    const hiddenState = dayState()
    const hiddenExecution = executePlayerAndCompleteDay(
      hiddenState,
      hiddenState.game.players[0]?.playerId ?? nightFixturePlayerId('missing-player'),
    )
    if (!hiddenExecution.ok) throw new Error('Expected hidden Jester execution.')

    const hiddenView = selectDayOutcomeView(hiddenExecution.value)
    expect(hiddenView).toEqual({
      dayNumber: 1,
      dayLabel: 'Day 1',
      announcement: {
        kind: 'player-executed',
        playerDisplayLabel: 'Alex (Player 1)',
        revealedRoleDisplayName: null,
      },
      hostResult: {
        kind: 'player-executed',
        playerDisplayLabel: 'Alex (Player 1)',
        currentRoleDisplayName: 'Jester',
        originalRoleDisplayName: null,
        alignmentDisplayName: 'Neutral',
      },
    })

    const revealedState = dayState(true)
    const revealedExecution = executePlayerAndCompleteDay(
      revealedState,
      revealedState.game.players[2]?.playerId ?? nightFixturePlayerId('missing-player'),
    )
    if (!revealedExecution.ok) throw new Error('Expected revealed Citizen execution.')
    expect(selectDayOutcomeView(revealedExecution.value)).toMatchObject({
      announcement: {
        kind: 'player-executed',
        playerDisplayLabel: 'Taylor',
        revealedRoleDisplayName: 'Citizen',
      },
      hostResult: {
        currentRoleDisplayName: 'Citizen',
        alignmentDisplayName: 'Town',
      },
    })
  })

  it('returns a host no-execution summary without creating a later workflow', () => {
    const result = completeDayWithoutExecution(dayState())

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected no-execution completion.')
    expect(selectDayOutcomeView(result.value)).toEqual({
      dayNumber: 1,
      dayLabel: 'Day 1',
      announcement: { kind: 'no-execution' },
      hostResult: { kind: 'no-execution' },
    })
    expect(result.value).not.toHaveProperty('workflow')
    expect(result.value).not.toHaveProperty('winner')
  })
})
