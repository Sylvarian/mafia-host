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
import type { TerminalFactionResult } from '@/domain/win-conditions/faction-result.ts'
import {
  evaluateAndFinalizeFactionVictory,
  evaluateAndFinalizePostPromotionFinalTwoKillingRoleOutcome,
  type FactionVictoryEvaluationError,
  type FinalizeFactionVictoryError,
} from '@/domain/win-conditions/faction-victory.ts'

import {
  confirmMayorRevealDuringDay,
  createDayDiscussionState,
  type BeginDayDiscussionWorkflowError,
  type ConfirmMayorRevealWorkflowError,
  type DayDiscussionState,
} from '../day-discussion/index.ts'
import {
  completeDayWithoutExecution,
  executePlayerAndCompleteDay,
  validateDayOutcomeState,
  type CompleteDayOutcomeWorkflowError,
  type DayOutcomeState,
} from '../day-outcome/index.ts'
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
  type NextGameSetupTemplate,
} from '../game-setup/index.ts'
import { type InvalidGameOverStateError } from '../game-over/index.ts'
import { createTrustedGameOverStateFromEvaluation } from '../game-over/game-over.ts'
import {
  beginFinalNightResolution,
  continueJesterRevengeResolution,
  prepareDawnAnnouncement,
  type DawnWorkflow,
  type NightCompletionError,
  type ReadyForDawnWorkflow,
  type RevengeResolutionWorkflow,
  type TerminalDawnWorkflow,
} from '../night-completion/index.ts'
import {
  beginNextNightActionCollection,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  type ActiveNightActionCollectionWorkflow,
  type CollectingNightActionsWorkflow,
  type NightActionCollectionError,
} from '../night-actions/index.ts'
import {
  assignRoleDistribution,
  confirmAllRoleCardsDelivered,
  createRoleDistributionWorkflow,
  reassignRoleDistribution,
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

export type GodfatherPromotionBriefingAppSession = Readonly<{
  stage: 'godfather-promotion-briefing'
  workflow: CollectingNightActionsWorkflow
}>

export type NightResolutionAppSession = Readonly<{
  stage: 'night-resolution'
  workflow: ReadyForDawnWorkflow
}>

export type DawnAppSession = Readonly<{
  stage: 'dawn'
  workflow: DawnWorkflow
}>

export type RevengeResolutionAppSession = Readonly<{
  stage: 'revenge-resolution'
  workflow: RevengeResolutionWorkflow
}>

export type DayDiscussionAppSession = Readonly<{
  stage: 'day-discussion'
  game: GameState
  participants: readonly Player[]
}>

export type DayOutcomeAppSession = Readonly<{
  stage: 'day-outcome'
  game: GameState
  participants: readonly Player[]
}>

export type PostDayWaitingAppSession = Readonly<{
  stage: 'post-day-waiting'
  game: GameState
  participants: readonly Player[]
}>

export type PendingRevengeWaitingAppSession = Readonly<{
  stage: 'pending-revenge-waiting'
  game: GameState
  participants: readonly Player[]
}>

export type GameOverAppSession = Readonly<{
  stage: 'game-over'
  game: GameState
  participants: readonly Player[]
  result: TerminalFactionResult
}>

export type ActiveAppSession =
  | SetupAppSession
  | RoleDistributionAppSession
  | ExecutionerBriefingAppSession
  | GodfatherPromotionBriefingAppSession
  | SequentialNightAppSession
  | NightResolutionAppSession
  | DawnAppSession
  | RevengeResolutionAppSession
  | DayDiscussionAppSession
  | DayOutcomeAppSession
  | PostDayWaitingAppSession
  | PendingRevengeWaitingAppSession
  | GameOverAppSession

export type ActiveAppSessionStage = ActiveAppSession['stage']

export type ActiveAppSessionOperation =
  | 'update-setup'
  | 'assign-roles'
  | 'confirm-all-role-cards-delivered'
  | 'reassign-roles'
  | 'begin-first-night'
  | 'acknowledge-executioner-briefing'
  | 'previous-executioner-briefing'
  | 'next-executioner-briefing'
  | 'complete-executioner-briefings'
  | 'acknowledge-godfather-promotion'
  | 'confirm-night-target'
  | 'continue-night'
  | 'prepare-dawn'
  | 'resolve-jester-revenge'
  | 'begin-day-discussion'
  | 'confirm-mayor-reveal'
  | 'execute-day-player'
  | 'end-day-without-execution'
  | 'settle-post-day'
  | 'begin-next-night'

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
  | BeginDayDiscussionWorkflowError
  | ConfirmMayorRevealWorkflowError
  | CompleteDayOutcomeWorkflowError
  | FactionVictoryEvaluationError
  | FinalizeFactionVictoryError
  | InvalidGameOverStateError
  | InvalidActiveAppSessionStageError

export type SettlePostDaySessionError =
  | CompleteDayOutcomeWorkflowError
  | FactionVictoryEvaluationError
  | FinalizeFactionVictoryError
  | InvalidGameOverStateError
  | InvalidActiveAppSessionStageError
  | Readonly<{ type: 'RESULT_ALREADY_FINALIZED' }>

export function createActiveAppSession(
  template: NextGameSetupTemplate | null = null,
): SetupAppSession {
  return Object.freeze({
    stage: 'setup',
    workflow: createGameSetupWorkflow(template),
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

export function confirmAllSessionRoleCardsDelivered(
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
    return invalidStage('confirm-all-role-cards-delivered', session.stage)
  }
  const result = confirmAllRoleCardsDelivered(session.workflow)
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
  const result = reassignRoleDistribution(session.workflow, dependencies)
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
  SequentialNightAppSession | NightResolutionAppSession,
  NightActionCollectionError | NightCompletionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'sequential-night') {
    return invalidStage('confirm-night-target', session.stage)
  }
  const result = confirmNightActionTarget(session.workflow, targetPlayerId)
  return completeNightProgress(result)
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
  return completeNightProgress(result)
}

function completeNightProgress(
  result: ReturnType<typeof confirmNightActionTarget | typeof continueNightActionCollection>,
): DomainResult<
  SequentialNightAppSession | NightResolutionAppSession,
  NightActionCollectionError | NightCompletionError
> {
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
  randomSource: RandomSource,
): DomainResult<
  DawnAppSession | RevengeResolutionAppSession | GameOverAppSession,
  NightCompletionError | InvalidGameOverStateError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'night-resolution') {
    return invalidStage('prepare-dawn', session.stage)
  }
  const result = prepareDawnAnnouncement(session.workflow, randomSource)
  return result.ok ? toDawnSession(result.value) : result
}

export function resolveSessionJesterRevenge(
  session: ActiveAppSession,
): DomainResult<
  DawnAppSession | GameOverAppSession,
  NightCompletionError | InvalidGameOverStateError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'revenge-resolution') {
    return invalidStage('resolve-jester-revenge', session.stage)
  }
  const result = continueJesterRevengeResolution(session.workflow)
  return result.ok ? toDawnSession(result.value) : result
}

export function beginSessionDayDiscussion(
  session: ActiveAppSession,
): DomainResult<
  DayDiscussionAppSession,
  BeginDayDiscussionWorkflowError | InvalidActiveAppSessionStageError
> {
  if (session.stage === 'day-discussion') {
    return fail({ type: 'DAY_TRANSITION_ALREADY_COMPLETED' })
  }
  if (session.stage !== 'dawn') {
    return invalidStage('begin-day-discussion', session.stage)
  }
  const result = createDayDiscussionState(session.workflow)
  return result.ok
    ? succeed(
        Object.freeze({
          stage: 'day-discussion',
          game: result.value.game,
          participants: result.value.participants,
        }),
      )
    : result
}

export function confirmSessionMayorReveal(
  session: ActiveAppSession,
  selectedPlayerId: PlayerId,
): DomainResult<
  DayDiscussionAppSession,
  ConfirmMayorRevealWorkflowError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'day-discussion') {
    return invalidStage('confirm-mayor-reveal', session.stage)
  }
  const state: DayDiscussionState = {
    game: session.game,
    participants: session.participants,
  }
  const result = confirmMayorRevealDuringDay(state, selectedPlayerId)
  return result.ok
    ? succeed(
        Object.freeze({
          stage: 'day-discussion',
          game: result.value.game,
          participants: result.value.participants,
        }),
      )
    : result
}

export function executeSessionDayPlayer(
  session: ActiveAppSession,
  selectedPlayerId: PlayerId,
): DomainResult<
  DayOutcomeAppSession,
  CompleteDayOutcomeWorkflowError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'day-discussion') {
    return invalidStage('execute-day-player', session.stage)
  }
  const state: DayDiscussionState = {
    game: session.game,
    participants: session.participants,
  }
  const result = executePlayerAndCompleteDay(state, selectedPlayerId)
  return result.ok ? succeed(toDayOutcomeSession(result.value)) : result
}

export function endSessionDayWithoutExecution(
  session: ActiveAppSession,
): DomainResult<
  DayOutcomeAppSession,
  CompleteDayOutcomeWorkflowError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'day-discussion') {
    return invalidStage('end-day-without-execution', session.stage)
  }
  const state: DayDiscussionState = {
    game: session.game,
    participants: session.participants,
  }
  const result = completeDayWithoutExecution(state)
  return result.ok ? succeed(toDayOutcomeSession(result.value)) : result
}

export function settleSessionAfterDayOutcome(
  session: ActiveAppSession,
): DomainResult<
  PostDayWaitingAppSession | PendingRevengeWaitingAppSession | GameOverAppSession,
  SettlePostDaySessionError
> {
  if (session.stage === 'game-over') {
    return fail({ type: 'RESULT_ALREADY_FINALIZED' })
  }
  if (session.stage !== 'day-outcome') {
    return invalidStage('settle-post-day', session.stage)
  }
  const dayStateResult = validateDayOutcomeState({
    game: session.game,
    participants: session.participants,
  })
  if (!dayStateResult.ok) {
    return dayStateResult
  }
  const evaluationResult = evaluateAndFinalizeFactionVictory(dayStateResult.value.game)
  if (!evaluationResult.ok) {
    if (evaluationResult.error.type === 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY') {
      return succeed(
        Object.freeze({
          stage: 'pending-revenge-waiting',
          game: dayStateResult.value.game,
          participants: dayStateResult.value.participants,
        }),
      )
    }
    return evaluationResult
  }
  if (evaluationResult.value.status === 'non-terminal') {
    return succeed(
      Object.freeze({
        stage: 'post-day-waiting',
        game: evaluationResult.value.game,
        participants: dayStateResult.value.participants,
      }),
    )
  }
  const gameOverResult = createTrustedGameOverStateFromEvaluation(
    evaluationResult.value,
    dayStateResult.value.participants,
  )
  return gameOverResult.ok
    ? succeed(
        Object.freeze({
          stage: 'game-over',
          game: gameOverResult.value.game,
          participants: gameOverResult.value.participants,
          result: gameOverResult.value.result,
        }),
      )
    : gameOverResult
}

export function beginSessionNextNight(
  session: ActiveAppSession,
  randomSource: RandomSource,
): DomainResult<
  SequentialNightAppSession | GodfatherPromotionBriefingAppSession,
  NightActionCollectionError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'post-day-waiting' && session.stage !== 'pending-revenge-waiting') {
    return invalidStage('begin-next-night', session.stage)
  }
  const result = beginNextNightActionCollection(session.game, session.participants, randomSource)
  if (!result.ok) {
    return result
  }
  return result.value.promotion === null
    ? succeed(Object.freeze({ stage: 'sequential-night', workflow: result.value.workflow }))
    : succeed(
        Object.freeze({
          stage: 'godfather-promotion-briefing',
          workflow: result.value.workflow,
        }),
      )
}

export function acknowledgeSessionGodfatherPromotion(
  session: ActiveAppSession,
): DomainResult<
  SequentialNightAppSession | GameOverAppSession,
  FinalizeFactionVictoryError | InvalidGameOverStateError | InvalidActiveAppSessionStageError
> {
  if (session.stage !== 'godfather-promotion-briefing') {
    return invalidStage('acknowledge-godfather-promotion', session.stage)
  }
  const evaluationResult = evaluateAndFinalizePostPromotionFinalTwoKillingRoleOutcome(
    session.workflow.game,
  )
  if (!evaluationResult.ok) {
    return evaluationResult
  }
  if (evaluationResult.value.status === 'non-terminal') {
    return succeed(
      Object.freeze({
        stage: 'sequential-night',
        workflow: session.workflow,
      }),
    )
  }
  const gameOverResult = createTrustedGameOverStateFromEvaluation(
    evaluationResult.value,
    session.workflow.participants,
  )
  return gameOverResult.ok
    ? succeed(
        Object.freeze({
          stage: 'game-over',
          game: gameOverResult.value.game,
          participants: gameOverResult.value.participants,
          result: gameOverResult.value.result,
        }),
      )
    : gameOverResult
}

function toDayOutcomeSession(state: DayOutcomeState): DayOutcomeAppSession {
  return Object.freeze({
    stage: 'day-outcome',
    game: state.game,
    participants: state.participants,
  })
}

function toDawnSession(
  workflow: DawnWorkflow | TerminalDawnWorkflow,
): DomainResult<DawnAppSession | GameOverAppSession, InvalidGameOverStateError>
function toDawnSession(
  workflow: DawnWorkflow | RevengeResolutionWorkflow | TerminalDawnWorkflow,
): DomainResult<
  DawnAppSession | RevengeResolutionAppSession | GameOverAppSession,
  InvalidGameOverStateError
>
function toDawnSession(
  workflow: DawnWorkflow | RevengeResolutionWorkflow | TerminalDawnWorkflow,
): DomainResult<
  DawnAppSession | RevengeResolutionAppSession | GameOverAppSession,
  InvalidGameOverStateError
> {
  switch (workflow.status) {
    case 'dawn':
      return succeed(Object.freeze({ stage: 'dawn', workflow }))
    case 'revenge-resolution':
      return succeed(Object.freeze({ stage: 'revenge-resolution', workflow }))
    case 'game-over': {
      const stateResult = createTrustedGameOverStateFromEvaluation(
        {
          status: 'game-over',
          game: workflow.game,
          result: workflow.result,
        },
        workflow.participants,
      )
      return stateResult.ok
        ? succeed(
            Object.freeze({
              stage: 'game-over',
              game: stateResult.value.game,
              participants: stateResult.value.participants,
              result: stateResult.value.result,
            }),
          )
        : stateResult
    }
  }
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
