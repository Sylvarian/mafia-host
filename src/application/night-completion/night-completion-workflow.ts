import { succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { CollectedNightActions } from '@/domain/night-actions/night-action.ts'
import type { Player } from '@/domain/players/player.ts'
import type { DawnAnnouncement } from '@/domain/resolution/dawn-announcement.ts'
import type { NightApplicationError } from '@/domain/resolution/night-application-errors.ts'
import { applyResolvedNight, beginNightResolution } from '@/domain/resolution/night-application.ts'
import type { NightResolution } from '@/domain/resolution/night-resolution-models.ts'

import type { CompleteNightActionsWorkflow } from '../night-actions/index.ts'
import {
  resolveCompletedNightWorkflow,
  type ResolveCompletedNightWorkflowError,
} from '../night-resolution/index.ts'

export type ReadyForDawnWorkflow = Readonly<{
  status: 'ready-for-dawn'
  game: GameState
  participants: readonly Player[]
  resolution: NightResolution
  collectedActions: CollectedNightActions
}>

export type DawnWorkflow = Readonly<{
  status: 'dawn'
  game: GameState
  participants: readonly Player[]
  dawnAnnouncement: DawnAnnouncement
}>

export type NightCompletionWorkflow = ReadyForDawnWorkflow | DawnWorkflow

export type NightCompletionError =
  | ResolveCompletedNightWorkflowError
  | NightApplicationError
  | Readonly<{ type: 'RESOLUTION_ALREADY_APPLIED' }>

export function beginFinalNightResolution(
  workflow: CompleteNightActionsWorkflow,
): DomainResult<ReadyForDawnWorkflow, NightCompletionError> {
  const resolutionResult = resolveCompletedNightWorkflow(workflow)
  if (!resolutionResult.ok) {
    return resolutionResult
  }

  const gameResult = beginNightResolution(
    workflow.game,
    resolutionResult.value,
    workflow.collectedActions,
  )
  if (!gameResult.ok) {
    return gameResult
  }

  return succeed(
    Object.freeze({
      status: 'ready-for-dawn',
      game: gameResult.value,
      participants: workflow.participants,
      resolution: resolutionResult.value,
      collectedActions: workflow.collectedActions,
    }),
  )
}

export function prepareDawnAnnouncement(
  workflow: NightCompletionWorkflow,
): DomainResult<DawnWorkflow, NightCompletionError> {
  if (workflow.status === 'dawn') {
    return { ok: false, error: { type: 'RESOLUTION_ALREADY_APPLIED' } }
  }

  const applicationResult = applyResolvedNight(
    workflow.game,
    workflow.resolution,
    workflow.collectedActions,
  )
  if (!applicationResult.ok) {
    return applicationResult
  }

  return succeed(
    Object.freeze({
      status: 'dawn',
      game: applicationResult.value.game,
      participants: workflow.participants,
      dawnAnnouncement: applicationResult.value.dawnAnnouncement,
    }),
  )
}
