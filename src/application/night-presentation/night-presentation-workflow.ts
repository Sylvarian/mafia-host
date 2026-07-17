import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { CollectedNightActions } from '@/domain/night-actions/night-action.ts'
import type { Player } from '@/domain/players/player.ts'
import type { DawnAnnouncement } from '@/domain/resolution/dawn-announcement.ts'
import type { NightApplicationError } from '@/domain/resolution/night-application-errors.ts'
import { applyResolvedNight, beginNightResolution } from '@/domain/resolution/night-application.ts'
import type { NightResolution } from '@/domain/resolution/night-resolution-models.ts'

import {
  resolveCompletedNightWorkflow,
  type ResolveCompletedNightWorkflowError,
} from '../night-resolution/resolve-completed-night.ts'
import type { NightActionCollectionWorkflow } from '../night-actions/night-action-workflow.ts'
import {
  buildPrivateNightResults,
  type PrivateNightResult,
  type PrivateNightResultConstructionError,
  type PrivateNightResultId,
} from './private-night-results.ts'

type PresentationSource = Readonly<{
  game: GameState
  participants: readonly Player[]
  resolution: NightResolution
  collectedActions: CollectedNightActions
  results: readonly PrivateNightResult[]
}>

export type NightPresentationWorkflow =
  | (PresentationSource &
      Readonly<{
        status: 'private-results'
        acknowledgedResultIds: readonly PrivateNightResultId[]
        currentResultIndex: number
      }>)
  | (PresentationSource &
      Readonly<{
        status: 'ready-for-dawn'
        acknowledgedResultIds: readonly PrivateNightResultId[]
      }>)
  | Readonly<{
      status: 'dawn'
      game: GameState
      participants: readonly Player[]
      dawnAnnouncement: DawnAnnouncement
    }>

export type NightPresentationOperation =
  'acknowledge-result' | 'previous-result' | 'next-result' | 'prepare-dawn'

export type NightPresentationError =
  | ResolveCompletedNightWorkflowError
  | NightApplicationError
  | PrivateNightResultConstructionError
  | Readonly<{
      type: 'UNKNOWN_PRIVATE_RESULT_ACKNOWLEDGEMENT'
      resultId: PrivateNightResultId
    }>
  | Readonly<{
      type: 'DUPLICATE_PRIVATE_RESULT_ACKNOWLEDGEMENT'
      resultId: PrivateNightResultId
    }>
  | Readonly<{
      type: 'PRIVATE_RESULT_NOT_CURRENT'
      resultId: PrivateNightResultId
    }>
  | Readonly<{ type: 'PRIVATE_RESULTS_INCOMPLETE' }>
  | Readonly<{
      type: 'PRIVATE_RESULT_NAVIGATION_BOUNDARY'
      direction: 'previous' | 'next'
    }>
  | Readonly<{
      type: 'PRIVATE_RESULT_NOT_ACKNOWLEDGED'
      resultId: PrivateNightResultId
    }>
  | Readonly<{ type: 'RESOLUTION_ALREADY_APPLIED' }>
  | Readonly<{
      type: 'INVALID_NIGHT_PRESENTATION_WORKFLOW_STATE'
      operation: NightPresentationOperation
      status: NightPresentationWorkflow['status']
    }>

export function beginNightResultPresentation(
  nightWorkflow: NightActionCollectionWorkflow,
): DomainResult<NightPresentationWorkflow, NightPresentationError> {
  const resolutionResult = resolveCompletedNightWorkflow(nightWorkflow)
  if (!resolutionResult.ok) {
    return resolutionResult
  }

  if (nightWorkflow.status !== 'complete') {
    throw new Error('Completed night resolution returned from an incomplete workflow.')
  }

  const gameResult = beginNightResolution(
    nightWorkflow.game,
    resolutionResult.value,
    nightWorkflow.collectedActions,
  )
  if (!gameResult.ok) {
    return gameResult
  }

  const privateResultsResult = buildPrivateNightResults(
    gameResult.value,
    nightWorkflow.participants,
    resolutionResult.value,
  )
  if (!privateResultsResult.ok) {
    return privateResultsResult
  }

  const source: PresentationSource = Object.freeze({
    game: gameResult.value,
    participants: nightWorkflow.participants,
    resolution: resolutionResult.value,
    collectedActions: nightWorkflow.collectedActions,
    results: privateResultsResult.value,
  })

  return privateResultsResult.value.length === 0
    ? succeed(
        Object.freeze({
          ...source,
          status: 'ready-for-dawn',
          acknowledgedResultIds: Object.freeze([]),
        }),
      )
    : succeed(
        Object.freeze({
          ...source,
          status: 'private-results',
          acknowledgedResultIds: Object.freeze([]),
          currentResultIndex: 0,
        }),
      )
}

export function acknowledgePrivateNightResult(
  workflow: NightPresentationWorkflow,
  resultId: PrivateNightResultId,
): DomainResult<NightPresentationWorkflow, NightPresentationError> {
  if (workflow.status !== 'private-results') {
    return invalidWorkflowState('acknowledge-result', workflow)
  }
  const workflowValidation = validatePrivateResultWorkflow(workflow)
  if (!workflowValidation.ok) {
    return workflowValidation
  }

  const resultIndex = workflow.results.findIndex((result) => result.id === resultId)
  if (resultIndex === -1) {
    return fail({ type: 'UNKNOWN_PRIVATE_RESULT_ACKNOWLEDGEMENT', resultId })
  }
  if (workflow.acknowledgedResultIds.some((id) => id === resultId)) {
    return fail({ type: 'DUPLICATE_PRIVATE_RESULT_ACKNOWLEDGEMENT', resultId })
  }
  if (resultIndex !== workflow.currentResultIndex) {
    return fail({ type: 'PRIVATE_RESULT_NOT_CURRENT', resultId })
  }

  const acknowledgedResultIds = Object.freeze([...workflow.acknowledgedResultIds, resultId])

  if (acknowledgedResultIds.length === workflow.results.length) {
    return succeed(
      Object.freeze({
        status: 'ready-for-dawn',
        game: workflow.game,
        participants: workflow.participants,
        resolution: workflow.resolution,
        collectedActions: workflow.collectedActions,
        results: workflow.results,
        acknowledgedResultIds,
      }),
    )
  }

  return succeed(
    Object.freeze({
      ...workflow,
      acknowledgedResultIds,
      currentResultIndex: Math.min(workflow.currentResultIndex + 1, workflow.results.length - 1),
    }),
  )
}

export function previousPrivateNightResult(
  workflow: NightPresentationWorkflow,
): DomainResult<NightPresentationWorkflow, NightPresentationError> {
  if (workflow.status !== 'private-results') {
    return invalidWorkflowState('previous-result', workflow)
  }
  const workflowValidation = validatePrivateResultWorkflow(workflow)
  if (!workflowValidation.ok) {
    return workflowValidation
  }
  if (workflow.currentResultIndex === 0) {
    return fail({
      type: 'PRIVATE_RESULT_NAVIGATION_BOUNDARY',
      direction: 'previous',
    })
  }

  return succeed(
    Object.freeze({
      ...workflow,
      currentResultIndex: workflow.currentResultIndex - 1,
    }),
  )
}

export function nextPrivateNightResult(
  workflow: NightPresentationWorkflow,
): DomainResult<NightPresentationWorkflow, NightPresentationError> {
  if (workflow.status !== 'private-results') {
    return invalidWorkflowState('next-result', workflow)
  }
  const workflowValidation = validatePrivateResultWorkflow(workflow)
  if (!workflowValidation.ok) {
    return workflowValidation
  }

  const currentResult = workflow.results[workflow.currentResultIndex]
  if (currentResult === undefined) {
    throw new Error('Validated private result index is outside the canonical queue.')
  }
  if (!workflow.acknowledgedResultIds.some((id) => id === currentResult.id)) {
    return fail({
      type: 'PRIVATE_RESULT_NOT_ACKNOWLEDGED',
      resultId: currentResult.id,
    })
  }
  if (workflow.currentResultIndex >= workflow.results.length - 1) {
    return fail({ type: 'PRIVATE_RESULT_NAVIGATION_BOUNDARY', direction: 'next' })
  }

  return succeed(
    Object.freeze({
      ...workflow,
      currentResultIndex: workflow.currentResultIndex + 1,
    }),
  )
}

export function prepareDawnAnnouncement(
  workflow: NightPresentationWorkflow,
): DomainResult<NightPresentationWorkflow, NightPresentationError> {
  if (workflow.status === 'dawn') {
    return fail({ type: 'RESOLUTION_ALREADY_APPLIED' })
  }
  if (workflow.status === 'private-results') {
    const workflowValidation = validatePrivateResultWorkflow(workflow)
    if (!workflowValidation.ok) {
      return workflowValidation
    }
    return fail({ type: 'PRIVATE_RESULTS_INCOMPLETE' })
  }

  const workflowValidation = validateReadyForDawnWorkflow(workflow)
  if (!workflowValidation.ok) {
    return workflowValidation
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

function validatePrivateResultWorkflow(
  workflow: Extract<NightPresentationWorkflow, Readonly<{ status: 'private-results' }>>,
): DomainResult<true, PrivateNightResultConstructionError> {
  const sourceValidation = validatePresentationSource(workflow)
  if (!sourceValidation.ok) {
    return sourceValidation
  }

  if (
    workflow.results.length === 0 ||
    !Number.isSafeInteger(workflow.currentResultIndex) ||
    workflow.currentResultIndex < 0 ||
    workflow.currentResultIndex >= workflow.results.length
  ) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'invalid-current-index',
    })
  }

  const resultIds = new Set(workflow.results.map((result) => result.id))
  if (resultIds.size !== workflow.results.length) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'invalid-acknowledgements',
    })
  }
  if (!Array.isArray(workflow.acknowledgedResultIds)) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'invalid-acknowledgements',
    })
  }
  const acknowledgedIds = new Set<PrivateNightResultId>()
  for (const acknowledgedId of workflow.acknowledgedResultIds) {
    const validatedAcknowledgedId = findPrivateNightResultId(resultIds, acknowledgedId)
    if (validatedAcknowledgedId === undefined || acknowledgedIds.has(validatedAcknowledgedId)) {
      return fail({
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      })
    }
    acknowledgedIds.add(validatedAcknowledgedId)
  }
  if (acknowledgedIds.size === workflow.results.length) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'invalid-acknowledgements',
    })
  }

  return succeed(true)
}

function validateReadyForDawnWorkflow(
  workflow: Extract<NightPresentationWorkflow, Readonly<{ status: 'ready-for-dawn' }>>,
): DomainResult<true, PrivateNightResultConstructionError> {
  const sourceValidation = validatePresentationSource(workflow)
  if (!sourceValidation.ok) {
    return sourceValidation
  }
  if (!Array.isArray(workflow.acknowledgedResultIds)) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'invalid-acknowledgements',
    })
  }

  const resultIds = new Set(workflow.results.map((result) => result.id))
  const acknowledgedIds = new Set<PrivateNightResultId>()
  for (const acknowledgedId of workflow.acknowledgedResultIds) {
    const validatedAcknowledgedId = findPrivateNightResultId(resultIds, acknowledgedId)
    if (validatedAcknowledgedId === undefined || acknowledgedIds.has(validatedAcknowledgedId)) {
      return fail({
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      })
    }
    acknowledgedIds.add(validatedAcknowledgedId)
  }

  return acknowledgedIds.size === resultIds.size
    ? succeed(true)
    : fail({
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      })
}

function validatePresentationSource(
  workflow: Extract<
    NightPresentationWorkflow,
    Readonly<{ status: 'private-results' | 'ready-for-dawn' }>
  >,
): DomainResult<true, PrivateNightResultConstructionError> {
  if (!Array.isArray(workflow.results)) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'workflow-source-mismatch',
    })
  }

  const canonicalResults = buildPrivateNightResults(
    workflow.game,
    workflow.participants,
    workflow.resolution,
  )
  if (!canonicalResults.ok) {
    return canonicalResults
  }

  return hasSameCanonicalContent(canonicalResults.value, workflow.results)
    ? succeed(true)
    : fail({
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'workflow-source-mismatch',
      })
}

function hasSameCanonicalContent(canonical: unknown, candidate: unknown): boolean {
  if (Object.is(canonical, candidate)) {
    return true
  }
  if (Array.isArray(canonical)) {
    return (
      Array.isArray(candidate) &&
      canonical.length === candidate.length &&
      canonical.every((entry, index) => hasSameCanonicalContent(entry, candidate[index]))
    )
  }
  if (!isUnknownRecord(canonical) || !isUnknownRecord(candidate)) {
    return false
  }

  const canonicalKeys = Object.keys(canonical)
  const candidateKeys = Object.keys(candidate)
  return (
    canonicalKeys.length === candidateKeys.length &&
    canonicalKeys.every(
      (key) =>
        Object.hasOwn(candidate, key) && hasSameCanonicalContent(canonical[key], candidate[key]),
    )
  )
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function findPrivateNightResultId(
  resultIds: ReadonlySet<PrivateNightResultId>,
  candidate: unknown,
): PrivateNightResultId | undefined {
  return typeof candidate === 'string'
    ? [...resultIds].find((resultId) => resultId === candidate)
    : undefined
}

function invalidWorkflowState<Value>(
  operation: NightPresentationOperation,
  workflow: NightPresentationWorkflow,
): DomainResult<Value, NightPresentationError> {
  if (workflow.status === 'dawn') {
    return fail({ type: 'RESOLUTION_ALREADY_APPLIED' })
  }

  return fail({
    type: 'INVALID_NIGHT_PRESENTATION_WORKFLOW_STATE',
    operation,
    status: workflow.status,
  })
}
