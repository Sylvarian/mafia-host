import { describe, expect, it } from 'vitest'

import { validateGameState } from '@/domain/game/game-invariants.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  confirmMayorRevealDuringDay,
  createDayDiscussionState,
  selectDayDiscussionView,
  selectDayVotingRequirements,
  selectMayorRevealCandidates,
  type DayDiscussionState,
} from './day-discussion.ts'

describe('day voting requirements', () => {
  it.each([
    [10, 6],
    [9, 5],
    [8, 5],
    [7, 4],
    [2, 2],
    [1, 1],
    [0, 1],
  ])('derives %i living players as %i trial votes', (livingPlayerCount, expectedVotes) => {
    expect(selectDayVotingRequirements(livingPlayerCount)).toEqual({
      livingPlayerCount,
      votesToPutOnTrial: expectedVotes,
    })
  })

  it('rejects invalid counts', () => {
    expect(() => selectDayVotingRequirements(-1)).toThrow(RangeError)
    expect(() => selectDayVotingRequirements(1.5)).toThrow(RangeError)
  })
})

describe('host Day discussion application view', () => {
  it('uses one exact host view with current roles, original roles, alignment, and death cause', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner, name: 'Converted' },
        { roleId: ROLE_IDS.citizen, name: 'Dead target', alive: false },
        { roleId: ROLE_IDS.godfather, name: 'Mafia' },
        { roleId: ROLE_IDS.mayor, name: 'Mayor' },
      ],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const state = { game: fixture.game, participants: fixture.participants }
    const viewResult = selectDayDiscussionView(state)

    expect(viewResult.ok).toBe(true)
    if (!viewResult.ok) throw new Error('Expected a host Day view.')
    expect(viewResult.value.groups).toHaveLength(3)
    expect(viewResult.value.groups.flatMap((group) => group.players)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerDisplayLabel: 'Converted',
          activeRoleDisplayName: 'Jester',
          originallyAssignedRoleDisplayName: 'Executioner',
          alignment: 'neutral',
        }),
        expect.objectContaining({
          playerDisplayLabel: 'Dead target',
          activeRoleDisplayName: 'Citizen',
          status: 'dead',
          deathCause: { kind: 'night-death', nightNumber: 1 },
        }),
        expect.objectContaining({
          playerDisplayLabel: 'Mafia',
          activeRoleDisplayName: 'Godfather',
          alignment: 'mafia',
        }),
      ]),
    )
    expect(viewResult.value.votingRequirements).toEqual({
      livingPlayerCount: 3,
      votesToPutOnTrial: 2,
    })
  })

  it('marks a confirmed Mayor reveal without hiding any other host roles', () => {
    const state = createDayState([
      { roleId: ROLE_IDS.mayor, name: 'Alex' },
      { roleId: ROLE_IDS.citizen, name: 'Alex' },
      { roleId: ROLE_IDS.godfather, name: 'Mafia' },
    ])
    const mayor = state.game.players[0]
    if (mayor === undefined) throw new Error('Expected Mayor.')
    const revealed = confirmMayorRevealDuringDay(state, mayor.playerId)
    if (!revealed.ok) throw new Error(`Expected reveal: ${revealed.error.type}`)
    const view = requireDayView(revealed.value)
    const players = view.groups.flatMap((group) => group.players)

    expect(players.find((player) => player.playerId === mayor.playerId)).toMatchObject({
      playerDisplayLabel: 'Alex (Player 1)',
      activeRoleDisplayName: 'Mayor',
      announcedRole: { displayName: 'Mayor', status: 'publicly-revealed-mayor' },
    })
    expect(players.find((player) => player.playerDisplayLabel === 'Mafia')).toMatchObject({
      activeRoleDisplayName: 'Godfather',
    })
  })

  it('selects only living unrevealed Mayors with duplicate-safe labels', () => {
    const state = createDayState([
      { roleId: ROLE_IDS.mayor, name: 'Alex' },
      { roleId: ROLE_IDS.mayor, name: 'Alex', alive: false },
      { roleId: ROLE_IDS.godfather, name: 'Mafia' },
    ])

    expect(selectMayorRevealCandidates(state)).toEqual([
      {
        playerId: state.game.players[0]?.playerId,
        playerDisplayLabel: 'Alex (Player 1)',
      },
    ])
  })

  it('rejects a mismatched participant roster', () => {
    const state = createDayState([{ roleId: ROLE_IDS.mayor }, { roleId: ROLE_IDS.godfather }])
    expect(
      selectDayDiscussionView({ ...state, participants: state.participants.slice(1) }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS' },
    })
  })
})

describe('Dawn to Day transition', () => {
  it('increments only the day counter and drops Dawn workflow authority', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.mayor }, { roleId: ROLE_IDS.godfather }],
      { phase: 'dawn-announcement', nightNumber: 1 },
    )
    const result = createDayDiscussionState({
      status: 'dawn',
      game: fixture.game,
      participants: fixture.participants,
      dawnAnnouncement: { outcome: 'no-deaths', nightNumber: 1 },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected Day 1.')
    expect(result.value.game).toMatchObject({
      phase: 'day-discussion',
      nightNumber: 1,
      dayNumber: 1,
    })
    expect(result.value).not.toHaveProperty('dawnAnnouncement')
    expect(result.value).not.toHaveProperty('importantNightEvents')
  })
})

function createDayState(roles: Parameters<typeof createNightFixture>[0]): DayDiscussionState {
  const fixture = createNightFixture(roles, { phase: 'day-discussion', nightNumber: 1 })
  const gameResult = validateGameState(fixture.game)
  if (!gameResult.ok) throw new Error(`Expected valid Day state: ${gameResult.error.type}`)
  return { game: gameResult.value, participants: fixture.participants }
}

function requireDayView(state: DayDiscussionState) {
  const result = selectDayDiscussionView(state)
  if (!result.ok) throw new Error(`Expected Day view: ${result.error.type}`)
  return result.value
}
