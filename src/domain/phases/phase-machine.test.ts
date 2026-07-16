import { describe, expect, it } from 'vitest'

import { GAME_PHASES, type GamePhase } from './game-phase.ts'
import { getAllowedPhaseTransitions, transitionPhase } from './phase-machine.ts'

const expectedTransitions = {
  roster: ['setup'],
  setup: ['role-distribution'],
  'role-distribution': ['executioner-briefing', 'night-action-collection'],
  'executioner-briefing': ['night-action-collection'],
  'night-action-collection': ['night-resolution'],
  'night-resolution': ['dawn-announcement'],
  'dawn-announcement': ['day-discussion', 'game-over'],
  'day-discussion': ['trial', 'night-action-collection'],
  trial: ['trial-voting'],
  'trial-voting': ['execution-resolution', 'day-discussion'],
  'execution-resolution': ['night-action-collection', 'game-over'],
  'game-over': [],
} as const satisfies Readonly<Record<GamePhase, readonly GamePhase[]>>

describe('phase machine', () => {
  it('defines the complete transition table for every phase', () => {
    for (const phase of GAME_PHASES) {
      expect(getAllowedPhaseTransitions(phase)).toEqual(expectedTransitions[phase])
    }
  })

  it('accepts every explicitly allowed transition', () => {
    for (const fromPhase of GAME_PHASES) {
      for (const targetPhase of expectedTransitions[fromPhase]) {
        expect(transitionPhase(fromPhase, targetPhase)).toEqual({
          ok: true,
          value: targetPhase,
        })
      }
    }
  })

  it('rejects every transition not present in the table with a typed error', () => {
    for (const fromPhase of GAME_PHASES) {
      for (const targetPhase of GAME_PHASES) {
        const isAllowed = expectedTransitions[fromPhase].some(
          (allowedPhase) => allowedPhase === targetPhase,
        )

        if (!isAllowed) {
          expect(transitionPhase(fromPhase, targetPhase)).toEqual({
            ok: false,
            error: {
              type: 'INVALID_PHASE_TRANSITION',
              fromPhase,
              targetPhase,
            },
          })
        }
      }
    }
  })

  it('makes game-over terminal', () => {
    expect(getAllowedPhaseTransitions('game-over')).toEqual([])
  })
})
