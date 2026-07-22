import { useCallback, useEffect, useRef, useState } from 'react'

import {
  selectMayorRevealCandidates,
  selectDayDiscussionView,
  type ConfirmMayorRevealWorkflowError,
} from '@/application/day-discussion/index.ts'
import {
  selectDayExecutionCandidates,
  selectDayOutcomeView,
  type CompleteDayOutcomeWorkflowError,
} from '@/application/day-outcome/index.ts'
import {
  selectExecutionerBriefingView,
  type ExecutionerBriefingError,
  type ExecutionerBriefingId,
  type FinalizeRoleDistributionError,
} from '@/application/executioner-briefing/index.ts'
import {
  clearNextGameSetupTemplate,
  createNextGameSetupTemplate,
  saveNextGameSetupTemplate,
  type GameSetupEditError,
  type GameSetupWorkflowCommand,
  type LoadedNextGameSetupTemplate,
  type NextGameSetupTemplate,
  type NextGameSetupTemplateRepository,
} from '@/application/game-setup/index.ts'
import { selectHostGameOverView } from '@/application/game-over/index.ts'
import type { NightActionCollectionError } from '@/application/night-actions/index.ts'
import type { NightCompletionError } from '@/application/night-completion/index.ts'
import {
  selectNightCompletionView,
  selectRevengeResolutionView,
} from '@/application/night-completion/index.ts'
import type {
  RoleAssignmentDependencies,
  RoleDistributionError,
} from '@/application/role-assignment/index.ts'
import {
  acknowledgeSessionExecutionerBriefing,
  assignSessionRoles,
  beginSessionDayDiscussion,
  beginSessionFirstNight,
  beginSessionNextNight,
  confirmSessionNightTarget,
  confirmSessionMayorReveal,
  confirmAllSessionRoleCardsDelivered,
  continueSessionNight,
  createActiveAppSession,
  createPersistedSessionEnvelopeV2,
  endSessionDayWithoutExecution,
  executeSessionDayPlayer,
  nextSessionExecutionerBriefing,
  prepareSessionDawn,
  resolveSessionJesterRevenge,
  previousSessionExecutionerBriefing,
  reassignSessionRoles,
  settleSessionAfterDayOutcome,
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
  type SettlePostDaySessionError,
} from '@/application/session-persistence/index.ts'
import { DawnPresentation } from '@/features/dawn/index.ts'
import {
  DayDiscussion,
  getBeginDayDiscussionErrorMessage,
} from '@/features/day-discussion/index.ts'
import { DayOutcomeSummary } from '@/features/day-outcome/index.ts'
import {
  ExecutionerBriefing,
  getExecutionerBriefingErrorMessage,
} from '@/features/executioner-briefing/index.ts'
import { GameSetup } from '@/features/game-setup/index.ts'
import { GameOver } from '@/features/game-over/index.ts'
import { getNightActionCollectionErrorMessage, NightRunner } from '@/features/night-runner/index.ts'
import { RevengeResolution } from '@/features/revenge-resolution/index.ts'
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
  nextGameSetupTemplateRepository?: NextGameSetupTemplateRepository
  initialNextGameSetupTemplate?: LoadedNextGameSetupTemplate
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
  nextGameSetupTemplateRepository = NOOP_NEXT_GAME_SETUP_TEMPLATE_REPOSITORY,
  initialNextGameSetupTemplate = EMPTY_NEXT_GAME_SETUP_TEMPLATE,
}: AppProps) {
  const [initialState] = useState<InitialAppState>(() =>
    createInitialAppState(initialLoadResult, initialNextGameSetupTemplate.template),
  )
  const [appState, setAppState] = useState<AppState>(initialState.state)
  const [savedSetupTemplate, setSavedSetupTemplate] = useState(
    initialNextGameSetupTemplate.template,
  )
  const [savedSetupMessage, setSavedSetupMessage] = useState<string | null>(() =>
    getSavedSetupLoadMessage(initialNextGameSetupTemplate),
  )
  const [pendingSetupTemplate, setPendingSetupTemplate] = useState<NextGameSetupTemplate | null>(
    null,
  )
  const [setupError, setSetupError] = useState<GameSetupEditError | null>(null)
  const [distributionError, setDistributionError] = useState<RoleDistributionError | null>(null)
  const [nightError, setNightError] = useState<NightActionCollectionError | null>(null)
  const [completionError, setCompletionError] = useState<NightCompletionError | null>(null)
  const [dayTransitionErrorMessage, setDayTransitionErrorMessage] = useState<string | null>(null)
  const [mayorRevealError, setMayorRevealError] = useState<ConfirmMayorRevealWorkflowError | null>(
    null,
  )
  const [dayOutcomeError, setDayOutcomeError] = useState<CompleteDayOutcomeWorkflowError | null>(
    null,
  )
  const [postDayErrorMessage, setPostDayErrorMessage] = useState<string | null>(null)
  const [firstNightErrorMessage, setFirstNightErrorMessage] = useState<string | null>(null)
  const [briefingErrorMessage, setBriefingErrorMessage] = useState<string | null>(null)
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false)
  const [dayDialogOpen, setDayDialogOpen] = useState(false)
  const persistedFingerprintRef = useRef<string | null>(initialState.persistedFingerprint)
  const identityOperationPendingRef = useRef(false)
  const nightOperationPendingRef = useRef(false)
  const briefingOperationPendingRef = useRef(false)
  const completionOperationPendingRef = useRef(false)
  const dayOperationPendingRef = useRef(false)
  const recoveryContinuePendingRef = useRef(false)
  const clearOperationPendingRef = useRef(false)
  const activeSession = appState.mode === 'active' ? appState.session : null

  useEffect(() => {
    identityOperationPendingRef.current = false
    nightOperationPendingRef.current = false
    briefingOperationPendingRef.current = false
    completionOperationPendingRef.current = false
    dayOperationPendingRef.current = false
    recoveryContinuePendingRef.current = false
  }, [activeSession])

  const setActiveSession = useCallback(
    (session: ActiveAppSession): void => {
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
    },
    [appState, sessionClock, sessionStore],
  )

  function clearErrors(): void {
    setSetupError(null)
    setDistributionError(null)
    setNightError(null)
    setCompletionError(null)
    setDayTransitionErrorMessage(null)
    setMayorRevealError(null)
    setDayOutcomeError(null)
    setPostDayErrorMessage(null)
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

    const freshSession = createActiveAppSession(savedSetupTemplate)
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
    const nextState = createInitialAppState(result, savedSetupTemplate)
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

  function retrySavedSetup(): void {
    const template = pendingSetupTemplate
    if (template === null) {
      return
    }
    const result = saveNextGameSetupTemplate(nextGameSetupTemplateRepository, template)
    if (!result.ok) {
      setSavedSetupMessage(
        'The current game is safe, but its setup still could not be saved for the next game.',
      )
      return
    }
    setPendingSetupTemplate(null)
    setSavedSetupTemplate(template)
    setSavedSetupMessage('Saved setup is ready for the next game.')
  }

  function continueSavedSession(): void {
    if (appState.mode !== 'saved-session-found' || recoveryContinuePendingRef.current) {
      return
    }
    recoveryContinuePendingRef.current = true
    const restoredSession = appState.envelope.session
    if (restoredSession.stage !== 'day-outcome') {
      persistedFingerprintRef.current = createSessionFingerprint(restoredSession)
      setAppState({
        mode: 'active',
        session: restoredSession,
        saveStatus: { status: 'saved', savedAt: appState.envelope.savedAt },
        hasStoredSave: true,
        clearError: null,
      })
      return
    }

    const settlement = settleSessionAfterDayOutcome(restoredSession)
    if (!settlement.ok) {
      setPostDayErrorMessage(getPostDaySettlementErrorMessage(settlement.error))
      persistedFingerprintRef.current = createSessionFingerprint(restoredSession)
      setAppState({
        mode: 'active',
        session: restoredSession,
        saveStatus: { status: 'saved', savedAt: appState.envelope.savedAt },
        hasStoredSave: true,
        clearError: null,
      })
      return
    }

    setPostDayErrorMessage(null)
    const envelope = createPersistedSessionEnvelopeV2(settlement.value, sessionClock.now())
    const saveResult = sessionStore.save(envelope)
    if (saveResult.ok) {
      persistedFingerprintRef.current = createSessionFingerprint(settlement.value)
    }
    setAppState({
      mode: 'active',
      session: settlement.value,
      saveStatus: saveResult.ok
        ? { status: 'saved', savedAt: envelope.savedAt }
        : { status: 'failed', error: saveResult.error },
      hasStoredSave: true,
      clearError: null,
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
            savedSetupExists={savedSetupTemplate !== null}
            savedSetupMessage={savedSetupMessage}
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
                if (session.workflow.status !== 'ready') {
                  throw new Error('Role assignment succeeded without a validated setup.')
                }
                const template = createNextGameSetupTemplate(session.workflow.draft)
                const savedSetupResult = saveNextGameSetupTemplate(
                  nextGameSetupTemplateRepository,
                  template,
                )
                setSavedSetupTemplate(template)
                if (savedSetupResult.ok) {
                  setPendingSetupTemplate(null)
                  setSavedSetupMessage('Saved setup is ready for the next game.')
                } else {
                  setPendingSetupTemplate(template)
                  setSavedSetupMessage(
                    'The game started, but its setup could not be saved for the next game.',
                  )
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
            onClearSavedSetup={() => {
              const result = clearNextGameSetupTemplate(nextGameSetupTemplateRepository)
              if (!result.ok) {
                setSavedSetupMessage(
                  'Saved setup could not be cleared. The current setup was not changed.',
                )
                return
              }
              setPendingSetupTemplate(null)
              setSavedSetupTemplate(null)
              setSavedSetupMessage('Saved setup cleared. The current setup remains unchanged.')
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
            onConfirmAllRoleCardsDelivered={() => {
              runIdentityOperation(() => {
                const result = confirmAllSessionRoleCardsDelivered(
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
                  setBriefingErrorMessage(getFirstNightTransitionErrorMessage(result.error))
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
          />
        )
      case 'night-resolution':
      case 'dawn':
        return (
          <DawnPresentation
            view={selectNightCompletionView(session.workflow)}
            error={completionError}
            dayTransitionErrorMessage={dayTransitionErrorMessage}
            onPrepareDawn={() => {
              if (session.stage !== 'night-resolution') {
                return
              }
              runCompletionOperation(() => {
                const result = prepareSessionDawn(session, roleAssignmentDependencies.randomSource)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  switch (result.error.type) {
                    case 'INVALID_GAME_OVER_GAME':
                    case 'INVALID_GAME_OVER_COUNTERS':
                    case 'INVALID_GAME_OVER_RESULT':
                    case 'INVALID_GAME_OVER_PARTICIPANTS':
                      setCompletionError({ type: 'DAWN_FINALIZATION_GAME_REJECTED' })
                      break
                    default:
                      setCompletionError(result.error)
                  }
                  return false
                }
                setCompletionError(null)
                setActiveSession(result.value)
                return true
              })
            }}
            onBeginDayDiscussion={() => {
              if (session.stage !== 'dawn') {
                return
              }
              runCompletionOperation(() => {
                const result = beginSessionDayDiscussion(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setDayTransitionErrorMessage(getBeginDayDiscussionErrorMessage(result.error))
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'revenge-resolution':
        return (
          <RevengeResolution
            view={selectRevengeResolutionView(session.workflow)}
            errorMessage={
              completionError === null
                ? null
                : 'Jester revenge could not be applied safely. The selected victim is unchanged.'
            }
            onContinue={() => {
              runCompletionOperation(() => {
                const result = resolveSessionJesterRevenge(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  switch (result.error.type) {
                    case 'INVALID_GAME_OVER_GAME':
                    case 'INVALID_GAME_OVER_COUNTERS':
                    case 'INVALID_GAME_OVER_RESULT':
                    case 'INVALID_GAME_OVER_PARTICIPANTS':
                      setCompletionError({ type: 'DAWN_FINALIZATION_GAME_REJECTED' })
                      break
                    default:
                      setCompletionError(result.error)
                  }
                  return false
                }
                setCompletionError(null)
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'day-discussion': {
        const viewResult = selectDayDiscussionView(session)
        if (!viewResult.ok) {
          throw new Error(`Invalid host Day view: ${viewResult.error.type}.`)
        }
        return (
          <DayDiscussion
            view={viewResult.value}
            mayorCandidates={selectMayorRevealCandidates(session)}
            executionCandidates={selectDayExecutionCandidates(session)}
            revealError={mayorRevealError}
            outcomeError={dayOutcomeError}
            onClearRevealError={() => {
              setMayorRevealError(null)
            }}
            onDialogPresentationChange={setDayDialogOpen}
            onClearOutcomeError={() => {
              setDayOutcomeError(null)
            }}
            onConfirmMayorReveal={(selectedPlayerId) =>
              runDayOperation(() => {
                const result = confirmSessionMayorReveal(session, selectedPlayerId)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setMayorRevealError(result.error)
                  return false
                }
                setMayorRevealError(null)
                setActiveSession(result.value)
                return true
              })
            }
            onExecutePlayer={(selectedPlayerId) =>
              runDayOperation(() => {
                const result = executeSessionDayPlayer(session, selectedPlayerId)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setDayOutcomeError(result.error)
                  return false
                }
                clearErrors()
                setDayDialogOpen(false)
                const settlement = settleSessionAfterDayOutcome(result.value)
                if (!settlement.ok) {
                  setPostDayErrorMessage(getPostDaySettlementErrorMessage(settlement.error))
                  setActiveSession(result.value)
                  return true
                }
                setActiveSession(settlement.value)
                return true
              })
            }
            onEndDayWithoutExecution={() =>
              runDayOperation(() => {
                const result = endSessionDayWithoutExecution(session)
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                  }
                  setDayOutcomeError(result.error)
                  return false
                }
                clearErrors()
                setDayDialogOpen(false)
                const settlement = settleSessionAfterDayOutcome(result.value)
                if (!settlement.ok) {
                  setPostDayErrorMessage(getPostDaySettlementErrorMessage(settlement.error))
                  setActiveSession(result.value)
                  return true
                }
                setActiveSession(settlement.value)
                return true
              })
            }
          />
        )
      }
      case 'day-outcome':
        return (
          <DayOutcomeSummary
            view={selectDayOutcomeView({
              game: session.game,
              participants: session.participants,
            })}
            status="evaluation-pending"
            errorMessage={postDayErrorMessage}
          />
        )
      case 'post-day-waiting':
      case 'pending-revenge-waiting':
        return (
          <DayOutcomeSummary
            view={selectDayOutcomeView({
              game: session.game,
              participants: session.participants,
            })}
            status="game-continues"
            errorMessage={postDayErrorMessage}
            nextNightNumber={session.game.nightNumber + 1}
            onBeginNextNight={() => {
              runNightOperation(() => {
                const result = beginSessionNextNight(
                  session,
                  roleAssignmentDependencies.randomSource,
                )
                if (!result.ok) {
                  if (result.error.type === 'INVALID_ACTIVE_APP_SESSION_STAGE') {
                    handleInvalidStage(result.error)
                    return false
                  }
                  setPostDayErrorMessage('The next night could not be started safely. Retry.')
                  return false
                }
                clearErrors()
                setActiveSession(result.value)
                return true
              })
            }}
          />
        )
      case 'game-over':
        return (
          <GameOver
            view={selectHostGameOverView({
              game: session.game,
              participants: session.participants,
              result: session.result,
            })}
            onStartNextGame={() => {
              setClearConfirmationOpen(true)
            }}
          />
        )
    }
  }

  function applyNightResult(
    result: ReturnType<typeof confirmSessionNightTarget | typeof continueSessionNight>,
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
        result.error.type === 'NO_PENDING_JESTER_REVENGE' ||
        result.error.type === 'PENDING_JESTER_REVENGE_NOT_DUE' ||
        result.error.type === 'INVALID_JESTER_REVENGE_RANDOM_OUTPUT' ||
        result.error.type === 'INVALID_JESTER_REVENGE_PHASE' ||
        result.error.type === 'JESTER_REVENGE_GAME_REJECTED' ||
        result.error.type === 'MULTIPLE_PENDING_JESTER_REVENGES_UNRESOLVED_RULE' ||
        result.error.type === 'INVALID_JESTER_REVENGE_SELECTION' ||
        result.error.type === 'INVALID_JESTER_REVENGE_VICTIM' ||
        result.error.type === 'JESTER_REVENGE_SURVIVOR_STILL_EXISTS' ||
        result.error.type === 'JESTER_REVENGE_APPLICATION_REJECTED' ||
        result.error.type === 'VICTORY_EVALUATION_GAME_REJECTED' ||
        result.error.type === 'VICTORY_EVALUATION_WRONG_PHASE' ||
        result.error.type === 'VICTORY_EVALUATION_COUNTER_MISMATCH' ||
        result.error.type === 'VICTORY_EVALUATION_MISSING_DAY_OUTCOME' ||
        result.error.type === 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY' ||
        result.error.type === 'CONTRADICTORY_VICTORY_PREDICATES' ||
        result.error.type === 'VICTORY_EVALUATION_UNKNOWN_ACTIVE_ROLE' ||
        result.error.type === 'FINAL_TWO_KILLING_ROLE_GAME_REJECTED' ||
        result.error.type === 'INVALID_FINAL_TWO_KILLING_ROLE_STATE' ||
        result.error.type === 'UNSUPPORTED_FINAL_TWO_KILLING_ROLE_PAIRING' ||
        result.error.type === 'INVALID_FINAL_TWO_KILLING_ROLE_ACTIVE_ROLE' ||
        result.error.type === 'CONTRADICTORY_FINAL_TWO_ATTACK_OUTCOMES' ||
        result.error.type === 'PREEXISTING_FINAL_TWO_KILLING_ROLE_SHOWDOWN' ||
        result.error.type === 'FINAL_TWO_KILLING_ROLE_APPLICATION_REJECTED' ||
        result.error.type === 'INVALID_STORED_FACTION_RESULT' ||
        result.error.type === 'INVALID_TOWN_RESULT' ||
        result.error.type === 'INVALID_MAFIA_RESULT' ||
        result.error.type === 'INVALID_SERIAL_KILLER_RESULT' ||
        result.error.type === 'INVALID_DRAW' ||
        result.error.type === 'UNKNOWN_WINNER_PLAYER' ||
        result.error.type === 'DUPLICATE_WINNER_PLAYER' ||
        result.error.type === 'FACTION_RESULT_GAME_MISMATCH' ||
        result.error.type === 'FACTION_RESULT_CONFLICTS_WITH_FINAL_TWO_DRAW' ||
        result.error.type === 'NON_TERMINAL_FACTION_RESULT' ||
        result.error.type === 'FACTION_GAME_FINALIZATION_REJECTED' ||
        result.error.type === 'DAWN_FINALIZATION_GAME_REJECTED' ||
        result.error.type === 'INVALID_REVENGE_RESOLUTION_WORKFLOW' ||
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

  function runDayOperation(operation: () => boolean): boolean {
    if (dayOperationPendingRef.current) {
      return false
    }
    dayOperationPendingRef.current = true
    try {
      const succeeded = operation()
      if (!succeeded) {
        dayOperationPendingRef.current = false
      }
      return succeeded
    } catch (error: unknown) {
      dayOperationPendingRef.current = false
      throw error
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand" aria-label="Mafia Host">
          <span aria-hidden="true">MH</span>
          <h1>Mafia Host</h1>
        </div>
      </header>

      <main className="app-main">
        {appState.mode === 'saved-session-found' ? (
          <SessionRecovery
            state="saved"
            envelope={appState.envelope}
            clearError={appState.clearError}
            onContinue={continueSavedSession}
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
            <div aria-hidden={dayDialogOpen || undefined} inert={dayDialogOpen ? true : undefined}>
              <SessionSaveStatus
                saveStatus={appState.saveStatus}
                hasStoredSave={appState.hasStoredSave}
                gameActive={appState.session.stage !== 'setup'}
                clearError={appState.clearError}
                confirmationOpen={clearConfirmationOpen}
                gameComplete={appState.session.stage === 'game-over'}
                savedSetupMessage={appState.session.stage === 'setup' ? null : savedSetupMessage}
                savedSetupRetryAvailable={pendingSetupTemplate !== null}
                onRetrySave={retrySave}
                onRetrySavedSetup={retrySavedSetup}
                onRequestClear={() => {
                  setClearConfirmationOpen(true)
                }}
                onCancelClear={() => {
                  setClearConfirmationOpen(false)
                }}
                onClear={clearSavedSession}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function createInitialAppState(
  loadResult: LoadPersistedSessionResult,
  savedSetupTemplate: NextGameSetupTemplate | null,
): InitialAppState {
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

  const session = createActiveAppSession(savedSetupTemplate)
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

const EMPTY_NEXT_GAME_SETUP_TEMPLATE: LoadedNextGameSetupTemplate = Object.freeze({
  template: null,
  error: null,
  migratedLegacyPlayerNames: false,
})

const NOOP_NEXT_GAME_SETUP_TEMPLATE_REPOSITORY: NextGameSetupTemplateRepository = Object.freeze({
  load: () => ({ ok: true as const, value: null }),
  save: () => ({ ok: true as const }),
  clear: () => ({ ok: true as const }),
})

function getSavedSetupLoadMessage(result: LoadedNextGameSetupTemplate): string | null {
  if (result.migratedLegacyPlayerNames) {
    return 'Remembered player names were migrated into saved setup defaults.'
  }
  if (result.error === null) {
    return null
  }
  switch (result.error.type) {
    case 'INVALID_SETUP_TEMPLATE_PAYLOAD':
    case 'INVALID_SAVED_ROSTER':
    case 'INVALID_SAVED_ROLE_DISTRIBUTION':
    case 'INVALID_SAVED_SETTINGS':
      return 'The saved setup was invalid and was not loaded.'
    case 'NEXT_GAME_SETUP_TEMPLATE_MIGRATION_FAILURE':
      return 'Remembered names were loaded, but could not be migrated into saved setup storage.'
    case 'NEXT_GAME_SETUP_TEMPLATE_LOAD_FAILURE':
    case 'NEXT_GAME_SETUP_TEMPLATE_SAVE_FAILURE':
    case 'NEXT_GAME_SETUP_TEMPLATE_CLEAR_FAILURE':
      return 'Saved setup could not be loaded from this browser. You can still set up a game.'
  }
}

function createSessionFingerprint(session: ActiveAppSession): string {
  return JSON.stringify(toPersistedAppSessionV2(session))
}

function getPostDaySettlementErrorMessage(error: SettlePostDaySessionError): string {
  if (error.type === 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY') {
    return 'The completed day was preserved, but the next game stage could not be finalized safely.'
  }
  if (error.type === 'RESULT_ALREADY_FINALIZED') {
    return 'The final game result is already recorded and cannot be replaced.'
  }
  return 'The completed day was preserved, but final victory evaluation could not be completed safely.'
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
    case 'INVALID_ROLE_DISTRIBUTION_AUTHORITY':
    case 'ROLE_CARDS_UNAVAILABLE':
    case 'ROLE_CARD_DELIVERY_ALREADY_COMPLETE':
    case 'REASSIGNMENT_AFTER_CONFIRMATION':
    case 'INVALID_ROLE_CARD_DISTRIBUTION_ORDER':
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
    case 'INVALID_NEXT_NIGHT_PHASE':
    case 'INVALID_NEXT_NIGHT_COUNTERS':
    case 'MISSING_COMPLETED_DAY_OUTCOME':
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
    case 'ACTOR_BLOCKED':
    case 'MISSING_BLOCK_STATE':
    case 'INVALID_CURRENT_OUTCOME':
    case 'OUTCOME_ACTOR_MISMATCH':
    case 'PRIVATE_OUTCOME_PENDING':
    case 'DETECTIVE_ACTION_RECORDED_AS_VISIT':
    case 'IMMEDIATE_RESULT_DISAGREEMENT':
    case 'INVALID_IMMEDIATE_OUTCOME_ROLE':
    case 'GODFATHER_SUCCESSION_GAME_REJECTED':
    case 'GODFATHER_SUCCESSION_WRONG_PHASE':
    case 'GODFATHER_PROMOTION_NOT_ALLOWED_ON_NIGHT_ONE':
    case 'INVALID_GODFATHER_PROMOTION_RANDOM_OUTPUT':
    case 'GODFATHER_PROMOTION_APPLICATION_REJECTED':
      return getNightActionCollectionErrorMessage(error)
  }
}
