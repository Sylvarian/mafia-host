import { useEffect, useRef, useState } from 'react'

import {
  createSessionStageSummary,
  type ClearFailureError,
  type LoadPersistedSessionError,
  type RestoredSessionEnvelopeV2,
} from '@/application/session-persistence/index.ts'

import './SessionPersistence.css'

type SavedSessionRecoveryProps = Readonly<{
  state: 'saved'
  envelope: RestoredSessionEnvelopeV2
  clearError: ClearFailureError | null
  onContinue: () => void
  onClear: () => void
}>

type FailedSessionRecoveryProps = Readonly<{
  state: 'failed'
  error: LoadPersistedSessionError
  clearError: ClearFailureError | null
  onRetry: () => void
  onClear: () => void
}>

type SessionRecoveryProps = SavedSessionRecoveryProps | FailedSessionRecoveryProps

type ConfirmationKind = 'none' | 'delete' | 'start-new'

export function SessionRecovery(props: SessionRecoveryProps) {
  const [confirmation, setConfirmation] = useState<ConfirmationKind>('none')
  const confirmationButtonRef = useRef<HTMLButtonElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const startNewButtonRef = useRef<HTMLButtonElement>(null)

  const returnFocusRef = confirmation === 'start-new' ? startNewButtonRef : deleteButtonRef

  if (props.state === 'failed') {
    return (
      <section className="session-recovery" aria-labelledby="session-recovery-heading">
        <div
          className="session-recovery__content"
          aria-hidden={confirmation !== 'none' || undefined}
          inert={confirmation !== 'none' ? true : undefined}
        >
          <p className="session-recovery__eyebrow">Local recovery</p>
          <h2 id="session-recovery-heading">{getRecoveryHeading(props.error)}</h2>
          <p>{getRecoveryDescription(props.error)}</p>
          <p>The saved contents have not been loaded into the game and have not been deleted.</p>
          {props.clearError === null ? null : <ClearError error={props.clearError} />}
          <div className="session-recovery__actions">
            <button
              ref={deleteButtonRef}
              type="button"
              className="button button--danger"
              onClick={() => {
                setConfirmation('delete')
              }}
            >
              {props.error.type === 'UNSUPPORTED_SCHEMA_VERSION'
                ? 'Delete incompatible save'
                : 'Delete damaged save'}
            </button>
            <button type="button" className="button button--secondary" onClick={props.onRetry}>
              Retry loading
            </button>
          </div>
        </div>

        {confirmation === 'delete' ? (
          <RecoveryConfirmation
            actionButtonRef={confirmationButtonRef}
            returnFocusRef={returnFocusRef}
            title="Delete this local save?"
            description="This removes only Mafia Host’s saved session from this browser profile. It cannot be undone."
            actionLabel="Yes, delete saved game"
            clearError={props.clearError}
            onConfirm={props.onClear}
            onCancel={() => {
              setConfirmation('none')
            }}
          />
        ) : null}
      </section>
    )
  }

  const summary = createSessionStageSummary(props.envelope.session)

  return (
    <section className="session-recovery" aria-labelledby="session-recovery-heading">
      <div
        className="session-recovery__content"
        aria-hidden={confirmation !== 'none' || undefined}
        inert={confirmation !== 'none' ? true : undefined}
      >
        <p className="session-recovery__eyebrow">Local recovery</p>
        <h2 id="session-recovery-heading">Saved game found</h2>
        <div className="session-recovery__summary">
          <strong>
            {summary.stage === 'Day discussion' && summary.dayNumber !== null
              ? `Day ${String(summary.dayNumber)} — ${summary.stage}`
              : summary.nightNumber === null
                ? summary.stage
                : `Night ${String(summary.nightNumber)} — ${summary.stage}`}
          </strong>
          <span>
            {summary.playerCount} participating {summary.playerCount === 1 ? 'player' : 'players'}
          </span>
          <span>Saved locally at {formatSavedAt(props.envelope.savedAt)}</span>
        </div>
        <p className="session-recovery__privacy">
          Continuing may reveal role assignments, night targets, and private results on this
          host-only screen.
        </p>
        {props.clearError === null ? null : <ClearError error={props.clearError} />}
        <div className="session-recovery__actions">
          <button type="button" className="button button--prepare" onClick={props.onContinue}>
            Continue saved game
          </button>
          <button
            ref={deleteButtonRef}
            type="button"
            className="button button--danger-quiet"
            onClick={() => {
              setConfirmation('delete')
            }}
          >
            Delete saved game
          </button>
          <button
            ref={startNewButtonRef}
            type="button"
            className="button button--secondary"
            onClick={() => {
              setConfirmation('start-new')
            }}
          >
            Start a new game
          </button>
        </div>
      </div>

      {confirmation === 'none' ? null : (
        <RecoveryConfirmation
          actionButtonRef={confirmationButtonRef}
          returnFocusRef={returnFocusRef}
          title={
            confirmation === 'start-new'
              ? 'Delete the saved game and start again?'
              : 'Delete this saved game?'
          }
          description="This permanently removes the current Mafia Host save from this browser profile and opens a fresh setup."
          actionLabel={
            confirmation === 'start-new' ? 'Delete save and start new' : 'Yes, delete saved game'
          }
          clearError={props.clearError}
          onConfirm={props.onClear}
          onCancel={() => {
            setConfirmation('none')
          }}
        />
      )}
    </section>
  )
}

type RecoveryConfirmationProps = Readonly<{
  actionButtonRef: React.RefObject<HTMLButtonElement | null>
  returnFocusRef: React.RefObject<HTMLButtonElement | null>
  title: string
  description: string
  actionLabel: string
  clearError: ClearFailureError | null
  onConfirm: () => void
  onCancel: () => void
}>

function RecoveryConfirmation({
  actionButtonRef,
  returnFocusRef,
  title,
  description,
  actionLabel,
  clearError,
  onConfirm,
  onCancel,
}: RecoveryConfirmationProps) {
  useEffect(() => {
    const returnFocusElement = returnFocusRef.current
    actionButtonRef.current?.focus()
    return () => {
      returnFocusElement?.focus()
    }
  }, [actionButtonRef, returnFocusRef])

  return (
    <div
      className="session-confirmation"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <strong>{title}</strong>
      <p>{description}</p>
      {clearError === null ? null : <ClearError error={clearError} />}
      <div className="session-confirmation__actions">
        <button
          ref={actionButtonRef}
          type="button"
          className="button button--danger"
          onClick={onConfirm}
        >
          {actionLabel}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function ClearError({ error }: Readonly<{ error: ClearFailureError }>) {
  return (
    <p className="session-persistence__error" role="alert">
      {error.type === 'STORAGE_UNAVAILABLE'
        ? 'Browser storage is unavailable. The saved game was not deleted.'
        : 'The local save could not be deleted. It remains in this browser.'}
    </p>
  )
}

function getRecoveryHeading(error: LoadPersistedSessionError): string {
  switch (error.type) {
    case 'UNSUPPORTED_SCHEMA_VERSION':
    case 'LEGACY_IN_PROGRESS_NIGHT_INCOMPATIBLE':
    case 'STALE_OLD_PRIVATE_RESULT_WORKFLOW':
      return 'This saved game was created by an incompatible workflow version.'
    default:
      return 'The saved game could not be restored.'
  }
}

function getRecoveryDescription(error: LoadPersistedSessionError): string {
  switch (error.type) {
    case 'STORAGE_UNAVAILABLE':
      return 'Browser storage is unavailable, so Mafia Host cannot check for a local save.'
    case 'STORAGE_READ_FAILURE':
      return 'The browser did not allow Mafia Host to read its local save.'
    case 'UNSUPPORTED_SCHEMA_VERSION':
      return 'This version cannot safely interpret that save. Delete it before starting a new autosaved session.'
    case 'LEGACY_IN_PROGRESS_NIGHT_INCOMPATIBLE':
      return 'This older save was captured during night actions. It cannot be migrated without guessing which private results were already revealed.'
    case 'STALE_OLD_PRIVATE_RESULT_WORKFLOW':
      return 'This older save contains the removed end-of-night private-result replay and cannot be migrated safely.'
    case 'V2_WRITE_FAILURE_AFTER_MIGRATION':
      return 'The older save was valid, but the upgraded V2 save could not be written. The older save was not removed.'
    case 'LEGACY_REMOVAL_FAILURE_AFTER_MIGRATION':
      return 'The upgraded save could not safely replace the older save. No session was loaded.'
    case 'MIGRATION_FAILURE':
      return 'The older save could not be validated for safe migration.'
    case 'NO_SAVED_SESSION':
      return 'No saved session was found.'
    case 'INVALID_JSON':
    case 'INVALID_ENVELOPE':
    case 'UNKNOWN_PERSISTED_STAGE':
    case 'INVALID_SETUP_SESSION':
    case 'INVALID_ROLE_DISTRIBUTION_SESSION':
    case 'INVALID_EXECUTIONER_BRIEFING_SESSION':
    case 'INVALID_SEQUENTIAL_NIGHT_SESSION':
    case 'INVALID_NIGHT_RESOLUTION_SESSION':
    case 'INVALID_DAWN_SESSION':
    case 'INVALID_DAY_DISCUSSION_SESSION':
    case 'STAGE_PHASE_MISMATCH':
    case 'MULTIPLE_AUTHORITATIVE_GAMES':
      return 'The local save appears to be damaged or incomplete.'
  }
}

function formatSavedAt(savedAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(savedAt))
}
