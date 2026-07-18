import {
  orderExecutionerTargets,
  type ExecutionerTarget,
} from '@/domain/executioner/executioner-target.ts'
import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import { validateGameSettings } from '@/domain/game/game-settings.ts'
import type { GameState, GameStateCandidate } from '@/domain/game/game-state.ts'
import {
  gameId,
  playerId,
  roleId,
  roleInstanceId,
  type PlayerId,
  type RoleId,
} from '@/domain/identifiers.ts'
import {
  createCollectedNightActions,
  createSubmittedNightAction,
  type SubmittedNightAction,
} from '@/domain/night-actions/night-action.ts'
import type { NightActionKind } from '@/domain/night-actions/night-action-kind.ts'
import type { GamePlayer } from '@/domain/players/game-player.ts'
import type { Player } from '@/domain/players/player.ts'
import { ROLE_IDS, ROLE_REGISTRY, findRoleDefinition } from '@/domain/roles/role-registry.ts'
import type { DawnAnnouncement, DawnDeath } from '@/domain/resolution/dawn-announcement.ts'
import { beginNightResolution } from '@/domain/resolution/night-application.ts'
import { resolveNight } from '@/domain/resolution/night-resolution.ts'

import { validateDayDiscussionState, type DayDiscussionState } from '../day-discussion/index.ts'
import {
  acknowledgeExecutionerBriefing,
  createExecutionerBriefingWorkflow,
  nextExecutionerBriefing,
  previousExecutionerBriefing,
  type ActiveExecutionerBriefingWorkflow,
} from '../executioner-briefing/index.ts'
import {
  inspectGameSetupDraft,
  validateGameSetupDraft,
  type GameSetupDraft,
  type GameSetupValidationError,
  type RoleCount,
  type ValidatedGameSetup,
} from '../game-setup/index.ts'
import {
  acknowledgeImmediateNightOutcome,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  selectDoctorPreviousTargetsForNight,
  type ActiveNightActionCollectionWorkflow,
} from '../night-actions/index.ts'
import {
  confirmRoleDistribution,
  setCardDelivered,
  type RoleDistributionWorkflow,
} from '../role-assignment/index.ts'
import type {
  ActiveAppSession,
  DayDiscussionAppSession,
  DawnAppSession,
  ExecutionerBriefingAppSession,
  NightResolutionAppSession,
  RoleDistributionAppSession,
  SequentialNightAppSession,
  SetupAppSession,
} from './active-app-session.ts'
import {
  PERSISTED_SESSION_SCHEMA_VERSION,
  toPersistedAppSessionV2,
  toPersistedNightResolutionV2,
  type PersistedAppSessionV2,
  type RestoredSessionEnvelopeV2,
} from './persisted-session-v2.ts'

export type RestorePersistedSessionV2Error =
  | Readonly<{
      type: 'INVALID_ENVELOPE'
      reason: 'not-an-object' | 'invalid-fields' | 'invalid-schema-version' | 'invalid-timestamp'
    }>
  | Readonly<{ type: 'UNSUPPORTED_SCHEMA_VERSION'; schemaVersion: number }>
  | Readonly<{ type: 'UNKNOWN_PERSISTED_STAGE' }>
  | Readonly<{
      type: 'INVALID_SETUP_SESSION'
      reason: 'invalid-shape' | 'invalid-draft' | 'prepared-setup-invalid'
      validationErrors: readonly GameSetupValidationError[]
    }>
  | Readonly<{
      type: 'INVALID_ROLE_DISTRIBUTION_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-setup'
        | 'invalid-game'
        | 'setup-game-mismatch'
        | 'invalid-delivery-evidence'
        | 'contains-private-night-data'
    }>
  | Readonly<{
      type: 'INVALID_EXECUTIONER_BRIEFING_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'invalid-acknowledgements'
        | 'restored-briefing-session-mismatch'
    }>
  | Readonly<{
      type: 'INVALID_SEQUENTIAL_NIGHT_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'invalid-order'
        | 'invalid-step'
        | 'invalid-current-outcome'
        | 'invalid-visit-ledger'
        | 'stale-private-result-workflow'
    }>
  | Readonly<{
      type: 'INVALID_NIGHT_RESOLUTION_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'invalid-actions'
        | 'invalid-resolution'
        | 'stale-private-result-workflow'
    }>
  | Readonly<{
      type: 'INVALID_DAWN_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'invalid-announcement'
        | 'invalid-counters'
        | 'contains-private-night-data'
    }>
  | Readonly<{
      type: 'INVALID_DAY_DISCUSSION_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'invalid-counters'
        | 'contains-stale-night-data'
    }>
  | Readonly<{
      type: 'STAGE_PHASE_MISMATCH'
      stage: ActiveAppSession['stage']
      phase: string
    }>
  | Readonly<{ type: 'MULTIPLE_AUTHORITATIVE_GAMES' }>

type RestoreOptions = Readonly<{ allowLegacyGameShape: boolean }>

const DEFAULT_OPTIONS: RestoreOptions = Object.freeze({ allowLegacyGameShape: false })
const ALLOWED_EDITING_SETUP_ERRORS = new Set<GameSetupValidationError['type']>([
  'NO_PARTICIPATING_PLAYERS',
  'ROLE_COUNT_MISMATCH',
  'NO_MAFIA_ROLE',
  'EXECUTIONER_REQUIRES_TOWN_TARGET',
])

export function restorePersistedSessionEnvelopeV2(
  candidate: unknown,
): DomainResult<RestoredSessionEnvelopeV2, RestorePersistedSessionV2Error> {
  return restoreEnvelope(candidate, DEFAULT_OPTIONS)
}

export function restoreSafeLegacySessionAsV2(
  candidate: unknown,
): DomainResult<RestoredSessionEnvelopeV2, RestorePersistedSessionV2Error> {
  return restoreEnvelope(candidate, { allowLegacyGameShape: true })
}

function restoreEnvelope(
  candidate: unknown,
  options: RestoreOptions,
): DomainResult<RestoredSessionEnvelopeV2, RestorePersistedSessionV2Error> {
  if (!isUnknownRecord(candidate)) {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'not-an-object' })
  }
  if (!hasExactKeys(candidate, ['schemaVersion', 'savedAt', 'session'])) {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'invalid-fields' })
  }
  const expectedVersion = options.allowLegacyGameShape ? 1 : PERSISTED_SESSION_SCHEMA_VERSION
  if (typeof candidate.schemaVersion !== 'number') {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'invalid-schema-version' })
  }
  if (candidate.schemaVersion !== expectedVersion) {
    return fail({
      type: 'UNSUPPORTED_SCHEMA_VERSION',
      schemaVersion: candidate.schemaVersion,
    })
  }
  if (typeof candidate.savedAt !== 'string' || !isCanonicalTimestamp(candidate.savedAt)) {
    return fail({ type: 'INVALID_ENVELOPE', reason: 'invalid-timestamp' })
  }

  const sessionResult = restoreAppSession(candidate.session, options)
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
  options: RestoreOptions,
): DomainResult<ActiveAppSession, RestorePersistedSessionV2Error> {
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
      return restoreRoleDistributionSession(candidate, options)
    case 'executioner-briefing':
      return restoreExecutionerBriefingSession(candidate, options)
    case 'sequential-night':
      return options.allowLegacyGameShape
        ? invalidSequential('invalid-shape')
        : restoreSequentialNightSession(candidate)
    case 'night-resolution':
      return options.allowLegacyGameShape
        ? invalidNightResolution('invalid-shape')
        : restoreNightResolutionSession(candidate)
    case 'dawn':
      return restoreDawnSession(candidate, options)
    case 'day-discussion':
      return options.allowLegacyGameShape
        ? invalidDayDiscussion('invalid-shape')
        : restoreDayDiscussionSession(candidate)
    default:
      return fail({ type: 'UNKNOWN_PERSISTED_STAGE' })
  }
}

function restoreSetupSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<SetupAppSession, RestorePersistedSessionV2Error> {
  if (
    !hasExactKeys(candidate, ['stage', 'workflowStatus', 'draft']) ||
    (candidate.workflowStatus !== 'editing' && candidate.workflowStatus !== 'ready')
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
        workflow: { status: 'editing', draft: draftResult.value, editError: null },
      }),
    )
  }
  const setupResult = validateGameSetupDraft(draftResult.value)
  return setupResult.ok
    ? succeed(
        deepFreeze({
          stage: 'setup',
          workflow: {
            status: 'ready',
            draft: draftResult.value,
            validatedSetup: setupResult.value,
          },
        }),
      )
    : invalidSetup('prepared-setup-invalid', setupResult.error)
}

function restoreSetupDraft(
  candidate: unknown,
): DomainResult<GameSetupDraft, RestorePersistedSessionV2Error> {
  if (
    !isUnknownRecord(candidate) ||
    !hasExactKeys(candidate, ['roster', 'roleCounts', 'settings', 'nextPlayerNumber']) ||
    !Array.isArray(candidate.roster) ||
    !Array.isArray(candidate.roleCounts) ||
    typeof candidate.nextPlayerNumber !== 'number' ||
    !Number.isSafeInteger(candidate.nextPlayerNumber) ||
    candidate.nextPlayerNumber < 1
  ) {
    return invalidSetup('invalid-draft')
  }
  const rosterResult = restoreRoster(candidate.roster, false)
  const roleCountsResult = restoreRoleCounts(candidate.roleCounts)
  const settingsResult = validateGameSettings(candidate.settings)
  if (!rosterResult.ok || !roleCountsResult.ok || !settingsResult.ok) {
    return invalidSetup('invalid-draft')
  }

  const draft = deepFreeze({
    roster: rosterResult.value,
    roleCounts: orderRoleCounts(roleCountsResult.value),
    settings: settingsResult.value,
    nextPlayerNumber: candidate.nextPlayerNumber,
  })
  const structuralErrors = inspectGameSetupDraft(draft).errors.filter(
    (error) => !ALLOWED_EDITING_SETUP_ERRORS.has(error.type),
  )
  return structuralErrors.length === 0
    ? succeed(draft)
    : invalidSetup('invalid-draft', structuralErrors)
}

function restoreRoleDistributionSession(
  candidate: Readonly<Record<string, unknown>>,
  options: RestoreOptions,
): DomainResult<RoleDistributionAppSession, RestorePersistedSessionV2Error> {
  const distributing = candidate.workflowStatus === 'distributing'
  const expectedKeys = distributing
    ? ['stage', 'workflowStatus', 'setup', 'game', 'deliveredPlayerIds']
    : ['stage', 'workflowStatus', 'setup', 'game']
  if (
    (candidate.workflowStatus !== 'distributing' && candidate.workflowStatus !== 'confirmed') ||
    !hasExactKeys(candidate, expectedKeys) ||
    (distributing && !Array.isArray(candidate.deliveredPlayerIds))
  ) {
    return invalidDistribution('invalid-shape')
  }
  const setupResult = restoreValidatedSetup(candidate.setup)
  const gameResult = restoreGame(candidate.game, options)
  if (!setupResult.ok) {
    return setupResult
  }
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
  const evidence =
    candidate.workflowStatus === 'confirmed'
      ? gameResult.value.players.map((player) => player.playerId)
      : candidate.deliveredPlayerIds
  if (!Array.isArray(evidence)) {
    return invalidDistribution('invalid-delivery-evidence')
  }
  const seen = new Set<string>()
  for (const idCandidate of evidence) {
    if (typeof idCandidate !== 'string' || seen.has(idCandidate)) {
      return invalidDistribution('invalid-delivery-evidence')
    }
    seen.add(idCandidate)
    const result = setCardDelivered(workflow, playerId(idCandidate), true)
    if (!result.ok) {
      return invalidDistribution('invalid-delivery-evidence')
    }
    workflow = result.value
  }
  if (candidate.workflowStatus === 'confirmed') {
    const result = confirmRoleDistribution(workflow)
    if (!result.ok) {
      return invalidDistribution('invalid-delivery-evidence')
    }
    workflow = result.value
  }
  const session = deepFreeze({ stage: 'role-distribution' as const, workflow })
  return !options.allowLegacyGameShape &&
    !hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? invalidDistribution('invalid-shape')
    : succeed(session)
}

function restoreExecutionerBriefingSession(
  candidate: Readonly<Record<string, unknown>>,
  options: RestoreOptions,
): DomainResult<ExecutionerBriefingAppSession, RestorePersistedSessionV2Error> {
  if (
    !hasExactKeys(candidate, [
      'stage',
      'workflowStatus',
      'game',
      'participants',
      'currentBriefingIndex',
      'acknowledgedBriefingIds',
    ]) ||
    (candidate.workflowStatus !== 'briefing' && candidate.workflowStatus !== 'ready') ||
    !Array.isArray(candidate.acknowledgedBriefingIds) ||
    typeof candidate.currentBriefingIndex !== 'number' ||
    !Number.isSafeInteger(candidate.currentBriefingIndex)
  ) {
    return invalidBriefing('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, options)
  if (!gameResult.ok) {
    return invalidBriefing('invalid-game')
  }
  if (gameResult.value.phase !== 'executioner-briefing') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'executioner-briefing',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidBriefing('invalid-participants')
  }
  const workflowResult = createExecutionerBriefingWorkflow(gameResult.value)
  if (!workflowResult.ok) {
    return invalidBriefing('restored-briefing-session-mismatch')
  }

  let workflow: ActiveExecutionerBriefingWorkflow = workflowResult.value
  for (const [index, idCandidate] of candidate.acknowledgedBriefingIds.entries()) {
    const canonicalId = workflow.briefings[index]?.id
    if (
      typeof idCandidate !== 'string' ||
      canonicalId === undefined ||
      idCandidate !== canonicalId
    ) {
      return invalidBriefing('invalid-acknowledgements')
    }
    const acknowledgement = acknowledgeExecutionerBriefing(gameResult.value, workflow, canonicalId)
    if (!acknowledgement.ok) {
      return invalidBriefing('invalid-acknowledgements')
    }
    workflow = acknowledgement.value
    if (index < candidate.acknowledgedBriefingIds.length - 1) {
      const next = nextExecutionerBriefing(gameResult.value, workflow)
      if (!next.ok) {
        return invalidBriefing('invalid-acknowledgements')
      }
      workflow = next.value
    }
  }
  if (
    candidate.currentBriefingIndex < 0 ||
    candidate.currentBriefingIndex >= workflow.briefings.length ||
    candidate.currentBriefingIndex > candidate.acknowledgedBriefingIds.length
  ) {
    return invalidBriefing('invalid-acknowledgements')
  }
  while (workflow.currentBriefingIndex > candidate.currentBriefingIndex) {
    const previous = previousExecutionerBriefing(gameResult.value, workflow)
    if (!previous.ok) {
      return invalidBriefing('invalid-acknowledgements')
    }
    workflow = previous.value
  }
  while (workflow.currentBriefingIndex < candidate.currentBriefingIndex) {
    const next = nextExecutionerBriefing(gameResult.value, workflow)
    if (!next.ok) {
      return invalidBriefing('invalid-acknowledgements')
    }
    workflow = next.value
  }
  if (workflow.status !== candidate.workflowStatus) {
    return invalidBriefing('restored-briefing-session-mismatch')
  }

  const session = deepFreeze({
    stage: 'executioner-briefing' as const,
    game: gameResult.value,
    participants: participantsResult.value,
    workflow,
  })
  return !options.allowLegacyGameShape &&
    !hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? invalidBriefing('invalid-shape')
    : succeed(session)
}

function restoreSequentialNightSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<SequentialNightAppSession, RestorePersistedSessionV2Error> {
  if (
    !hasExactKeys(candidate, [
      'stage',
      'workflowStatus',
      'game',
      'participants',
      'currentStepIndex',
      'completedSteps',
      'currentOutcome',
    ]) ||
    (candidate.workflowStatus !== 'collecting' &&
      candidate.workflowStatus !== 'awaiting-outcome-acknowledgement' &&
      candidate.workflowStatus !== 'outcome-acknowledged') ||
    typeof candidate.currentStepIndex !== 'number' ||
    !Number.isSafeInteger(candidate.currentStepIndex) ||
    !Array.isArray(candidate.completedSteps)
  ) {
    return invalidSequential('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, DEFAULT_OPTIONS)
  if (!gameResult.ok) {
    return invalidSequential('invalid-game')
  }
  if (gameResult.value.phase !== 'night-action-collection') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'sequential-night',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidSequential('invalid-participants')
  }
  const initialResult = createNightActionCollectionForStartedNight(
    gameResult.value,
    participantsResult.value,
  )
  if (!initialResult.ok) {
    return invalidSequential('invalid-game')
  }
  if (
    candidate.currentStepIndex < 0 ||
    candidate.currentStepIndex >= initialResult.value.steps.length
  ) {
    return invalidSequential('invalid-order')
  }
  let workflow: ActiveNightActionCollectionWorkflow = initialResult.value

  for (const stepCandidate of candidate.completedSteps) {
    if (!isUnknownRecord(stepCandidate) || typeof stepCandidate.stepIndex !== 'number') {
      return invalidSequential('invalid-step')
    }
    while (workflow.currentStepIndex < stepCandidate.stepIndex) {
      const advance = continueNightActionCollection(workflow)
      if (!advance.ok || advance.value.status === 'complete') {
        return invalidSequential('invalid-order')
      }
      workflow = advance.value
    }
    if (workflow.currentStepIndex !== stepCandidate.stepIndex) {
      return invalidSequential('invalid-order')
    }

    if (stepCandidate.status === 'action-confirmed') {
      if (!isUnknownRecord(stepCandidate.action)) {
        return invalidSequential('invalid-step')
      }
      const actionResult = restoreSubmittedAction(
        stepCandidate.action,
        gameResult.value,
        selectDoctorPreviousTargetsForNight(gameResult.value),
      )
      if (!actionResult.ok || workflow.status !== 'collecting') {
        return invalidSequential('invalid-step')
      }
      const confirmation = confirmNightActionTarget(workflow, actionResult.value.targetPlayerId)
      if (!confirmation.ok) {
        return invalidSequential('invalid-step')
      }
      workflow = confirmation.value
    } else if (
      stepCandidate.status !== 'blocked' ||
      workflow.status !== 'awaiting-outcome-acknowledgement' ||
      workflow.completedSteps.at(-1)?.status !== 'blocked'
    ) {
      return invalidSequential('invalid-step')
    }

    const canonicalRecord = workflow.completedSteps.at(-1)
    if (
      canonicalRecord === undefined ||
      !hasSameCanonicalContent(
        persistSequentialWorkflow(workflow).completedSteps.at(-1),
        stepCandidate,
      )
    ) {
      if (stepCandidate.acknowledged !== true) {
        return invalidSequential('invalid-step')
      }
      const unacknowledgedCandidate = { ...stepCandidate, acknowledged: false }
      const canonicalCandidate = persistSequentialWorkflow(workflow).completedSteps.at(-1)
      if (!hasSameCanonicalContent(canonicalCandidate, unacknowledgedCandidate)) {
        return invalidSequential('invalid-step')
      }
    }

    if (stepCandidate.acknowledged === true) {
      const acknowledgement = acknowledgeImmediateNightOutcome(workflow)
      if (!acknowledgement.ok || acknowledgement.value.status === 'complete') {
        return invalidSequential('invalid-step')
      }
      workflow = acknowledgement.value
    } else if (stepCandidate.acknowledged !== false) {
      return invalidSequential('invalid-step')
    }
  }

  while (workflow.currentStepIndex < candidate.currentStepIndex) {
    const advance = continueNightActionCollection(workflow)
    if (!advance.ok || advance.value.status === 'complete') {
      return invalidSequential('invalid-order')
    }
    workflow = advance.value
  }
  if (workflow.currentStepIndex !== candidate.currentStepIndex) {
    return invalidSequential('invalid-order')
  }

  const session = deepFreeze({ stage: 'sequential-night' as const, workflow })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidSequential('invalid-current-outcome')
}

function restoreNightResolutionSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<NightResolutionAppSession, RestorePersistedSessionV2Error> {
  if (
    !hasExactKeys(candidate, [
      'stage',
      'workflowStatus',
      'game',
      'participants',
      'collectedActions',
      'resolution',
    ]) ||
    candidate.workflowStatus !== 'ready-for-dawn' ||
    !Array.isArray(candidate.collectedActions)
  ) {
    return invalidNightResolution('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, DEFAULT_OPTIONS)
  if (!gameResult.ok) {
    return invalidNightResolution('invalid-game')
  }
  if (gameResult.value.phase !== 'night-resolution') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'night-resolution',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidNightResolution('invalid-participants')
  }
  const actionGame = deepFreeze({
    ...gameResult.value,
    phase: 'night-action-collection' as const,
  })
  const previousTargets = selectDoctorPreviousTargetsForNight(actionGame)
  const actions: SubmittedNightAction[] = []
  for (const actionCandidate of candidate.collectedActions) {
    const actionResult = restoreSubmittedAction(actionCandidate, actionGame, previousTargets)
    if (!actionResult.ok) {
      return invalidNightResolution('invalid-actions')
    }
    actions.push(actionResult.value)
  }
  const batchResult = createCollectedNightActions(actionGame, actions, previousTargets)
  if (!batchResult.ok) {
    return invalidNightResolution('invalid-actions')
  }
  const resolutionResult = resolveNight({
    game: actionGame,
    collectedActions: batchResult.value,
    previousTargets,
  })
  if (
    !resolutionResult.ok ||
    !hasSameCanonicalContent(
      toPersistedNightResolutionV2(resolutionResult.value),
      candidate.resolution,
    )
  ) {
    return invalidNightResolution('invalid-resolution')
  }
  const begunGame = beginNightResolution(actionGame, resolutionResult.value, batchResult.value)
  if (!begunGame.ok || !hasSameCanonicalContent(begunGame.value, gameResult.value)) {
    return invalidNightResolution('invalid-game')
  }
  const session = deepFreeze({
    stage: 'night-resolution' as const,
    workflow: {
      status: 'ready-for-dawn' as const,
      game: begunGame.value,
      participants: participantsResult.value,
      resolution: resolutionResult.value,
      collectedActions: batchResult.value,
    },
  })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidNightResolution('invalid-shape')
}

function restoreDawnSession(
  candidate: Readonly<Record<string, unknown>>,
  options: RestoreOptions,
): DomainResult<DawnAppSession, RestorePersistedSessionV2Error> {
  if (
    !hasExactKeys(candidate, [
      'stage',
      'workflowStatus',
      'game',
      'participants',
      'dawnAnnouncement',
    ]) ||
    candidate.workflowStatus !== 'dawn'
  ) {
    return invalidDawn('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, options)
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
  if (gameResult.value.nightNumber !== 1 || gameResult.value.dayNumber !== 0) {
    return invalidDawn('invalid-counters')
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidDawn('invalid-participants')
  }
  const announcementResult = restoreDawnAnnouncement(candidate.dawnAnnouncement, gameResult.value)
  if (!announcementResult.ok) {
    return announcementResult
  }
  const session = deepFreeze({
    stage: 'dawn' as const,
    workflow: {
      status: 'dawn' as const,
      game: gameResult.value,
      participants: participantsResult.value,
      dawnAnnouncement: announcementResult.value,
    },
  })
  return !options.allowLegacyGameShape &&
    !hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? invalidDawn('invalid-shape')
    : succeed(session)
}

function restoreDayDiscussionSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<DayDiscussionAppSession, RestorePersistedSessionV2Error> {
  if (
    hasAnyKey(candidate, [
      'workflow',
      'dawnAnnouncement',
      'completedSteps',
      'currentOutcome',
      'currentStepIndex',
      'steps',
      'sequentialNight',
      'nightWorkflow',
      'immediateNightOutcome',
      'privateResultQueue',
      'visitLedger',
      'actionBatch',
      'collectedActions',
      'resolution',
      'attacks',
      'protections',
      'frames',
      'blocks',
      'selectedMayorPlayerId',
      'mayorDialogOpen',
    ])
  ) {
    return invalidDayDiscussion('contains-stale-night-data')
  }
  if (
    !hasExactKeys(candidate, ['stage', 'workflowStatus', 'game', 'participants']) ||
    candidate.workflowStatus !== 'day-discussion'
  ) {
    return invalidDayDiscussion('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, DEFAULT_OPTIONS)
  if (!gameResult.ok) {
    return invalidDayDiscussion('invalid-game')
  }
  if (gameResult.value.phase !== 'day-discussion') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'day-discussion',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidDayDiscussion('invalid-participants')
  }
  const state: DayDiscussionState = {
    game: gameResult.value,
    participants: participantsResult.value,
  }
  const stateResult = validateDayDiscussionState(state)
  if (!stateResult.ok) {
    return stateResult.error.type === 'INVALID_DAY_DISCUSSION_COUNTERS'
      ? invalidDayDiscussion('invalid-counters')
      : stateResult.error.type === 'INVALID_DAY_DISCUSSION_PARTICIPANTS'
        ? invalidDayDiscussion('invalid-participants')
        : invalidDayDiscussion('invalid-game')
  }
  const session = deepFreeze({
    stage: 'day-discussion' as const,
    game: stateResult.value.game,
    participants: stateResult.value.participants,
  })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidDayDiscussion('invalid-shape')
}

function restoreValidatedSetup(
  candidate: unknown,
): DomainResult<ValidatedGameSetup, RestorePersistedSessionV2Error> {
  if (
    !isUnknownRecord(candidate) ||
    !hasExactKeys(candidate, ['participatingPlayers', 'roleCounts', 'settings']) ||
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
  options: RestoreOptions,
): DomainResult<GameState, RestorePersistedSessionV2Error> {
  if (!isUnknownRecord(candidate)) {
    return invalidDistribution('invalid-game')
  }
  const currentKeys = [
    'id',
    'phase',
    'players',
    'neutralStateVersion',
    'executionerBriefingStatus',
    'executionerTargets',
    'settings',
    'nightNumber',
    'dayNumber',
    'doctorPreviousTargets',
  ]
  const legacyKeys = [
    'id',
    'phase',
    'players',
    'settings',
    'nightNumber',
    'dayNumber',
    'doctorPreviousTargets',
  ]
  const legacyShape = options.allowLegacyGameShape && hasExactKeys(candidate, legacyKeys)
  if (
    (!hasExactKeys(candidate, currentKeys) && !legacyShape) ||
    typeof candidate.id !== 'string' ||
    candidate.id.trim().length === 0 ||
    typeof candidate.phase !== 'string' ||
    !Array.isArray(candidate.players) ||
    typeof candidate.nightNumber !== 'number' ||
    !Number.isSafeInteger(candidate.nightNumber) ||
    typeof candidate.dayNumber !== 'number' ||
    !Number.isSafeInteger(candidate.dayNumber) ||
    !Array.isArray(candidate.doctorPreviousTargets)
  ) {
    return invalidDistribution('invalid-game')
  }
  if (
    !legacyShape &&
    (candidate.neutralStateVersion !== 1 ||
      !Array.isArray(candidate.executionerTargets) ||
      (candidate.executionerBriefingStatus !== 'not-started' &&
        candidate.executionerBriefingStatus !== 'not-required' &&
        candidate.executionerBriefingStatus !== 'pending' &&
        candidate.executionerBriefingStatus !== 'completed'))
  ) {
    return invalidDistribution('invalid-game')
  }

  const players: GamePlayer[] = []
  const selectedRoleIds = new Set<RoleId>()
  for (const playerCandidate of candidate.players) {
    if (!isUnknownRecord(playerCandidate)) {
      return invalidDistribution('invalid-game')
    }
    const expectedPlayerKeys = legacyShape
      ? [
          'playerId',
          'role',
          'alive',
          'publiclyRevealedRoleId',
          'mayorRevealed',
          'executionerTargetId',
          'personalWin',
        ]
      : ['playerId', 'role', 'alive', 'publiclyRevealedRoleId']
    const compatibilityPlayerKeys = [...expectedPlayerKeys, 'mayorRevealed']
    const hasLegacyFalseMayorMarker =
      !legacyShape &&
      hasExactKeys(playerCandidate, compatibilityPlayerKeys) &&
      playerCandidate.mayorRevealed === false
    if (
      (!hasExactKeys(playerCandidate, expectedPlayerKeys) && !hasLegacyFalseMayorMarker) ||
      (legacyShape &&
        (playerCandidate.executionerTargetId !== null || playerCandidate.personalWin !== null)) ||
      typeof playerCandidate.playerId !== 'string' ||
      !isUnknownRecord(playerCandidate.role) ||
      !hasExactKeys(playerCandidate.role, ['instanceId', 'roleId', 'ordinal']) ||
      typeof playerCandidate.role.instanceId !== 'string' ||
      typeof playerCandidate.role.roleId !== 'string' ||
      (playerCandidate.role.ordinal !== null &&
        (typeof playerCandidate.role.ordinal !== 'number' ||
          !Number.isSafeInteger(playerCandidate.role.ordinal))) ||
      typeof playerCandidate.alive !== 'boolean' ||
      (playerCandidate.publiclyRevealedRoleId !== null &&
        typeof playerCandidate.publiclyRevealedRoleId !== 'string') ||
      (legacyShape && playerCandidate.mayorRevealed !== false)
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
    })
  }

  const executionerTargets: ExecutionerTarget[] = []
  const targetCandidates = legacyShape ? [] : candidate.executionerTargets
  if (!Array.isArray(targetCandidates)) {
    return invalidDistribution('invalid-game')
  }
  for (const targetCandidate of targetCandidates) {
    if (
      !isUnknownRecord(targetCandidate) ||
      !hasExactKeys(targetCandidate, [
        'gameId',
        'executionerPlayerId',
        'executionerRoleInstanceId',
        'targetPlayerId',
      ]) ||
      typeof targetCandidate.gameId !== 'string' ||
      typeof targetCandidate.executionerPlayerId !== 'string' ||
      typeof targetCandidate.executionerRoleInstanceId !== 'string' ||
      typeof targetCandidate.targetPlayerId !== 'string'
    ) {
      return invalidDistribution('invalid-game')
    }
    executionerTargets.push({
      gameId: gameId(targetCandidate.gameId),
      executionerPlayerId: playerId(targetCandidate.executionerPlayerId),
      executionerRoleInstanceId: roleInstanceId(targetCandidate.executionerRoleInstanceId),
      targetPlayerId: playerId(targetCandidate.targetPlayerId),
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
    executionerTargets: orderExecutionerTargets(executionerTargets, players),
    executionerBriefingStatus: legacyShape
      ? candidate.phase === 'role-distribution'
        ? 'not-started'
        : players.some((player) => player.role.roleId === ROLE_IDS.executioner)
          ? 'not-started'
          : 'not-required'
      : candidate.executionerBriefingStatus,
  }
  const result = validateGameState(gameCandidate)
  return result.ok ? succeed(deepFreeze(result.value)) : invalidDistribution('invalid-game')
}

function restoreParticipants(
  candidate: unknown,
  game: GameState,
): DomainResult<readonly Player[], RestorePersistedSessionV2Error> {
  if (!Array.isArray(candidate)) {
    return invalidSequential('invalid-participants')
  }
  const result = restoreRoster(candidate, true)
  if (!result.ok || result.value.length !== game.players.length) {
    return invalidSequential('invalid-participants')
  }
  return result.value.every(
    (participant, index) => participant.id === game.players[index]?.playerId,
  )
    ? succeed(result.value)
    : invalidSequential('invalid-participants')
}

function restoreSubmittedAction(
  candidate: unknown,
  game: GameState,
  previousTargets: readonly Readonly<{
    actorRoleInstanceId: ReturnType<typeof roleInstanceId>
    targetPlayerId: PlayerId | null
  }>[],
): DomainResult<SubmittedNightAction, RestorePersistedSessionV2Error> {
  if (
    !isUnknownRecord(candidate) ||
    !hasExactKeys(candidate, [
      'actorPlayerId',
      'actorRoleInstanceId',
      'actorRoleId',
      'actionKind',
      'targetPlayerId',
    ]) ||
    typeof candidate.actorPlayerId !== 'string' ||
    typeof candidate.actorRoleInstanceId !== 'string' ||
    typeof candidate.actorRoleId !== 'string' ||
    !isNightActionKind(candidate.actionKind) ||
    typeof candidate.targetPlayerId !== 'string'
  ) {
    return invalidSequential('invalid-step')
  }
  const action: SubmittedNightAction = {
    actorPlayerId: playerId(candidate.actorPlayerId),
    actorRoleInstanceId: roleInstanceId(candidate.actorRoleInstanceId),
    actorRoleId: roleId(candidate.actorRoleId),
    actionKind: candidate.actionKind,
    targetPlayerId: playerId(candidate.targetPlayerId),
  }
  const previousTarget =
    previousTargets.find((entry) => entry.actorRoleInstanceId === action.actorRoleInstanceId)
      ?.targetPlayerId ?? null
  const result = createSubmittedNightAction(game, action, previousTarget)
  return result.ok ? succeed(result.value) : invalidSequential('invalid-step')
}

function restoreDawnAnnouncement(
  candidate: unknown,
  game: GameState,
): DomainResult<DawnAnnouncement, RestorePersistedSessionV2Error> {
  if (
    !isUnknownRecord(candidate) ||
    typeof candidate.nightNumber !== 'number' ||
    !Number.isSafeInteger(candidate.nightNumber) ||
    candidate.nightNumber !== game.nightNumber
  ) {
    return invalidDawn('invalid-announcement')
  }
  if (candidate.outcome === 'no-deaths') {
    return hasExactKeys(candidate, ['outcome', 'nightNumber']) &&
      game.players.every((player) => player.alive)
      ? succeed(Object.freeze({ outcome: 'no-deaths', nightNumber: candidate.nightNumber }))
      : invalidDawn('invalid-announcement')
  }
  if (
    candidate.outcome !== 'deaths' ||
    !hasExactKeys(candidate, ['outcome', 'nightNumber', 'deaths']) ||
    !Array.isArray(candidate.deaths)
  ) {
    return invalidDawn('invalid-announcement')
  }
  const deaths: DawnDeath[] = []
  const seen = new Set<PlayerId>()
  for (const deathCandidate of candidate.deaths) {
    if (
      !isUnknownRecord(deathCandidate) ||
      !hasExactKeys(deathCandidate, ['playerId', 'revealedRoleId']) ||
      typeof deathCandidate.playerId !== 'string' ||
      (deathCandidate.revealedRoleId !== null && typeof deathCandidate.revealedRoleId !== 'string')
    ) {
      return invalidDawn('invalid-announcement')
    }
    const id = playerId(deathCandidate.playerId)
    const player = game.players.find((entry) => entry.playerId === id)
    const expectedReveal =
      player !== undefined && game.settings.revealRoleOnDeath ? player.role.roleId : null
    if (
      player === undefined ||
      player.alive ||
      seen.has(id) ||
      deathCandidate.revealedRoleId !== expectedReveal ||
      player.publiclyRevealedRoleId !== expectedReveal
    ) {
      return invalidDawn('invalid-announcement')
    }
    seen.add(id)
    deaths.push({
      playerId: id,
      revealedRoleId:
        deathCandidate.revealedRoleId === null ? null : roleId(deathCandidate.revealedRoleId),
    })
  }
  if (
    deaths.length === 0 ||
    game.players.some((player) => !player.alive && !seen.has(player.playerId))
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
      deaths: Object.freeze(deaths.map((death) => Object.freeze(death))),
    }),
  )
}

function restoreRoster(
  candidates: readonly unknown[],
  requirePlaying: boolean,
): DomainResult<readonly Player[], RestorePersistedSessionV2Error> {
  const roster: Player[] = []
  for (const candidate of candidates) {
    if (
      !isUnknownRecord(candidate) ||
      !hasExactKeys(candidate, ['id', 'name', 'playing']) ||
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      typeof candidate.name !== 'string' ||
      candidate.name.trim().length === 0 ||
      typeof candidate.playing !== 'boolean' ||
      (requirePlaying && !candidate.playing)
    ) {
      return invalidSetup('invalid-draft')
    }
    roster.push({
      id: playerId(candidate.id),
      name: candidate.name,
      playing: candidate.playing,
    })
  }
  return succeed(Object.freeze(roster.map((player) => Object.freeze(player))))
}

function restoreRoleCounts(
  candidates: readonly unknown[],
): DomainResult<readonly RoleCount[], RestorePersistedSessionV2Error> {
  const roleCounts: RoleCount[] = []
  const knownRoleIds = new Set(ROLE_REGISTRY.map((role) => role.id))
  const seen = new Set<RoleId>()
  for (const candidate of candidates) {
    if (
      !isUnknownRecord(candidate) ||
      !hasExactKeys(candidate, ['roleId', 'count']) ||
      typeof candidate.roleId !== 'string' ||
      typeof candidate.count !== 'number' ||
      !Number.isSafeInteger(candidate.count) ||
      candidate.count < 0
    ) {
      return invalidSetup('invalid-draft')
    }
    const id = roleId(candidate.roleId)
    if (!knownRoleIds.has(id) || seen.has(id)) {
      return invalidSetup('invalid-draft')
    }
    seen.add(id)
    roleCounts.push({ roleId: id, count: candidate.count })
  }
  return seen.size === knownRoleIds.size
    ? succeed(Object.freeze(roleCounts.map((entry) => Object.freeze(entry))))
    : invalidSetup('invalid-draft')
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
  const assignedCounts = new Map<RoleId, number>()
  for (const player of game.players) {
    assignedCounts.set(player.role.roleId, (assignedCounts.get(player.role.roleId) ?? 0) + 1)
  }
  return (
    setup.participatingPlayers.every(
      (player, index) => player.id === game.players[index]?.playerId,
    ) &&
    setup.roleCounts.every(
      (roleCount) => (assignedCounts.get(roleCount.roleId) ?? 0) === roleCount.count,
    )
  )
}

function isNightActionKind(candidate: unknown): candidate is NightActionKind {
  return (
    candidate === 'attack' ||
    candidate === 'frame' ||
    candidate === 'role-block' ||
    candidate === 'investigate' ||
    candidate === 'track' ||
    candidate === 'protect'
  )
}

function isCanonicalTimestamp(value: string): boolean {
  const date = new Date(value)
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value
}

function hasExactKeys(
  candidate: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const candidateKeys = Object.keys(candidate)
  return candidateKeys.length === keys.length && keys.every((key) => Object.hasOwn(candidate, key))
}

function hasAnyKey(candidate: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return keys.some((key) => Object.hasOwn(candidate, key))
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
  const keys = Object.keys(canonical)
  const candidateKeys = Object.keys(candidate).filter(
    (key) => !isCompatibleLegacyMayorMarker(canonical, candidate, key),
  )
  return (
    candidateKeys.length === keys.length &&
    keys.every(
      (key) =>
        Object.hasOwn(candidate, key) && hasSameCanonicalContent(canonical[key], candidate[key]),
    )
  )
}

function isCompatibleLegacyMayorMarker(
  canonical: Readonly<Record<string, unknown>>,
  candidate: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  return (
    key === 'mayorRevealed' &&
    candidate.mayorRevealed === false &&
    !Object.hasOwn(canonical, key) &&
    Object.hasOwn(canonical, 'playerId') &&
    Object.hasOwn(canonical, 'role') &&
    Object.hasOwn(canonical, 'alive') &&
    Object.hasOwn(canonical, 'publiclyRevealedRoleId')
  )
}

function persistSequentialWorkflow(
  workflow: SequentialNightAppSession['workflow'],
): Extract<PersistedAppSessionV2, Readonly<{ stage: 'sequential-night' }>> {
  const persisted = toPersistedAppSessionV2({ stage: 'sequential-night', workflow })
  if (persisted.stage !== 'sequential-night') {
    throw new Error('Sequential-night persistence produced the wrong stage.')
  }
  return persisted
}

function countAuthoritativeGameFields(candidate: Readonly<Record<string, unknown>>): number {
  return Object.entries(candidate).filter(
    ([field, value]) =>
      isUnknownRecord(value) && (field === 'game' || field.toLowerCase().endsWith('game')),
  ).length
}

function invalidSetup(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_SETUP_SESSION' }>
  >['reason'],
  validationErrors: readonly GameSetupValidationError[] = [],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_SETUP_SESSION', reason, validationErrors })
}

function invalidDistribution(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_ROLE_DISTRIBUTION_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_ROLE_DISTRIBUTION_SESSION', reason })
}

function invalidBriefing(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_EXECUTIONER_BRIEFING_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_EXECUTIONER_BRIEFING_SESSION', reason })
}

function invalidSequential(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_SEQUENTIAL_NIGHT_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason })
}

function invalidNightResolution(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_NIGHT_RESOLUTION_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_NIGHT_RESOLUTION_SESSION', reason })
}

function invalidDawn(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_DAWN_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_DAWN_SESSION', reason })
}

function invalidDayDiscussion(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_DAY_DISCUSSION_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_DAY_DISCUSSION_SESSION', reason })
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
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
