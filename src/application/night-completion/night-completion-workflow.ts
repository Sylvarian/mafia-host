import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { CollectedNightActions } from '@/domain/night-actions/night-action.ts'
import {
  applySelectedJesterRevenge,
  exhaustJesterRevengeWithoutSurvivor,
  selectJesterRevengeVictim,
  type ApplyJesterRevengeError,
  type SelectJesterRevengeError,
} from '@/domain/neutral/jester-revenge.ts'
import type { SelectedJesterRevenge } from '@/domain/neutral/neutral-outcome-model.ts'
import type { Player } from '@/domain/players/player.ts'
import type { RandomSource } from '@/domain/randomness/random-source.ts'
import {
  buildCurrentDawnAnnouncement,
  type DawnAnnouncement,
} from '@/domain/resolution/dawn-announcement.ts'
import {
  buildImportantNightEvents,
  captureImportantNightEventCanonicalSource,
  type ImportantNightEventCanonicalSource,
  type ImportantNightEvents,
} from '@/domain/resolution/important-night-events.ts'
import type { NightApplicationError } from '@/domain/resolution/night-application-errors.ts'
import { applyResolvedNight, beginNightResolution } from '@/domain/resolution/night-application.ts'
import type { NightResolution } from '@/domain/resolution/night-resolution-models.ts'
import { transitionPhase } from '@/domain/phases/phase-machine.ts'
import type { TerminalFactionResult } from '@/domain/win-conditions/faction-result.ts'
import {
  evaluateAndFinalizeFactionVictory,
  type FactionVictoryEvaluationError,
  type FinalizeFactionVictoryError,
} from '@/domain/win-conditions/faction-victory.ts'

import type { CompleteNightActionsWorkflow } from '../night-actions/index.ts'
import {
  resolveCompletedNightWorkflow,
  type ResolveCompletedNightWorkflowError,
} from '../night-resolution/index.ts'

export type ReadyForDawnWorkflow = Readonly<{
  status: 'ready-for-dawn'
  importantNightEventSource: ImportantNightEventCanonicalSource
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
  importantNightEvents: ImportantNightEvents
}>

export type RevengeResolutionWorkflow = Readonly<{
  status: 'revenge-resolution'
  game: GameState
  participants: readonly Player[]
  selectedRevenge: SelectedJesterRevenge
  importantNightEvents: ImportantNightEvents
}>

export type TerminalDawnWorkflow = Readonly<{
  status: 'game-over'
  game: GameState
  participants: readonly Player[]
  result: TerminalFactionResult
}>

export type NightCompletionWorkflow =
  ReadyForDawnWorkflow | RevengeResolutionWorkflow | DawnWorkflow | TerminalDawnWorkflow

export type NightCompletionError =
  | ResolveCompletedNightWorkflowError
  | NightApplicationError
  | SelectJesterRevengeError
  | ApplyJesterRevengeError
  | FactionVictoryEvaluationError
  | FinalizeFactionVictoryError
  | Readonly<{ type: 'DAWN_FINALIZATION_GAME_REJECTED' }>
  | Readonly<{ type: 'INVALID_REVENGE_RESOLUTION_WORKFLOW' }>
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
      importantNightEventSource: captureImportantNightEventCanonicalSource(
        workflow.game,
        workflow.collectedActions,
      ),
      game: gameResult.value,
      participants: workflow.participants,
      resolution: resolutionResult.value,
      collectedActions: workflow.collectedActions,
    }),
  )
}

export function finalizeNightAtDawn(
  workflow: NightCompletionWorkflow,
  randomSource: RandomSource,
): DomainResult<
  RevengeResolutionWorkflow | DawnWorkflow | TerminalDawnWorkflow,
  NightCompletionError
> {
  if (workflow.status !== 'ready-for-dawn') {
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

  return advanceDawnResolution(
    applicationResult.value.game,
    workflow.participants,
    randomSource,
    buildImportantNightEvents(workflow.resolution, workflow.importantNightEventSource),
  )
}

export function continueJesterRevengeResolution(
  workflow: RevengeResolutionWorkflow,
): DomainResult<DawnWorkflow | TerminalDawnWorkflow, NightCompletionError> {
  if (
    workflow.game.phase !== 'dawn-resolution' ||
    workflow.game.pendingJesterRevenges[0]?.id !== workflow.selectedRevenge.obligationId
  ) {
    return fail({ type: 'INVALID_REVENGE_RESOLUTION_WORKFLOW' })
  }
  const applicationResult = applySelectedJesterRevenge(workflow.game, workflow.selectedRevenge)
  return applicationResult.ok
    ? finalizeDawn(applicationResult.value, workflow.participants, workflow.importantNightEvents)
    : applicationResult
}

function advanceDawnResolution(
  game: GameState,
  participants: readonly Player[],
  randomSource: RandomSource,
  importantNightEvents: ImportantNightEvents,
): DomainResult<
  RevengeResolutionWorkflow | DawnWorkflow | TerminalDawnWorkflow,
  NightCompletionError
> {
  if (game.pendingJesterRevenges.length === 0) {
    return finalizeDawn(game, participants, importantNightEvents)
  }
  const selectionResult = selectJesterRevengeVictim(game, randomSource)
  if (!selectionResult.ok) {
    return selectionResult
  }
  if (selectionResult.value !== null) {
    return succeed(
      Object.freeze({
        status: 'revenge-resolution',
        game,
        participants,
        selectedRevenge: selectionResult.value,
        importantNightEvents,
      }),
    )
  }
  const exhaustedResult = exhaustJesterRevengeWithoutSurvivor(game)
  return exhaustedResult.ok
    ? finalizeDawn(exhaustedResult.value, participants, importantNightEvents)
    : exhaustedResult
}

function finalizeDawn(
  game: GameState,
  participants: readonly Player[],
  importantNightEvents: ImportantNightEvents,
): DomainResult<DawnWorkflow | TerminalDawnWorkflow, NightCompletionError> {
  const evaluationResult = evaluateAndFinalizeFactionVictory(game)
  if (!evaluationResult.ok) {
    return evaluationResult
  }
  if (evaluationResult.value.status === 'game-over') {
    return succeed(
      Object.freeze({
        status: 'game-over',
        game: evaluationResult.value.game,
        participants,
        result: evaluationResult.value.result,
      }),
    )
  }
  const phaseResult = transitionPhase(game.phase, 'dawn-announcement')
  if (!phaseResult.ok) {
    return fail({ type: 'DAWN_FINALIZATION_GAME_REJECTED' })
  }
  const gameResult = validateGameState({ ...game, phase: phaseResult.value })
  if (!gameResult.ok) {
    return fail({ type: 'DAWN_FINALIZATION_GAME_REJECTED' })
  }
  return succeed(
    Object.freeze({
      status: 'dawn',
      game: gameResult.value,
      participants,
      dawnAnnouncement: buildCurrentDawnAnnouncement(gameResult.value),
      importantNightEvents,
    }),
  )
}
