import { describe, expect, it } from 'vitest'

import type { DawnWorkflow } from '@/application/night-completion/index.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import {
  confirmMayorRevealDuringDay,
  createDayDiscussionState,
  selectMayorRevealCandidates,
  selectPublicDayDiscussionView,
  type DayDiscussionState,
} from './day-discussion.ts'

function createDawnWorkflow(
  roles: Parameters<typeof createNightFixture>[0],
  revealRoleOnDeath = false,
): DawnWorkflow {
  const fixture = createNightFixture(roles, {
    phase: 'dawn-announcement',
    nightNumber: 1,
    settings: { revealRoleOnDeath },
  })
  const game: GameState = fixture.game
  const deaths = game.players
    .filter((player) => !player.alive)
    .map((player) => ({
      playerId: player.playerId,
      revealedRoleId: player.publiclyRevealedRoleId,
    }))
  return {
    status: 'dawn',
    game,
    participants: fixture.participants,
    dawnAnnouncement:
      deaths.length === 0
        ? { outcome: 'no-deaths', nightNumber: 1 }
        : { outcome: 'deaths', nightNumber: 1, deaths },
  }
}

function createDayState(
  roles: Parameters<typeof createNightFixture>[0],
  revealedIndexes: readonly number[] = [],
  revealRoleOnDeath = false,
): DayDiscussionState {
  const result = createDayDiscussionState(createDawnWorkflow(roles, revealRoleOnDeath))
  if (!result.ok) throw new Error(`Expected day state: ${result.error.type}`)
  let state = result.value
  for (const revealIndex of revealedIndexes) {
    const mayor = state.game.players[revealIndex]
    if (mayor === undefined) throw new Error('Expected selected Mayor.')
    const revealResult = confirmMayorRevealDuringDay(state, mayor.playerId)
    if (!revealResult.ok) throw new Error(`Expected Mayor reveal: ${revealResult.error.type}`)
    state = revealResult.value
  }
  return state
}

describe('day discussion application boundary', () => {
  it('drops Dawn authority and constructs only the day game and participant labels', () => {
    const dawn = createDawnWorkflow([{ roleId: ROLE_IDS.mayor }, { roleId: ROLE_IDS.citizen }])
    const result = createDayDiscussionState(dawn)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected day discussion state.')
    expect(result.value.game.phase).toBe('day-discussion')
    expect(result.value.game.dayNumber).toBe(1)
    expect(result.value.participants).toEqual(dawn.participants)
    expect(result.value).not.toHaveProperty('workflow')
    expect(result.value).not.toHaveProperty('dawnAnnouncement')
    expect(result.value).not.toHaveProperty('nightResolution')
    expect(result.value).not.toHaveProperty('currentOutcome')
    expect(Object.isFrozen(result.value)).toBe(true)
  })

  it('rejects a participant roster that does not match the Dawn game', () => {
    const dawn = createDawnWorkflow([{ roleId: ROLE_IDS.citizen }])
    const firstParticipant = dawn.participants[0]
    if (firstParticipant === undefined) throw new Error('Expected participant.')
    expect(
      createDayDiscussionState({
        ...dawn,
        participants: [
          ...dawn.participants,
          { id: firstParticipant.id, name: 'Duplicate', playing: true },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS',
        reason: 'duplicate-player',
      },
    })
  })

  it('coordinates a reveal without copying assignments into the session', () => {
    const state = createDayState([{ roleId: ROLE_IDS.mayor }, { roleId: ROLE_IDS.citizen }])
    const mayor = state.game.players[0]
    if (mayor === undefined) throw new Error('Expected Mayor.')
    const result = confirmMayorRevealDuringDay(state, mayor.playerId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected application reveal.')
    expect(result.value.game.players[0]?.publiclyRevealedRoleId).toBe(ROLE_IDS.mayor)
    expect(result.value.participants).toEqual(state.participants)
    expect(result.value.participants).not.toBe(state.participants)
    expect(result.value).not.toHaveProperty('assignments')
  })
})

describe('public day view', () => {
  it('shows only legitimate public roles across living and dead players', () => {
    const state = createDayState(
      [
        { roleId: ROLE_IDS.mayor, name: 'Hidden Mayor' },
        { roleId: ROLE_IDS.mayor, name: 'Public Mayor' },
        { roleId: ROLE_IDS.citizen, name: 'Hidden Citizen' },
        { roleId: ROLE_IDS.doctor, name: 'Dead Doctor', alive: false },
        { roleId: ROLE_IDS.jester, name: 'Dead Jester', alive: false },
      ],
      [1],
      true,
    )
    const view = selectPublicDayDiscussionView(state)

    expect(view).toMatchObject({
      dayNumber: 1,
      dayLabel: 'Day 1',
      mayorRevealAvailable: true,
    })
    expect(view.livingPlayers).toEqual([
      {
        playerId: state.game.players[0]?.playerId,
        playerDisplayLabel: 'Hidden Mayor',
        status: 'alive',
        publicRoleDisplayName: null,
        publiclyRevealedMayor: false,
        hasThreeVoteReminder: false,
      },
      {
        playerId: state.game.players[1]?.playerId,
        playerDisplayLabel: 'Public Mayor',
        status: 'alive',
        publicRoleDisplayName: 'Mayor 2',
        publiclyRevealedMayor: true,
        hasThreeVoteReminder: true,
      },
      {
        playerId: state.game.players[2]?.playerId,
        playerDisplayLabel: 'Hidden Citizen',
        status: 'alive',
        publicRoleDisplayName: null,
        publiclyRevealedMayor: false,
        hasThreeVoteReminder: false,
      },
    ])
    expect(view.deadPlayers).toEqual([
      {
        playerId: state.game.players[3]?.playerId,
        playerDisplayLabel: 'Dead Doctor',
        status: 'dead',
        publicRoleDisplayName: 'Doctor',
        publiclyRevealedMayor: false,
        hasThreeVoteReminder: false,
      },
      {
        playerId: state.game.players[4]?.playerId,
        playerDisplayLabel: 'Dead Jester',
        status: 'dead',
        publicRoleDisplayName: 'Jester',
        publiclyRevealedMayor: false,
        hasThreeVoteReminder: false,
      },
    ])
  })

  it('uses stable duplicate-name labels and strips every private or malicious property', () => {
    const state = createDayState([
      { roleId: ROLE_IDS.executioner, name: 'Alex' },
      { roleId: ROLE_IDS.mayor, name: 'Alex' },
      { roleId: ROLE_IDS.godfather, name: 'Jordan' },
      { roleId: ROLE_IDS.citizen, name: 'Taylor', alive: false },
    ])
    const maliciousState = {
      ...state,
      secretNightResolution: { attacks: ['hidden'] },
      participants: state.participants.map((participant) => ({
        ...participant,
        faction: 'hidden',
      })),
      game: {
        ...state.game,
        players: state.game.players.map((player) => ({
          ...player,
          actualRoleId: player.role.roleId,
          privateTarget: 'hidden',
        })),
      },
    }
    const view = selectPublicDayDiscussionView(maliciousState)
    const serialized = JSON.stringify(view)

    expect(view.livingPlayers.map((row) => row.playerDisplayLabel)).toEqual([
      'Alex (Player 1)',
      'Alex (Player 2)',
      'Jordan',
    ])
    expect(serialized).not.toMatch(
      /executioner|godfather|actualRoleId|privateTarget|secretNightResolution|faction|attacks|role-instance/i,
    )
  })

  it('renders multiple revealed Mayors independently without calculating votes', () => {
    const state = createDayState(
      [{ roleId: ROLE_IDS.mayor }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.mayor }],
      [0, 2],
    )
    const view = selectPublicDayDiscussionView(state)

    expect(view.livingPlayers.filter((row) => row.hasThreeVoteReminder)).toHaveLength(2)
    expect(view).not.toHaveProperty('voteCount')
    expect(JSON.stringify(view)).not.toMatch(/guilty|innocent|majority|trialCount/)
  })

  it('renders zero living players safely and makes the private reveal unavailable', () => {
    const state = createDayState([
      { roleId: ROLE_IDS.mayor, alive: false },
      { roleId: ROLE_IDS.citizen, alive: false },
    ])
    const view = selectPublicDayDiscussionView(state)

    expect(view.livingPlayers).toEqual([])
    expect(view.deadPlayers).toHaveLength(2)
    expect(view.mayorRevealAvailable).toBe(false)
    expect(selectMayorRevealCandidates(state)).toEqual([])
  })
})

describe('private Mayor candidate selector', () => {
  it('returns only living unrevealed Mayors in ordinal then roster order', () => {
    const state = createDayState(
      [
        { roleId: ROLE_IDS.mayor, name: 'Zed' },
        { roleId: ROLE_IDS.citizen, name: 'Not Mayor' },
        { roleId: ROLE_IDS.mayor, name: 'Amy' },
        { roleId: ROLE_IDS.mayor, name: 'Dead', alive: false },
      ],
      [],
    )
    const candidates = selectMayorRevealCandidates(state)

    expect(candidates).toEqual([
      {
        playerId: state.game.players[0]?.playerId,
        playerDisplayLabel: 'Zed',
      },
      {
        playerId: state.game.players[2]?.playerId,
        playerDisplayLabel: 'Amy',
      },
    ])
    expect(JSON.stringify(candidates)).not.toMatch(
      /Not Mayor|Dead|roleId|role-instance|faction|executionerTarget/,
    )
  })
})
