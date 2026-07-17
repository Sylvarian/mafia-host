import { useEffect, useRef, useState } from 'react'

import type {
  GameSetupEditError,
  GameSetupWorkflowCommand,
} from '@/application/game-setup/index.ts'
import type { NightActionCollectionError } from '@/application/night-actions/index.ts'
import type {
  NightPresentationError,
  PrivateNightResultId,
} from '@/application/night-presentation/index.ts'
import { selectNightPresentationView } from '@/application/night-presentation/index.ts'
import type {
  PlayerId,
  RoleAssignmentDependencies,
  RoleDistributionError,
} from '@/application/role-assignment/index.ts'
import {
  acknowledgeSessionPrivateResult,
  assignSessionRoles,
  beginSessionFirstNight,
  confirmSessionNightTarget,
  confirmSessionRoleDistribution,
  continueSessionNight,
  createActiveAppSession,
  createPersistedSessionEnvelopeV1,
  editSessionNightAction,
  finaliseSessionNightActions,
  nextSessionPrivateResult,
  prepareSessionDawn,
  previousSessionNight,
  previousSessionPrivateResult,
  reassignSessionRoles,
  resolveSessionNight,
  setSessionCardDelivered,
  toPersistedAppSessionV1,
  updateSetupSession,
  type ActiveAppSession,
  type ClearFailureError,
  type GameSessionStore,
  type InvalidActiveAppSessionStageError,
  type LoadPersistedSessionError,
  type LoadPersistedSessionResult,
  type RestoredSessionEnvelopeV1,
  type SessionClock,
} from '@/application/session-persistence/index.ts'
import { DawnPresentation, getNightPresentationErrorMessage } from '@/features/dawn/index.ts'
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
      envelope: RestoredSessionEnvelopeV1
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
  const [presentationError, setPresentationError] = useState<NightPresentationError | null>(null)
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false)
  const persistedFingerprintRef = useRef<string | null>(initialState.persistedFingerprint)
  const identityOperationPendingRef = useRef(false)
  const nightOperationPendingRef = useRef(false)
  const presentationOperationPendingRef = useRef(false)
  const clearOperationPendingRef = useRef(false)
  const activeSession = appState.mode === 'active' ? appState.session : null

  useEffect(() => {
    identityOperationPendingRef.current = false
    nightOperationPendingRef.current = false
    presentationOperationPendingRef.current = false
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

    const envelope = createPersistedSessionEnvelopeV1(session, sessionClock.now())
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
    setPresentationError(null)
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
    const envelope = createPersistedSessionEnvelopeV1(appState.session, sessionClock.now())
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
              nightError === null ? null : getNightActionCollectionErrorMessage(nightError)
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
            onConfirmDistribution={() => {
              const result = confirmSessionRoleDistribution(session)
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
                const result = beginSessionFirstNight(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setNightError(result.error)
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'night-action':
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
            onPrevious={() => {
              applyNightResult(previousSessionNight(session))
            }}
            onEditAction={(actorRoleInstanceId) => {
              applyNightResult(editSessionNightAction(session, actorRoleInstanceId))
            }}
            onFinalise={() => {
              applyNightResult(finaliseSessionNightActions(session))
            }}
            resolutionErrorMessage={
              presentationError === null
                ? null
                : getNightPresentationErrorMessage(presentationError)
            }
            onResolveNight={() => {
              runPresentationOperation(() => {
                const result = resolveSessionNight(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setPresentationError(result.error)
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'night-presentation':
      case 'dawn':
        return (
          <DawnPresentation
            view={selectNightPresentationView(session.workflow)}
            error={presentationError}
            onAcknowledgeResult={(resultId: PrivateNightResultId) => {
              if (session.stage !== 'night-presentation') {
                return
              }
              applyPresentationResult(acknowledgeSessionPrivateResult(session, resultId))
            }}
            onPreviousResult={() => {
              if (session.stage !== 'night-presentation') {
                return
              }
              applyPresentationResult(previousSessionPrivateResult(session))
            }}
            onNextResult={() => {
              if (session.stage !== 'night-presentation') {
                return
              }
              applyPresentationResult(nextSessionPrivateResult(session))
            }}
            onPrepareDawn={() => {
              if (session.stage !== 'night-presentation') {
                return
              }
              runPresentationOperation(() => {
                const result = prepareSessionDawn(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setPresentationError(result.error)
                  return false
                }
                setPresentationError(null)
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
      | typeof previousSessionNight
      | typeof editSessionNightAction
      | typeof finaliseSessionNightActions
    >,
  ): boolean {
    if (!result.ok) {
      if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
        handleInvalidStage(result.error)
      }
      setNightError(result.error)
      return false
    }
    setNightError(null)
    setActiveSession(result.value)
    return true
  }

  function applyPresentationResult(
    result: ReturnType<
      | typeof acknowledgeSessionPrivateResult
      | typeof previousSessionPrivateResult
      | typeof nextSessionPrivateResult
    >,
  ): boolean {
    if (!result.ok) {
      if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
        handleInvalidStage(result.error)
      }
      setPresentationError(result.error)
      return false
    }
    setPresentationError(null)
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

  function runPresentationOperation(operation: () => boolean): void {
    if (presentationOperationPendingRef.current) {
      return
    }
    presentationOperationPendingRef.current = true
    try {
      if (!operation()) {
        presentationOperationPendingRef.current = false
      }
    } catch (error: unknown) {
      presentationOperationPendingRef.current = false
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
        <p>Phase 6.5 · Local refresh recovery</p>
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
  return JSON.stringify(toPersistedAppSessionV1(session))
}
