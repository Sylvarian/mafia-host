import { useEffect, useRef, useState } from 'react'

import {
  type NightPresentationError,
  type NightPresentationView,
  type PrivateNightResult,
  type PrivateNightResultId,
} from '@/application/night-presentation/index.ts'

import { getNightPresentationErrorMessage } from './dawn-error.ts'

import './DawnPresentation.css'

type DawnPresentationProps = Readonly<{
  view: NightPresentationView
  error: NightPresentationError | null
  onAcknowledgeResult: (resultId: PrivateNightResultId) => void
  onPreviousResult: () => void
  onNextResult: () => void
  onPrepareDawn: () => void
}>

export function DawnPresentation({
  view,
  error,
  onAcknowledgeResult,
  onPreviousResult,
  onNextResult,
  onPrepareDawn,
}: DawnPresentationProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prepareButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const confirmationWasOpenRef = useRef(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const focusKey =
    view.status === 'private-results'
      ? `${view.status}-${String(view.currentResultIndex)}`
      : view.status

  useEffect(() => {
    headingRef.current?.focus()
  }, [focusKey])

  useEffect(() => {
    if (confirmationOpen) {
      confirmButtonRef.current?.focus()
    } else if (confirmationWasOpenRef.current) {
      prepareButtonRef.current?.focus()
    }
    confirmationWasOpenRef.current = confirmationOpen
  }, [confirmationOpen])

  function closeConfirmation(): void {
    setConfirmationOpen(false)
  }

  if (view.status === 'dawn') {
    const announcement = view.announcement

    return (
      <section className="dawn-public" aria-labelledby="dawn-heading">
        <p className="dawn-public__eyebrow">
          Public announcement · Night {announcement.nightNumber}
        </p>
        <h2 id="dawn-heading" ref={headingRef} tabIndex={-1}>
          {announcement.outcome === 'no-deaths' ? 'A quiet Dawn' : 'Dawn deaths'}
        </h2>
        {announcement.outcome === 'no-deaths' ? (
          <p className="dawn-public__headline">No one died during the night.</p>
        ) : (
          <ul className="dawn-public__deaths" aria-label="Players who died during the night">
            {announcement.deaths.map((death) => (
              <li key={death.playerId}>
                <strong>
                  {death.playerName}
                  {death.showStableId ? ` (${death.playerId})` : ''}
                </strong>{' '}
                died during the night.
                {death.revealedRoleDisplayName === null
                  ? null
                  : ` Their role was ${death.revealedRoleDisplayName}.`}
              </li>
            ))}
          </ul>
        )}
        <div className="dawn-public__boundary">
          <strong>Dawn complete</strong>
          <span>Day discussion will be added in Phase 7.</span>
        </div>
      </section>
    )
  }

  if (view.status === 'ready-for-dawn') {
    return (
      <section className="dawn-ready" aria-labelledby="dawn-ready-heading">
        <div
          className="dawn-ready__content"
          aria-hidden={confirmationOpen || undefined}
          inert={confirmationOpen ? true : undefined}
        >
          <p className="dawn-ready__eyebrow">Host-only privacy boundary</p>
          <h2 id="dawn-ready-heading" ref={headingRef} tabIndex={-1}>
            Private results are complete
          </h2>
          <p>Make sure all players’ eyes are open before showing the Dawn announcement.</p>
          {error === null ? null : <PresentationError error={error} />}
          <button
            ref={prepareButtonRef}
            type="button"
            className="button button--prepare"
            disabled={confirmationOpen}
            onClick={() => {
              setConfirmationOpen(true)
            }}
          >
            Prepare Dawn Announcement
          </button>
        </div>

        {confirmationOpen ? (
          <div
            className="dawn-confirmation__backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeConfirmation()
              }
            }}
          >
            <section
              className="dawn-confirmation"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="dawn-confirmation-heading"
              aria-describedby="dawn-confirmation-description"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeConfirmation()
                }
              }}
            >
              <p className="dawn-confirmation__eyebrow">Final privacy check</p>
              <h3 id="dawn-confirmation-heading">Show the public Dawn announcement?</h3>
              <p id="dawn-confirmation-description">
                Confirm that every player’s eyes are open. This applies the resolved deaths exactly
                once.
              </p>
              <div className="dawn-confirmation__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={closeConfirmation}
                >
                  Cancel
                </button>
                <button
                  ref={confirmButtonRef}
                  type="button"
                  className="button button--prepare"
                  onClick={() => {
                    onPrepareDawn()
                    setConfirmationOpen(false)
                  }}
                >
                  Show Dawn Announcement
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    )
  }

  const result = view.currentResult
  const acknowledged = view.acknowledged

  return (
    <section className="private-results" aria-labelledby="private-result-heading">
      <header className="private-results__header">
        <div>
          <p className="private-results__eyebrow">Private host result</p>
          <h2 id="private-result-heading" ref={headingRef} tabIndex={-1}>
            Only show this result to{' '}
            {displayPlayer(result.actorPlayerName, result.actorPlayerId, result.showActorStableId)}
          </h2>
        </div>
        <p className="private-results__progress" aria-live="polite">
          Result {view.currentResultIndex + 1} of {view.resultCount}
        </p>
      </header>

      <div className="private-result-card">
        <p className="private-result-card__actor">
          <strong>{result.roleDisplayName}</strong> ·{' '}
          {displayPlayer(result.actorPlayerName, result.actorPlayerId, result.showActorStableId)}
        </p>
        <PrivateResultContent result={result} />
      </div>

      {error === null ? null : <PresentationError error={error} />}

      <div className="private-results__actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={view.currentResultIndex === 0}
          onClick={onPreviousResult}
        >
          Previous result
        </button>
        {acknowledged ? (
          <button
            type="button"
            className="button button--prepare"
            disabled={view.currentResultIndex === view.resultCount - 1}
            onClick={onNextResult}
          >
            Next result
          </button>
        ) : (
          <button
            type="button"
            className="button button--prepare"
            onClick={() => {
              onAcknowledgeResult(result.id)
            }}
          >
            Result communicated
          </button>
        )}
        <button type="button" className="button button--secondary" disabled>
          Prepare Dawn Announcement
        </button>
      </div>
    </section>
  )
}

function PrivateResultContent({ result }: Readonly<{ result: PrivateNightResult }>) {
  const targetName = displayPlayer(
    result.targetPlayerName,
    result.targetPlayerId,
    result.showTargetStableId,
  )

  switch (result.kind) {
    case 'sheriff':
      return (
        <>
          <p className="private-result-card__target">Target: {targetName}</p>
          <p className="private-result-card__message">
            {targetName}{' '}
            {result.status === 'suspicious' ? 'appears suspicious.' : 'does not appear suspicious.'}
          </p>
        </>
      )
    case 'investigation':
      return (
        <>
          <p className="private-result-card__target">Target: {targetName}</p>
          <p className="private-result-card__instruction">Show {result.groupLabel}</p>
          <p className="private-result-card__group">{result.groupRoleDisplayNames.join(' · ')}</p>
        </>
      )
    case 'detective':
      return (
        <>
          <p className="private-result-card__target">Tracked: {targetName}</p>
          <p className="private-result-card__message">
            {targetName}{' '}
            {result.status === 'visited-nobody'
              ? 'visited nobody.'
              : `visited ${displayPlayer(
                  result.visitedPlayerName,
                  result.visitedPlayerId,
                  result.showVisitedPlayerStableId,
                )}.`}
          </p>
        </>
      )
  }
}

function PresentationError({ error }: Readonly<{ error: NightPresentationError }>) {
  return (
    <p className="dawn-error" role="alert">
      {getNightPresentationErrorMessage(error)}
    </p>
  )
}

function displayPlayer(playerName: string, playerId: string, showStableId: boolean): string {
  return showStableId ? `${playerName} (${playerId})` : playerName
}
