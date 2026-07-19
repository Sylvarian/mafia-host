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
import { validateCompleteGodfatherSuccessionHistory } from '@/domain/mafia/godfather-promotion-invariants.ts'
import {
  createJesterRevengeResolutionId,
  createPendingJesterRevengeId,
} from '@/domain/neutral/jester-revenge-identity.ts'
import { selectEligibleJesterRevengeVictims } from '@/domain/neutral/jester-revenge.ts'
import type { SelectedJesterRevenge } from '@/domain/neutral/neutral-outcome-model.ts'
import {
  buildCurrentDawnAnnouncement,
  type DawnAnnouncement,
} from '@/domain/resolution/dawn-announcement.ts'
import { beginNightResolution } from '@/domain/resolution/night-application.ts'
import { resolveNight } from '@/domain/resolution/night-resolution.ts'
import {
  evaluateFactionVictory,
  validateFactionVictoryEvaluationGate,
} from '@/domain/win-conditions/faction-victory.ts'

import { validateDayDiscussionState, type DayDiscussionState } from '../day-discussion/index.ts'
import { validateDayOutcomeState, type DayOutcomeState } from '../day-outcome/index.ts'
import { validateGameOverState } from '../game-over/index.ts'
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
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  selectDoctorPreviousTargetsForNight,
  type ActiveNightActionCollectionWorkflow,
  type ImmediateNightOutcome,
} from '../night-actions/index.ts'
import { beginFinalNightResolution } from '../night-completion/index.ts'
import {
  confirmRoleDistribution,
  setCardDelivered,
  type RoleDistributionWorkflow,
} from '../role-assignment/index.ts'
import type {
  ActiveAppSession,
  DayDiscussionAppSession,
  DayOutcomeAppSession,
  DawnAppSession,
  ExecutionerBriefingAppSession,
  GameOverAppSession,
  GodfatherPromotionBriefingAppSession,
  NightResolutionAppSession,
  PendingRevengeWaitingAppSession,
  PostDayWaitingAppSession,
  RevengeResolutionAppSession,
  RoleDistributionAppSession,
  SequentialNightAppSession,
  SetupAppSession,
} from './active-app-session.ts'
import {
  PERSISTED_SESSION_SCHEMA_VERSION,
  toPersistedAppSessionV2,
  toPersistedNightResolutionV2,
  type PersistedImmediateNightOutcomeV2,
  type PersistedSequentialNightStepV2,
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
        | 'invalid-fabricated-non-informational-outcome'
        | 'restore-position-mismatch'
        | 'stale-private-result-workflow'
    }>
  | Readonly<{
      type: 'INVALID_GODFATHER_PROMOTION_BRIEFING_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'missing-current-promotion'
        | 'invalid-workflow'
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
      type: 'INVALID_REVENGE_RESOLUTION_SESSION'
      reason: 'invalid-shape' | 'invalid-game' | 'invalid-participants' | 'invalid-selection'
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
      type: 'INVALID_DAY_OUTCOME_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'invalid-outcome'
        | 'contains-stale-day-data'
    }>
  | Readonly<{
      type: 'INVALID_POST_DAY_WAITING_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'waiting-stage-result-mismatch'
        | 'contains-stale-day-data'
    }>
  | Readonly<{
      type: 'INVALID_GAME_OVER_SESSION'
      reason:
        | 'invalid-shape'
        | 'invalid-game'
        | 'invalid-participants'
        | 'invalid-result'
        | 'game-over-result-mismatch'
        | 'contains-stale-day-data'
    }>
  | Readonly<{
      type: 'PERSISTENCE_COMPATIBILITY_FAILURE'
      reason: 'legacy-day-death-cause-unavailable' | 'ambiguous-legacy-night-advancement'
    }>
  | Readonly<{
      type: 'STAGE_PHASE_MISMATCH'
      stage: ActiveAppSession['stage']
      phase: string
    }>
  | Readonly<{ type: 'MULTIPLE_AUTHORITATIVE_GAMES' }>

type RestoreOptions = Readonly<{
  allowLegacyGameShape: boolean
  provenNightDeathPlayerIds?: readonly string[]
}>

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
    case 'godfather-promotion-briefing':
      return options.allowLegacyGameShape
        ? invalidGodfatherPromotionBriefing('invalid-shape')
        : restoreGodfatherPromotionBriefingSession(candidate)
    case 'night-resolution':
      return options.allowLegacyGameShape
        ? invalidNightResolution('invalid-shape')
        : restoreNightResolutionSession(candidate)
    case 'revenge-resolution':
      return options.allowLegacyGameShape
        ? invalidRevengeResolution('invalid-shape')
        : restoreRevengeResolutionSession(candidate)
    case 'dawn':
      return restoreDawnSession(candidate, options)
    case 'day-discussion':
      return options.allowLegacyGameShape
        ? invalidDayDiscussion('invalid-shape')
        : restoreDayDiscussionSession(candidate)
    case 'day-outcome':
      return options.allowLegacyGameShape
        ? invalidDayOutcome('invalid-shape')
        : restoreDayOutcomeSession(candidate)
    case 'post-day-waiting':
      return options.allowLegacyGameShape
        ? invalidPostDayWaiting('invalid-shape')
        : restorePostDayWaitingSession(candidate, 'post-day-waiting')
    case 'pending-revenge-waiting':
      return options.allowLegacyGameShape
        ? invalidPostDayWaiting('invalid-shape')
        : restorePostDayWaitingSession(candidate, 'pending-revenge-waiting')
    case 'game-over':
      return options.allowLegacyGameShape
        ? invalidGameOver('invalid-shape')
        : restoreGameOverSession(candidate)
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
): DomainResult<
  SequentialNightAppSession | NightResolutionAppSession,
  RestorePersistedSessionV2Error
> {
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

  return isLegacySequentialNightCandidate(candidate, candidate.completedSteps)
    ? restoreLegacySequentialNightProgress(
        candidate,
        candidate.completedSteps,
        initialResult.value,
        gameResult.value,
      )
    : restoreCurrentSequentialNightProgress(
        candidate,
        candidate.completedSteps,
        initialResult.value,
        gameResult.value,
      )
}

function restoreGodfatherPromotionBriefingSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<GodfatherPromotionBriefingAppSession, RestorePersistedSessionV2Error> {
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
    candidate.workflowStatus !== 'promotion-briefing' ||
    candidate.currentStepIndex !== 0 ||
    !Array.isArray(candidate.completedSteps) ||
    candidate.completedSteps.length !== 0 ||
    candidate.currentOutcome !== null
  ) {
    return invalidGodfatherPromotionBriefing('invalid-shape')
  }

  const sequentialCandidate = {
    ...candidate,
    stage: 'sequential-night',
    workflowStatus: 'collecting',
  }
  const restored = restoreSequentialNightSession(sequentialCandidate)
  if (!restored.ok) {
    return invalidGodfatherPromotionBriefing('invalid-workflow')
  }
  if (
    restored.value.stage !== 'sequential-night' ||
    restored.value.workflow.status !== 'collecting' ||
    restored.value.workflow.currentStepIndex !== 0 ||
    restored.value.workflow.completedSteps.length !== 0
  ) {
    return invalidGodfatherPromotionBriefing('invalid-workflow')
  }
  const currentPromotions = restored.value.workflow.game.godfatherPromotions.filter(
    (promotion) => promotion.promotedAtNightNumber === restored.value.workflow.game.nightNumber,
  )
  if (currentPromotions.length !== 1) {
    return invalidGodfatherPromotionBriefing('missing-current-promotion')
  }

  const session = deepFreeze({
    stage: 'godfather-promotion-briefing' as const,
    workflow: restored.value.workflow,
  })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidGodfatherPromotionBriefing('invalid-shape')
}

function restoreCurrentSequentialNightProgress(
  candidate: Readonly<Record<string, unknown>>,
  completedSteps: readonly unknown[],
  initialWorkflow: ActiveNightActionCollectionWorkflow,
  game: GameState,
): DomainResult<SequentialNightAppSession, RestorePersistedSessionV2Error> {
  if (
    candidate.workflowStatus !== 'collecting' &&
    candidate.workflowStatus !== 'awaiting-outcome-acknowledgement'
  ) {
    return invalidSequential('invalid-shape')
  }

  let workflow = initialWorkflow
  for (const [recordIndex, stepCandidate] of completedSteps.entries()) {
    if (!isUnknownRecord(stepCandidate) || typeof stepCandidate.stepIndex !== 'number') {
      return invalidSequential('invalid-step')
    }
    const alignedResult = alignWorkflowToRecordedStep(workflow, stepCandidate.stepIndex)
    if (!alignedResult.ok) {
      return alignedResult
    }
    workflow = alignedResult.value

    const appliedResult = applyPersistedCurrentStep(workflow, stepCandidate, game)
    if (!appliedResult.ok) {
      return appliedResult
    }
    workflow = appliedResult.value

    const canonicalRecord = workflow.completedSteps.find(
      (record) => record.stepIndex === stepCandidate.stepIndex,
    )
    if (
      canonicalRecord === undefined ||
      !hasSameCanonicalContent(
        persistSequentialRecord(workflow, canonicalRecord.stepIndex),
        stepCandidate,
      )
    ) {
      return invalidSequential(
        isFabricatedNonInformationalOutcome(stepCandidate)
          ? 'invalid-fabricated-non-informational-outcome'
          : 'invalid-step',
      )
    }

    if (
      recordIndex < completedSteps.length - 1 &&
      workflow.status === 'awaiting-outcome-acknowledgement' &&
      workflow.currentStepIndex === stepCandidate.stepIndex
    ) {
      const advance = continueNightActionCollection(workflow)
      if (!advance.ok || advance.value.status === 'complete') {
        return invalidSequential('restore-position-mismatch')
      }
      workflow = advance.value
    }
  }

  const alignedResult = alignCurrentWorkflowToPersistedPosition(
    workflow,
    candidate.currentStepIndex,
    candidate.workflowStatus,
  )
  if (!alignedResult.ok) {
    return alignedResult
  }
  workflow = alignedResult.value

  const session = deepFreeze({ stage: 'sequential-night' as const, workflow })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidSequential('invalid-current-outcome')
}

function restoreLegacySequentialNightProgress(
  candidate: Readonly<Record<string, unknown>>,
  completedSteps: readonly unknown[],
  initialWorkflow: ActiveNightActionCollectionWorkflow,
  game: GameState,
): DomainResult<
  SequentialNightAppSession | NightResolutionAppSession,
  RestorePersistedSessionV2Error
> {
  let workflow: ActiveNightActionCollectionWorkflow = initialWorkflow
  let legacyLastStep: Readonly<Record<string, unknown>> | undefined

  for (const [recordIndex, stepCandidate] of completedSteps.entries()) {
    if (
      !isUnknownRecord(stepCandidate) ||
      typeof stepCandidate.stepIndex !== 'number' ||
      typeof stepCandidate.acknowledged !== 'boolean'
    ) {
      return invalidSequential('invalid-step')
    }
    // Replaying the preceding action may have generated the next blocked record. Legacy history
    // must contain that record before restoration is allowed to advance beyond its private screen.
    const pendingCanonicalRecord = workflow.completedSteps[recordIndex]
    if (
      pendingCanonicalRecord !== undefined &&
      pendingCanonicalRecord.stepIndex !== stepCandidate.stepIndex
    ) {
      return invalidSequential('restore-position-mismatch')
    }
    const alignedResult = alignWorkflowToRecordedStep(workflow, stepCandidate.stepIndex)
    if (!alignedResult.ok) {
      return alignedResult
    }
    workflow = alignedResult.value

    const appliedResult = applyPersistedCurrentStep(workflow, stepCandidate, game)
    if (!appliedResult.ok) {
      return appliedResult
    }
    workflow = appliedResult.value
    const canonicalRecord = workflow.completedSteps.find(
      (record) => record.stepIndex === stepCandidate.stepIndex,
    )
    const persistedRecord =
      canonicalRecord === undefined
        ? undefined
        : persistSequentialRecord(workflow, canonicalRecord.stepIndex)
    if (
      persistedRecord === undefined ||
      !hasSameCanonicalContent(
        toLegacyPersistedSequentialRecord(persistedRecord, stepCandidate.acknowledged),
        stepCandidate,
      )
    ) {
      return invalidSequential('invalid-step')
    }

    const informationalOrBlocked = canonicalRecord?.outcome !== null
    const mustAdvance =
      stepCandidate.acknowledged ||
      recordIndex < completedSteps.length - 1 ||
      (persistedRecord.status === 'action-confirmed' && persistedRecord.outcome === null)
    if (informationalOrBlocked && mustAdvance) {
      if (!stepCandidate.acknowledged) {
        return invalidSequential('invalid-step')
      }
      const advance = continueNightActionCollection(workflow)
      if (!advance.ok) {
        return invalidSequential('restore-position-mismatch')
      }
      workflow = advance.value
    }
    legacyLastStep = stepCandidate
  }

  // A collapsed legacy acknowledgement may legitimately surface a new current blocked screen, but
  // a collecting position proves that every earlier blocked screen already had a persisted record.
  if (
    candidate.workflowStatus === 'collecting' &&
    workflow.completedSteps.length !== completedSteps.length
  ) {
    return invalidSequential('restore-position-mismatch')
  }

  const evidenceResult = validateLegacySequentialPositionEvidence(
    candidate,
    legacyLastStep,
    workflow,
  )
  if (!evidenceResult.ok) {
    return evidenceResult
  }
  workflow = evidenceResult.value

  if (workflow.status === 'complete') {
    const resolutionResult = beginFinalNightResolution(workflow)
    return resolutionResult.ok
      ? succeed(
          deepFreeze({
            stage: 'night-resolution' as const,
            workflow: resolutionResult.value,
          }),
        )
      : invalidSequential('restore-position-mismatch')
  }

  return succeed(
    deepFreeze({
      stage: 'sequential-night' as const,
      workflow,
    }),
  )
}

function isLegacySequentialNightCandidate(
  candidate: Readonly<Record<string, unknown>>,
  completedSteps: readonly unknown[],
): boolean {
  return (
    candidate.workflowStatus === 'outcome-acknowledged' ||
    completedSteps.some((step) => isUnknownRecord(step) && Object.hasOwn(step, 'acknowledged')) ||
    (isUnknownRecord(candidate.currentOutcome) &&
      candidate.currentOutcome.kind === 'action-recorded')
  )
}

function alignWorkflowToRecordedStep(
  initialWorkflow: ActiveNightActionCollectionWorkflow,
  stepIndex: number,
): DomainResult<ActiveNightActionCollectionWorkflow, RestorePersistedSessionV2Error> {
  let workflow = initialWorkflow
  while (workflow.currentStepIndex < stepIndex) {
    const advance = continueNightActionCollection(workflow)
    if (!advance.ok || advance.value.status === 'complete') {
      return invalidSequential('restore-position-mismatch')
    }
    workflow = advance.value
  }
  return workflow.currentStepIndex === stepIndex
    ? succeed(workflow)
    : invalidSequential('restore-position-mismatch')
}

function applyPersistedCurrentStep(
  workflow: ActiveNightActionCollectionWorkflow,
  stepCandidate: Readonly<Record<string, unknown>>,
  game: GameState,
): DomainResult<ActiveNightActionCollectionWorkflow, RestorePersistedSessionV2Error> {
  if (stepCandidate.status === 'action-confirmed') {
    if (!isUnknownRecord(stepCandidate.action) || workflow.status !== 'collecting') {
      return invalidSequential('invalid-step')
    }
    const actionResult = restoreSubmittedAction(
      stepCandidate.action,
      game,
      selectDoctorPreviousTargetsForNight(game),
    )
    if (!actionResult.ok) {
      return invalidSequential('invalid-step')
    }
    const confirmation = confirmNightActionTarget(workflow, actionResult.value.targetPlayerId)
    return confirmation.ok ? succeed(confirmation.value) : invalidSequential('invalid-step')
  }

  return stepCandidate.status === 'blocked' &&
    workflow.status === 'awaiting-outcome-acknowledgement' &&
    workflow.completedSteps.at(-1)?.status === 'blocked'
    ? succeed(workflow)
    : invalidSequential('invalid-step')
}

function alignCurrentWorkflowToPersistedPosition(
  initialWorkflow: ActiveNightActionCollectionWorkflow,
  currentStepIndex: unknown,
  workflowStatus: unknown,
): DomainResult<SequentialNightAppSession['workflow'], RestorePersistedSessionV2Error> {
  if (typeof currentStepIndex !== 'number') {
    return invalidSequential('restore-position-mismatch')
  }
  let workflow = initialWorkflow
  if (workflowStatus === 'collecting') {
    if (workflow.status === 'awaiting-outcome-acknowledgement') {
      const advance = continueNightActionCollection(workflow)
      if (!advance.ok || advance.value.status === 'complete') {
        return invalidSequential('restore-position-mismatch')
      }
      workflow = advance.value
    }
    while (workflow.currentStepIndex < currentStepIndex) {
      const advance = continueNightActionCollection(workflow)
      if (!advance.ok || advance.value.status === 'complete') {
        return invalidSequential('restore-position-mismatch')
      }
      workflow = advance.value
    }
  }

  if (
    workflowStatus === 'collecting' &&
    workflow.status === 'collecting' &&
    workflow.currentStepIndex === currentStepIndex
  ) {
    return succeed(workflow)
  }
  if (
    workflowStatus === 'awaiting-outcome-acknowledgement' &&
    workflow.status === 'awaiting-outcome-acknowledgement' &&
    workflow.currentStepIndex === currentStepIndex
  ) {
    return succeed(workflow)
  }
  return invalidSequential('restore-position-mismatch')
}

function persistSequentialRecord(
  workflow: ActiveNightActionCollectionWorkflow,
  stepIndex: number,
): PersistedSequentialNightStepV2 | undefined {
  const record = workflow.completedSteps.find((candidate) => candidate.stepIndex === stepIndex)
  if (record === undefined) {
    return undefined
  }
  return record.status === 'blocked'
    ? {
        stepIndex: record.stepIndex,
        status: record.status,
        actorPlayerId: record.actorPlayerId,
        actorRoleId: record.actorRoleId,
        actorRoleInstanceId: record.actorRoleInstanceId,
        outcome: persistImmediateNightOutcome(record.outcome),
      }
    : {
        stepIndex: record.stepIndex,
        status: record.status,
        actorPlayerId: record.actorPlayerId,
        actorRoleId: record.actorRoleId,
        actorRoleInstanceId: record.actorRoleInstanceId,
        action: { ...record.action },
        outcome: record.outcome === null ? null : persistImmediateNightOutcome(record.outcome),
      }
}

function persistImmediateNightOutcome(
  outcome: Extract<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>>,
): Extract<PersistedImmediateNightOutcomeV2, Readonly<{ kind: 'blocked' }>>
function persistImmediateNightOutcome(
  outcome: Exclude<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>>,
): Exclude<PersistedImmediateNightOutcomeV2, Readonly<{ kind: 'blocked' }>>
function persistImmediateNightOutcome(
  outcome: ImmediateNightOutcome,
): PersistedImmediateNightOutcomeV2 {
  switch (outcome.kind) {
    case 'blocked':
    case 'sheriff-result':
      return { ...outcome }
    case 'investigation-result':
      return {
        kind: outcome.kind,
        actorPlayerId: outcome.actorPlayerId,
        actorRoleId: outcome.actorRoleId,
        actorRoleInstanceId: outcome.actorRoleInstanceId,
        targetPlayerId: outcome.targetPlayerId,
        investigationRole: outcome.investigationRole,
        groupId: outcome.group.id,
      }
    case 'detective-result':
      return outcome.result.status === 'visited-nobody'
        ? {
            kind: outcome.kind,
            actorPlayerId: outcome.actorPlayerId,
            actorRoleId: outcome.actorRoleId,
            actorRoleInstanceId: outcome.actorRoleInstanceId,
            targetPlayerId: outcome.targetPlayerId,
            status: outcome.result.status,
          }
        : {
            kind: outcome.kind,
            actorPlayerId: outcome.actorPlayerId,
            actorRoleId: outcome.actorRoleId,
            actorRoleInstanceId: outcome.actorRoleInstanceId,
            targetPlayerId: outcome.targetPlayerId,
            status: outcome.result.status,
            visitedPlayerId: outcome.result.visitedPlayerId,
          }
  }
}

function toLegacyPersistedSequentialRecord(
  record: PersistedSequentialNightStepV2,
  acknowledged: boolean,
): Readonly<Record<string, unknown>> {
  if (record.status === 'blocked') {
    return { ...record, acknowledged }
  }
  const outcome =
    record.outcome === null
      ? {
          kind: 'action-recorded',
          actorPlayerId: record.actorPlayerId,
          actorRoleId: record.actorRoleId,
          actorRoleInstanceId: record.actorRoleInstanceId,
          targetPlayerId: record.action.targetPlayerId,
        }
      : record.outcome
  return { ...record, outcome, acknowledged }
}

function validateLegacySequentialPositionEvidence(
  candidate: Readonly<Record<string, unknown>>,
  lastStep: Readonly<Record<string, unknown>> | undefined,
  initialWorkflow: ActiveNightActionCollectionWorkflow,
): DomainResult<ActiveNightActionCollectionWorkflow, RestorePersistedSessionV2Error> {
  if (candidate.workflowStatus === 'outcome-acknowledged') {
    if (
      lastStep === undefined ||
      lastStep.acknowledged !== true ||
      candidate.currentOutcome !== null ||
      candidate.currentStepIndex !== lastStep.stepIndex
    ) {
      return fail({
        type: 'PERSISTENCE_COMPATIBILITY_FAILURE',
        reason: 'ambiguous-legacy-night-advancement',
      })
    }
    return succeed(initialWorkflow)
  }

  if (candidate.workflowStatus === 'awaiting-outcome-acknowledgement') {
    if (
      lastStep === undefined ||
      lastStep.acknowledged !== false ||
      candidate.currentStepIndex !== lastStep.stepIndex ||
      !hasSameCanonicalContent(lastStep.outcome, candidate.currentOutcome)
    ) {
      return invalidSequential('invalid-current-outcome')
    }
    const actionRecorded =
      isUnknownRecord(lastStep.outcome) && lastStep.outcome.kind === 'action-recorded'
    return actionRecorded ||
      (initialWorkflow.status === 'awaiting-outcome-acknowledgement' &&
        initialWorkflow.currentStepIndex === candidate.currentStepIndex)
      ? succeed(initialWorkflow)
      : invalidSequential('restore-position-mismatch')
  }

  if (
    candidate.workflowStatus !== 'collecting' ||
    candidate.currentOutcome !== null ||
    (lastStep !== undefined && lastStep.acknowledged !== true)
  ) {
    return invalidSequential('invalid-current-outcome')
  }
  return alignCurrentWorkflowToPersistedPosition(
    initialWorkflow,
    candidate.currentStepIndex,
    'collecting',
  )
}

function isFabricatedNonInformationalOutcome(
  stepCandidate: Readonly<Record<string, unknown>>,
): boolean {
  if (stepCandidate.status !== 'action-confirmed' || !isUnknownRecord(stepCandidate.outcome)) {
    return false
  }
  return (
    stepCandidate.actorRoleId === ROLE_IDS.consort ||
    stepCandidate.actorRoleId === ROLE_IDS.framer ||
    stepCandidate.actorRoleId === ROLE_IDS.godfather ||
    stepCandidate.actorRoleId === ROLE_IDS.serialKiller ||
    stepCandidate.actorRoleId === ROLE_IDS.doctor
  )
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
  const gameResult = restoreGame(candidate.game, {
    ...options,
    provenNightDeathPlayerIds: selectDawnDeathPlayerIds(candidate.dawnAnnouncement),
  })
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
  if (gameResult.value.nightNumber !== gameResult.value.dayNumber + 1) {
    return invalidDawn('invalid-counters')
  }
  if (isCurrentNeutralStateGame(candidate.game) || isPhase7ENeutralStateGame(candidate.game)) {
    const evaluation = evaluateFactionVictory({
      ...gameResult.value,
      phase: 'dawn-resolution',
    })
    if (!evaluation.ok || evaluation.value.kind !== 'none') {
      return invalidDawn('invalid-game')
    }
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

function restoreRevengeResolutionSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<RevengeResolutionAppSession, RestorePersistedSessionV2Error> {
  if (
    !hasExactKeys(candidate, [
      'stage',
      'workflowStatus',
      'game',
      'participants',
      'selectedRevenge',
    ]) ||
    candidate.workflowStatus !== 'revenge-resolution' ||
    !isUnknownRecord(candidate.selectedRevenge) ||
    !hasExactKeys(candidate.selectedRevenge, [
      'id',
      'kind',
      'gameId',
      'obligationId',
      'jesterPlayerId',
      'jesterRoleInstanceId',
      'victimPlayerId',
      'resolvedAtNightNumber',
    ])
  ) {
    return invalidRevengeResolution('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, DEFAULT_OPTIONS)
  if (!gameResult.ok || gameResult.value.phase !== 'dawn-resolution') {
    return invalidRevengeResolution('invalid-game')
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidRevengeResolution('invalid-participants')
  }
  const selectedCandidate = candidate.selectedRevenge
  if (
    selectedCandidate.kind !== 'victim-selected' ||
    typeof selectedCandidate.id !== 'string' ||
    typeof selectedCandidate.gameId !== 'string' ||
    typeof selectedCandidate.obligationId !== 'string' ||
    typeof selectedCandidate.jesterPlayerId !== 'string' ||
    typeof selectedCandidate.jesterRoleInstanceId !== 'string' ||
    typeof selectedCandidate.victimPlayerId !== 'string' ||
    typeof selectedCandidate.resolvedAtNightNumber !== 'number' ||
    !Number.isSafeInteger(selectedCandidate.resolvedAtNightNumber)
  ) {
    return invalidRevengeResolution('invalid-selection')
  }
  const obligation = gameResult.value.pendingJesterRevenges[0]
  if (
    obligation === undefined ||
    gameResult.value.pendingJesterRevenges.length !== 1 ||
    obligation.id !== selectedCandidate.obligationId ||
    obligation.id !==
      createPendingJesterRevengeId(obligation.jesterRoleInstanceId, obligation.triggeredOnDay) ||
    createJesterRevengeResolutionId(obligation.id) !== selectedCandidate.id ||
    gameResult.value.id !== selectedCandidate.gameId ||
    obligation.jesterPlayerId !== selectedCandidate.jesterPlayerId ||
    obligation.jesterRoleInstanceId !== selectedCandidate.jesterRoleInstanceId ||
    gameResult.value.nightNumber !== selectedCandidate.resolvedAtNightNumber
  ) {
    return invalidRevengeResolution('invalid-selection')
  }
  const selection: SelectedJesterRevenge = Object.freeze({
    id: selectedCandidate.id,
    kind: 'victim-selected',
    gameId: gameId(selectedCandidate.gameId),
    obligationId: selectedCandidate.obligationId,
    jesterPlayerId: playerId(selectedCandidate.jesterPlayerId),
    jesterRoleInstanceId: roleInstanceId(selectedCandidate.jesterRoleInstanceId),
    victimPlayerId: playerId(selectedCandidate.victimPlayerId),
    resolvedAtNightNumber: selectedCandidate.resolvedAtNightNumber,
  })
  if (
    !selectEligibleJesterRevengeVictims(gameResult.value, obligation).includes(
      selection.victimPlayerId,
    )
  ) {
    return invalidRevengeResolution('invalid-selection')
  }
  const session = deepFreeze({
    stage: 'revenge-resolution' as const,
    workflow: {
      status: 'revenge-resolution' as const,
      game: gameResult.value,
      participants: participantsResult.value,
      selectedRevenge: selection,
    },
  })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidRevengeResolution('invalid-shape')
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
      'selectedExecutionPlayerId',
      'executionDialogOpen',
      'noExecutionDialogOpen',
      'operationPending',
      'showHostRoles',
      'hostOnlyRoles',
      'hostRoleView',
      'hostRoleVisibility',
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
  if (isPriorNeutralStateGame(candidate.game) && persistedGameHasDeadPlayer(candidate.game)) {
    return fail({
      type: 'PERSISTENCE_COMPATIBILITY_FAILURE',
      reason: 'legacy-day-death-cause-unavailable',
    })
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

function restoreDayOutcomeSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<DayOutcomeAppSession, RestorePersistedSessionV2Error> {
  if (
    hasAnyKey(candidate, [
      'workflow',
      'dawnAnnouncement',
      'completedSteps',
      'currentOutcome',
      'currentStepIndex',
      'steps',
      'nightWorkflow',
      'collectedActions',
      'resolution',
      'selectedMayorPlayerId',
      'mayorDialogOpen',
      'selectedExecutionPlayerId',
      'executionDialogOpen',
      'noExecutionDialogOpen',
      'operationPending',
    ])
  ) {
    return invalidDayOutcome('contains-stale-day-data')
  }
  if (
    !hasExactKeys(candidate, ['stage', 'workflowStatus', 'game', 'participants']) ||
    candidate.workflowStatus !== 'day-outcome' ||
    !isSupportedNeutralStateGame(candidate.game)
  ) {
    return invalidDayOutcome('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, DEFAULT_OPTIONS)
  if (!gameResult.ok) {
    return invalidDayOutcome('invalid-game')
  }
  if (gameResult.value.phase !== 'execution-resolution') {
    return fail({
      type: 'STAGE_PHASE_MISMATCH',
      stage: 'day-outcome',
      phase: gameResult.value.phase,
    })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidDayOutcome('invalid-participants')
  }
  const state: DayOutcomeState = {
    game: gameResult.value,
    participants: participantsResult.value,
  }
  const stateResult = validateDayOutcomeState(state)
  if (!stateResult.ok) {
    return invalidDayOutcome(
      stateResult.error.type === 'INVALID_DAY_OUTCOME_PARTICIPANTS'
        ? 'invalid-participants'
        : stateResult.error.type === 'MISSING_DAY_OUTCOME'
          ? 'invalid-outcome'
          : 'invalid-game',
    )
  }
  const session = deepFreeze({
    stage: 'day-outcome' as const,
    game: stateResult.value.game,
    participants: stateResult.value.participants,
  })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidDayOutcome('invalid-shape')
}

function restorePostDayWaitingSession(
  candidate: Readonly<Record<string, unknown>>,
  stage: PostDayWaitingAppSession['stage'] | PendingRevengeWaitingAppSession['stage'],
): DomainResult<
  PostDayWaitingAppSession | PendingRevengeWaitingAppSession,
  RestorePersistedSessionV2Error
> {
  if (containsStalePostDayData(candidate)) {
    return invalidPostDayWaiting('contains-stale-day-data')
  }
  if (
    !hasExactKeys(candidate, ['stage', 'workflowStatus', 'game', 'participants']) ||
    candidate.workflowStatus !== stage ||
    !isSupportedNeutralStateGame(candidate.game)
  ) {
    return invalidPostDayWaiting('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, DEFAULT_OPTIONS)
  if (!gameResult.ok) {
    return invalidPostDayWaiting('invalid-game')
  }
  if (gameResult.value.phase !== 'execution-resolution') {
    return fail({ type: 'STAGE_PHASE_MISMATCH', stage, phase: gameResult.value.phase })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidPostDayWaiting('invalid-participants')
  }
  const dayResult = validateDayOutcomeState({
    game: gameResult.value,
    participants: participantsResult.value,
  })
  if (!dayResult.ok) {
    return invalidPostDayWaiting('invalid-game')
  }
  if (stage === 'pending-revenge-waiting') {
    const gateResult = validateFactionVictoryEvaluationGate(dayResult.value.game)
    if (gateResult.ok || gateResult.error.type !== 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY') {
      return invalidPostDayWaiting('waiting-stage-result-mismatch')
    }
    const session = deepFreeze({
      stage,
      game: dayResult.value.game,
      participants: dayResult.value.participants,
    })
    return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
      ? succeed(session)
      : invalidPostDayWaiting('invalid-shape')
  }
  const evaluationResult = evaluateFactionVictory(dayResult.value.game)
  if (!evaluationResult.ok || evaluationResult.value.kind !== 'none') {
    return invalidPostDayWaiting('waiting-stage-result-mismatch')
  }
  const session = deepFreeze({
    stage,
    game: dayResult.value.game,
    participants: dayResult.value.participants,
  })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidPostDayWaiting('invalid-shape')
}

function restoreGameOverSession(
  candidate: Readonly<Record<string, unknown>>,
): DomainResult<GameOverAppSession, RestorePersistedSessionV2Error> {
  if (containsStalePostDayData(candidate)) {
    return invalidGameOver('contains-stale-day-data')
  }
  if (
    !hasExactKeys(candidate, ['stage', 'workflowStatus', 'game', 'participants', 'result']) ||
    candidate.workflowStatus !== 'game-over' ||
    !isSupportedNeutralStateGame(candidate.game)
  ) {
    return invalidGameOver('invalid-shape')
  }
  const gameResult = restoreGame(candidate.game, DEFAULT_OPTIONS)
  if (!gameResult.ok) {
    return invalidGameOver('invalid-game')
  }
  if (gameResult.value.phase !== 'game-over') {
    return fail({ type: 'STAGE_PHASE_MISMATCH', stage: 'game-over', phase: gameResult.value.phase })
  }
  const participantsResult = restoreParticipants(candidate.participants, gameResult.value)
  if (!participantsResult.ok) {
    return invalidGameOver('invalid-participants')
  }
  const stateResult = validateGameOverState({
    game: gameResult.value,
    participants: participantsResult.value,
    result: candidate.result,
  })
  if (!stateResult.ok) {
    return invalidGameOver(
      stateResult.error.type === 'INVALID_GAME_OVER_RESULT' &&
        stateResult.error.error.type === 'GAME_OVER_RESULT_MISMATCH'
        ? 'game-over-result-mismatch'
        : stateResult.error.type === 'INVALID_GAME_OVER_RESULT'
          ? 'invalid-result'
          : 'game-over-result-mismatch',
    )
  }
  const session = deepFreeze({
    stage: 'game-over' as const,
    game: stateResult.value.game,
    participants: stateResult.value.participants,
    result: stateResult.value.result,
  })
  return hasSameCanonicalContent(toPersistedAppSessionV2(session), candidate)
    ? succeed(session)
    : invalidGameOver('invalid-shape')
}

function containsStalePostDayData(candidate: Readonly<Record<string, unknown>>): boolean {
  return hasAnyKey(candidate, [
    'workflow',
    'dawnAnnouncement',
    'completedSteps',
    'currentOutcome',
    'currentStepIndex',
    'steps',
    'nightWorkflow',
    'collectedActions',
    'resolution',
    'revengeResolution',
    'revengeVictimPlayerId',
    'nextNight',
    'selectedMayorPlayerId',
    'mayorDialogOpen',
    'selectedExecutionPlayerId',
    'executionDialogOpen',
    'noExecutionDialogOpen',
    'operationPending',
    'showHostRoles',
    'hostRoleView',
  ])
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
  const priorNeutralKeys = [
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
  const phase7DKeys = [
    ...priorNeutralKeys,
    'deathRecords',
    'personalWins',
    'executionerConversions',
    'pendingJesterRevenges',
    'dayOutcome',
  ]
  const currentKeys = [
    ...priorNeutralKeys,
    'deathRecords',
    'personalWins',
    'executionerConversions',
    'godfatherSuccessionStartNightNumber',
    'godfatherPromotions',
    'pendingJesterRevenges',
    'jesterRevengeResolutions',
    'dayOutcomes',
  ]
  const phase7EKeys = currentKeys.filter(
    (key) => key !== 'godfatherSuccessionStartNightNumber' && key !== 'godfatherPromotions',
  )
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
  const priorNeutralShape =
    !legacyShape && hasExactKeys(candidate, priorNeutralKeys) && candidate.neutralStateVersion === 1
  const phase7DShape =
    !legacyShape && hasExactKeys(candidate, phase7DKeys) && candidate.neutralStateVersion === 2
  const phase7EShape = hasExactKeys(candidate, phase7EKeys) && candidate.neutralStateVersion === 3
  const currentNeutralShape =
    hasExactKeys(candidate, currentKeys) && candidate.neutralStateVersion === 4
  if (
    (!currentNeutralShape &&
      !phase7EShape &&
      !phase7DShape &&
      !priorNeutralShape &&
      !legacyShape) ||
    typeof candidate.id !== 'string' ||
    candidate.id.trim().length === 0 ||
    typeof candidate.phase !== 'string' ||
    !Array.isArray(candidate.players) ||
    typeof candidate.nightNumber !== 'number' ||
    !Number.isSafeInteger(candidate.nightNumber) ||
    typeof candidate.dayNumber !== 'number' ||
    !Number.isSafeInteger(candidate.dayNumber) ||
    (currentNeutralShape &&
      (typeof candidate.godfatherSuccessionStartNightNumber !== 'number' ||
        !Number.isSafeInteger(candidate.godfatherSuccessionStartNightNumber))) ||
    !Array.isArray(candidate.doctorPreviousTargets)
  ) {
    return invalidDistribution('invalid-game')
  }
  if (
    !legacyShape &&
    (!Array.isArray(candidate.executionerTargets) ||
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
  const provenNightDeaths = new Set(options.provenNightDeathPlayerIds ?? [])
  const hasOutcomeAuthority = currentNeutralShape || phase7EShape || phase7DShape
  const upgradedDeathRecords = hasOutcomeAuthority
    ? candidate.deathRecords
    : players
        .filter((player) => provenNightDeaths.has(player.playerId))
        .map((player) => ({
          gameId: candidate.id,
          playerId: player.playerId,
          roleInstanceId: player.role.instanceId,
          cause: {
            kind: 'night-death' as const,
            nightNumber: candidate.nightNumber,
          },
        }))
  const upgradedConversions = hasOutcomeAuthority
    ? candidate.executionerConversions
    : executionerTargets
        .filter((target) => provenNightDeaths.has(target.targetPlayerId))
        .map((target) => ({
          kind: 'executioner-to-jester' as const,
          gameId: candidate.id,
          playerId: target.executionerPlayerId,
          roleInstanceId: target.executionerRoleInstanceId,
          targetPlayerId: target.targetPlayerId,
        }))
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
    deathRecords: upgradedDeathRecords,
    personalWins: hasOutcomeAuthority ? candidate.personalWins : [],
    executionerConversions: upgradedConversions,
    godfatherSuccessionStartNightNumber: currentNeutralShape
      ? candidate.godfatherSuccessionStartNightNumber
      : Math.max(2, candidate.nightNumber + 1),
    godfatherPromotions: currentNeutralShape ? candidate.godfatherPromotions : [],
    pendingJesterRevenges:
      currentNeutralShape || phase7EShape
        ? candidate.pendingJesterRevenges
        : phase7DShape && Array.isArray(candidate.pendingJesterRevenges)
          ? candidate.pendingJesterRevenges.map((record: unknown): unknown =>
              isUnknownRecord(record) &&
              typeof record.jesterRoleInstanceId === 'string' &&
              typeof record.triggeredOnDay === 'number'
                ? {
                    ...record,
                    id: createPendingJesterRevengeId(
                      roleInstanceId(record.jesterRoleInstanceId),
                      record.triggeredOnDay,
                    ),
                  }
                : record,
            )
          : [],
    jesterRevengeResolutions:
      currentNeutralShape || phase7EShape ? candidate.jesterRevengeResolutions : [],
    dayOutcomes:
      currentNeutralShape || phase7EShape
        ? candidate.dayOutcomes
        : phase7DShape && candidate.dayOutcome !== null
          ? [candidate.dayOutcome]
          : [],
  }
  const result = validateGameState(gameCandidate)
  if (!result.ok) {
    return invalidDistribution('invalid-game')
  }
  if (currentNeutralShape && !validateCompleteGodfatherSuccessionHistory(result.value).ok) {
    return invalidDistribution('invalid-game')
  }
  return succeed(deepFreeze(result.value))
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
  const announcement = buildCurrentDawnAnnouncement(game)
  return hasSameCanonicalContent(announcement, candidate)
    ? succeed(announcement)
    : invalidDawn('invalid-announcement')
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
  if (isCurrentNeutralStateGame(canonical) && isPhase7DNeutralStateGame(candidate)) {
    return hasSameCanonicalContent(toPhase7DNeutralStateGame(canonical), candidate)
  }
  if (isCurrentNeutralStateGame(canonical) && isPhase7ENeutralStateGame(candidate)) {
    return hasSameCanonicalContent(toPhase7ENeutralStateGame(canonical), candidate)
  }
  if (isCurrentNeutralStateGame(canonical) && isPriorNeutralStateGame(candidate)) {
    return hasSameCanonicalContent(toPriorNeutralStateGame(canonical), candidate)
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

function isPriorNeutralStateGame(
  candidate: unknown,
): candidate is Readonly<Record<string, unknown>> {
  return isUnknownRecord(candidate) && candidate.neutralStateVersion === 1
}

function isCurrentNeutralStateGame(
  candidate: unknown,
): candidate is Readonly<Record<string, unknown>> {
  return isUnknownRecord(candidate) && candidate.neutralStateVersion === 4
}

function isSupportedNeutralStateGame(
  candidate: unknown,
): candidate is Readonly<Record<string, unknown>> {
  return (
    isCurrentNeutralStateGame(candidate) ||
    isPhase7ENeutralStateGame(candidate) ||
    isPhase7DNeutralStateGame(candidate)
  )
}

function isPhase7ENeutralStateGame(
  candidate: unknown,
): candidate is Readonly<Record<string, unknown>> {
  return isUnknownRecord(candidate) && candidate.neutralStateVersion === 3
}

function toPhase7ENeutralStateGame(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    ...Object.fromEntries(
      Object.entries(candidate).filter(
        ([key]) => key !== 'godfatherSuccessionStartNightNumber' && key !== 'godfatherPromotions',
      ),
    ),
    neutralStateVersion: 3,
  }
}

function isPhase7DNeutralStateGame(
  candidate: unknown,
): candidate is Readonly<Record<string, unknown>> {
  return isUnknownRecord(candidate) && candidate.neutralStateVersion === 2
}

function toPhase7DNeutralStateGame(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const dayOutcomes = Array.isArray(candidate.dayOutcomes) ? candidate.dayOutcomes : []
  const pendingJesterRevenges = Array.isArray(candidate.pendingJesterRevenges)
    ? candidate.pendingJesterRevenges.map((record: unknown): unknown =>
        isUnknownRecord(record)
          ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'id'))
          : record,
      )
    : candidate.pendingJesterRevenges
  return {
    ...Object.fromEntries(
      Object.entries(candidate).filter(
        ([key]) =>
          key !== 'jesterRevengeResolutions' &&
          key !== 'dayOutcomes' &&
          key !== 'godfatherSuccessionStartNightNumber' &&
          key !== 'godfatherPromotions',
      ),
    ),
    neutralStateVersion: 2,
    pendingJesterRevenges,
    dayOutcome: dayOutcomes[0] ?? null,
  }
}

function toPriorNeutralStateGame(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const phase7CFields = new Set([
    'deathRecords',
    'personalWins',
    'executionerConversions',
    'pendingJesterRevenges',
    'jesterRevengeResolutions',
    'dayOutcome',
    'dayOutcomes',
    'godfatherSuccessionStartNightNumber',
    'godfatherPromotions',
  ])
  return {
    ...Object.fromEntries(Object.entries(candidate).filter(([key]) => !phase7CFields.has(key))),
    neutralStateVersion: 1,
  }
}

function persistedGameHasDeadPlayer(candidate: unknown): boolean {
  return (
    isUnknownRecord(candidate) &&
    Array.isArray(candidate.players) &&
    candidate.players.some((player) => isUnknownRecord(player) && player.alive === false)
  )
}

function selectDawnDeathPlayerIds(candidate: unknown): readonly string[] {
  if (
    !isUnknownRecord(candidate) ||
    candidate.outcome !== 'deaths' ||
    !Array.isArray(candidate.deaths)
  ) {
    return []
  }
  return candidate.deaths.flatMap((death) =>
    isUnknownRecord(death) && typeof death.playerId === 'string' ? [death.playerId] : [],
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

function invalidGodfatherPromotionBriefing(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_GODFATHER_PROMOTION_BRIEFING_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_GODFATHER_PROMOTION_BRIEFING_SESSION', reason })
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

function invalidRevengeResolution(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_REVENGE_RESOLUTION_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_REVENGE_RESOLUTION_SESSION', reason })
}

function invalidDayDiscussion(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_DAY_DISCUSSION_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_DAY_DISCUSSION_SESSION', reason })
}

function invalidDayOutcome(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_DAY_OUTCOME_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_DAY_OUTCOME_SESSION', reason })
}

function invalidPostDayWaiting(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_POST_DAY_WAITING_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_POST_DAY_WAITING_SESSION', reason })
}

function invalidGameOver(
  reason: Extract<
    RestorePersistedSessionV2Error,
    Readonly<{ type: 'INVALID_GAME_OVER_SESSION' }>
  >['reason'],
): DomainResult<never, RestorePersistedSessionV2Error> {
  return fail({ type: 'INVALID_GAME_OVER_SESSION', reason })
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
