import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameInvariantError } from '../game/game-errors.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId, RoleInstanceId } from '../identifiers.ts'
import type { RandomSource } from '../randomness/random-source.ts'
import { transitionPhase } from '../phases/phase-machine.ts'
import {
  isTownPlayer,
  selectExecutionersInCanonicalOrder,
} from './executioner-target-invariants.ts'
import type { ExecutionerTarget } from './executioner-target-model.ts'

export type { ExecutionerTargetInvariantError } from './executioner-target-errors.ts'
export type { ExecutionerTarget } from './executioner-target-model.ts'
export { orderExecutionerTargets } from './executioner-target-invariants.ts'

export type FinalizeRoleDistributionError =
  | Readonly<{
      type: 'WRONG_EXECUTIONER_ASSIGNMENT_PHASE'
      currentPhase: GameState['phase']
    }>
  | Readonly<{ type: 'DISTRIBUTION_NOT_FINALIZED' }>
  | Readonly<{ type: 'EXISTING_EXECUTIONER_TARGETS' }>
  | Readonly<{
      type: 'DEAD_EXECUTIONER_BEFORE_ASSIGNMENT'
      executionerPlayerId: PlayerId
      executionerRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{ type: 'NO_ELIGIBLE_TOWN_TARGETS' }>
  | Readonly<{ type: 'INVALID_EXECUTIONER_RANDOM_OUTPUT'; value: number }>
  | Readonly<{ type: 'EXECUTIONER_ASSIGNMENT_GAME_REJECTED'; error: GameInvariantError }>

export type CompleteExecutionerBriefingPhaseError =
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_PHASE_MISMATCH'
      currentPhase: GameState['phase']
    }>
  | Readonly<{ type: 'EXECUTIONER_BRIEFING_GAME_REJECTED'; error: GameInvariantError }>

function isFinalizedConfirmation(value: unknown): value is true {
  return value === true
}

export function finalizeRoleDistributionForFirstNight(
  game: GameState,
  distributionFinalized: boolean,
  randomSource: RandomSource,
): DomainResult<GameState, FinalizeRoleDistributionError> {
  if (game.phase !== 'role-distribution') {
    return fail({
      type: 'WRONG_EXECUTIONER_ASSIGNMENT_PHASE',
      currentPhase: game.phase,
    })
  }

  if (!isFinalizedConfirmation(distributionFinalized)) {
    return fail({ type: 'DISTRIBUTION_NOT_FINALIZED' })
  }

  const candidateTargets: unknown = game.executionerTargets
  if (Array.isArray(candidateTargets) && candidateTargets.length > 0) {
    return fail({ type: 'EXISTING_EXECUTIONER_TARGETS' })
  }

  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'EXECUTIONER_ASSIGNMENT_GAME_REJECTED', error: gameResult.error })
  }

  const validatedGame = gameResult.value
  const executioners = selectExecutionersInCanonicalOrder(validatedGame.players)
  for (const executioner of executioners) {
    if (!executioner.alive) {
      return fail({
        type: 'DEAD_EXECUTIONER_BEFORE_ASSIGNMENT',
        executionerPlayerId: executioner.playerId,
        executionerRoleInstanceId: executioner.role.instanceId,
      })
    }
  }

  const eligibleTownPlayers = validatedGame.players.filter(isTownPlayer)
  if (executioners.length > 0 && eligibleTownPlayers.length === 0) {
    return fail({ type: 'NO_ELIGIBLE_TOWN_TARGETS' })
  }

  const targets: ExecutionerTarget[] = []
  for (const executioner of executioners) {
    const randomValue = randomSource.next()
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      return fail({ type: 'INVALID_EXECUTIONER_RANDOM_OUTPUT', value: randomValue })
    }

    const targetIndex = Math.floor(randomValue * eligibleTownPlayers.length)
    const target = eligibleTownPlayers[targetIndex]
    if (target === undefined) {
      throw new Error('Executioner target selection produced an impossible candidate index.')
    }

    targets.push(
      Object.freeze({
        gameId: validatedGame.id,
        executionerPlayerId: executioner.playerId,
        executionerRoleInstanceId: executioner.role.instanceId,
        targetPlayerId: target.playerId,
      }),
    )
  }

  const targetPhase = executioners.length === 0 ? 'night-action-collection' : 'executioner-briefing'
  const phaseResult = transitionPhase(validatedGame.phase, targetPhase)
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected the finalized first-night transition.')
  }

  const finalizedResult = validateGameState({
    ...validatedGame,
    phase: phaseResult.value,
    nightNumber: validatedGame.nightNumber + 1,
    executionerTargets: Object.freeze(targets),
    executionerBriefingStatus: executioners.length === 0 ? 'not-required' : 'pending',
  })

  return finalizedResult.ok
    ? succeed(deepFreeze(finalizedResult.value))
    : fail({ type: 'EXECUTIONER_ASSIGNMENT_GAME_REJECTED', error: finalizedResult.error })
}

export function completeExecutionerBriefingPhase(
  game: GameState,
): DomainResult<GameState, CompleteExecutionerBriefingPhaseError> {
  if (game.phase !== 'executioner-briefing') {
    return fail({
      type: 'EXECUTIONER_BRIEFING_PHASE_MISMATCH',
      currentPhase: game.phase,
    })
  }

  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'EXECUTIONER_BRIEFING_GAME_REJECTED', error: gameResult.error })
  }

  const phaseResult = transitionPhase(gameResult.value.phase, 'night-action-collection')
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected the completed Executioner briefing transition.')
  }

  const transitionedResult = validateGameState({
    ...gameResult.value,
    phase: phaseResult.value,
    executionerBriefingStatus: 'completed',
  })

  return transitionedResult.ok
    ? succeed(deepFreeze(transitionedResult.value))
    : fail({ type: 'EXECUTIONER_BRIEFING_GAME_REJECTED', error: transitionedResult.error })
}

function deepFreeze<Value>(value: Value): Value {
  freezeRecursively(value)
  return value
}

function freezeRecursively(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return
  }

  for (const child of Object.values(value)) {
    freezeRecursively(child)
  }
  Object.freeze(value)
}
