import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { InvalidPhaseTransitionError } from '../game/game-errors.ts'
import type { GamePhase } from './game-phase.ts'

const ALLOWED_PHASE_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  roster: ['setup'],
  setup: ['role-distribution'],
  'role-distribution': ['executioner-briefing', 'night-action-collection'],
  'executioner-briefing': ['night-action-collection'],
  'night-action-collection': ['night-resolution'],
  'night-resolution': ['dawn-resolution'],
  'dawn-resolution': ['dawn-announcement', 'game-over'],
  'dawn-announcement': ['day-discussion'],
  'day-discussion': ['trial', 'execution-resolution'],
  trial: ['trial-voting'],
  'trial-voting': ['execution-resolution', 'day-discussion'],
  'execution-resolution': ['night-action-collection', 'game-over'],
  'game-over': [],
}

export function getAllowedPhaseTransitions(phase: GamePhase): readonly GamePhase[] {
  return ALLOWED_PHASE_TRANSITIONS[phase]
}

export function transitionPhase(
  fromPhase: GamePhase,
  targetPhase: GamePhase,
): DomainResult<GamePhase, InvalidPhaseTransitionError> {
  const isAllowed = getAllowedPhaseTransitions(fromPhase).some(
    (allowedPhase) => allowedPhase === targetPhase,
  )

  if (!isAllowed) {
    return fail({
      type: 'INVALID_PHASE_TRANSITION',
      fromPhase,
      targetPhase,
    })
  }

  return succeed(targetPhase)
}
