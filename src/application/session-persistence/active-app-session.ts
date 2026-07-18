import {
  completeExecutionerBriefingPhase,
  finalizeRoleDistributionForFirstNight,
  type CompleteExecutionerBriefingPhaseError,
  type FinalizeRoleDistributionError,
} from '@/domain/executioner/executioner-target.ts'
import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import type { RandomSource } from '@/domain/randomness/random-source.ts'

import {
  acknowledgeExecutionerBriefing,
  createExecutionerBriefingWorkflow,
  nextExecutionerBriefing,
  previousExecutionerBriefing,
  validateExecutionerBriefingsReadyForCompletion,
  type ActiveExecutionerBriefingWorkflow,
  type ExecutionerBriefingError,
  type ExecutionerBriefingId,
} from '../executioner-briefing/index.ts'
import {
  createGameSetupWorkflow,
  reduceGameSetupWorkflow,
  type GameSetupEditError,
  type GameSetupWorkflowCommand,
  type GameSetupWorkflowState,
} from '../game-setup/index.ts'
import {
  beginFinalNightResolution,
  prepareDawnAnnouncement,
  type DawnWorkflow,
  type NightCompletionError,
  type ReadyForDawnWorkflow,
} from '../night-completion/index.ts'
import {
  acknowledgeImmediateNightOutcome,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  type ActiveNightActionCollectionWorkflow,
  type NightActionCollectionError,
} from '../night-actions/index.ts'
import {
  assignRoleDistribution,
  confirmRoleDistribution,
  createRoleDistributionWorkflow,
  markAllParticipatingCardsDelivered,
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

export type ExecutionerBriefingAppSession = Readonly<{
  stage: 'executioner-briefing'
  game: GameState
  participants: readonly Player[]
  workflow: ActiveExecutionerBriefingWorkflow
}>

export type SequentialNightAppSession = Readonly<{
  stage: 'sequential-night'
  workflow: Exclude<ActiveNightActionCollectionWorkflow, Readonly<{ status: 'complete' }>>
}>

export type NightResolutionAppSession = Readonly<{
  stage: 'night-resolution'
  workflow: ReadyForDawnWorkflow
}>

export type DawnAppSession = Readonly<{
  stage: 'dawn'
  workflow: DawnWorkflow
}>

export type ActiveAppSession =
  | SetupAppSession
  | RoleDistributionAppSession
  | ExecutionerBriefingAppSession
  | SequentialNightAppSession
  | NightResolutionAppSession
  | DawnAppSession

export type ActiveAppSessionStage = ActiveAppSession['stage']

export type ActiveAppSessionOperation =
  | 'update-setup'
  | 'assign-roles'
  | 'set-card-delivery'
  | 'mark-all-cards-delivered'
  | 'confirm-distribution'
  | 'reassign-roles'
  | 'begin-first-night'
  | 'acknowledge-executioner-briefing'
  | 'previous-executioner-briefing'
  | 'next-executioner-briefing'
  | 'complete-executioner-briefings'
  | 'confirm-night-target'
  | 'acknowledge-night-outcome'
  | 'continue-night'
  | 'prepare-dawn'

export type InvalidActiveAppSessionStageError = Readonly<{
  type: 'INVALID_ACTIVE_APP_SESSION_STAGE'
  operation: ActiveAppSessionOperation
  stage: ActiveAppSessionStage
}>

export type ActiveAppSessionError =
  | GameSetupEditError
  | RoleDistributionError
  | FinalizeRoleDistributionError
  | ExecutionerBriefingError
  | CompleteExecutionerBriefingPhaseError
  | NightActionCollectionError
  | NightCompletionError
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
  if (session.stage !== 'setup' || session.workflow.status !== 'ready') {
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

export function markAllSessionCardsDelivered(
  session: ActiveAppSession,
): DomainResult<
  RoleDistributionAppSession,
  RoleDistributionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'role-distribution') {
    return invalidStage('mark-all-cards-delivered', session.stage)
  }
  const result = markAllParticipatingCardsDelivered(session.workflow)
  return result.ok
    ? succeed(Object.freeze({ stage: 'role-distribution', workflow: result.value }))
    : result
}

export function confirmSessionRoleDistribution(
  session: ActiveAppSession,
  randomSource: RandomSource,
): DomainResult<
  ExecutionerBriefingAppSession | SequentialNightAppSession,
  | RoleDistributionError
  | FinalizeRoleDistributionError
  | ExecutionerBriefingError
  | NightActionCollectionError
  | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'role-distribution') {
    return invalidStage('confirm-distribution', session.stage)
  }
  const result = confirmRoleDistribution(session.workflow)
  return result.ok ? startFirstNightStage(result.value, randomSource) : result
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
  randomSource: RandomSource,
): DomainResult<
  ExecutionerBriefingAppSession | SequentialNightAppSession,
  | FinalizeRoleDistributionError
  | ExecutionerBriefingError
  | NightActionCollectionError
  | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'role-distribution') {
    return invalidStage('begin-first-night', session.stage)
  }
  if (session.workflow.status !== 'confirmed') {
    return fail({ type: 'DISTRIBUTION_NOT_CONFIRMED' })
  }
  return startFirstNightStage(session.workflow, randomSource)
}

export function acknowledgeSessionExecutionerBriefing(
  session: ActiveAppSession,
  briefingId: ExecutionerBriefingId,
): DomainResult<
  ExecutionerBriefingAppSession,
  ExecutionerBriefingError | InvalidActiveAppSessionStageError
> {
  return updateExecutionerBriefingSession(
    session,
    'acknowledge-executioner-briefing',
    (game, workflow) => acknowledgeExecutionerBriefing(game, workflow, briefingId),
  )
}

export function previousSessionExecutionerBriefing(
  session: ActiveAppSession,
): DomainResult<
  ExecutionerBriefingAppSession,
  ExecutionerBriefingError | InvalidActiveAppSessionStageError
> {
  return updateExecutionerBriefingSession(
    session,
    'previous-executioner-briefing',
    previousExecutionerBriefing,
  )
}

export function nextSessionExecutionerBriefing(
  session: ActiveAppSession,
): DomainResult<
  ExecutionerBriefingAppSession,
  ExecutionerBriefingError | InvalidActiveAppSessionStageError
> {
  return updateExecutionerBriefingSession(
    session,
    'next-executioner-briefing',
    nextExecutionerBriefing,
  )
}

export function completeSessionExecutionerBriefings(
  session: ActiveAppSession,
): DomainResult<
  SequentialNightAppSession,
  | ExecutionerBriefingError
  | CompleteExecutionerBriefingPhaseError
  | NightActionCollectionError
  | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'executioner-briefing') {
    return invalidStage('complete-executioner-briefings', session.stage)
  }
  const readinessResult = validateExecutionerBriefingsReadyForCompletion(
    session.game,
    session.workflow,
  )
  if (!readinessResult.ok) {
    return readinessResult
  }
  const phaseResult = completeExecutionerBriefingPhase(session.game)
  if (!phaseResult.ok) {
    return phaseResult
  }
  const nightResult = createNightActionCollectionForStartedNight(
    phaseResult.value,
    session.participants,
  )
  return nightResult.ok
    ? succeed(Object.freeze({ stage: 'sequential-night', workflow: nightResult.value }))
    : nightResult
}

export function confirmSessionNightTarget(
  session: ActiveAppSession,
  targetPlayerId: PlayerId,
): DomainResult<
  SequentialNightAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'sequential-night') {
    return invalidStage('confirm-night-target', session.stage)
  }
  const result = confirmNightActionTarget(session.workflow, targetPlayerId)
  return result.ok
    ? succeed(Object.freeze({ stage: 'sequential-night', workflow: result.value }))
    : result
}

export function acknowledgeSessionNightOutcome(
  session: ActiveAppSession,
): DomainResult<
  SequentialNightAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'sequential-night') {
    return invalidStage('acknowledge-night-outcome', session.stage)
  }
  const result = acknowledgeImmediateNightOutcome(session.workflow)
  if (!result.ok) {
    return result
  }
  if (result.value.status === 'complete') {
    throw new Error('Acknowledging an outcome cannot complete the night before Continue.')
  }
  return succeed(Object.freeze({ stage: 'sequential-night', workflow: result.value }))
}

export function continueSessionNight(
  session: ActiveAppSession,
): DomainResult<
  SequentialNightAppSession | NightResolutionAppSession,
  NightActionCollectionError | NightCompletionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'sequential-night') {
    return invalidStage('continue-night', session.stage)
  }
  const result = continueNightActionCollection(session.workflow)
  if (!result.ok) {
    return result
  }
  if (result.value.status !== 'complete') {
    return succeed(Object.freeze({ stage: 'sequential-night', workflow: result.value }))
  }
  const resolutionResult = beginFinalNightResolution(result.value)
  return resolutionResult.ok
    ? succeed(Object.freeze({ stage: 'night-resolution', workflow: resolutionResult.value }))
    : resolutionResult
}

export function prepareSessionDawn(
  session: ActiveAppSession,
): DomainResult<DawnAppSession, NightCompletionError | InvalidActiveAppSessionStageError> {
  if (session.stage !== 'night-resolution') {
    return invalidStage('prepare-dawn', session.stage)
  }
  const result = prepareDawnAnnouncement(session.workflow)
  return result.ok ? succeed(Object.freeze({ stage: 'dawn', workflow: result.value })) : result
}

function startFirstNightStage(
  distribution: ConfirmedRoleDistributionWorkflow,
  randomSource: RandomSource,
): DomainResult<
  ExecutionerBriefingAppSession | SequentialNightAppSession,
  FinalizeRoleDistributionError | ExecutionerBriefingError | NightActionCollectionError
> {
  const gameResult = finalizeRoleDistributionForFirstNight(distribution.game, true, randomSource)
  if (!gameResult.ok) {
    return gameResult
  }
  const participants = Object.freeze(
    distribution.setup.participatingPlayers.map((player) => Object.freeze({ ...player })),
  )
  if (gameResult.value.phase === 'executioner-briefing') {
    const workflowResult = createExecutionerBriefingWorkflow(gameResult.value)
    return workflowResult.ok
      ? succeed(
          Object.freeze({
            stage: 'executioner-briefing',
            game: gameResult.value,
            participants,
            workflow: workflowResult.value,
          }),
        )
      : workflowResult
  }
  const nightResult = createNightActionCollectionForStartedNight(gameResult.value, participants)
  return nightResult.ok
    ? succeed(Object.freeze({ stage: 'sequential-night', workflow: nightResult.value }))
    : nightResult
}

function updateExecutionerBriefingSession(
  session: ActiveAppSession,
  operation: ActiveAppSessionOperation,
  update: (
    game: ExecutionerBriefingAppSession['game'],
    workflow: ActiveExecutionerBriefingWorkflow,
  ) => DomainResult<ActiveExecutionerBriefingWorkflow, ExecutionerBriefingError>,
): DomainResult<
  ExecutionerBriefingAppSession,
  ExecutionerBriefingError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'executioner-briefing') {
    return invalidStage(operation, session.stage)
  }
  const result = update(session.game, session.workflow)
  return result.ok ? succeed(Object.freeze({ ...session, workflow: result.value })) : result
}

function invalidStage<Value>(
  operation: ActiveAppSessionOperation,
  stage: ActiveAppSessionStage,
): DomainResult<Value, InvalidActiveAppSessionStageError> {
  return fail({ type: 'INVALID_ACTIVE_APP_SESSION_STAGE', operation, stage })
}
