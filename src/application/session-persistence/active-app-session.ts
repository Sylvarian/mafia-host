import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'

import {
  createGameSetupWorkflow,
  reduceGameSetupWorkflow,
  type GameSetupEditError,
  type GameSetupWorkflowCommand,
  type GameSetupWorkflowState,
} from '../game-setup/index.ts'
import {
  beginFirstNight,
  continueNightActionCollection,
  editNightAction,
  finaliseNightActionCollection,
  previousNightActionCollection,
  selectNightActionTarget,
  type ActiveNightActionCollectionWorkflow,
  type NightActionCollectionError,
} from '../night-actions/index.ts'
import {
  acknowledgePrivateNightResult,
  beginNightResultPresentation,
  nextPrivateNightResult,
  prepareDawnAnnouncement,
  previousPrivateNightResult,
  type NightPresentationError,
  type NightPresentationWorkflow,
  type PrivateNightResultId,
} from '../night-presentation/index.ts'
import {
  assignRoleDistribution,
  confirmRoleDistribution,
  createRoleDistributionWorkflow,
  reassignRoleDistribution,
  setCardDelivered,
  type ConfirmedRoleDistributionWorkflow,
  type DistributingRolesWorkflow,
  type RoleAssignmentDependencies,
  type RoleDistributionError,
} from '../role-assignment/index.ts'

export type SetupAppSession = Readonly<{
  stage: 'setup'
  workflow: GameSetupWorkflowState
}>

export type RoleDistributionAppSession = Readonly<{
  stage: 'role-distribution'
  workflow: DistributingRolesWorkflow | ConfirmedRoleDistributionWorkflow
}>

export type NightActionAppSession = Readonly<{
  stage: 'night-action'
  workflow: ActiveNightActionCollectionWorkflow
}>

export type NightPresentationAppSession = Readonly<{
  stage: 'night-presentation'
  workflow: Exclude<NightPresentationWorkflow, Readonly<{ status: 'dawn' }>>
}>

export type DawnAppSession = Readonly<{
  stage: 'dawn'
  workflow: Extract<NightPresentationWorkflow, Readonly<{ status: 'dawn' }>>
}>

export type ActiveAppSession =
  | SetupAppSession
  | RoleDistributionAppSession
  | NightActionAppSession
  | NightPresentationAppSession
  | DawnAppSession

export type ActiveAppSessionStage = ActiveAppSession['stage']

export type ActiveAppSessionOperation =
  | 'update-setup'
  | 'assign-roles'
  | 'set-card-delivery'
  | 'confirm-distribution'
  | 'reassign-roles'
  | 'begin-first-night'
  | 'confirm-night-target'
  | 'continue-night'
  | 'previous-night'
  | 'edit-night-action'
  | 'finalise-night-actions'
  | 'resolve-night'
  | 'acknowledge-private-result'
  | 'previous-private-result'
  | 'next-private-result'
  | 'prepare-dawn'

export type InvalidActiveAppSessionStageError = Readonly<{
  type: 'INVALID_ACTIVE_APP_SESSION_STAGE'
  operation: ActiveAppSessionOperation
  stage: ActiveAppSessionStage
}>

export type ActiveAppSessionError =
  | GameSetupEditError
  | RoleDistributionError
  | NightActionCollectionError
  | NightPresentationError
  | InvalidActiveAppSessionStageError

export function createActiveAppSession(): SetupAppSession {
  return Object.freeze({
    stage: 'setup',
    workflow: createGameSetupWorkflow(),
  })
}

export function updateSetupSession(
  session: ActiveAppSession,
  command: GameSetupWorkflowCommand,
): DomainResult<SetupAppSession, GameSetupEditError | InvalidActiveAppSessionStageError> {
  if (session.stage !== 'setup') {
    return invalidStage('update-setup', session.stage)
  }

  const nextWorkflow = reduceGameSetupWorkflow(session.workflow, command)
  if (nextWorkflow.status === 'editing' && nextWorkflow.editError !== null) {
    return fail(nextWorkflow.editError)
  }

  return nextWorkflow === session.workflow
    ? succeed(session)
    : succeed(Object.freeze({ stage: 'setup', workflow: nextWorkflow }))
}

export function assignSessionRoles(
  session: ActiveAppSession,
  dependencies: RoleAssignmentDependencies,
): DomainResult<
  RoleDistributionAppSession,
  RoleDistributionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'setup') {
    return invalidStage('assign-roles', session.stage)
  }
  if (session.workflow.status !== 'ready') {
    return invalidStage('assign-roles', session.stage)
  }

  const result = assignRoleDistribution(
    createRoleDistributionWorkflow(session.workflow.validatedSetup),
    dependencies,
  )

  return result.ok
    ? succeed(Object.freeze({ stage: 'role-distribution', workflow: result.value }))
    : result
}

export function setSessionCardDelivered(
  session: ActiveAppSession,
  playerId: PlayerId,
  delivered: boolean,
): DomainResult<
  RoleDistributionAppSession,
  RoleDistributionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'role-distribution') {
    return invalidStage('set-card-delivery', session.stage)
  }

  const result = setCardDelivered(session.workflow, playerId, delivered)
  return result.ok
    ? succeed(Object.freeze({ stage: 'role-distribution', workflow: result.value }))
    : result
}

export function confirmSessionRoleDistribution(
  session: ActiveAppSession,
): DomainResult<
  RoleDistributionAppSession,
  RoleDistributionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'role-distribution') {
    return invalidStage('confirm-distribution', session.stage)
  }

  const result = confirmRoleDistribution(session.workflow)
  return result.ok
    ? succeed(Object.freeze({ stage: 'role-distribution', workflow: result.value }))
    : result
}

export function reassignSessionRoles(
  session: ActiveAppSession,
  dependencies: RoleAssignmentDependencies,
): DomainResult<
  RoleDistributionAppSession,
  RoleDistributionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'role-distribution') {
    return invalidStage('reassign-roles', session.stage)
  }

  const result = reassignRoleDistribution(session.workflow, dependencies, true)
  return result.ok
    ? succeed(Object.freeze({ stage: 'role-distribution', workflow: result.value }))
    : result
}

export function beginSessionFirstNight(
  session: ActiveAppSession,
): DomainResult<
  NightActionAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'role-distribution') {
    return invalidStage('begin-first-night', session.stage)
  }

  const result = beginFirstNight({
    status: 'not-started',
    distribution: session.workflow,
  })
  return result.ok
    ? succeed(Object.freeze({ stage: 'night-action', workflow: result.value }))
    : result
}

export function confirmSessionNightTarget(
  session: ActiveAppSession,
  targetPlayerId: PlayerId,
): DomainResult<
  NightActionAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  return updateNightSession(session, 'confirm-night-target', (workflow) => {
    const selectionResult = selectNightActionTarget(workflow, targetPlayerId)

    return selectionResult.ok
      ? continueNightActionCollection(selectionResult.value)
      : selectionResult
  })
}

export function continueSessionNight(
  session: ActiveAppSession,
): DomainResult<
  NightActionAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  return updateNightSession(session, 'continue-night', continueNightActionCollection)
}

export function previousSessionNight(
  session: ActiveAppSession,
): DomainResult<
  NightActionAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  return updateNightSession(session, 'previous-night', previousNightActionCollection)
}

export function editSessionNightAction(
  session: ActiveAppSession,
  actorRoleInstanceId: RoleInstanceId,
): DomainResult<
  NightActionAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  return updateNightSession(session, 'edit-night-action', (workflow) =>
    editNightAction(workflow, actorRoleInstanceId),
  )
}

export function finaliseSessionNightActions(
  session: ActiveAppSession,
): DomainResult<
  NightActionAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  return updateNightSession(session, 'finalise-night-actions', finaliseNightActionCollection)
}

export function resolveSessionNight(
  session: ActiveAppSession,
): DomainResult<
  NightPresentationAppSession,
  NightPresentationError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'night-action') {
    return invalidStage('resolve-night', session.stage)
  }

  const result = beginNightResultPresentation(session.workflow)
  if (!result.ok) {
    return result
  }
  if (result.value.status === 'dawn') {
    throw new Error('Beginning private night-result presentation cannot apply Dawn.')
  }

  return succeed(Object.freeze({ stage: 'night-presentation', workflow: result.value }))
}

export function acknowledgeSessionPrivateResult(
  session: ActiveAppSession,
  resultId: PrivateNightResultId,
): DomainResult<
  NightPresentationAppSession,
  NightPresentationError | InvalidActiveAppSessionStageError
> {
  return updatePresentationSession(session, 'acknowledge-private-result', (workflow) =>
    acknowledgePrivateNightResult(workflow, resultId),
  )
}

export function previousSessionPrivateResult(
  session: ActiveAppSession,
): DomainResult<
  NightPresentationAppSession,
  NightPresentationError | InvalidActiveAppSessionStageError
> {
  return updatePresentationSession(session, 'previous-private-result', previousPrivateNightResult)
}

export function nextSessionPrivateResult(
  session: ActiveAppSession,
): DomainResult<
  NightPresentationAppSession,
  NightPresentationError | InvalidActiveAppSessionStageError
> {
  return updatePresentationSession(session, 'next-private-result', nextPrivateNightResult)
}

export function prepareSessionDawn(
  session: ActiveAppSession,
): DomainResult<DawnAppSession, NightPresentationError | InvalidActiveAppSessionStageError> {
  if (session.stage !== 'night-presentation') {
    return invalidStage('prepare-dawn', session.stage)
  }

  const result = prepareDawnAnnouncement(session.workflow)
  if (!result.ok) {
    return result
  }
  if (result.value.status !== 'dawn') {
    throw new Error('Preparing Dawn did not produce the terminal Phase 6 Dawn workflow.')
  }

  return succeed(Object.freeze({ stage: 'dawn', workflow: result.value }))
}

function updateNightSession(
  session: ActiveAppSession,
  operation: ActiveAppSessionOperation,
  update: (
    workflow: ActiveNightActionCollectionWorkflow,
  ) => DomainResult<ActiveNightActionCollectionWorkflow, NightActionCollectionError>,
): DomainResult<
  NightActionAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'night-action') {
    return invalidStage(operation, session.stage)
  }

  const result = update(session.workflow)
  return result.ok
    ? succeed(Object.freeze({ stage: 'night-action', workflow: result.value }))
    : result
}

function updatePresentationSession(
  session: ActiveAppSession,
  operation: ActiveAppSessionOperation,
  update: (
    workflow: Exclude<NightPresentationWorkflow, Readonly<{ status: 'dawn' }>>,
  ) => DomainResult<NightPresentationWorkflow, NightPresentationError>,
): DomainResult<
  NightPresentationAppSession,
  NightPresentationError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'night-presentation') {
    return invalidStage(operation, session.stage)
  }

  const result = update(session.workflow)
  if (!result.ok) {
    return result
  }
  if (result.value.status === 'dawn') {
    throw new Error(`${operation} cannot apply Dawn.`)
  }

  return succeed(Object.freeze({ stage: 'night-presentation', workflow: result.value }))
}

function invalidStage<Value>(
  operation: ActiveAppSessionOperation,
  stage: ActiveAppSessionStage,
): DomainResult<Value, InvalidActiveAppSessionStageError> {
  return fail({ type: 'INVALID_ACTIVE_APP_SESSION_STAGE', operation, stage })
}
