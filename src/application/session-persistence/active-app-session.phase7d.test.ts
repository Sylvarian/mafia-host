import { describe, expect, it } from 'vitest'

import { completeDayWithoutExecution, executePlayerAndCompleteDay } from '../day-outcome/index.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  settleSessionAfterDayOutcome,
  type ActiveAppSession,
  type DayOutcomeAppSession,
} from './active-app-session.ts'

function dayOutcomeSession(
  roles: Parameters<typeof createNightFixture>[0],
  executedIndex?: number,
): DayOutcomeAppSession {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
  })
  const state = { game: { ...fixture.game, dayNumber: 1 }, participants: fixture.participants }
  let result: ReturnType<typeof completeDayWithoutExecution>
  if (executedIndex === undefined) {
    result = completeDayWithoutExecution(state)
  } else {
    const selectedPlayer = state.game.players[executedIndex]
    if (selectedPlayer === undefined) {
      throw new Error('Expected selected execution player.')
    }
    result = executePlayerAndCompleteDay(state, selectedPlayer.playerId)
  }
  if (!result.ok) throw new Error(`Could not complete day: ${result.error.type}`)
  return { stage: 'day-outcome', game: result.value.game, participants: result.value.participants }
}

describe('corrected Phase 7D application settlement', () => {
  it('enters private-safe pending waiting without evaluating, selecting, resolving, or clearing revenge', () => {
    const session = dayOutcomeSession(
      [{ roleId: ROLE_IDS.jester }, { roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      0,
    )
    const originalGame = JSON.stringify(session.game)
    const result = settleSessionAfterDayOutcome(session)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected pending waiting.')
    expect(result.value.stage).toBe('pending-revenge-waiting')
    expect(JSON.stringify(result.value.game)).toBe(originalGame)
    expect(result.value.game.pendingJesterRevenges).toEqual(session.game.pendingJesterRevenges)
    expect(result.value.game.pendingJesterRevenges[0]).not.toHaveProperty('victimPlayerId')
    expect(result.value.game.deathRecords).toEqual(session.game.deathRecords)
    expect(result.value.game.executionerConversions).toEqual(session.game.executionerConversions)
    expect(result.value.game.nightNumber).toBe(1)
    expect(result.value.game.dayNumber).toBe(1)
    expect(result.value.game.phase).toBe('execution-resolution')
    expect(result.value).not.toHaveProperty('result')
    expect(result.value).not.toHaveProperty('revengeResolution')
    expect(result.value).not.toHaveProperty('nextNight')
  })

  it('enters non-terminal waiting without starting Night 2', () => {
    const session = dayOutcomeSession([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.citizen },
    ])
    const result = settleSessionAfterDayOutcome(session)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected ordinary waiting.')
    expect(result.value).toMatchObject({
      stage: 'post-day-waiting',
      game: { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
    })
    expect(result.value).not.toHaveProperty('result')
    expect(result.value).not.toHaveProperty('nightWorkflow')
  })

  it.each([
    {
      name: 'Town',
      roles: [{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather, alive: false }],
      resultKind: 'town-victory',
    },
    {
      name: 'Mafia',
      roles: [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      resultKind: 'mafia-victory',
    },
    {
      name: 'Serial Killer',
      roles: [{ roleId: ROLE_IDS.serialKiller }, { roleId: ROLE_IDS.citizen, alive: false }],
      resultKind: 'serial-killer-victory',
    },
    {
      name: 'draw',
      roles: [
        { roleId: ROLE_IDS.citizen, alive: false },
        { roleId: ROLE_IDS.godfather, alive: false },
      ],
      resultKind: 'draw',
    },
  ] as const)('enters immutable game over for $name', ({ roles, resultKind }) => {
    const session = dayOutcomeSession(roles)
    const first = settleSessionAfterDayOutcome(session)
    const repeated = settleSessionAfterDayOutcome(session)

    expect(first.ok).toBe(true)
    expect(repeated).toEqual(first)
    if (!first.ok) throw new Error('Expected terminal session.')
    expect(first.value).toMatchObject({
      stage: 'game-over',
      game: { phase: 'game-over', nightNumber: 1, dayNumber: 1 },
      result: { kind: resultKind, gameId: session.game.id },
    })
    expect(Object.isFrozen(first.value)).toBe(true)
    expect(first.value).not.toHaveProperty('workflow')
    expect(first.value).not.toHaveProperty('nextNight')
  })

  it.each([
    {
      name: 'stalemate',
      setting: false,
      reason: 'opposing-killers-stalemate',
      alive: true,
      deathCount: 0,
    },
    {
      name: 'mutual elimination',
      setting: true,
      reason: 'opposing-killers-mutual-elimination',
      alive: false,
      deathCount: 2,
    },
  ] as const)(
    'settles the opposing-killer $name exactly once without starting another night',
    ({ setting, reason, alive, deathCount }) => {
      const fixture = createNightFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
        {
          phase: 'day-discussion',
          nightNumber: 1,
          settings: { godfatherAndSerialCanKillEachOther: setting },
        },
      )
      const state = {
        game: { ...fixture.game, dayNumber: 1 },
        participants: fixture.participants,
      }
      const completed = completeDayWithoutExecution(state)
      if (!completed.ok) throw new Error(`Could not complete day: ${completed.error.type}`)
      const session: DayOutcomeAppSession = {
        stage: 'day-outcome',
        game: completed.value.game,
        participants: completed.value.participants,
      }

      const first = settleSessionAfterDayOutcome(session)
      const retried = settleSessionAfterDayOutcome(session)

      expect(first.ok).toBe(true)
      expect(retried).toEqual(first)
      if (!first.ok || first.value.stage !== 'game-over') {
        throw new Error('Expected immediate game over.')
      }
      expect(first.value.result).toEqual({
        kind: 'draw',
        gameId: session.game.id,
        reason,
      })
      expect(first.value.game.players.every((player) => player.alive === alive)).toBe(true)
      expect(first.value.game.deathRecords).toHaveLength(deathCount)
      expect(first.value.game).toMatchObject({
        phase: 'game-over',
        nightNumber: 1,
        dayNumber: 1,
      })
      expect(first.value).not.toHaveProperty('nextNight')
      expect(first.value).not.toHaveProperty('workflow')
    },
  )

  it('fails safely when a finalized result is evaluated again', () => {
    const settled = settleSessionAfterDayOutcome(
      dayOutcomeSession([
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather, alive: false },
      ]),
    )
    if (!settled.ok || settled.value.stage !== 'game-over') {
      throw new Error('Expected game over.')
    }
    expect(settleSessionAfterDayOutcome(settled.value)).toEqual({
      ok: false,
      error: { type: 'RESULT_ALREADY_FINALIZED' },
    })
  })

  it('rejects a wrong session stage without changing it', () => {
    const session: ActiveAppSession = {
      ...dayOutcomeSession([
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ]),
      stage: 'post-day-waiting',
    }
    expect(settleSessionAfterDayOutcome(session)).toMatchObject({
      ok: false,
      error: { type: 'INVALID_ACTIVE_APP_SESSION_STAGE', operation: 'settle-post-day' },
    })
  })
})
