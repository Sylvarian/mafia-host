import { describe, expect, it } from 'vitest'

import { createDayDiscussionState } from '../day-discussion/index.ts'
import { completeDayWithoutExecution, executePlayerAndCompleteDay } from '../day-outcome/index.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import { playerId, roleInstanceId } from '@/domain/identifiers.ts'
import { selectActiveRoleId } from '@/domain/neutral/executioner-conversion.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  beginSessionNextNight,
  settleSessionAfterDayOutcome,
  type ActiveAppSession,
  type DayOutcomeAppSession,
} from './active-app-session.ts'

function completedDaySession(
  roles: Parameters<typeof createNightFixture>[0],
  executedIndex?: number,
  doctorHistory = false,
): DayOutcomeAppSession {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
    doctorPreviousTargets: doctorHistory
      ? [
          {
            doctorRoleInstanceId: roleInstanceId('role-instance-2'),
            targetPlayerId: playerId('player-4'),
            nightNumber: 1,
          },
        ]
      : [],
  })
  const result =
    executedIndex === undefined
      ? completeDayWithoutExecution({
          game: fixture.game,
          participants: fixture.participants,
        })
      : executePlayerAndCompleteDay(
          { game: fixture.game, participants: fixture.participants },
          fixture.game.players[executedIndex]?.playerId ?? playerId('missing-player'),
        )
  if (!result.ok) throw new Error(`Expected completed day: ${result.error.type}`)
  return {
    stage: 'day-outcome',
    game: result.value.game,
    participants: result.value.participants,
  }
}

function settle(session: DayOutcomeAppSession): ActiveAppSession {
  const result = settleSessionAfterDayOutcome(session)
  if (!result.ok) throw new Error(`Expected settled day: ${result.error.type}`)
  return result.value
}

describe('Phase 7E next-night application flow', () => {
  it('begins Night 2 with canonical living actors, preserved authority, and clean transient state', () => {
    const waiting = settle(
      completedDaySession(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.framer, alive: false },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
        ],
        undefined,
        true,
      ),
    )
    expect(waiting.stage).toBe('post-day-waiting')
    if (waiting.stage !== 'post-day-waiting') throw new Error('Expected ordinary waiting.')
    const result = beginSessionNextNight(waiting)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected Night 2: ${result.error.type}`)
    expect(result.value.workflow.game).toMatchObject({
      phase: 'night-action-collection',
      nightNumber: 2,
      dayNumber: 1,
    })
    expect(
      result.value.workflow.steps.flatMap((step) =>
        step.type === 'actor-action' ? [step.actorPlayerId] : [],
      ),
    ).toEqual([waiting.game.players[0]?.playerId, waiting.game.players[1]?.playerId])
    expect(result.value.workflow.completedSteps).toEqual([])
    expect(result.value.workflow.currentOutcome).toBeNull()
    expect(result.value.workflow.previousTargets).toEqual([
      {
        actorRoleInstanceId: roleInstanceId('role-instance-2'),
        targetPlayerId: playerId('player-4'),
      },
    ])
    expect(result.value.workflow.game.deathRecords).toEqual(waiting.game.deathRecords)
    expect(result.value.workflow.game.dayOutcomes).toEqual(waiting.game.dayOutcomes)
    expect(result.value.workflow.game.doctorPreviousTargets).toEqual(
      waiting.game.doctorPreviousTargets,
    )
  })

  it('begins Night 2 while retaining a due revenge obligation without selecting a victim', () => {
    const waiting = settle(
      completedDaySession(
        [
          { roleId: ROLE_IDS.jester },
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
        ],
        0,
      ),
    )
    expect(waiting.stage).toBe('pending-revenge-waiting')
    if (waiting.stage !== 'pending-revenge-waiting') {
      throw new Error('Expected pending waiting.')
    }
    const result = beginSessionNextNight(waiting)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected Night 2 with pending revenge.')
    expect(result.value.workflow.game.pendingJesterRevenges).toEqual(
      waiting.game.pendingJesterRevenges,
    )
    expect(result.value.workflow.game.pendingJesterRevenges[0]).not.toHaveProperty('victimPlayerId')
    expect(
      result.value.workflow.steps.some(
        (step) =>
          step.type === 'actor-action' && step.actorPlayerId === waiting.game.players[0]?.playerId,
      ),
    ).toBe(false)
  })

  it('keeps converted Executioners as actionless Jesters on later nights', () => {
    const waiting = settle(
      completedDaySession([
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen, alive: false },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    if (waiting.stage !== 'post-day-waiting') throw new Error('Expected ordinary waiting.')
    expect(waiting.game.executionerConversions).toHaveLength(1)
    expect(
      selectActiveRoleId(waiting.game, waiting.game.players[0]?.playerId ?? playerId('x')),
    ).toBe(ROLE_IDS.jester)
    const result = beginSessionNextNight(waiting)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected converted-role Night 2.')
    expect(
      result.value.workflow.steps.flatMap((step) =>
        step.type === 'actor-action' ? [step.actorPlayerId] : [],
      ),
    ).toEqual([waiting.game.players[2]?.playerId])
    expect(result.value.workflow.game.executionerConversions).toEqual(
      waiting.game.executionerConversions,
    )
  })

  it('rejects next-night creation from day discussion and game over', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.citizen }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const daySession: ActiveAppSession = {
      stage: 'day-discussion',
      game: fixture.game,
      participants: fixture.participants,
    }
    expect(beginSessionNextNight(daySession)).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_ACTIVE_APP_SESSION_STAGE',
        operation: 'begin-next-night',
        stage: 'day-discussion',
      },
    })

    const gameOver = settle(
      completedDaySession([
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather, alive: false },
      ]),
    )
    expect(gameOver.stage).toBe('game-over')
    expect(beginSessionNextNight(gameOver)).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_ACTIVE_APP_SESSION_STAGE',
        operation: 'begin-next-night',
        stage: 'game-over',
      },
    })
  })

  it('continues through Day 2 into Night 3 without overwriting Day 1 authority', () => {
    const dayOne = settle(
      completedDaySession([
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    if (dayOne.stage !== 'post-day-waiting') throw new Error('Expected Day 1 waiting.')
    const nightTwo = beginSessionNextNight(dayOne)
    if (!nightTwo.ok) throw new Error('Expected Night 2.')
    const dawnGame = validateGameState({
      ...nightTwo.value.workflow.game,
      phase: 'dawn-announcement',
    })
    if (!dawnGame.ok) throw new Error(`Expected Dawn 2: ${dawnGame.error.type}`)
    const dayTwo = createDayDiscussionState({
      status: 'dawn',
      game: dawnGame.value,
      participants: nightTwo.value.workflow.participants,
      dawnAnnouncement: { outcome: 'no-deaths', nightNumber: 2 },
    })
    if (!dayTwo.ok) throw new Error(`Expected Day 2: ${dayTwo.error.type}`)
    expect(dayTwo.value.game).toMatchObject({ nightNumber: 2, dayNumber: 2 })
    const completedDayTwo = completeDayWithoutExecution(dayTwo.value)
    if (!completedDayTwo.ok) throw new Error('Expected Day 2 completion.')
    expect(completedDayTwo.value.game.dayOutcomes).toEqual([
      { kind: 'no-execution', gameId: dayOne.game.id, dayNumber: 1 },
      { kind: 'no-execution', gameId: dayOne.game.id, dayNumber: 2 },
    ])
    const settledDayTwo = settleSessionAfterDayOutcome({
      stage: 'day-outcome',
      game: completedDayTwo.value.game,
      participants: completedDayTwo.value.participants,
    })
    if (!settledDayTwo.ok) throw new Error('Expected Day 2 settlement.')
    const nightThree = beginSessionNextNight(settledDayTwo.value)

    expect(nightThree.ok).toBe(true)
    if (!nightThree.ok) throw new Error('Expected Night 3.')
    expect(nightThree.value.workflow.game).toMatchObject({
      phase: 'night-action-collection',
      nightNumber: 3,
      dayNumber: 2,
    })
    expect(nightThree.value.workflow.game.dayOutcomes).toEqual(
      completedDayTwo.value.game.dayOutcomes,
    )
  })
})
