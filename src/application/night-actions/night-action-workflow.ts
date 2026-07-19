import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameCommandError } from '@/domain/game/game-errors.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import { handleGameCommand } from '@/domain/game/game-reducer.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId, RoleId, RoleInstanceId } from '@/domain/identifiers.ts'
import type { InvestigationGroup } from '@/domain/investigation/investigation-groups.ts'
import {
  createCollectedNightActions,
  createSubmittedNightAction,
  validatePreviousNightTargets,
  type CollectedNightActions,
  type NightActionBatchError,
  type NightActionValidationError,
  type PreviousNightTarget,
  type SubmittedNightAction,
} from '@/domain/night-actions/night-action.ts'
import type { Player } from '@/domain/players/player.ts'
import { ROLE_IDS, findRoleDefinition } from '@/domain/roles/role-registry.ts'
import { resolveDetectiveResults } from '@/domain/resolution/detective-results.ts'
import { resolveFrames } from '@/domain/resolution/frames.ts'
import { resolveInvestigationResults } from '@/domain/resolution/investigation-results.ts'
import type { DetectiveResult, SheriffResult } from '@/domain/resolution/night-resolution-models.ts'
import { isActorBlockedByConfirmedConsortActions } from '@/domain/resolution/role-blocks.ts'
import { resolveSheriffResults } from '@/domain/resolution/sheriff-results.ts'
import { buildFinalVisits } from '@/domain/resolution/visits.ts'

import type { RoleDistributionWorkflow } from '../role-assignment/role-distribution-workflow.ts'
import {
  buildNightActionSequence,
  type NightSequenceError,
  type NightSequenceStep,
} from './night-sequence.ts'

type ImmediateOutcomeBase = Readonly<{
  actorPlayerId: PlayerId
  actorRoleId: RoleId
  actorRoleInstanceId: RoleInstanceId
}>

export type ImmediateNightOutcome =
  | (ImmediateOutcomeBase & Readonly<{ kind: 'blocked' }>)
  | (ImmediateOutcomeBase &
      Readonly<{
        kind: 'sheriff-result'
        targetPlayerId: PlayerId
        status: SheriffResult['status']
      }>)
  | (ImmediateOutcomeBase &
      Readonly<{
        kind: 'investigation-result'
        targetPlayerId: PlayerId
        investigationRole: 'investigator' | 'consigliere'
        group: InvestigationGroup
      }>)
  | (ImmediateOutcomeBase &
      Readonly<{
        kind: 'detective-result'
        targetPlayerId: PlayerId
        result:
          | Readonly<{ status: 'visited-nobody' }>
          | Readonly<{ status: 'visited-player'; visitedPlayerId: PlayerId }>
      }>)

export type SequentialNightStepRecord =
  | Readonly<{
      stepIndex: number
      status: 'blocked'
      actorPlayerId: PlayerId
      actorRoleId: RoleId
      actorRoleInstanceId: RoleInstanceId
      outcome: Extract<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>>
    }>
  | Readonly<{
      stepIndex: number
      status: 'action-confirmed'
      actorPlayerId: PlayerId
      actorRoleId: RoleId
      actorRoleInstanceId: RoleInstanceId
      action: SubmittedNightAction
      outcome: Exclude<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>> | null
    }>

type ActiveSequentialNightFields = Readonly<{
  game: GameState
  participants: readonly Player[]
  steps: readonly NightSequenceStep[]
  previousTargets: readonly PreviousNightTarget[]
  currentStepIndex: number
  completedSteps: readonly SequentialNightStepRecord[]
}>

export type NightActionCollectionWorkflow =
  | Readonly<{
      status: 'not-started'
      distribution: RoleDistributionWorkflow
    }>
  | (ActiveSequentialNightFields &
      Readonly<{
        status: 'collecting'
        currentOutcome: null
      }>)
  | (ActiveSequentialNightFields &
      Readonly<{
        status: 'awaiting-outcome-acknowledgement'
        currentOutcome: ImmediateNightOutcome
      }>)
  | (Omit<ActiveSequentialNightFields, 'currentStepIndex'> &
      Readonly<{
        status: 'complete'
        currentStepIndex: number
        currentOutcome: null
        collectedActions: CollectedNightActions
      }>)

export type CollectingNightActionsWorkflow = Extract<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'collecting' }>
>

export type AwaitingNightOutcomeWorkflow = Extract<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'awaiting-outcome-acknowledgement' }>
>

export type CompleteNightActionsWorkflow = Extract<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'complete' }>
>

export type ActiveNightActionCollectionWorkflow = Exclude<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'not-started' }>
>

export type NightActionCollectionOperation = 'begin-first-night' | 'confirm-target' | 'continue'

export type NightActionCollectionError =
  | NightSequenceError
  | NightActionValidationError
  | NightActionBatchError
  | Readonly<{ type: 'DISTRIBUTION_NOT_CONFIRMED' }>
  | Readonly<{ type: 'INVALID_STARTING_PHASE'; currentPhase: GameState['phase'] }>
  | Readonly<{ type: 'EXECUTIONER_BRIEFING_REQUIRED'; actorPlayerId: PlayerId }>
  | Readonly<{ type: 'INVALID_STARTED_NIGHT_PHASE'; currentPhase: GameState['phase'] }>
  | Readonly<{ type: 'ACTIVE_GAME_REJECTED'; error: GameCommandError }>
  | Readonly<{
      type: 'INVALID_WORKFLOW_STATE'
      operation: NightActionCollectionOperation
      status: NightActionCollectionWorkflow['status']
    }>
  | Readonly<{
      type: 'INVALID_SEQUENCE_STEP'
      operation: NightActionCollectionOperation
      stepType: NightSequenceStep['type']
    }>
  | Readonly<{
      type: 'NO_VALID_TARGETS'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{ type: 'SEQUENCE_BOUNDARY'; direction: 'next' }>
  | Readonly<{
      type: 'ACTOR_ALREADY_COMPLETED'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'ACTOR_BLOCKED'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'MISSING_BLOCK_STATE'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'INVALID_CURRENT_OUTCOME'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'OUTCOME_ACTOR_MISMATCH'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{ type: 'PRIVATE_OUTCOME_PENDING' }>
  | Readonly<{ type: 'DETECTIVE_ACTION_RECORDED_AS_VISIT' }>
  | Readonly<{ type: 'IMMEDIATE_RESULT_DISAGREEMENT' }>
  | Readonly<{
      type: 'INVALID_IMMEDIATE_OUTCOME_ROLE'
      actorRoleId: RoleId
    }>

export function createNightActionCollectionWorkflow(
  distribution: RoleDistributionWorkflow,
): NightActionCollectionWorkflow {
  return Object.freeze({ status: 'not-started', distribution })
}

export function beginFirstNight(
  workflow: NightActionCollectionWorkflow,
): DomainResult<CollectingNightActionsWorkflow, NightActionCollectionError> {
  if (workflow.status !== 'not-started') {
    return invalidWorkflowState('begin-first-night', workflow.status)
  }
  if (workflow.distribution.status !== 'confirmed') {
    return fail({ type: 'DISTRIBUTION_NOT_CONFIRMED' })
  }

  const startingGame = workflow.distribution.game
  if (startingGame.phase !== 'role-distribution') {
    return fail({ type: 'INVALID_STARTING_PHASE', currentPhase: startingGame.phase })
  }
  const executionerRequiringBriefing = startingGame.players.find(
    (player) => player.role.roleId === ROLE_IDS.executioner,
  )
  if (executionerRequiringBriefing !== undefined) {
    return fail({
      type: 'EXECUTIONER_BRIEFING_REQUIRED',
      actorPlayerId: executionerRequiringBriefing.playerId,
    })
  }

  const gameResult = handleGameCommand(startingGame, {
    type: 'ADVANCE_PHASE',
    targetPhase: 'night-action-collection',
  })
  if (!gameResult.ok) {
    return fail({ type: 'ACTIVE_GAME_REJECTED', error: gameResult.error })
  }

  return createNightActionCollectionForStartedNight(
    gameResult.value.state,
    workflow.distribution.setup.participatingPlayers,
  )
}

export function createNightActionCollectionForStartedNight(
  game: GameState,
  participants: readonly Player[],
): DomainResult<CollectingNightActionsWorkflow, NightActionCollectionError> {
  if (game.phase !== 'night-action-collection') {
    return fail({ type: 'INVALID_STARTED_NIGHT_PHASE', currentPhase: game.phase })
  }

  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'ACTIVE_GAME_REJECTED', error: gameResult.error })
  }
  const sequenceResult = buildNightActionSequence(gameResult.value)
  if (!sequenceResult.ok) {
    return sequenceResult
  }
  const previousTargetsResult = validatePreviousNightTargets(
    gameResult.value,
    selectDoctorPreviousTargetsForNight(gameResult.value),
  )
  if (!previousTargetsResult.ok) {
    return previousTargetsResult
  }

  for (const step of sequenceResult.value) {
    if (step.type !== 'actor-action') {
      continue
    }
    const hasValidTarget = gameResult.value.players.some(
      (target) =>
        createActionForStep(
          gameResult.value,
          step,
          target.playerId,
          findPreviousTarget(previousTargetsResult.value, step.actorRoleInstanceId),
        ).ok,
    )
    if (!hasValidTarget) {
      return fail({
        type: 'NO_VALID_TARGETS',
        actorPlayerId: step.actorPlayerId,
        actorRoleInstanceId: step.actorRoleInstanceId,
      })
    }
  }

  return succeed(
    deepFreeze({
      status: 'collecting',
      game: gameResult.value,
      participants: participants.map((player) => ({ ...player })),
      steps: sequenceResult.value,
      previousTargets: previousTargetsResult.value,
      currentStepIndex: 0,
      completedSteps: [],
      currentOutcome: null,
    }),
  )
}

export function selectDoctorPreviousTargetsForNight(
  game: GameState,
): readonly PreviousNightTarget[] {
  return Object.freeze(
    game.doctorPreviousTargets.map((entry) =>
      Object.freeze({
        actorRoleInstanceId: entry.doctorRoleInstanceId,
        targetPlayerId: entry.targetPlayerId,
      }),
    ),
  )
}

export function continueNightActionCollection(
  workflow: NightActionCollectionWorkflow,
): DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError> {
  if (workflow.status === 'awaiting-outcome-acknowledgement') {
    return advanceAfterPrivateOutcome(workflow)
  }
  if (workflow.status !== 'collecting') {
    return invalidWorkflowState('continue', workflow.status)
  }

  const currentStep = getCurrentStep(workflow)
  if (currentStep.type !== 'mafia-overview') {
    return fail({
      type: 'INVALID_SEQUENCE_STEP',
      operation: 'continue',
      stepType: currentStep.type,
    })
  }

  const nextIndex = workflow.currentStepIndex + 1
  return nextIndex >= workflow.steps.length
    ? completeNightActionCollection(workflow)
    : advanceToStep(workflow, nextIndex)
}

export function confirmNightActionTarget(
  workflow: NightActionCollectionWorkflow,
  targetPlayerId: PlayerId,
): DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError> {
  const actionResult = validateCurrentNightActionTarget(workflow, targetPlayerId)
  if (!actionResult.ok) {
    return actionResult
  }
  if (workflow.status !== 'collecting') {
    return invalidWorkflowState('confirm-target', workflow.status)
  }

  const confirmedActions = selectConfirmedActions(workflow.completedSteps)
  const immediateOutcomeResult = resolveImmediateOutcome(
    workflow.game,
    [...confirmedActions, actionResult.value],
    actionResult.value,
  )
  if (!immediateOutcomeResult.ok) {
    return immediateOutcomeResult
  }
  const record: SequentialNightStepRecord = deepFreeze({
    stepIndex: workflow.currentStepIndex,
    status: 'action-confirmed',
    actorPlayerId: actionResult.value.actorPlayerId,
    actorRoleId: actionResult.value.actorRoleId,
    actorRoleInstanceId: actionResult.value.actorRoleInstanceId,
    action: actionResult.value,
    outcome: immediateOutcomeResult.value,
  })

  const confirmedWorkflow: CollectingNightActionsWorkflow = deepFreeze({
    ...workflow,
    completedSteps: [...workflow.completedSteps, record],
    currentOutcome: null,
  })

  if (immediateOutcomeResult.value === null) {
    return advanceAfterCurrentStep(confirmedWorkflow)
  }

  return succeed(
    deepFreeze({
      ...confirmedWorkflow,
      status: 'awaiting-outcome-acknowledgement',
      currentOutcome: immediateOutcomeResult.value,
    }),
  )
}

export function validateCurrentNightActionTarget(
  workflow: NightActionCollectionWorkflow,
  targetPlayerId: PlayerId,
): DomainResult<SubmittedNightAction, NightActionCollectionError> {
  if (workflow.status === 'awaiting-outcome-acknowledgement') {
    return fail({ type: 'PRIVATE_OUTCOME_PENDING' })
  }
  if (workflow.status !== 'collecting') {
    return invalidWorkflowState('confirm-target', workflow.status)
  }

  const step = getCurrentStep(workflow)
  if (step.type !== 'actor-action') {
    return fail({
      type: 'INVALID_SEQUENCE_STEP',
      operation: 'confirm-target',
      stepType: step.type,
    })
  }
  if (
    workflow.completedSteps.some(
      (record) => record.actorRoleInstanceId === step.actorRoleInstanceId,
    )
  ) {
    return fail({
      type: 'ACTOR_ALREADY_COMPLETED',
      actorRoleInstanceId: step.actorRoleInstanceId,
    })
  }

  const confirmedActions = selectConfirmedActions(workflow.completedSteps)
  if (
    isActorBlockedByConfirmedConsortActions(
      workflow.game,
      step.actorRoleInstanceId,
      confirmedActions,
    )
  ) {
    return fail({ type: 'ACTOR_BLOCKED', actorRoleInstanceId: step.actorRoleInstanceId })
  }

  const actionResult = createActionForStep(
    workflow.game,
    step,
    targetPlayerId,
    findPreviousTarget(workflow.previousTargets, step.actorRoleInstanceId),
  )
  if (!actionResult.ok) {
    return actionResult
  }
  return actionResult
}

function advanceAfterPrivateOutcome(
  workflow: AwaitingNightOutcomeWorkflow,
): DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError> {
  const currentStep = getCurrentStep(workflow)
  if (
    currentStep.type !== 'actor-action' ||
    currentStep.actorRoleInstanceId !== workflow.currentOutcome.actorRoleInstanceId
  ) {
    return fail({
      type: 'OUTCOME_ACTOR_MISMATCH',
      actorRoleInstanceId: workflow.currentOutcome.actorRoleInstanceId,
    })
  }

  const currentRecord = workflow.completedSteps.at(-1)
  if (
    currentRecord === undefined ||
    currentRecord.actorRoleInstanceId !== workflow.currentOutcome.actorRoleInstanceId ||
    currentRecord.stepIndex !== workflow.currentStepIndex ||
    currentRecord.outcome === null ||
    !immediateOutcomesMatch(currentRecord.outcome, workflow.currentOutcome)
  ) {
    return fail({
      type: 'INVALID_CURRENT_OUTCOME',
      actorRoleInstanceId: workflow.currentOutcome.actorRoleInstanceId,
    })
  }

  return advanceAfterCurrentStep(
    deepFreeze({ ...workflow, status: 'collecting', currentOutcome: null }),
  )
}

function completeNightActionCollection(
  workflow: CollectingNightActionsWorkflow,
): DomainResult<CompleteNightActionsWorkflow, NightActionCollectionError> {
  const collectedResult = createCollectedNightActions(
    workflow.game,
    selectConfirmedActions(workflow.completedSteps),
    workflow.previousTargets,
  )
  if (!collectedResult.ok) {
    return collectedResult
  }

  return succeed(
    deepFreeze({
      ...workflow,
      status: 'complete',
      currentStepIndex: workflow.steps.length,
      currentOutcome: null,
      collectedActions: collectedResult.value,
    }),
  )
}

function advanceAfterCurrentStep(
  workflow: CollectingNightActionsWorkflow,
): DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError> {
  const nextIndex = workflow.currentStepIndex + 1
  return nextIndex >= workflow.steps.length
    ? completeNightActionCollection(workflow)
    : advanceToStep(workflow, nextIndex)
}

function advanceToStep(
  workflow: CollectingNightActionsWorkflow,
  nextIndex: number,
): DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError> {
  const nextStep = workflow.steps[nextIndex]
  if (nextStep === undefined) {
    return fail({ type: 'SEQUENCE_BOUNDARY', direction: 'next' })
  }

  const collecting = deepFreeze({ ...workflow, currentStepIndex: nextIndex })
  if (nextStep.type !== 'actor-action') {
    return succeed(collecting)
  }

  const actor = workflow.game.players.find(
    (player) => player.role.instanceId === nextStep.actorRoleInstanceId,
  )
  if (actor === undefined) {
    return fail({
      type: 'MISSING_BLOCK_STATE',
      actorRoleInstanceId: nextStep.actorRoleInstanceId,
    })
  }
  const confirmedActions = selectConfirmedActions(workflow.completedSteps)
  if (
    !isActorBlockedByConfirmedConsortActions(
      workflow.game,
      nextStep.actorRoleInstanceId,
      confirmedActions,
    )
  ) {
    return succeed(collecting)
  }

  const outcome: Extract<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>> = Object.freeze({
    kind: 'blocked',
    actorPlayerId: actor.playerId,
    actorRoleId: actor.role.roleId,
    actorRoleInstanceId: actor.role.instanceId,
  })
  const record: SequentialNightStepRecord = deepFreeze({
    stepIndex: nextIndex,
    status: 'blocked',
    actorPlayerId: actor.playerId,
    actorRoleId: actor.role.roleId,
    actorRoleInstanceId: actor.role.instanceId,
    outcome,
  })

  return succeed(
    deepFreeze({
      ...collecting,
      status: 'awaiting-outcome-acknowledgement',
      completedSteps: [...collecting.completedSteps, record],
      currentOutcome: outcome,
    }),
  )
}

function resolveImmediateOutcome(
  game: GameState,
  confirmedActions: readonly SubmittedNightAction[],
  currentAction: SubmittedNightAction,
): DomainResult<
  Exclude<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>> | null,
  NightActionCollectionError
> {
  const base = Object.freeze({
    actorPlayerId: currentAction.actorPlayerId,
    actorRoleId: currentAction.actorRoleId,
    actorRoleInstanceId: currentAction.actorRoleInstanceId,
  })

  switch (currentAction.actorRoleId) {
    case ROLE_IDS.consort:
    case ROLE_IDS.framer:
    case ROLE_IDS.godfather:
    case ROLE_IDS.serialKiller:
    case ROLE_IDS.doctor:
      return succeed(null)
    case ROLE_IDS.sheriff: {
      const frames = resolveFrames(game, confirmedActions)
      const result = resolveSheriffResults(game, confirmedActions, frames)
      if (!result.ok) {
        return fail({ type: 'IMMEDIATE_RESULT_DISAGREEMENT' })
      }
      const currentResult = result.value.find(
        (entry) => entry.actorRoleInstanceId === currentAction.actorRoleInstanceId,
      )
      return currentResult === undefined
        ? fail({ type: 'IMMEDIATE_RESULT_DISAGREEMENT' })
        : succeed(
            Object.freeze({
              ...base,
              kind: 'sheriff-result',
              targetPlayerId: currentResult.targetPlayerId,
              status: currentResult.status,
            }),
          )
    }
    case ROLE_IDS.investigator:
    case ROLE_IDS.consigliere: {
      const frames = resolveFrames(game, confirmedActions)
      const result = resolveInvestigationResults(game, confirmedActions, frames)
      if (!result.ok) {
        return fail({ type: 'IMMEDIATE_RESULT_DISAGREEMENT' })
      }
      const currentResult = result.value.find(
        (entry) => entry.actorRoleInstanceId === currentAction.actorRoleInstanceId,
      )
      if (currentResult === undefined) {
        return fail({ type: 'IMMEDIATE_RESULT_DISAGREEMENT' })
      }
      return succeed(
        Object.freeze({
          ...base,
          kind: 'investigation-result',
          targetPlayerId: currentResult.targetPlayerId,
          investigationRole:
            currentAction.actorRoleId === ROLE_IDS.investigator ? 'investigator' : 'consigliere',
          group: currentResult.group,
        }),
      )
    }
    case ROLE_IDS.detective: {
      const visits = buildFinalVisits(confirmedActions)
      if (visits.some((visit) => visit.actorRoleId === ROLE_IDS.detective)) {
        return fail({ type: 'DETECTIVE_ACTION_RECORDED_AS_VISIT' })
      }
      const result = resolveDetectiveResults([currentAction], visits).at(0)
      if (result === undefined) {
        return fail({ type: 'IMMEDIATE_RESULT_DISAGREEMENT' })
      }
      return succeed(
        Object.freeze({
          ...base,
          kind: 'detective-result',
          targetPlayerId: result.targetPlayerId,
          result: toImmediateDetectiveResult(result),
        }),
      )
    }
    default:
      return fail({
        type: 'INVALID_IMMEDIATE_OUTCOME_ROLE',
        actorRoleId: currentAction.actorRoleId,
      })
  }
}

function immediateOutcomesMatch(
  left: ImmediateNightOutcome,
  right: ImmediateNightOutcome,
): boolean {
  if (
    left.kind !== right.kind ||
    left.actorPlayerId !== right.actorPlayerId ||
    left.actorRoleId !== right.actorRoleId ||
    left.actorRoleInstanceId !== right.actorRoleInstanceId
  ) {
    return false
  }

  switch (left.kind) {
    case 'blocked':
      return true
    case 'sheriff-result':
      return (
        right.kind === left.kind &&
        left.targetPlayerId === right.targetPlayerId &&
        left.status === right.status
      )
    case 'investigation-result':
      return (
        right.kind === left.kind &&
        left.targetPlayerId === right.targetPlayerId &&
        left.investigationRole === right.investigationRole &&
        left.group.id === right.group.id
      )
    case 'detective-result':
      return (
        right.kind === left.kind &&
        left.targetPlayerId === right.targetPlayerId &&
        (left.result.status === 'visited-nobody'
          ? right.result.status === 'visited-nobody'
          : right.result.status === 'visited-player' &&
            left.result.visitedPlayerId === right.result.visitedPlayerId)
      )
  }
}

function toImmediateDetectiveResult(
  result: DetectiveResult,
): Extract<ImmediateNightOutcome, Readonly<{ kind: 'detective-result' }>>['result'] {
  return result.status === 'visited-nobody'
    ? Object.freeze({ status: 'visited-nobody' })
    : Object.freeze({
        status: 'visited-player',
        visitedPlayerId: result.visitedPlayerId,
      })
}

function createActionForStep(
  game: GameState,
  step: Extract<NightSequenceStep, Readonly<{ type: 'actor-action' }>>,
  targetPlayerId: PlayerId,
  previousTargetId: PlayerId | null,
): DomainResult<SubmittedNightAction, NightActionValidationError> {
  const actor = game.players.find((player) => player.playerId === step.actorPlayerId)
  if (actor === undefined) {
    return fail({ type: 'UNKNOWN_ACTOR', actorPlayerId: step.actorPlayerId })
  }
  const role = findRoleDefinition(actor.role.roleId)
  if (role === undefined || !role.nightAction.hasNightAction) {
    return fail({ type: 'ROLE_HAS_NO_NIGHT_ACTION', actorRoleId: actor.role.roleId })
  }

  return createSubmittedNightAction(
    game,
    {
      actorPlayerId: actor.playerId,
      actorRoleInstanceId: step.actorRoleInstanceId,
      actorRoleId: actor.role.roleId,
      actionKind: role.nightAction.actionKind,
      targetPlayerId,
    },
    previousTargetId,
  )
}

function getCurrentStep(
  workflow: CollectingNightActionsWorkflow | AwaitingNightOutcomeWorkflow,
): NightSequenceStep {
  const step = workflow.steps[workflow.currentStepIndex]
  if (step === undefined) {
    throw new Error(`Night sequence index ${String(workflow.currentStepIndex)} is out of bounds.`)
  }
  return step
}

function selectConfirmedActions(
  completedSteps: readonly SequentialNightStepRecord[],
): readonly SubmittedNightAction[] {
  return Object.freeze(
    completedSteps.flatMap((record): readonly SubmittedNightAction[] =>
      record.status === 'action-confirmed' ? [record.action] : [],
    ),
  )
}

function findPreviousTarget(
  previousTargets: readonly PreviousNightTarget[],
  actorRoleInstanceId: RoleInstanceId,
): PlayerId | null {
  return (
    previousTargets.find((target) => target.actorRoleInstanceId === actorRoleInstanceId)
      ?.targetPlayerId ?? null
  )
}

function invalidWorkflowState<Value>(
  operation: NightActionCollectionOperation,
  status: NightActionCollectionWorkflow['status'],
): DomainResult<Value, NightActionCollectionError> {
  return fail({ type: 'INVALID_WORKFLOW_STATE', operation, status })
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
