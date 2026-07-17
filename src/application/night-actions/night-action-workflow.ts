import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameCommandError } from '@/domain/game/game-errors.ts'
import { handleGameCommand } from '@/domain/game/game-reducer.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'
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

import type { RoleDistributionWorkflow } from '../role-assignment/role-distribution-workflow.ts'
import {
  buildNightActionSequence,
  orderNightActionsBySequence,
  type NightSequenceError,
  type NightSequenceStep,
} from './night-sequence.ts'

type ActiveNightWorkflowFields = Readonly<{
  game: GameState
  participants: readonly Player[]
  steps: readonly NightSequenceStep[]
  previousTargets: readonly PreviousNightTarget[]
}>

export type NightActionCollectionWorkflow =
  | Readonly<{
      status: 'not-started'
      distribution: RoleDistributionWorkflow
    }>
  | (ActiveNightWorkflowFields &
      Readonly<{
        status: 'collecting'
        currentStepIndex: number
        submittedActions: readonly SubmittedNightAction[]
        returnToReviewAfterActor: boolean
      }>)
  | (ActiveNightWorkflowFields &
      Readonly<{
        status: 'reviewing'
        submittedActions: readonly SubmittedNightAction[]
      }>)
  | (ActiveNightWorkflowFields &
      Readonly<{
        status: 'complete'
        collectedActions: CollectedNightActions
      }>)

export type CollectingNightActionsWorkflow = Extract<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'collecting' }>
>

export type ReviewingNightActionsWorkflow = Extract<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'reviewing' }>
>

export type CompleteNightActionsWorkflow = Extract<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'complete' }>
>

export type ActiveNightActionCollectionWorkflow = Exclude<
  NightActionCollectionWorkflow,
  Readonly<{ status: 'not-started' }>
>

export type NightActionCollectionOperation =
  'begin-first-night' | 'select-target' | 'continue' | 'previous' | 'edit-action' | 'finalise'

export type NightActionCollectionError =
  | NightSequenceError
  | NightActionValidationError
  | NightActionBatchError
  | Readonly<{ type: 'DISTRIBUTION_NOT_CONFIRMED' }>
  | Readonly<{ type: 'INVALID_STARTING_PHASE'; currentPhase: GameState['phase'] }>
  | Readonly<{
      type: 'EXECUTIONER_TARGET_REQUIRED'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{ type: 'EXECUTIONER_BRIEFING_REQUIRED'; actorPlayerId: PlayerId }>
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
  | Readonly<{
      type: 'TARGET_REQUIRED'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{ type: 'SEQUENCE_BOUNDARY'; direction: 'previous' | 'next' }>
  | Readonly<{ type: 'ACTION_NOT_FOUND'; actorRoleInstanceId: RoleInstanceId }>
  | Readonly<{
      type: 'INCOMPLETE_ACTION_BATCH'
      missingRoleInstanceIds: readonly RoleInstanceId[]
    }>

export function createNightActionCollectionWorkflow(
  distribution: RoleDistributionWorkflow,
): NightActionCollectionWorkflow {
  return { status: 'not-started', distribution }
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

  const executionerWithoutTarget = startingGame.players.find(
    (player) =>
      player.alive &&
      player.role.roleId === ROLE_IDS.executioner &&
      player.executionerTargetId === null,
  )

  if (executionerWithoutTarget !== undefined) {
    return fail({
      type: 'EXECUTIONER_TARGET_REQUIRED',
      actorPlayerId: executionerWithoutTarget.playerId,
      actorRoleInstanceId: executionerWithoutTarget.role.instanceId,
    })
  }

  const executionerRequiringBriefing = startingGame.players.find(
    (player) => player.alive && player.role.roleId === ROLE_IDS.executioner,
  )

  if (executionerRequiringBriefing !== undefined) {
    // Phase 4 does not implement or silently skip the required private briefing.
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

  const game = gameResult.value.state
  const sequenceResult = buildNightActionSequence(game)

  if (!sequenceResult.ok) {
    return sequenceResult
  }

  const previousTargetsResult = validatePreviousNightTargets(
    game,
    selectDoctorPreviousTargetsForNight(game),
  )

  if (!previousTargetsResult.ok) {
    return previousTargetsResult
  }

  const previousTargetsCopy = previousTargetsResult.value

  for (const step of sequenceResult.value) {
    if (step.type !== 'actor-action') {
      continue
    }

    const hasValidTarget = game.players.some(
      (target) =>
        createActionForStep(
          game,
          step,
          target.playerId,
          findPreviousTarget(previousTargetsCopy, step.actorRoleInstanceId),
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

  return succeed({
    status: 'collecting',
    game,
    participants: Object.freeze(
      workflow.distribution.setup.participatingPlayers.map((player) =>
        Object.freeze({ ...player }),
      ),
    ),
    steps: sequenceResult.value,
    currentStepIndex: 0,
    submittedActions: Object.freeze([]),
    previousTargets: previousTargetsCopy,
    returnToReviewAfterActor: false,
  })
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

export function selectNightActionTarget(
  workflow: NightActionCollectionWorkflow,
  targetPlayerId: PlayerId,
): DomainResult<CollectingNightActionsWorkflow, NightActionCollectionError> {
  if (workflow.status !== 'collecting') {
    return invalidWorkflowState('select-target', workflow.status)
  }

  const step = getCurrentStep(workflow)

  if (step.type !== 'actor-action') {
    return fail({
      type: 'INVALID_SEQUENCE_STEP',
      operation: 'select-target',
      stepType: step.type,
    })
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

  const existingIndex = workflow.submittedActions.findIndex(
    (action) => action.actorRoleInstanceId === step.actorRoleInstanceId,
  )
  const actions = [...workflow.submittedActions]

  if (existingIndex === -1) {
    actions.push(actionResult.value)
  } else {
    actions[existingIndex] = actionResult.value
  }

  return succeed({
    ...workflow,
    submittedActions: orderNightActionsBySequence(workflow.steps, actions),
  })
}

export function continueNightActionCollection(
  workflow: NightActionCollectionWorkflow,
): DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError> {
  if (workflow.status !== 'collecting') {
    return invalidWorkflowState('continue', workflow.status)
  }

  const step = getCurrentStep(workflow)

  if (step.type === 'review') {
    return fail({ type: 'INVALID_SEQUENCE_STEP', operation: 'continue', stepType: step.type })
  }

  if (step.type === 'actor-action') {
    const existingAction = workflow.submittedActions.find(
      (action) => action.actorRoleInstanceId === step.actorRoleInstanceId,
    )

    if (existingAction === undefined) {
      return fail({ type: 'TARGET_REQUIRED', actorRoleInstanceId: step.actorRoleInstanceId })
    }

    const actionResult = createSubmittedNightAction(
      workflow.game,
      existingAction,
      findPreviousTarget(workflow.previousTargets, step.actorRoleInstanceId),
    )

    if (!actionResult.ok) {
      return actionResult
    }

    if (workflow.returnToReviewAfterActor) {
      return succeed(toReviewing(workflow))
    }
  }

  const nextStep = workflow.steps[workflow.currentStepIndex + 1]

  if (nextStep === undefined) {
    return fail({ type: 'SEQUENCE_BOUNDARY', direction: 'next' })
  }

  return nextStep.type === 'review'
    ? succeed(toReviewing(workflow))
    : succeed({ ...workflow, currentStepIndex: workflow.currentStepIndex + 1 })
}

export function previousNightActionCollection(
  workflow: NightActionCollectionWorkflow,
): DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError> {
  if (workflow.status === 'reviewing') {
    const previousIndex = workflow.steps.length - 2

    if (previousIndex < 0) {
      return fail({ type: 'SEQUENCE_BOUNDARY', direction: 'previous' })
    }

    return succeed({
      ...workflow,
      status: 'collecting',
      currentStepIndex: previousIndex,
      returnToReviewAfterActor: false,
    })
  }

  if (workflow.status !== 'collecting') {
    return invalidWorkflowState('previous', workflow.status)
  }

  if (workflow.returnToReviewAfterActor) {
    return succeed(toReviewing(workflow))
  }

  if (workflow.currentStepIndex === 0) {
    return fail({ type: 'SEQUENCE_BOUNDARY', direction: 'previous' })
  }

  return succeed({ ...workflow, currentStepIndex: workflow.currentStepIndex - 1 })
}

export function editNightAction(
  workflow: NightActionCollectionWorkflow,
  actorRoleInstanceId: RoleInstanceId,
): DomainResult<CollectingNightActionsWorkflow, NightActionCollectionError> {
  if (workflow.status !== 'reviewing') {
    return invalidWorkflowState('edit-action', workflow.status)
  }

  if (
    !workflow.submittedActions.some((action) => action.actorRoleInstanceId === actorRoleInstanceId)
  ) {
    return fail({ type: 'ACTION_NOT_FOUND', actorRoleInstanceId })
  }

  const currentStepIndex = findActorStepIndex(workflow.steps, actorRoleInstanceId)

  if (currentStepIndex === -1) {
    throw new Error(`Submitted action ${actorRoleInstanceId} has no actor step.`)
  }

  return succeed({
    ...workflow,
    status: 'collecting',
    currentStepIndex,
    returnToReviewAfterActor: true,
  })
}

export function finaliseNightActionCollection(
  workflow: NightActionCollectionWorkflow,
): DomainResult<CompleteNightActionsWorkflow, NightActionCollectionError> {
  if (workflow.status !== 'reviewing') {
    return invalidWorkflowState('finalise', workflow.status)
  }

  const requiredActorSteps = workflow.steps.filter(
    (step): step is Extract<NightSequenceStep, Readonly<{ type: 'actor-action' }>> =>
      step.type === 'actor-action',
  )
  const requiredRoleInstanceIds = new Set(
    requiredActorSteps.map((step) => step.actorRoleInstanceId),
  )
  const unexpectedAction = workflow.submittedActions.find(
    (action) => !requiredRoleInstanceIds.has(action.actorRoleInstanceId),
  )

  if (unexpectedAction !== undefined) {
    return fail({
      type: 'UNEXPECTED_ACTION',
      actorPlayerId: unexpectedAction.actorPlayerId,
      actorRoleInstanceId: unexpectedAction.actorRoleInstanceId,
    })
  }

  const missingRoleInstanceIds = requiredActorSteps
    .filter(
      (step) =>
        !workflow.submittedActions.some(
          (action) => action.actorRoleInstanceId === step.actorRoleInstanceId,
        ),
    )
    .map((step) => step.actorRoleInstanceId)

  if (missingRoleInstanceIds.length > 0) {
    return fail({
      type: 'INCOMPLETE_ACTION_BATCH',
      missingRoleInstanceIds: Object.freeze(missingRoleInstanceIds),
    })
  }

  const batchResult = createCollectedNightActions(
    workflow.game,
    orderNightActionsBySequence(workflow.steps, workflow.submittedActions),
    workflow.previousTargets,
  )

  return batchResult.ok
    ? succeed(
        Object.freeze({
          status: 'complete',
          game: workflow.game,
          participants: workflow.participants,
          steps: workflow.steps,
          previousTargets: workflow.previousTargets,
          collectedActions: batchResult.value,
        }),
      )
    : batchResult
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

function getCurrentStep(workflow: CollectingNightActionsWorkflow): NightSequenceStep {
  const step = workflow.steps[workflow.currentStepIndex]

  if (step === undefined) {
    throw new Error(`Night sequence index ${String(workflow.currentStepIndex)} is out of bounds.`)
  }

  return step
}

function findActorStepIndex(
  steps: readonly NightSequenceStep[],
  actorRoleInstanceId: RoleInstanceId,
): number {
  return steps.findIndex(
    (step) => step.type === 'actor-action' && step.actorRoleInstanceId === actorRoleInstanceId,
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

function toReviewing(workflow: CollectingNightActionsWorkflow): ReviewingNightActionsWorkflow {
  return {
    status: 'reviewing',
    game: workflow.game,
    participants: workflow.participants,
    steps: workflow.steps,
    submittedActions: workflow.submittedActions,
    previousTargets: workflow.previousTargets,
  }
}

function invalidWorkflowState<Value>(
  operation: NightActionCollectionOperation,
  status: NightActionCollectionWorkflow['status'],
): DomainResult<Value, NightActionCollectionError> {
  return fail({ type: 'INVALID_WORKFLOW_STATE', operation, status })
}
