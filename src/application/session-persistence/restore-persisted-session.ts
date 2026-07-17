import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState, GameStateCandidate } from '@/domain/game/game-state.ts'
import { validateGameSettings } from '@/domain/game/game-settings.ts'
import {
  gameId,
  playerId,
  roleId,
  roleInstanceId,
  type PlayerId,
  type RoleId,
  type RoleInstanceId,
} from '@/domain/identifiers.ts'
import {
  createCollectedNightActions,
  createSubmittedNightAction,
  isNightActionRequiredForPlayer,
  type SubmittedNightAction,
} from '@/domain/night-actions/night-action.ts'
import type { NightActionKind } from '@/domain/night-actions/night-action-kind.ts'
import type { Player } from '@/domain/players/player.ts'
import type { GamePlayer } from '@/domain/players/game-player.ts'
import type { DawnAnnouncement, DawnDeath } from '@/domain/resolution/dawn-announcement.ts'
import { ROLE_REGISTRY, findRoleDefinition } from '@/domain/roles/role-registry.ts'

import {
  inspectGameSetupDraft,
  validateGameSetupDraft,
  type GameSetupDraft,
  type GameSetupValidationError,
  type RoleCount,
  type ValidatedGameSetup,
} from '../game-setup/index.ts'
import {
  buildNightActionSequence,
  orderNightActionsBySequence,
  selectDoctorPreviousTargetsForNight,
  type CompleteNightActionsWorkflow,
  type NightActionCollectionWorkflow,
} from '../night-actions/index.ts'
import {
  acknowledgePrivateNightResult,
  beginNightResultPresentation,
  previousPrivateNightResult,
  type NightPresentationWorkflow,
} from '../night-presentation/index.ts'
import {
  confirmRoleDistribution,
  setCardDelivered,
  type RoleDistributionWorkflow,
} from '../role-assignment/index.ts'
import type {
  ActiveAppSession,
  DawnAppSession,
  NightActionAppSession,
  NightPresentationAppSession,
  RoleDistributionAppSession,
  SetupAppSession,
} from './active-app-session.ts'
import {
  PERSISTED_SESSION_SCHEMA_VERSION,
  toPersistedNightResolutionV1,
  type RestoredSessionEnvelopeV1,
} from './persisted-session-v1.ts'

export type InvalidEnvelopeError = Readonly<{
  type: 'INVALID_ENVELOPE'
  reason:
    | 'not-an-object'
    | 'missing-schema-version'
    | 'invalid-schema-version'
    | 'missing-timestamp'
    | 'missing-session'
}>

export type UnsupportedSchemaVersionError = Readonly<{
  type: 'UNSUPPORTED_SCHEMA_VERSION'
  schemaVersion: number
}>

export type InvalidTimestampError = Readonly<{
  type: 'INVALID_TIMESTAMP'
}>

export type UnknownPersistedStageError = Readonly<{
  type: 'UNKNOWN_PERSISTED_STAGE'
}>

export type InvalidSetupSessionError = Readonly<{
  type: 'INVALID_SETUP_SESSION'
  reason: 'invalid-shape' | 'invalid-draft' | 'prepared-setup-invalid'
  validationErrors: readonly GameSetupValidationError[]
}>

export type InvalidRoleDistributionSessionError = Readonly<{
  type: 'INVALID_ROLE_DISTRIBUTION_SESSION'
  reason:
    | 'invalid-shape'
    | 'invalid-setup'
    | 'invalid-game'
    | 'setup-game-mismatch'
    | 'invalid-delivery-evidence'
    | 'contains-private-night-data'
}>

export type InvalidNightActionSessionError = Readonly<{
  type: 'INVALID_NIGHT_ACTION_SESSION'
  reason:
    | 'invalid-shape'
    | 'invalid-game'
    | 'invalid-participants'
    | 'invalid-actions'
    | 'invalid-sequence-position'
    | 'unreachable-workflow-state'
}>

export type InvalidNightPresentationSessionError = Readonly<{
  type: 'INVALID_NIGHT_PRESENTATION_SESSION'
  reason:
    | 'invalid-shape'
    | 'invalid-game'
    | 'invalid-participants'
    | 'invalid-actions'
    | 'invalid-resolution'
    | 'invalid-acknowledgements'
    | 'cross-game-records'
}>

export type InvalidDawnSessionError = Readonly<{
  type: 'INVALID_DAWN_SESSION'
  reason:
    | 'invalid-shape'
    | 'invalid-game'
    | 'invalid-participants'
    | 'invalid-announcement'
    | 'contains-private-night-data'
}>

export type StagePhaseMismatchError = Readonly<{
  type: 'STAGE_PHASE_MISMATCH'
  stage: ActiveAppSession['stage']
  phase: string
}>

export type MultipleAuthoritativeGamesError = Readonly<{
  type: 'MULTIPLE_AUTHORITATIVE_GAMES'
}>

export type RestorePersistedSessionError =
  | InvalidEnvelopeError
  | UnsupportedSchemaVersionError
  | InvalidTimestampError
  | UnknownPersistedStageError
  | InvalidSetupSessionError
  | InvalidRoleDistributionSessionError
  | InvalidNightActionSessionError
  | InvalidNightPresentationSessionError
  | InvalidDawnSessionError
  | StagePhaseMismatchError
  | MultipleAuthoritativeGamesError

const ALLOWED_EDITING_SETUP_ERRORS = new Set<GameSetupValidationError['type']>([
  'NO_PARTICIPATING_PLAYERS',
  'ROLE_COUNT_MISMATCH',
  'NO_MAFIA_ROLE',
])

export function restorePersistedSessionEnvelopeV1(
  candidate: unknown,
): DomainResult<RestoredSessionEnvelopeV1, RestorePersistedSessionError> {
  if (!isUnknownRecord(candidate)) {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'not-an-object' })
  }

  if (!Object.hasOwn(candidate, 'schemaVersion')) {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'missing-schema-version' })
  }
  if (typeof candidate.schemaVersion !== 'number') {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'invalid-schema-version' })
  }
  if (candidate.schemaVersion !== PERSISTED_SESSION_SCHEMA_VERSION) {
    return fail({
      type: 'UNSUPPORTED_SCHEMA_VERSION',
      schemaVersion: candidate.schemaVersion,
    })
  }

  if (!Object.hasOwn(candidate, 'savedAt') || typeof candidate.savedAt !== 'string') {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'missing-timestamp' })
  }
  if (!isCanonicalTimestamp(candidate.savedAt)) {
    return fail({ type: 'INVALID_TIMESTAMP' })
  }

  if (!Object.hasOwn(candidate, 'session')) {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'missing-session' })
  }

  const sessionResult = restoreAppSession(candidate.session)
  if (!sessionResult.ok) {
    return sessionResult
  }

  return succeed(
    deepFreeze({
      schemaVersion: PERSISTED_SESSION_SCHEMA_VERSION,
      savedAt: candidate.savedAt,
      session: sessionResult.value,
    }),
  )
}

function restoreAppSession(
  candidate: unknown,
): DomainResult<ActiveAppSession, RestorePersistedSessionError> {
  if (!isUnknownRecord(candidate)) {
    return invalidSetup('invalid-shape')
  }

  if (countAuthoritativeGameFields(candidate) > 1) {
    return fail({ type: 'MULTIPLE_AUTHORITATIVE_GAMES' })
  }

  switch (candidate.stage) {
    case 'setup':
      return restoreSetupSession(candidate)
    case 'role-distribution':
      return restoreRoleDistributionSession(candidate)
    case 'night-action':
      return restoreNightActionSession(candidate)
    case 'night-presentation':
      return restoreNightPresentationSession(candidate)
    case 'dawn':
      return restoreDawnSession(candidate)
    default:
      return fail({ type: 'UNKNOWN_PERSISTED_STAGE' })
  }
}

function restoreSetupSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<SetupAppSession, RestorePersistedSessionError> {
  if (countAuthoritativeGameFields(candidate) > 0) {
    return fail({ type: 'MULTIPLE_AUTHORITATIVE_GAMES' })
  }
  if (
    (candidate.workflowStatus !== 'editing' && candidate.workflowStatus !== 'ready') ||
    !Object.hasOwn(candidate, 'draft')
  ) {
    return invalidSetup('invalid-shape')
  }

  const draftResult = restoreSetupDraft(candidate.draft)
  if (!draftResult.ok) {
    return draftResult
  }

  if (candidate.workflowStatus === 'editing') {
    return succeed(
      deepFreeze({
        stage: 'setup',
        workflow: {
          status: 'editing',
          draft: draftResult.value,
          editError: null,
        },
      }),
    )
  }

  const setupResult = validateGameSetupDraft(draftResult.value)
  if (!setupResult.ok) {
    return invalidSetup('prepared-setup-invalid', setupResult.error)
  }

  return succeed(
    deepFreeze({
      stage: 'setup',
      workflow: {
        status: 'ready',
        draft: draftResult.value,
        validatedSetup: setupResult.value,
      },
    }),
  )
}

function restoreSetupDraft(
  candidate: unknown,
): DomainResult<GameSetupDraft, InvalidSetupSessionError> {
  if (
    !isUnknownRecord(candidate) ||
    !Array.isArray(candidate.roster) ||
    !Array.isArray(candidate.roleCounts) ||
    !Number.isSafeInteger(candidate.nextPlayerNumber) ||
    typeof candidate.nextPlayerNumber !== 'number' ||
    candidate.nextPlayerNumber < 1
  ) {
    return invalidSetup('invalid-draft')
  }

  const rosterResult = restoreRoster(candidate.roster, false)
  if (!rosterResult.ok) {
    return invalidSetup('invalid-draft')
  }
  const roleCountsResult = restoreRoleCounts(candidate.roleCounts)
  if (!roleCountsResult.ok) {
    return invalidSetup('invalid-draft')
  }
  const settingsResult = validateGameSettings(candidate.settings)
  if (!settingsResult.ok) {
    return invalidSetup('invalid-draft')
  }

  const draft = deepFreeze({
    roster: rosterResult.value,
    roleCounts: orderRoleCounts(roleCountsResult.value),
    settings: settingsResult.value,
    nextPlayerNumber: candidate.nextPlayerNumber,
  })
  const validation = inspectGameSetupDraft(draft)
  const structuralErrors = validation.errors.filter(
    (error) => !ALLOWED_EDITING_SETUP_ERRORS.has(error.type),
  )

  return structuralErrors.length === 0
    ? succeed(draft)
    : invalidSetup('invalid-draft', structuralErrors)
}

function restoreRoleDistributionSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<RoleDistributionAppSession, RestorePersistedSessionError> {
  if (
    hasAny(candidate, [
      'resolution',
      'privateResults',
      'results',
      'collectedActions',
      'acknowledgedResultIds',
    ])
  ) {
    return fail({
      type: 'INVALID_ROLE_DISTRIBUTION_SESSION',
      reason: 'contains-private-night-data',
    })
  }
  if (
    (candidate.workflowStatus !== 'distributing' && candidate.workflowStatus !== 'confirmed') ||
    (candidate.workflowStatus === 'distributing' && !Array.isArray(candidate.deliveredPlayerIds)) ||
    (candidate.workflowStatus === 'confirmed' && Object.hasOwn(candidate, 'deliveredPlayerIds'))
  ) {
    return invalidDistribution('invalid-shape')
  }

  const setupResult = restoreValidatedSetup(candidate.setup)
  if (!setupResult.ok) {
    return invalidDistribution('invalid-setup')
  }
  const gameResult = restoreGame(candidate.game)
  if (!gameResult.ok) {
    return invalidDistribution('invalid-game')
  }
  if (gameResult.value.phase !== 'role-distribution') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'role-distribution',
      phase: gameResult.value.phase,
    })
  }
  if (!doesSetupMatchGame(setupResult.value, gameResult.value)) {
    return invalidDistribution('setup-game-mismatch')
  }

  let workflow: RoleDistributionWorkflow = deepFreeze({
    status: 'distributing',
    setup: setupResult.value,
    game: gameResult.value,
    deliveredPlayerIds: [],
  })
  const deliveredIds = new Set<PlayerId>()
  const deliveryEvidence =
    candidate.workflowStatus === 'distributing' && Array.isArray(candidate.deliveredPlayerIds)
      ? candidate.deliveredPlayerIds
      : gameResult.value.players.map((player) => player.playerId)
  for (const deliveredPlayerId of deliveryEvidence) {
    if (typeof deliveredPlayerId !== 'string') {
      return invalidDistribution('invalid-delivery-evidence')
    }
    const id = playerId(deliveredPlayerId)
    if (deliveredIds.has(id)) {
      return invalidDistribution('invalid-delivery-evidence')
    }
    deliveredIds.add(id)

    const deliveryResult = setCardDelivered(workflow, id, true)
    if (!deliveryResult.ok) {
      return invalidDistribution('invalid-delivery-evidence')
    }
    workflow = deliveryResult.value
  }

  if (candidate.workflowStatus === 'confirmed') {
    const confirmationResult = confirmRoleDistribution(workflow)
    if (!confirmationResult.ok) {
      return invalidDistribution('invalid-delivery-evidence')
    }
    workflow = confirmationResult.value
  } else {
    workflow = deepFreeze({
      ...workflow,
      deliveredPlayerIds: workflow.game.players
        .filter((player) => deliveredIds.has(player.playerId))
        .map((player) => player.playerId),
    })
  }

  return succeed(deepFreeze({ stage: 'role-distribution', workflow }))
}

function restoreNightActionSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<NightActionAppSession, RestorePersistedSessionError> {
  if (
    candidate.workflowStatus !== 'collecting' &&
    candidate.workflowStatus !== 'reviewing' &&
    candidate.workflowStatus !== 'complete'
  ) {
    return invalidNightAction('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game)
  if (!gameResult.ok) {
    return invalidNightAction('invalid-game')
  }
  if (gameResult.value.phase !== 'night-action-collection') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'night-action',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidNightAction('invalid-participants')
  }
  const sourceResult = restoreNightActionSource(
    gameResult.value,
    participantsResult.value,
    candidate.submittedActions,
  )
  if (!sourceResult.ok) {
    return sourceResult
  }

  const { game, participants, steps, previousTargets, submittedActions } = sourceResult.value
  let workflow: NightActionCollectionWorkflow

  if (candidate.workflowStatus === 'collecting') {
    if (
      typeof candidate.currentStepIndex !== 'number' ||
      !Number.isSafeInteger(candidate.currentStepIndex) ||
      candidate.currentStepIndex < 0 ||
      candidate.currentStepIndex >= steps.length ||
      typeof candidate.returnToReviewAfterActor !== 'boolean'
    ) {
      return invalidNightAction('invalid-sequence-position')
    }
    const currentStepIndex = candidate.currentStepIndex
    const currentStep = steps[currentStepIndex]
    if (currentStep === undefined || currentStep.type === 'review') {
      return invalidNightAction('invalid-sequence-position')
    }

    const actionStepIndexes = new Map<RoleInstanceId, number>()
    for (const [index, step] of steps.entries()) {
      if (step.type === 'actor-action') {
        actionStepIndexes.set(step.actorRoleInstanceId, index)
      }
    }
    const containsUnreachableFutureAction = submittedActions.some(
      (action) =>
        (actionStepIndexes.get(action.actorRoleInstanceId) ?? Number.MAX_SAFE_INTEGER) >
        currentStepIndex,
    )
    const submittedRoleInstanceIds = new Set(
      submittedActions.map((action) => action.actorRoleInstanceId),
    )
    const containsMissingPastAction = steps.some(
      (step, index) =>
        index < currentStepIndex &&
        step.type === 'actor-action' &&
        !submittedRoleInstanceIds.has(step.actorRoleInstanceId),
    )

    if (candidate.returnToReviewAfterActor) {
      if (currentStep.type !== 'actor-action') {
        return invalidNightAction('unreachable-workflow-state')
      }
      const completeResult = createCollectedNightActions(game, submittedActions, previousTargets)
      if (!completeResult.ok) {
        return invalidNightAction('unreachable-workflow-state')
      }
    } else if (containsUnreachableFutureAction || containsMissingPastAction) {
      return invalidNightAction('unreachable-workflow-state')
    }

    workflow = {
      status: 'collecting',
      game,
      participants,
      steps,
      previousTargets,
      currentStepIndex,
      submittedActions,
      returnToReviewAfterActor: candidate.returnToReviewAfterActor,
    }
  } else {
    if (candidate.currentStepIndex !== null || candidate.returnToReviewAfterActor !== false) {
      return invalidNightAction('invalid-sequence-position')
    }
    const collectedResult = createCollectedNightActions(game, submittedActions, previousTargets)
    if (!collectedResult.ok) {
      return invalidNightAction('unreachable-workflow-state')
    }
    workflow =
      candidate.workflowStatus === 'reviewing'
        ? {
            status: 'reviewing',
            game,
            participants,
            steps,
            previousTargets,
            submittedActions,
          }
        : {
            status: 'complete',
            game,
            participants,
            steps,
            previousTargets,
            collectedActions: collectedResult.value,
          }
  }

  return succeed(deepFreeze({ stage: 'night-action', workflow }))
}

function restoreNightPresentationSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<NightPresentationAppSession, RestorePersistedSessionError> {
  if (
    candidate.workflowStatus !== 'private-results' &&
    candidate.workflowStatus !== 'ready-for-dawn'
  ) {
    return invalidNightPresentation('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game)
  if (!gameResult.ok) {
    return invalidNightPresentation('invalid-game')
  }
  if (gameResult.value.phase !== 'night-resolution') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'night-presentation',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidNightPresentation('invalid-participants')
  }

  const actionCollectionGame = deepFreeze({
    ...gameResult.value,
    phase: 'night-action-collection' as const,
  })
  const sourceResult = restoreNightActionSource(
    actionCollectionGame,
    participantsResult.value,
    candidate.collectedActions,
  )
  if (!sourceResult.ok) {
    return invalidNightPresentation('invalid-actions')
  }
  const collectedResult = createCollectedNightActions(
    actionCollectionGame,
    sourceResult.value.submittedActions,
    sourceResult.value.previousTargets,
  )
  if (!collectedResult.ok) {
    return invalidNightPresentation('invalid-actions')
  }
  const completedWorkflow: CompleteNightActionsWorkflow = deepFreeze({
    status: 'complete',
    game: actionCollectionGame,
    participants: participantsResult.value,
    steps: sourceResult.value.steps,
    previousTargets: sourceResult.value.previousTargets,
    collectedActions: collectedResult.value,
  })
  const presentationResult = beginNightResultPresentation(completedWorkflow)
  if (!presentationResult.ok || presentationResult.value.status === 'dawn') {
    return invalidNightPresentation('invalid-resolution')
  }
  if (!hasSameCanonicalContent(presentationResult.value.game, gameResult.value)) {
    return invalidNightPresentation('cross-game-records')
  }
  if (
    !hasSameCanonicalResolutionContent(
      toPersistedNightResolutionV1(presentationResult.value.resolution),
      candidate.resolution,
    )
  ) {
    return invalidNightPresentation('invalid-resolution')
  }
  if (!Array.isArray(candidate.acknowledgedResultIds)) {
    return invalidNightPresentation('invalid-acknowledgements')
  }
  const acknowledgedResultIds: string[] = []
  for (const resultIdCandidate of candidate.acknowledgedResultIds) {
    if (typeof resultIdCandidate !== 'string') {
      return invalidNightPresentation('invalid-acknowledgements')
    }
    acknowledgedResultIds.push(resultIdCandidate)
  }

  const resultIds = presentationResult.value.results.map((result) => result.id)
  const expectedAcknowledgements =
    candidate.workflowStatus === 'ready-for-dawn'
      ? resultIds
      : resultIds.slice(0, acknowledgedResultIds.length)
  if (!hasSameCanonicalContent(expectedAcknowledgements, acknowledgedResultIds)) {
    return invalidNightPresentation('invalid-acknowledgements')
  }
  if (
    candidate.workflowStatus === 'private-results' &&
    acknowledgedResultIds.length >= resultIds.length
  ) {
    return invalidNightPresentation('invalid-acknowledgements')
  }

  let workflow: Exclude<
    NightPresentationWorkflow,
    Readonly<{ status: 'dawn' }>
  > = presentationResult.value
  for (const [index] of acknowledgedResultIds.entries()) {
    const resultId = resultIds[index]
    if (resultId === undefined) {
      return invalidNightPresentation('invalid-acknowledgements')
    }
    const acknowledgementResult = acknowledgePrivateNightResult(workflow, resultId)
    if (!acknowledgementResult.ok || acknowledgementResult.value.status === 'dawn') {
      return invalidNightPresentation('invalid-acknowledgements')
    }
    workflow = acknowledgementResult.value
  }

  if (candidate.workflowStatus === 'ready-for-dawn') {
    if (workflow.status !== 'ready-for-dawn' || candidate.currentResultIndex !== null) {
      return invalidNightPresentation('invalid-acknowledgements')
    }
  } else {
    if (
      workflow.status !== 'private-results' ||
      !Number.isSafeInteger(candidate.currentResultIndex) ||
      typeof candidate.currentResultIndex !== 'number' ||
      candidate.currentResultIndex < 0 ||
      candidate.currentResultIndex > acknowledgedResultIds.length
    ) {
      return invalidNightPresentation('invalid-acknowledgements')
    }

    while (workflow.currentResultIndex > candidate.currentResultIndex) {
      const previousResult = previousPrivateNightResult(workflow)
      if (!previousResult.ok || previousResult.value.status !== 'private-results') {
        return invalidNightPresentation('invalid-acknowledgements')
      }
      workflow = previousResult.value
    }
    if (workflow.currentResultIndex !== candidate.currentResultIndex) {
      return invalidNightPresentation('invalid-acknowledgements')
    }
  }

  return succeed(deepFreeze({ stage: 'night-presentation', workflow }))
}

function restoreDawnSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<DawnAppSession, RestorePersistedSessionError> {
  if (
    hasAny(candidate, [
      'resolution',
      'privateResults',
      'results',
      'collectedActions',
      'submittedActions',
      'acknowledgedResultIds',
      'attackAttempts',
      'blockedActors',
      'frames',
      'protections',
    ])
  ) {
    return fail({ type: 'INVALID_DAWN_SESSION', reason: 'contains-private-night-data' })
  }
  if (candidate.workflowStatus !== 'dawn') {
    return invalidDawn('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game)
  if (!gameResult.ok) {
    return invalidDawn('invalid-game')
  }
  if (gameResult.value.phase !== 'dawn-announcement') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'dawn',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidDawn('invalid-participants')
  }
  const announcementResult = restoreDawnAnnouncement(candidate.dawnAnnouncement, gameResult.value)
  if (!announcementResult.ok) {
    return announcementResult
  }

  return succeed(
    deepFreeze({
      stage: 'dawn',
      workflow: {
        status: 'dawn',
        game: gameResult.value,
        participants: participantsResult.value,
        dawnAnnouncement: announcementResult.value,
      },
    }),
  )
}

function restoreValidatedSetup(
  candidate: unknown,
): DomainResult<ValidatedGameSetup, InvalidRoleDistributionSessionError> {
  if (
    !isUnknownRecord(candidate) ||
    !Array.isArray(candidate.participatingPlayers) ||
    !Array.isArray(candidate.roleCounts)
  ) {
    return invalidDistribution('invalid-setup')
  }
  const playersResult = restoreRoster(candidate.participatingPlayers, true)
  const roleCountsResult = restoreRoleCounts(candidate.roleCounts)
  const settingsResult = validateGameSettings(candidate.settings)
  if (!playersResult.ok || !roleCountsResult.ok || !settingsResult.ok) {
    return invalidDistribution('invalid-setup')
  }
  const result = validateGameSetupDraft({
    roster: playersResult.value,
    roleCounts: orderRoleCounts(roleCountsResult.value),
    settings: settingsResult.value,
    nextPlayerNumber: 1,
  })
  return result.ok ? succeed(result.value) : invalidDistribution('invalid-setup')
}

function restoreGame(
  candidate: unknown,
): DomainResult<GameState, InvalidRoleDistributionSessionError> {
  if (
    !isUnknownRecord(candidate) ||
    typeof candidate.id !== 'string' ||
    candidate.id.trim().length === 0 ||
    typeof candidate.phase !== 'string' ||
    !Array.isArray(candidate.players) ||
    !Number.isSafeInteger(candidate.nightNumber) ||
    typeof candidate.nightNumber !== 'number' ||
    !Number.isSafeInteger(candidate.dayNumber) ||
    typeof candidate.dayNumber !== 'number' ||
    !Array.isArray(candidate.doctorPreviousTargets)
  ) {
    return invalidDistribution('invalid-game')
  }

  const players: GamePlayer[] = []
  const selectedRoleIds = new Set<RoleId>()
  for (const playerCandidate of candidate.players) {
    if (
      !isUnknownRecord(playerCandidate) ||
      typeof playerCandidate.playerId !== 'string' ||
      playerCandidate.playerId.trim().length === 0 ||
      !isUnknownRecord(playerCandidate.role) ||
      typeof playerCandidate.role.instanceId !== 'string' ||
      playerCandidate.role.instanceId.trim().length === 0 ||
      typeof playerCandidate.role.roleId !== 'string' ||
      playerCandidate.role.roleId.trim().length === 0 ||
      (playerCandidate.role.ordinal !== null &&
        (!Number.isSafeInteger(playerCandidate.role.ordinal) ||
          typeof playerCandidate.role.ordinal !== 'number')) ||
      typeof playerCandidate.alive !== 'boolean' ||
      (playerCandidate.publiclyRevealedRoleId !== null &&
        typeof playerCandidate.publiclyRevealedRoleId !== 'string') ||
      typeof playerCandidate.mayorRevealed !== 'boolean' ||
      (playerCandidate.executionerTargetId !== null &&
        typeof playerCandidate.executionerTargetId !== 'string') ||
      (playerCandidate.personalWin !== null &&
        playerCandidate.personalWin !== 'jester' &&
        playerCandidate.personalWin !== 'executioner')
    ) {
      return invalidDistribution('invalid-game')
    }

    const assignedRoleId = roleId(playerCandidate.role.roleId)
    if (findRoleDefinition(assignedRoleId) === undefined) {
      return invalidDistribution('invalid-game')
    }
    selectedRoleIds.add(assignedRoleId)
    players.push({
      playerId: playerId(playerCandidate.playerId),
      role: {
        instanceId: roleInstanceId(playerCandidate.role.instanceId),
        roleId: assignedRoleId,
        ordinal: playerCandidate.role.ordinal,
      },
      alive: playerCandidate.alive,
      publiclyRevealedRoleId:
        playerCandidate.publiclyRevealedRoleId === null
          ? null
          : roleId(playerCandidate.publiclyRevealedRoleId),
      mayorRevealed: playerCandidate.mayorRevealed,
      executionerTargetId:
        playerCandidate.executionerTargetId === null
          ? null
          : playerId(playerCandidate.executionerTargetId),
      personalWin: playerCandidate.personalWin,
    })
  }

  const settingsResult = validateGameSettings(candidate.settings)
  if (!settingsResult.ok) {
    return invalidDistribution('invalid-game')
  }
  const roleDefinitions = ROLE_REGISTRY.filter((role) => selectedRoleIds.has(role.id)).map(
    (role) => ({ id: role.id, name: role.name, faction: role.faction }),
  )
  const gameCandidate: GameStateCandidate = {
    id: gameId(candidate.id),
    phase: candidate.phase,
    players,
    roleDefinitions,
    settings: settingsResult.value,
    nightNumber: candidate.nightNumber,
    dayNumber: candidate.dayNumber,
    doctorPreviousTargets: candidate.doctorPreviousTargets,
  }
  const result = validateGameState(gameCandidate)
  return result.ok ? succeed(deepFreeze(result.value)) : invalidDistribution('invalid-game')
}

function restoreParticipants(
  candidate: unknown,
  game: GameState,
): DomainResult<readonly Player[], InvalidNightActionSessionError> {
  if (!Array.isArray(candidate)) {
    return invalidNightAction('invalid-participants')
  }
  const rosterResult = restoreRoster(candidate, true)
  if (!rosterResult.ok || rosterResult.value.length !== game.players.length) {
    return invalidNightAction('invalid-participants')
  }
  for (const [index, participant] of rosterResult.value.entries()) {
    if (participant.id !== game.players[index]?.playerId) {
      return invalidNightAction('invalid-participants')
    }
  }
  return succeed(rosterResult.value)
}

function restoreNightActionSource(
  game: GameState,
  participants: readonly Player[],
  actionCandidates: unknown,
): DomainResult<
  Readonly<{
    game: GameState
    participants: readonly Player[]
    steps: ActiveNightSource['steps']
    previousTargets: ActiveNightSource['previousTargets']
    submittedActions: readonly SubmittedNightAction[]
  }>,
  InvalidNightActionSessionError
> {
  if (!Array.isArray(actionCandidates)) {
    return invalidNightAction('invalid-actions')
  }
  const sequenceResult = buildNightActionSequence(game)
  if (!sequenceResult.ok) {
    return invalidNightAction('invalid-actions')
  }
  const previousTargets = selectDoctorPreviousTargetsForNight(game)
  const submittedActions: SubmittedNightAction[] = []
  const actorPlayerIds = new Set<PlayerId>()
  const roleInstanceIds = new Set<RoleInstanceId>()

  for (const actionCandidate of actionCandidates) {
    if (
      !isUnknownRecord(actionCandidate) ||
      typeof actionCandidate.actorPlayerId !== 'string' ||
      typeof actionCandidate.actorRoleInstanceId !== 'string' ||
      typeof actionCandidate.actorRoleId !== 'string' ||
      !isNightActionKind(actionCandidate.actionKind) ||
      typeof actionCandidate.targetPlayerId !== 'string'
    ) {
      return invalidNightAction('invalid-actions')
    }
    const action: SubmittedNightAction = {
      actorPlayerId: playerId(actionCandidate.actorPlayerId),
      actorRoleInstanceId: roleInstanceId(actionCandidate.actorRoleInstanceId),
      actorRoleId: roleId(actionCandidate.actorRoleId),
      actionKind: actionCandidate.actionKind,
      targetPlayerId: playerId(actionCandidate.targetPlayerId),
    }
    if (
      actorPlayerIds.has(action.actorPlayerId) ||
      roleInstanceIds.has(action.actorRoleInstanceId) ||
      !isNightActionRequiredForPlayer(game, action.actorPlayerId)
    ) {
      return invalidNightAction('invalid-actions')
    }
    const previousTarget =
      previousTargets.find((target) => target.actorRoleInstanceId === action.actorRoleInstanceId)
        ?.targetPlayerId ?? null
    const actionResult = createSubmittedNightAction(game, action, previousTarget)
    if (!actionResult.ok) {
      return invalidNightAction('invalid-actions')
    }
    actorPlayerIds.add(action.actorPlayerId)
    roleInstanceIds.add(action.actorRoleInstanceId)
    submittedActions.push(actionResult.value)
  }

  return succeed(
    deepFreeze({
      game,
      participants,
      steps: sequenceResult.value,
      previousTargets,
      submittedActions: orderNightActionsBySequence(sequenceResult.value, submittedActions),
    }),
  )
}

function restoreDawnAnnouncement(
  candidate: unknown,
  game: GameState,
): DomainResult<DawnAnnouncement, InvalidDawnSessionError> {
  if (
    !isUnknownRecord(candidate) ||
    !Number.isSafeInteger(candidate.nightNumber) ||
    typeof candidate.nightNumber !== 'number' ||
    candidate.nightNumber !== game.nightNumber
  ) {
    return invalidDawn('invalid-announcement')
  }
  if (game.players.some((player) => player.alive && player.publiclyRevealedRoleId !== null)) {
    return invalidDawn('invalid-announcement')
  }

  if (candidate.outcome === 'no-deaths') {
    if (game.players.some((player) => !player.alive)) {
      return invalidDawn('invalid-announcement')
    }
    return succeed(Object.freeze({ outcome: 'no-deaths', nightNumber: candidate.nightNumber }))
  }
  if (candidate.outcome !== 'deaths' || !Array.isArray(candidate.deaths)) {
    return invalidDawn('invalid-announcement')
  }

  const deaths: DawnDeath[] = []
  const deathPlayerIds = new Set<PlayerId>()
  for (const deathCandidate of candidate.deaths) {
    if (
      !isUnknownRecord(deathCandidate) ||
      typeof deathCandidate.playerId !== 'string' ||
      (deathCandidate.revealedRoleId !== null && typeof deathCandidate.revealedRoleId !== 'string')
    ) {
      return invalidDawn('invalid-announcement')
    }
    const id = playerId(deathCandidate.playerId)
    const playerIndex = game.players.findIndex((player) => player.playerId === id)
    const player = game.players[playerIndex]
    const expectedRevealedRoleId =
      player !== undefined && game.settings.revealRoleOnDeath ? player.role.roleId : null
    if (
      player === undefined ||
      player.alive ||
      deathPlayerIds.has(id) ||
      player.publiclyRevealedRoleId !== expectedRevealedRoleId ||
      deathCandidate.revealedRoleId !== expectedRevealedRoleId
    ) {
      return invalidDawn('invalid-announcement')
    }
    deathPlayerIds.add(id)
    deaths.push(
      Object.freeze({
        playerId: id,
        revealedRoleId:
          deathCandidate.revealedRoleId === null ? null : roleId(deathCandidate.revealedRoleId),
      }),
    )
  }
  if (deaths.length === 0) {
    return invalidDawn('invalid-announcement')
  }
  if (
    deaths.length !== game.players.filter((player) => !player.alive).length ||
    game.players.some((player) => !player.alive && !deathPlayerIds.has(player.playerId))
  ) {
    return invalidDawn('invalid-announcement')
  }
  deaths.sort(
    (left, right) =>
      game.players.findIndex((player) => player.playerId === left.playerId) -
      game.players.findIndex((player) => player.playerId === right.playerId),
  )

  return succeed(
    Object.freeze({
      outcome: 'deaths',
      nightNumber: candidate.nightNumber,
      deaths: Object.freeze(deaths),
    }),
  )
}

function restoreRoster(
  candidates: readonly unknown[],
  requirePlaying: boolean,
): DomainResult<readonly Player[], InvalidSetupSessionError> {
  const roster: Player[] = []
  for (const candidate of candidates) {
    if (
      !isUnknownRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      typeof candidate.name !== 'string' ||
      candidate.name.trim().length === 0 ||
      typeof candidate.playing !== 'boolean' ||
      (requirePlaying && !candidate.playing)
    ) {
      return invalidSetup('invalid-draft')
    }
    roster.push(
      Object.freeze({
        id: playerId(candidate.id),
        name: candidate.name,
        playing: candidate.playing,
      }),
    )
  }
  return succeed(Object.freeze(roster))
}

function restoreRoleCounts(
  candidates: readonly unknown[],
): DomainResult<readonly RoleCount[], InvalidSetupSessionError> {
  const roleCounts: RoleCount[] = []
  const knownRoleIds = new Set(ROLE_REGISTRY.map((role) => role.id))
  const seenRoleIds = new Set<RoleId>()
  for (const candidate of candidates) {
    if (
      !isUnknownRecord(candidate) ||
      typeof candidate.roleId !== 'string' ||
      !Number.isSafeInteger(candidate.count) ||
      typeof candidate.count !== 'number' ||
      candidate.count < 0
    ) {
      return invalidSetup('invalid-draft')
    }
    const id = roleId(candidate.roleId)
    if (!knownRoleIds.has(id) || seenRoleIds.has(id)) {
      return invalidSetup('invalid-draft')
    }
    seenRoleIds.add(id)
    roleCounts.push(Object.freeze({ roleId: id, count: candidate.count }))
  }
  if (seenRoleIds.size !== knownRoleIds.size) {
    return invalidSetup('invalid-draft')
  }
  return succeed(Object.freeze(roleCounts))
}

function orderRoleCounts(roleCounts: readonly RoleCount[]): readonly RoleCount[] {
  return Object.freeze(
    ROLE_REGISTRY.flatMap((role) => {
      const roleCount = roleCounts.find((candidate) => candidate.roleId === role.id)
      return roleCount === undefined ? [] : [roleCount]
    }),
  )
}

function doesSetupMatchGame(setup: ValidatedGameSetup, game: GameState): boolean {
  if (
    setup.participatingPlayers.length !== game.players.length ||
    !hasSameCanonicalContent(setup.settings, game.settings)
  ) {
    return false
  }
  for (const [index, player] of setup.participatingPlayers.entries()) {
    if (player.id !== game.players[index]?.playerId) {
      return false
    }
  }

  const assignedCounts = new Map<RoleId, number>()
  for (const player of game.players) {
    assignedCounts.set(player.role.roleId, (assignedCounts.get(player.role.roleId) ?? 0) + 1)
  }
  return setup.roleCounts.every(
    (roleCount) => (assignedCounts.get(roleCount.roleId) ?? 0) === roleCount.count,
  )
}

function isCanonicalTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/u.exec(value)
  if (match === null) {
    return false
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  if (
    !Number.isSafeInteger(year) ||
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return false
  }
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maximumDay = daysInMonth[month - 1]
  return maximumDay !== undefined && day >= 1 && day <= maximumDay
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function isNightActionKind(candidate: unknown): candidate is NightActionKind {
  return (
    candidate === 'attack' ||
    candidate === 'frame' ||
    candidate === 'role-block' ||
    candidate === 'protect' ||
    candidate === 'investigate' ||
    candidate === 'track'
  )
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

function hasSameCanonicalResolutionContent(canonical: unknown, candidate: unknown): boolean {
  if (Object.is(canonical, candidate)) {
    return true
  }
  if (Array.isArray(canonical)) {
    if (!Array.isArray(candidate) || canonical.length !== candidate.length) {
      return false
    }
    const matchedCandidateIndexes = new Set<number>()
    return canonical.every((canonicalEntry) => {
      const matchingIndex = candidate.findIndex(
        (candidateEntry, index) =>
          !matchedCandidateIndexes.has(index) &&
          hasSameCanonicalResolutionContent(canonicalEntry, candidateEntry),
      )
      if (matchingIndex === -1) {
        return false
      }
      matchedCandidateIndexes.add(matchingIndex)
      return true
    })
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
        Object.hasOwn(candidate, key) &&
        hasSameCanonicalResolutionContent(canonical[key], candidate[key]),
    )
  )
}

function countAuthoritativeGameFields(candidate: Readonly<Record<string, unknown>>): number {
  return Object.entries(candidate).filter(
    ([field, value]) =>
      isUnknownRecord(value) && (field === 'game' || field.toLowerCase().endsWith('game')),
  ).length
}

function hasAny(candidate: Readonly<Record<string, unknown>>, fields: readonly string[]): boolean {
  return fields.some((field) => Object.hasOwn(candidate, field))
}

function invalidSetup(
  reason: InvalidSetupSessionError['reason'],
  validationErrors: readonly GameSetupValidationError[] = [],
): DomainResult<never, InvalidSetupSessionError> {
  return fail({ type: 'INVALID_SETUP_SESSION', reason, validationErrors })
}

function invalidDistribution(
  reason: InvalidRoleDistributionSessionError['reason'],
): DomainResult<never, InvalidRoleDistributionSessionError> {
  return fail({ type: 'INVALID_ROLE_DISTRIBUTION_SESSION', reason })
}

function invalidNightAction(
  reason: InvalidNightActionSessionError['reason'],
): DomainResult<never, InvalidNightActionSessionError> {
  return fail({ type: 'INVALID_NIGHT_ACTION_SESSION', reason })
}

function invalidNightPresentation(
  reason: InvalidNightPresentationSessionError['reason'],
): DomainResult<never, InvalidNightPresentationSessionError> {
  return fail({ type: 'INVALID_NIGHT_PRESENTATION_SESSION', reason })
}

function invalidDawn(
  reason: InvalidDawnSessionError['reason'],
): DomainResult<never, InvalidDawnSessionError> {
  return fail({ type: 'INVALID_DAWN_SESSION', reason })
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

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type ActiveNightSource = Extract<NightActionCollectionWorkflow, Readonly<{ status: 'collecting' }>>
