import { useEffect, useRef, useState } from 'react'

import {
  selectExecutionerBriefingView,
  type CompleteExecutionerBriefingPhaseError,
  type ExecutionerBriefingError,
  type ExecutionerBriefingId,
  type FinalizeRoleDistributionError,
} from '@/application/executioner-briefing/index.ts'
import type {
  GameSetupEditError,
  GameSetupWorkflowCommand,
} from '@/application/game-setup/index.ts'
import type { NightActionCollectionError } from '@/application/night-actions/index.ts'
import type { NightCompletionError } from '@/application/night-completion/index.ts'
import { selectNightCompletionView } from '@/application/night-completion/index.ts'
import type {
  PlayerId,
  RoleAssignmentDependencies,
  RoleDistributionError,
} from '@/application/role-assignment/index.ts'
import {
  acknowledgeSessionNightOutcome,
  acknowledgeSessionExecutionerBriefing,
  assignSessionRoles,
  beginSessionFirstNight,
  completeSessionExecutionerBriefings,
  confirmSessionNightTarget,
  confirmSessionRoleDistribution,
  continueSessionNight,
  createActiveAppSession,
  createPersistedSessionEnvelopeV2,
  markAllSessionCardsDelivered,
  nextSessionExecutionerBriefing,
  prepareSessionDawn,
  previousSessionExecutionerBriefing,
  reassignSessionRoles,
  setSessionCardDelivered,
  toPersistedAppSessionV2,
  updateSetupSession,
  type ActiveAppSession,
  type ClearFailureError,
  type GameSessionStore,
  type InvalidActiveAppSessionStageError,
  type LoadPersistedSessionError,
  type LoadPersistedSessionResult,
  type RestoredSessionEnvelopeV2,
  type SessionClock,
} from '@/application/session-persistence/index.ts'
import { DawnPresentation } from '@/features/dawn/index.ts'
import {
  ExecutionerBriefing,
  getExecutionerBriefingErrorMessage,
} from '@/features/executioner-briefing/index.ts'
import { GameSetup } from '@/features/game-setup/index.ts'
import { getNightActionCollectionErrorMessage, NightRunner } from '@/features/night-runner/index.ts'
import {
  getRoleDistributionErrorMessage,
  RoleDistribution,
} from '@/features/role-distribution/index.ts'
import {
  SessionRecovery,
  SessionSaveStatus,
  type LocalSaveStatus,
} from '@/features/session-persistence/index.ts'

import './App.css'

export type AppProps = Readonly<{
  roleAssignmentDependencies: RoleAssignmentDependencies
  sessionStore: GameSessionStore
  sessionClock: SessionClock
  initialLoadResult: LoadPersistedSessionResult
}>

type AppState =
  | Readonly<{
      mode: 'saved-session-found'
      envelope: RestoredSessionEnvelopeV2
      clearError: ClearFailureError | null
    }>
  | Readonly<{
      mode: 'recovery-failed'
      error: LoadPersistedSessionError
      clearError: ClearFailureError | null
    }>
  | Readonly<{
      mode: 'active'
      session: ActiveAppSession
      saveStatus: LocalSaveStatus
      hasStoredSave: boolean
      clearError: ClearFailureError | null
    }>

type InitialAppState = Readonly<{
  state: AppState
  persistedFingerprint: string | null
}>

export default function App({
  roleAssignmentDependencies,
  sessionStore,
  sessionClock,
  initialLoadResult,
}: AppProps) {
  const [initialState] = useState<InitialAppState>(() => createInitialAppState(initialLoadResult))
  const [appState, setAppState] = useState<AppState>(initialState.state)
  const [setupError, setSetupError] = useState<GameSetupEditError | null>(null)
  const [distributionError, setDistributionError] = useState<RoleDistributionError | null>(null)
  const [nightError, setNightError] = useState<NightActionCollectionError | null>(null)
  const [completionError, setCompletionError] = useState<NightCompletionError | null>(null)
  const [firstNightErrorMessage, setFirstNightErrorMessage] = useState<string | null>(null)
  const [briefingErrorMessage, setBriefingErrorMessage] = useState<string | null>(null)
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false)
  const persistedFingerprintRef = useRef<string | null>(initialState.persistedFingerprint)
  const identityOperationPendingRef = useRef(false)
  const nightOperationPendingRef = useRef(false)
  const briefingOperationPendingRef = useRef(false)
  const completionOperationPendingRef = useRef(false)
  const clearOperationPendingRef = useRef(false)
  const activeSession = appState.mode === 'active' ? appState.session : null

  useEffect(() => {
    identityOperationPendingRef.current = false
    nightOperationPendingRef.current = false
    briefingOperationPendingRef.current = false
    completionOperationPendingRef.current = false
  }, [activeSession])

  function setActiveSession(session: ActiveAppSession): void {
    if (appState.mode !== 'active') {
      throw new Error('An active session update was attempted during recovery.')
    }

    const fingerprint = createSessionFingerprint(session)
    if (fingerprint === persistedFingerprintRef.current) {
      setAppState({ ...appState, session, clearError: null })
      return
    }

    const envelope = createPersistedSessionEnvelopeV2(session, sessionClock.now())
    const saveResult = sessionStore.save(envelope)
    if (saveResult.ok) {
      persistedFingerprintRef.current = fingerprint
    }
    setAppState({
      ...appState,
      session,
      saveStatus: saveResult.ok
        ? { status: 'saved', savedAt: envelope.savedAt }
        : { status: 'failed', error: saveResult.error },
      hasStoredSave: saveResult.ok ? true : appState.hasStoredSave,
      clearError: null,
    })
  }

  function clearErrors(): void {
    setSetupError(null)
    setDistributionError(null)
    setNightError(null)
    setCompletionError(null)
    setFirstNightErrorMessage(null)
    setBriefingErrorMessage(null)
  }

  function clearSavedSession(): void {
    if (clearOperationPendingRef.current) {
      return
    }
    clearOperationPendingRef.current = true
    const result = sessionStore.clear()

    if (!result.ok) {
      clearOperationPendingRef.current = false
      setAppState((current) => ({ ...current, clearError: result.error }))
      return
    }

    const freshSession = createActiveAppSession()
    const fingerprint = createSessionFingerprint(freshSession)
    persistedFingerprintRef.current = fingerprint
    clearOperationPendingRef.current = false
    clearErrors()
    setClearConfirmationOpen(false)
    setAppState({
      mode: 'active',
      session: freshSession,
      saveStatus: { status: 'not-saved' },
      hasStoredSave: false,
      clearError: null,
    })
  }

  function retryLoad(): void {
    const result = sessionStore.load()
    const nextState = createInitialAppState(result)
    persistedFingerprintRef.current = nextState.persistedFingerprint
    setAppState(nextState.state)
  }

  function retrySave(): void {
    if (appState.mode !== 'active') {
      return
    }
    const envelope = createPersistedSessionEnvelopeV2(appState.session, sessionClock.now())
    const saveResult = sessionStore.save(envelope)
    if (saveResult.ok) {
      persistedFingerprintRef.current = createSessionFingerprint(appState.session)
    }
    setAppState({
      ...appState,
      saveStatus: saveResult.ok
        ? { status: 'saved', savedAt: envelope.savedAt }
        : { status: 'failed', error: saveResult.error },
      hasStoredSave: saveResult.ok ? true : appState.hasStoredSave,
    })
  }

  function handleInvalidStage(error: InvalidActiveAppSessionStageError): never {
    throw new Error(
      `Application session operation ${error.operation} was called from ${error.stage}.`,
    )
  }

  function renderActiveSession(session: ActiveAppSession) {
    switch (session.stage) {
      case 'setup':
        return (
          <GameSetup
            workflow={session.workflow}
            editError={setupError}
            assignmentErrorMessage={
              distributionError === null ? null : getRoleDistributionErrorMessage(distributionError)
            }
            onCommand={(command: GameSetupWorkflowCommand) => {
              const result = updateSetupSession(session, command)
              if (!result.ok) {
                if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                  handleInvalidStage(result.error)
                }
                setSetupError(result.error)
                return
              }
              setSetupError(null)
              setActiveSession(result.value)
            }}
            onAssignRoles={() => {
              runIdentityOperation(() => {
                const result = assignSessionRoles(session, roleAssignmentDependencies)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setDistributionError(result.error)
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'role-distribution':
        return (
          <RoleDistribution
            workflow={session.workflow}
            error={distributionError}
            beginNightErrorMessage={
              firstNightErrorMessage ??
              (nightError === null ? null : getNightActionCollectionErrorMessage(nightError))
            }
            onCardDeliveryChange={(playerId: PlayerId, delivered: boolean) => {
              const result = setSessionCardDelivered(session, playerId, delivered)
              if (!result.ok) {
                if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                  handleInvalidStage(result.error)
                }
                setDistributionError(result.error)
                return
              }
              setDistributionError(null)
              setActiveSession(result.value)
            }}
            onMarkAllCardsDelivered={() => {
              runIdentityOperation(() => {
                const result = markAllSessionCardsDelivered(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setDistributionError(result.error)
                  return false
                }
                setDistributionError(null)
                setActiveSession(result.value)
                return true
              })
            }}
            onConfirmDistribution={() => {
              runIdentityOperation(() => {
                const result = confirmSessionRoleDistribution(
                  session,
                  roleAssignmentDependencies.randomSource,
                )
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setFirstNightErrorMessage(getFirstNightTransitionErrorMessage(result.error))
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
            onReassignRoles={() => {
              runIdentityOperation(() => {
                const result = reassignSessionRoles(session, roleAssignmentDependencies)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setDistributionError(result.error)
                  return false
                }
                setDistributionError(null)
                setActiveSession(result.value)
                return true
              })
            }}
            onBeginFirstNight={() => {
              runNightOperation(() => {
                const result = beginSessionFirstNight(
                  session,
                  roleAssignmentDependencies.randomSource,
                )
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setFirstNightErrorMessage(getFirstNightTransitionErrorMessage(result.error))
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'executioner-briefing':
        return (
          <ExecutionerBriefing
            view={selectExecutionerBriefingView(
              session.game,
              session.participants,
              session.workflow,
            )}
            errorMessage={briefingErrorMessage}
            onAcknowledge={(briefingId: ExecutionerBriefingId) => {
              runBriefingOperation(() => {
                const result = acknowledgeSessionExecutionerBriefing(session, briefingId)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setBriefingErrorMessage(getExecutionerBriefingErrorMessage(result.error))
                  return false
                }
                setBriefingErrorMessage(null)
                setActiveSession(result.value)
                return true
              })
            }}
            onPrevious={() => {
              runBriefingOperation(() =>
                applyExecutionerBriefingResult(previousSessionExecutionerBriefing(session)),
              )
            }}
            onNext={() => {
              runBriefingOperation(() =>
                applyExecutionerBriefingResult(nextSessionExecutionerBriefing(session)),
              )
            }}
            onBeginNight={() => {
              runBriefingOperation(() => {
                const result = completeSessionExecutionerBriefings(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setBriefingErrorMessage(getBriefingCompletionErrorMessage(result.error))
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'sequential-night':
        return (
          <NightRunner
            workflow={session.workflow}
            error={nightError}
            onConfirmTarget={(targetPlayerId) => {
              runNightOperation(() =>
                applyNightResult(confirmSessionNightTarget(session, targetPlayerId)),
              )
            }}
            onContinue={() => {
              runNightOperation(() => applyNightResult(continueSessionNight(session)))
            }}
            onAcknowledgeOutcome={() => {
              runNightOperation(() => applyNightResult(acknowledgeSessionNightOutcome(session)))
            }}
          />
        )
      case 'night-resolution':
      case 'dawn':
        return (
          <DawnPresentation
            view={selectNightCompletionView(session.workflow)}
            error={completionError}
            onPrepareDawn={() => {
              if (session.stage !== 'night-resolution') {
                return
              }
              runCompletionOperation(() => {
                const result = prepareSessionDawn(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setCompletionError(result.error)
                  return false
                }
                setCompletionError(null)
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
    }
  }

  function applyNightResult(
    result: ReturnType<
      | typeof confirmSessionNightTarget
      | typeof continueSessionNight
      | typeof acknowledgeSessionNightOutcome
    >,
  ): boolean {
    if (!result.ok) {
      if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
        handleInvalidStage(result.error)
      }
      if (
        result.error.type === 'NIGHT_ACTION_WORKFLOW_NOT_COMPLETE' ||
        result.error.type === 'INVALID_NIGHT_RESOLUTION_PHASE' ||
        result.error.type === 'NIGHT_RESOLUTION_GAME_ID_MISMATCH' ||
        result.error.type === 'NIGHT_RESOLUTION_NIGHT_NUMBER_MISMATCH' ||
        result.error.type === 'INVALID_GAME_STATE_FOR_NIGHT_RESOLUTION' ||
        result.error.type === 'INVALID_COLLECTED_NIGHT_ACTIONS' ||
        result.error.type === 'INVALID_RESOLUTION_ROLE_METADATA' ||
        result.error.type === 'INVALID_INVESTIGATION_GROUP_DEFINITION' ||
        result.error.type === 'MISSING_CANONICAL_INVESTIGATION_GROUP' ||
        result.error.type === 'INVALID_NIGHT_APPLICATION_PHASE' ||
        result.error.type === 'NIGHT_APPLICATION_GAME_ID_MISMATCH' ||
        result.error.type === 'NIGHT_APPLICATION_NIGHT_NUMBER_MISMATCH' ||
        result.error.type === 'INVALID_GAME_STATE_FOR_NIGHT_APPLICATION' ||
        result.error.type === 'INVALID_NIGHT_RESOLUTION' ||
        result.error.type === 'UNKNOWN_PROVISIONAL_DEATH_PLAYER' ||
        result.error.type === 'DUPLICATE_PROVISIONAL_DEATH' ||
        result.error.type === 'PROVISIONAL_DEATH_PLAYER_ALREADY_DEAD' ||
        result.error.type === 'INVALID_PROVISIONAL_DEATH_ROLE' ||
        result.error.type === 'INVALID_COLLECTED_ACTIONS_FOR_NIGHT_APPLICATION' ||
        result.error.type === 'NIGHT_RESOLUTION_REVALIDATION_FAILED' ||
        result.error.type === 'NIGHT_RESOLUTION_CONTENT_MISMATCH' ||
        result.error.type === 'INVALID_DAWN_ANNOUNCEMENT' ||
        result.error.type === 'RESOLUTION_ALREADY_APPLIED'
      ) {
        setCompletionError(result.error)
        return false
      }
      setNightError(result.error)
      return false
    }
    setNightError(null)
    setActiveSession(result.value)
    return true
  }

  function applyExecutionerBriefingResult(
    result: ReturnType<
      typeof previousSessionExecutionerBriefing | typeof nextSessionExecutionerBriefing
    >,
  ): boolean {
    if (!result.ok) {
      if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
        handleInvalidStage(result.error)
      }
      setBriefingErrorMessage(getExecutionerBriefingErrorMessage(result.error))
      return false
    }
    setBriefingErrorMessage(null)
    setActiveSession(result.value)
    return true
  }

  function runIdentityOperation(operation: () => boolean): void {
    if (identityOperationPendingRef.current) {
      return
    }
    identityOperationPendingRef.current = true
    try {
      if (!operation()) {
        identityOperationPendingRef.current = false
      }
    } catch (error: unknown) {
      identityOperationPendingRef.current = false
      throw error
    }
  }

  function runNightOperation(operation: () => boolean): void {
    if (nightOperationPendingRef.current) {
      return
    }
    nightOperationPendingRef.current = true
    try {
      if (!operation()) {
        nightOperationPendingRef.current = false
      }
    } catch (error: unknown) {
      nightOperationPendingRef.current = false
      throw error
    }
  }

  function runCompletionOperation(operation: () => boolean): void {
    if (completionOperationPendingRef.current) {
      return
    }
    completionOperationPendingRef.current = true
    try {
      if (!operation()) {
        completionOperationPendingRef.current = false
      }
    } catch (error: unknown) {
      completionOperationPendingRef.current = false
      throw error
    }
  }

  function runBriefingOperation(operation: () => boolean): void {
    if (briefingOperationPendingRef.current) {
      return
    }
    briefingOperationPendingRef.current = true
    try {
      if (!operation()) {
        briefingOperationPendingRef.current = false
      }
    } catch (error: unknown) {
      briefingOperationPendingRef.current = false
      throw error
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand" aria-label="Mafia Host">
          <span aria-hidden="true">MH</span>
          <strong>Mafia Host</strong>
        </div>
        <p>Phase 7A.1 · Sequential night resolution</p>
      </header>

      <main className="app-main">
        <section className="app-intro" aria-labelledby="page-heading">
          <p className="app-intro__eyebrow">Run tonight’s table</p>
          <h1 id="page-heading">Set up, resolve, and announce Dawn</h1>
          <p>
            This host-only app keeps one active session locally in this browser so a refresh can
            resume at the exact authoritative stage.
          </p>
          <div className="app-intro__boundary">
            <strong>Host-only workflow</strong>
            <span>
              The local save is not encrypted. Anyone with access to this browser profile and its
              developer tools can inspect secret game information.
            </span>
          </div>
        </section>

        {appState.mode === 'saved-session-found' ? (
          <SessionRecovery
            state="saved"
            envelope={appState.envelope}
            clearError={appState.clearError}
            onContinue={() => {
              const fingerprint = createSessionFingerprint(appState.envelope.session)
              persistedFingerprintRef.current = fingerprint
              setAppState({
                mode: 'active',
                session: appState.envelope.session,
                saveStatus: { status: 'saved', savedAt: appState.envelope.savedAt },
                hasStoredSave: true,
                clearError: null,
              })
            }}
            onClear={clearSavedSession}
          />
        ) : appState.mode === 'recovery-failed' ? (
          <SessionRecovery
            state="failed"
            error={appState.error}
            clearError={appState.clearError}
            onRetry={retryLoad}
            onClear={clearSavedSession}
          />
        ) : (
          <>
            <div
              aria-hidden={clearConfirmationOpen || undefined}
              inert={clearConfirmationOpen ? true : undefined}
            >
              {renderActiveSession(appState.session)}
            </div>
            <SessionSaveStatus
              saveStatus={appState.saveStatus}
              hasStoredSave={appState.hasStoredSave}
              gameActive={appState.session.stage !== 'setup'}
              clearError={appState.clearError}
              confirmationOpen={clearConfirmationOpen}
              onRetrySave={retrySave}
              onRequestClear={() => {
                setClearConfirmationOpen(true)
              }}
              onCancelClear={() => {
                setClearConfirmationOpen(false)
              }}
              onClear={clearSavedSession}
            />
          </>
        )}
      </main>

      <footer className="app-footer">
        The save stays on this browser profile and device. Use one host tab; there is no cloud sync
        or backup.
      </footer>
    </div>
  )
}

function createInitialAppState(loadResult: LoadPersistedSessionResult): InitialAppState {
  if (loadResult.ok) {
    return {
      state: {
        mode: 'saved-session-found',
        envelope: loadResult.value,
        clearError: null,
      },
      persistedFingerprint: createSessionFingerprint(loadResult.value.session),
    }
  }
  if (loadResult.error.type !== 'NO_SAVED_SESSION') {
    return {
      state: {
        mode: 'recovery-failed',
        error: loadResult.error,
        clearError: null,
      },
      persistedFingerprint: null,
    }
  }

  const session = createActiveAppSession()
  const fingerprint = createSessionFingerprint(session)
  return {
    state: {
      mode: 'active',
      session,
      saveStatus: { status: 'not-saved' },
      hasStoredSave: false,
      clearError: null,
    },
    persistedFingerprint: fingerprint,
  }
}

function createSessionFingerprint(session: ActiveAppSession): string {
  return JSON.stringify(toPersistedAppSessionV2(session))
}

type FirstNightTransitionError =
  | RoleDistributionError
  | FinalizeRoleDistributionError
  | ExecutionerBriefingError
  | NightActionCollectionError

function getFirstNightTransitionErrorMessage(error: FirstNightTransitionError): string {
  switch (error.type) {
    case 'UNKNOWN_ROLE':
    case 'DUPLICATE_ROLE_COUNT':
    case 'INVALID_ROLE_COUNT':
    case 'ASSIGNMENT_COUNT_MISMATCH':
    case 'DUPLICATE_PARTICIPATING_PLAYER':
    case 'IDENTIFIER_COLLISION':
    case 'INVALID_IDENTIFIER':
    case 'INVALID_RANDOM_VALUE':
    case 'DOMAIN_ASSIGNMENT_REJECTED':
    case 'INVALID_ROLE_DISTRIBUTION_STATE':
    case 'UNKNOWN_CARD_DELIVERY_PLAYER':
    case 'CARD_DELIVERY_INCOMPLETE':
    case 'REASSIGNMENT_CONFIRMATION_REQUIRED':
    case 'REASSIGNMENT_AFTER_CONFIRMATION':
      return getRoleDistributionErrorMessage(error)
    case 'ACTIVE_GAME_REJECTED':
      return 'The active game failed domain validation, so the first-night transition was not applied.'
    case 'WRONG_EXECUTIONER_ASSIGNMENT_PHASE':
      return `Executioner targets can be assigned only after role distribution, not during ${error.currentPhase}.`
    case 'DISTRIBUTION_NOT_FINALIZED':
      return 'Confirm every physical role card before assigning Executioner targets.'
    case 'EXISTING_EXECUTIONER_TARGETS':
      return 'Executioner targets were already assigned. The game was not rerolled.'
    case 'DEAD_EXECUTIONER_BEFORE_ASSIGNMENT':
      return 'A finalized role distribution cannot assign a target to an Executioner already marked dead.'
    case 'NO_ELIGIBLE_TOWN_TARGETS':
      return 'No participating Town player is available as an Executioner target.'
    case 'INVALID_EXECUTIONER_RANDOM_OUTPUT':
      return `The random source returned ${String(error.value)} instead of a value from 0 inclusive to 1 exclusive.`
    case 'EXECUTIONER_ASSIGNMENT_GAME_REJECTED':
      return 'The finalized game failed domain validation, so no Executioner target was assigned.'
    case 'EXECUTIONER_BRIEFING_GAME_REJECTED':
    case 'EXECUTIONER_BRIEFING_GAME_MISMATCH':
    case 'EXECUTIONER_BRIEFING_PHASE_MISMATCH':
    case 'NO_EXECUTIONERS_FOR_BRIEFING':
    case 'MISSING_EXECUTIONER_TARGET_RELATIONSHIP':
    case 'INVALID_EXECUTIONER_BRIEFING_RECORD':
    case 'UNKNOWN_EXECUTIONER_BRIEFING_ID':
    case 'DUPLICATE_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT':
    case 'UNKNOWN_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT':
    case 'EXECUTIONER_BRIEFING_NOT_CURRENT':
    case 'EXECUTIONER_BRIEFING_NOT_ACKNOWLEDGED':
    case 'EXECUTIONER_BRIEFING_INDEX_OUT_OF_RANGE':
    case 'EXECUTIONER_BRIEFING_NAVIGATION_BOUNDARY':
    case 'INCOMPLETE_EXECUTIONER_BRIEFINGS':
    case 'INVALID_EXECUTIONER_BRIEFING_WORKFLOW':
      return getExecutionerBriefingErrorMessage(error)
    case 'DISTRIBUTION_NOT_CONFIRMED':
    case 'EXECUTIONER_BRIEFING_REQUIRED':
    case 'INVALID_STARTING_PHASE':
    case 'INVALID_STARTED_NIGHT_PHASE':
    case 'UNKNOWN_ACTOR':
    case 'DEAD_ACTOR':
    case 'UNKNOWN_ROLE_INSTANCE':
    case 'ROLE_INSTANCE_DOES_NOT_BELONG_TO_ACTOR':
    case 'ACTOR_ROLE_MISMATCH':
    case 'ROLE_HAS_NO_NIGHT_ACTION':
    case 'WRONG_ACTION_KIND':
    case 'UNKNOWN_TARGET':
    case 'DEAD_TARGET':
    case 'INVALID_SELF_TARGET':
    case 'DOCTOR_REPEATED_PREVIOUS_TARGET':
    case 'DUPLICATE_ACTOR_ACTION':
    case 'BLOCKED_ACTOR_SUBMITTED_ACTION':
    case 'UNEXPECTED_ACTION':
    case 'MISSING_REQUIRED_ACTION':
    case 'DUPLICATE_PREVIOUS_TARGET_CONTEXT':
    case 'UNKNOWN_PREVIOUS_TARGET_ROLE_INSTANCE':
    case 'PREVIOUS_TARGET_ROLE_NOT_DOCTOR':
    case 'UNKNOWN_PREVIOUS_TARGET':
    case 'ACTION_BATCH_GAME_MISMATCH':
    case 'INVALID_ACTION_BATCH':
    case 'UNKNOWN_SEQUENCE_ROLE':
    case 'INVALID_WORKFLOW_STATE':
    case 'INVALID_SEQUENCE_STEP':
    case 'NO_VALID_TARGETS':
    case 'SEQUENCE_BOUNDARY':
    case 'ACTOR_ALREADY_COMPLETED':
    case 'ACTOR_NOT_CURRENT':
    case 'ACTOR_BLOCKED':
    case 'MISSING_BLOCK_STATE':
    case 'INVALID_CURRENT_OUTCOME':
    case 'OUTCOME_ACTOR_MISMATCH':
    case 'OUTCOME_RESULT_MISMATCH':
    case 'OUTCOME_NOT_ACKNOWLEDGED':
    case 'OUTCOME_ALREADY_ACKNOWLEDGED':
    case 'INVALID_VISIT_LEDGER':
    case 'DETECTIVE_ACTION_RECORDED_AS_VISIT':
    case 'IMMEDIATE_RESULT_DISAGREEMENT':
    case 'PREVIOUS_STEP_SEALED':
    case 'INVALID_IMMEDIATE_OUTCOME_ROLE':
      return getNightActionCollectionErrorMessage(error)
  }
}

function getBriefingCompletionErrorMessage(
  error:
    ExecutionerBriefingError | CompleteExecutionerBriefingPhaseError | NightActionCollectionError,
): string {
  return getFirstNightTransitionErrorMessage(error)
}
