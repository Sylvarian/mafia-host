import { transitionPhase } from '../phases/phase-machine.ts'
import { fail, succeed, type DomainResult } from './domain-result.ts'
import type { GameCommand } from './game-command.ts'
import type { ApplyGameEventError, GameCommandError } from './game-errors.ts'
import type { GameEvent } from './game-event.ts'
import { validateGameState } from './game-invariants.ts'
import type { GameState } from './game-state.ts'

export type AcceptedGameCommand = Readonly<{
  state: GameState
  event: GameEvent
}>

export function handleGameCommand(
  state: GameState,
  command: GameCommand,
): DomainResult<AcceptedGameCommand, GameCommandError> {
  const stateResult = validateGameState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  const phaseResult = transitionPhase(stateResult.value.phase, command.targetPhase)

  if (!phaseResult.ok) {
    return phaseResult
  }

  const event: GameEvent = {
    type: 'PHASE_ADVANCED',
    fromPhase: stateResult.value.phase,
    toPhase: phaseResult.value,
  }

  return succeed({ state: applyAcceptedPhaseEvent(stateResult.value, event), event })
}

export function applyGameEvent(
  state: GameState,
  event: GameEvent,
): DomainResult<GameState, ApplyGameEventError> {
  const stateResult = validateGameState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (event.fromPhase !== stateResult.value.phase) {
    return fail({
      type: 'EVENT_PHASE_MISMATCH',
      statePhase: stateResult.value.phase,
      eventFromPhase: event.fromPhase,
    })
  }

  const phaseResult = transitionPhase(event.fromPhase, event.toPhase)

  if (!phaseResult.ok) {
    return phaseResult
  }

  return succeed(applyAcceptedPhaseEvent(stateResult.value, event))
}

function applyAcceptedPhaseEvent(state: GameState, event: GameEvent): GameState {
  const startsNight =
    event.toPhase === 'executioner-briefing' ||
    (event.toPhase === 'night-action-collection' && event.fromPhase !== 'executioner-briefing')
  const startsDay = event.fromPhase === 'dawn-announcement' && event.toPhase === 'day-discussion'

  return {
    ...state,
    phase: event.toPhase,
    nightNumber: state.nightNumber + (startsNight ? 1 : 0),
    dayNumber: state.dayNumber + (startsDay ? 1 : 0),
  }
}
