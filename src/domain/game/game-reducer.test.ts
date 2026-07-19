import { describe, expect, it } from 'vitest'

import { gameId, playerId, roleId, roleInstanceId } from '../identifiers.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  completeExecutionerBriefingPhase,
  finalizeRoleDistributionForFirstNight,
} from '../executioner/executioner-target.ts'
import type { GameEvent } from './game-event.ts'
import { createGame } from './game-invariants.ts'
import { applyGameEvent, handleGameCommand } from './game-reducer.ts'
import type { GameState } from './game-state.ts'

function createTestGame(): GameState {
  const participatingPlayerId = playerId('alice')
  const participatingRoleId = roleId('citizen')
  const result = createGame({
    id: gameId('game-1'),
    roster: [{ id: participatingPlayerId, name: 'Alice', playing: true }],
    players: [
      {
        playerId: participatingPlayerId,
        role: {
          instanceId: roleInstanceId('citizen-1'),
          roleId: participatingRoleId,
          ordinal: null,
        },
        alive: true,
        publiclyRevealedRoleId: null,
      },
    ],
    roleDefinitions: [{ id: participatingRoleId, name: 'Citizen', faction: 'town' }],
    settings: {
      godfatherAndSerialCanKillEachOther: false,
      godfatherAppearsSuspiciousToSheriff: true,
      doctorCanSelfProtect: false,
      doctorCannotRepeatPreviousTarget: false,
      revealRoleOnDeath: false,
      allowFirstNightKills: false,
    },
  })

  if (!result.ok) {
    throw new Error('Expected the test game to be valid.')
  }

  return result.value
}

function createExecutionerTestGame(): GameState {
  const executionerPlayerId = playerId('executioner-player')
  const townPlayerId = playerId('town-player')
  const result = createGame({
    id: gameId('executioner-game'),
    roster: [
      { id: executionerPlayerId, name: 'Executioner', playing: true },
      { id: townPlayerId, name: 'Town', playing: true },
    ],
    players: [
      {
        playerId: executionerPlayerId,
        role: {
          instanceId: roleInstanceId('executioner-role'),
          roleId: ROLE_IDS.executioner,
          ordinal: null,
        },
        alive: true,
        publiclyRevealedRoleId: null,
      },
      {
        playerId: townPlayerId,
        role: {
          instanceId: roleInstanceId('citizen-role'),
          roleId: ROLE_IDS.citizen,
          ordinal: null,
        },
        alive: true,
        publiclyRevealedRoleId: null,
      },
    ],
    roleDefinitions: [
      { id: ROLE_IDS.executioner, name: 'Executioner', faction: 'neutral' },
      { id: ROLE_IDS.citizen, name: 'Citizen', faction: 'town' },
    ],
    settings: {
      godfatherAndSerialCanKillEachOther: false,
      godfatherAppearsSuspiciousToSheriff: true,
      doctorCanSelfProtect: false,
      doctorCannotRepeatPreviousTarget: false,
      revealRoleOnDeath: false,
      allowFirstNightKills: false,
    },
  })

  if (!result.ok) {
    throw new Error('Expected the Executioner test game to be valid.')
  }

  return result.value
}

function freezeGameState(state: GameState): GameState {
  for (const player of state.players) {
    Object.freeze(player.role)
    Object.freeze(player)
  }

  for (const roleDefinition of state.roleDefinitions) {
    Object.freeze(roleDefinition)
  }

  Object.freeze(state.players)
  Object.freeze(state.roleDefinitions)
  Object.freeze(state.settings)
  return Object.freeze(state)
}

const counterTransitionCases = [
  { fromPhase: 'roster', toPhase: 'setup', nightDelta: 0, dayDelta: 0 },
  { fromPhase: 'setup', toPhase: 'role-distribution', nightDelta: 0, dayDelta: 0 },
  {
    fromPhase: 'role-distribution',
    toPhase: 'night-action-collection',
    nightDelta: 1,
    dayDelta: 0,
  },
  {
    fromPhase: 'night-action-collection',
    toPhase: 'night-resolution',
    nightDelta: 0,
    dayDelta: 0,
  },
  {
    fromPhase: 'night-resolution',
    toPhase: 'dawn-announcement',
    nightDelta: 0,
    dayDelta: 0,
  },
  {
    fromPhase: 'dawn-announcement',
    toPhase: 'day-discussion',
    nightDelta: 0,
    dayDelta: 1,
  },
  {
    fromPhase: 'dawn-announcement',
    toPhase: 'game-over',
    nightDelta: 0,
    dayDelta: 0,
  },
  { fromPhase: 'day-discussion', toPhase: 'trial', nightDelta: 0, dayDelta: 0 },
  {
    fromPhase: 'day-discussion',
    toPhase: 'night-action-collection',
    nightDelta: 1,
    dayDelta: 0,
  },
  { fromPhase: 'trial', toPhase: 'trial-voting', nightDelta: 0, dayDelta: 0 },
  {
    fromPhase: 'trial-voting',
    toPhase: 'day-discussion',
    nightDelta: 0,
    dayDelta: 0,
  },
] as const satisfies readonly Readonly<{
  fromPhase: GamePhase
  toPhase: GamePhase
  nightDelta: number
  dayDelta: number
}>[]

describe('game reducer', () => {
  it('turns an accepted command into an event and an immutable next state', () => {
    const originalState = freezeGameState(createTestGame())
    const originalSnapshot = JSON.stringify(originalState)
    const result = handleGameCommand(originalState, {
      type: 'ADVANCE_PHASE',
      targetPhase: 'night-action-collection',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected the phase command to be accepted.')
    }

    expect(result.value.event).toEqual({
      type: 'PHASE_ADVANCED',
      fromPhase: 'role-distribution',
      toPhase: 'night-action-collection',
    })
    expect(result.value.state).toMatchObject({
      phase: 'night-action-collection',
      nightNumber: 1,
      dayNumber: 0,
    })
    expect(result.value.state.settings).toEqual(originalState.settings)
    expect(result.value.state.settings.godfatherAppearsSuspiciousToSheriff).toBe(true)
    expect(result.value.state).not.toBe(originalState)
    expect(JSON.stringify(originalState)).toBe(originalSnapshot)
  })

  it('returns a typed error for an invalid command without mutating state', () => {
    const originalState = freezeGameState(createTestGame())
    const originalSnapshot = JSON.stringify(originalState)
    const result = handleGameCommand(originalState, {
      type: 'ADVANCE_PHASE',
      targetPhase: 'day-discussion',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'INVALID_PHASE_TRANSITION',
        fromPhase: 'role-distribution',
        targetPhase: 'day-discussion',
      },
    })
    expect(JSON.stringify(originalState)).toBe(originalSnapshot)
  })

  it('increments day and night counters exactly once at every phase boundary', () => {
    const startingNight = 4
    const startingDay = 3

    for (const transition of counterTransitionCases) {
      const state: GameState = {
        ...createTestGame(),
        phase: transition.fromPhase,
        nightNumber: startingNight,
        dayNumber: startingDay,
        executionerBriefingStatus:
          transition.fromPhase === 'roster' ||
          transition.fromPhase === 'setup' ||
          transition.fromPhase === 'role-distribution'
            ? 'not-started'
            : 'not-required',
      }
      const result = applyGameEvent(state, {
        type: 'PHASE_ADVANCED',
        fromPhase: transition.fromPhase,
        toPhase: transition.toPhase,
      })
      const context = `${transition.fromPhase} -> ${transition.toPhase}`

      expect(result.ok, context).toBe(true)
      if (!result.ok) {
        throw new Error(`Expected ${context} to be accepted.`)
      }

      expect(result.value.nightNumber, context).toBe(startingNight + transition.nightDelta)
      expect(result.value.dayNumber, context).toBe(startingDay + transition.dayDelta)
    }
  })

  it('replays the same accepted event sequence to the same state', () => {
    const initialState = createTestGame()
    const targets: readonly GamePhase[] = [
      'night-action-collection',
      'night-resolution',
      'dawn-announcement',
      'day-discussion',
      'night-action-collection',
    ]
    const events: GameEvent[] = []
    let commandedState = initialState

    for (const targetPhase of targets) {
      const result = handleGameCommand(commandedState, {
        type: 'ADVANCE_PHASE',
        targetPhase,
      })

      if (!result.ok) {
        throw new Error(`Expected transition to ${targetPhase} to be accepted.`)
      }

      commandedState = result.value.state
      events.push(result.value.event)
    }

    let replayedState = initialState

    for (const event of events) {
      const result = applyGameEvent(replayedState, event)

      if (!result.ok) {
        throw new Error('Expected an accepted event sequence to replay.')
      }

      replayedState = result.value
    }

    expect(replayedState).toEqual(commandedState)
    expect(replayedState).toMatchObject({ nightNumber: 2, dayNumber: 1 })
  })

  it('counts the first night once when Executioner briefing is included', () => {
    const briefingResult = finalizeRoleDistributionForFirstNight(
      createExecutionerTestGame(),
      true,
      { next: () => 0 },
    )

    if (!briefingResult.ok) {
      throw new Error('Expected Executioner briefing to begin the first night.')
    }

    const collectionResult = completeExecutionerBriefingPhase(briefingResult.value)

    expect(collectionResult.ok).toBe(true)
    if (!collectionResult.ok) {
      throw new Error('Expected night action collection after Executioner briefing.')
    }

    expect(collectionResult.value.nightNumber).toBe(1)
    expect(collectionResult.value.dayNumber).toBe(0)
  })

  it('cannot use the generic phase command to bypass Executioner target assignment and briefing', () => {
    const result = handleGameCommand(createExecutionerTestGame(), {
      type: 'ADVANCE_PHASE',
      targetPhase: 'night-action-collection',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'EXECUTIONER_BRIEFING_STATUS_MISMATCH',
        status: 'not-required',
      },
    })
  })

  it('rejects an event whose recorded source phase does not match state', () => {
    const originalState = freezeGameState(createTestGame())
    const originalSnapshot = JSON.stringify(originalState)
    const result = applyGameEvent(originalState, {
      type: 'PHASE_ADVANCED',
      fromPhase: 'day-discussion',
      toPhase: 'night-action-collection',
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'EVENT_PHASE_MISMATCH',
        statePhase: 'role-distribution',
        eventFromPhase: 'day-discussion',
      },
    })
    expect(JSON.stringify(originalState)).toBe(originalSnapshot)
  })
})
