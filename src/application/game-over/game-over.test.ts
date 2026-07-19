import { describe, expect, it } from 'vitest'

import { endDayWithoutExecution, executePlayerDuringDay } from '@/domain/day/day-outcome.ts'
import {
  finalizeFactionVictory,
  evaluateFactionVictory,
} from '@/domain/win-conditions/faction-victory.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { selectPublicGameOverView, validateGameOverState } from './game-over.ts'

describe('public game-over application view', () => {
  it('shows only legitimately public roles with duplicate-safe names', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.citizen, name: 'Alex' },
        { roleId: ROLE_IDS.godfather, name: 'Alex', alive: false },
        { roleId: ROLE_IDS.jester, name: 'Jordan' },
      ],
      {
        phase: 'day-discussion',
        nightNumber: 1,
        settings: { revealRoleOnDeath: true },
      },
    )
    const completed = endDayWithoutExecution({ ...fixture.game, dayNumber: 1 })
    if (!completed.ok) throw new Error(`Expected day completion: ${completed.error.type}`)
    const evaluated = evaluateFactionVictory(completed.value)
    if (!evaluated.ok || evaluated.value.kind === 'none') {
      throw new Error('Expected terminal Town victory.')
    }
    const finalized = finalizeFactionVictory(completed.value, evaluated.value)
    if (!finalized.ok) throw new Error(`Expected finalization: ${finalized.error.type}`)

    const view = selectPublicGameOverView({
      game: finalized.value,
      participants: fixture.participants,
      result: evaluated.value,
    })

    expect(view.heading).toBe('Town wins')
    expect(view.players).toEqual([
      {
        playerDisplayLabel: 'Alex (Player 1)',
        alive: true,
        revealedRoleDisplayName: null,
      },
      {
        playerDisplayLabel: 'Alex (Player 2)',
        alive: false,
        revealedRoleDisplayName: 'Godfather',
      },
      { playerDisplayLabel: 'Jordan', alive: true, revealedRoleDisplayName: null },
    ])
    expect(JSON.stringify(view)).not.toMatch(
      /player-1|player-2|role-instance|executionerTargets|personalWins|pendingJester|conversion/i,
    )
  })

  it('preserves private personal wins while excluding them from the public selector', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner, name: 'Hidden neutral' },
        { roleId: ROLE_IDS.citizen, name: 'Executed player' },
        { roleId: ROLE_IDS.godfather, name: 'Mafia' },
      ],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const target = fixture.game.players[1]
    if (target === undefined) throw new Error('Expected Executioner target.')
    const completed = executePlayerDuringDay({ ...fixture.game, dayNumber: 1 }, target.playerId)
    if (!completed.ok) throw new Error(`Expected target execution: ${completed.error.type}`)
    const evaluated = evaluateFactionVictory(completed.value)
    if (!evaluated.ok || evaluated.value.kind !== 'mafia-victory') {
      throw new Error('Expected Mafia victory.')
    }
    const finalized = finalizeFactionVictory(completed.value, evaluated.value)
    if (!finalized.ok) throw new Error('Expected final game.')
    expect(finalized.value.personalWins).toHaveLength(1)

    const view = selectPublicGameOverView({
      game: finalized.value,
      participants: fixture.participants,
      result: evaluated.value,
    })
    expect(view.heading).toBe('Mafia wins')
    expect(JSON.stringify(view)).not.toMatch(/personal|Executioner|target|conversion/i)
  })

  it('rejects a result from the wrong game and a noncanonical winner list', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const completed = endDayWithoutExecution({ ...fixture.game, dayNumber: 1 })
    if (!completed.ok) throw new Error('Expected day completion.')
    const evaluated = evaluateFactionVictory(completed.value)
    if (!evaluated.ok || evaluated.value.kind !== 'mafia-victory') {
      throw new Error('Expected Mafia victory.')
    }
    const finalized = finalizeFactionVictory(completed.value, evaluated.value)
    if (!finalized.ok) throw new Error('Expected finalization.')

    expect(
      validateGameOverState({
        game: finalized.value,
        participants: fixture.participants,
        result: { ...evaluated.value, gameId: 'other-game' as typeof evaluated.value.gameId },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_GAME_OVER_RESULT',
        error: { type: 'FACTION_RESULT_GAME_MISMATCH' },
      },
    })
  })
})
