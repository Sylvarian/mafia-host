import { useEffect, useRef } from 'react'

import type {
  ClearFailureError,
  SaveFailureError,
} from '@/application/session-persistence/index.ts'

import './SessionPersistence.css'

export type LocalSaveStatus =
  | Readonly<{ status: 'not-saved' }>
  | Readonly<{ status: 'saved'; savedAt: string }>
  | Readonly<{ status: 'failed'; error: SaveFailureError }>

type SessionSaveStatusProps = Readonly<{
  saveStatus: LocalSaveStatus
  hasStoredSave: boolean
  gameActive: boolean
  gameComplete: boolean
  savedSetupMessage: string | null
  savedSetupRetryAvailable: boolean
  clearError: ClearFailureError | null
  confirmationOpen: boolean
  onRetrySave: () => void
  onRetrySavedSetup: () => void
  onRequestClear: () => void
  onCancelClear: () => void
  onClear: () => void
}>

export function SessionSaveStatus({
  saveStatus,
  hasStoredSave,
  gameActive,
  gameComplete,
  savedSetupMessage,
  savedSetupRetryAvailable,
  clearError,
  confirmationOpen,
  onRetrySave,
  onRetrySavedSetup,
  onRequestClear,
  onCancelClear,
  onClear,
}: SessionSaveStatusProps) {
  const clearButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirmationOpen) {
      return
    }
    const returnFocusElement = clearButtonRef.current
    confirmButtonRef.current?.focus()
    return () => {
      returnFocusElement?.focus()
    }
  }, [confirmationOpen])

  return (
    <aside className="session-save-panel" aria-label="Local save status">
      <div
        className="session-save-panel__content"
        aria-hidden={confirmationOpen || undefined}
        inert={confirmationOpen ? true : undefined}
      >
        <div>
          {saveStatus.status === 'not-saved' ? (
            <span>Local recovery begins after the first setup change.</span>
          ) : saveStatus.status === 'saved' ? (
            <span>Saved locally</span>
          ) : (
            <>
              <span className="session-save-panel__warning">
                Unable to save locally — the current game will continue in this tab.
              </span>
              <button type="button" className="session-save-panel__retry" onClick={onRetrySave}>
                Retry save
              </button>
            </>
          )}
        </div>
        {savedSetupMessage === null ? null : (
          <div className="session-save-panel__setup-status" role="status">
            <span>{savedSetupMessage}</span>
            {savedSetupRetryAvailable ? (
              <button
                type="button"
                className="session-save-panel__retry"
                onClick={onRetrySavedSetup}
              >
                Retry saved setup
              </button>
            ) : null}
          </div>
        )}
        {hasStoredSave && !gameComplete ? (
          <button
            ref={clearButtonRef}
            type="button"
            className="button button--danger-quiet"
            onClick={onRequestClear}
          >
            {gameActive ? 'Abandon game and delete local save' : 'Delete saved game'}
          </button>
        ) : null}
        {clearError === null || confirmationOpen ? null : (
          <p className="session-persistence__error" role="alert">
            {clearError.type === 'STORAGE_UNAVAILABLE'
              ? 'Browser storage is unavailable. The saved game was not deleted.'
              : 'The local save could not be deleted. The current session is unchanged.'}
          </p>
        )}
      </div>

      {confirmationOpen ? (
        <div
          className="session-confirmation"
          role="alertdialog"
          aria-modal="true"
          aria-label={
            gameComplete
              ? 'Start the next game?'
              : gameActive
                ? 'Abandon this game?'
                : 'Delete this saved game?'
          }
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancelClear()
            }
          }}
        >
          <strong>
            {gameComplete
              ? 'Start the next game?'
              : gameActive
                ? 'Abandon this game?'
                : 'Delete this saved game?'}
          </strong>
          <p>
            This removes only the active match save and opens an editable setup from your saved
            next-game choices. The completed or abandoned match cannot be recovered afterward.
          </p>
          {clearError === null ? null : (
            <p className="session-persistence__error" role="alert">
              {clearError.type === 'STORAGE_UNAVAILABLE'
                ? 'Browser storage is unavailable. The saved game was not deleted.'
                : 'The local save could not be deleted. The current session is unchanged.'}
            </p>
          )}
          <div className="session-confirmation__actions">
            <button
              ref={confirmButtonRef}
              type="button"
              className="button button--danger"
              onClick={onClear}
            >
              {gameComplete
                ? 'Yes, start next game'
                : gameActive
                  ? 'Yes, abandon and delete'
                  : 'Yes, delete saved game'}
            </button>
            <button type="button" className="button button--secondary" onClick={onCancelClear}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
