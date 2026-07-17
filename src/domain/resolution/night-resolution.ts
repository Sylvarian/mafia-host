import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import { validateInvestigationGroups } from '../investigation/investigation-groups.ts'
import {
  validateCollectedNightActions,
  type CollectedNightActions,
  type PreviousNightTarget,
} from '../night-actions/night-action.ts'
import { resolveAttacks, determineProvisionalDeaths } from './attacks.ts'
import {
  orderNightActionsForResolution,
  validateResolutionRoleMetadata,
} from './canonical-order.ts'
import { resolveDetectiveResults } from './detective-results.ts'
import { resolveFrames } from './frames.ts'
import { resolveInvestigationResults } from './investigation-results.ts'
import type { NightResolutionError } from './night-resolution-errors.ts'
import type { NightResolution } from './night-resolution-models.ts'
import { resolveProtections } from './protections.ts'
import { resolveRoleBlocks, selectEffectiveActions } from './role-blocks.ts'
import { resolveSheriffResults } from './sheriff-results.ts'
import { buildFinalVisits } from './visits.ts'

export type NightResolutionInput = Readonly<{
  game: GameState
  collectedActions: CollectedNightActions
  previousTargets: readonly PreviousNightTarget[]
}>

export function resolveNight(
  input: NightResolutionInput,
): DomainResult<NightResolution, NightResolutionError> {
  const { game, collectedActions, previousTargets } = input

  if (game.phase !== 'night-action-collection') {
    return fail({
      type: 'INVALID_NIGHT_RESOLUTION_PHASE',
      currentPhase: game.phase,
    })
  }

  if (collectedActions.gameId !== game.id) {
    return fail({
      type: 'NIGHT_RESOLUTION_GAME_ID_MISMATCH',
      expectedGameId: game.id,
      batchGameId: collectedActions.gameId,
    })
  }

  if (collectedActions.nightNumber !== game.nightNumber) {
    return fail({
      type: 'NIGHT_RESOLUTION_NIGHT_NUMBER_MISMATCH',
      expectedNightNumber: game.nightNumber,
      batchNightNumber: collectedActions.nightNumber,
    })
  }

  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'INVALID_GAME_STATE_FOR_NIGHT_RESOLUTION', error: gameResult.error })
  }
  const validatedGame = gameResult.value

  const metadataResult = validateResolutionRoleMetadata(validatedGame)
  if (!metadataResult.ok) {
    return metadataResult
  }

  const groupValidationResult = validateInvestigationGroups()
  if (!groupValidationResult.ok) {
    return groupValidationResult
  }

  const batchResult = validateCollectedNightActions(
    validatedGame,
    collectedActions,
    previousTargets,
  )
  if (!batchResult.ok) {
    return fail({ type: 'INVALID_COLLECTED_NIGHT_ACTIONS', error: batchResult.error })
  }

  const orderResult = orderNightActionsForResolution(validatedGame, batchResult.value.actions)
  if (!orderResult.ok) {
    return orderResult
  }
  const orderedActions = orderResult.value

  const roleBlocks = resolveRoleBlocks(validatedGame, orderedActions)
  const effectiveActions = selectEffectiveActions(orderedActions, roleBlocks.blockedActors)
  const finalVisits = buildFinalVisits(effectiveActions)
  const frames = resolveFrames(validatedGame, effectiveActions)
  const protections = resolveProtections(validatedGame, effectiveActions)
  const attackAttempts = resolveAttacks(validatedGame, effectiveActions, protections)
  const provisionalDeaths = determineProvisionalDeaths(validatedGame, attackAttempts)

  const sheriffResult = resolveSheriffResults(validatedGame, effectiveActions, frames)
  if (!sheriffResult.ok) {
    return sheriffResult
  }

  const investigationResult = resolveInvestigationResults(validatedGame, effectiveActions, frames)
  if (!investigationResult.ok) {
    return investigationResult
  }

  const detectiveResults = resolveDetectiveResults(effectiveActions, finalVisits)

  return succeed(
    Object.freeze({
      gameId: validatedGame.id,
      nightNumber: validatedGame.nightNumber,
      roleBlockAttempts: roleBlocks.attempts,
      blockedActors: roleBlocks.blockedActors,
      finalVisits,
      frames,
      protections,
      attackAttempts,
      provisionalDeaths,
      sheriffResults: sheriffResult.value,
      investigationResults: investigationResult.value,
      detectiveResults,
    }),
  )
}
