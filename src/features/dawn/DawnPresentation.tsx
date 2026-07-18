import { useEffect, useRef, useState } from 'react'

import type {
  NightCompletionError,
  NightCompletionView,
} from '@/application/night-completion/index.ts'

import { getNightCompletionErrorMessage } from './dawn-error.ts'

import './DawnPresentation.css'

type DawnPresentationProps = Readonly<{
  view: NightCompletionView
  error: NightCompletionError | null
  dayTransitionErrorMessage: string | null
  onPrepareDawn: () => void
  onBeginDayDiscussion: () => void
}>

export function DawnPresentation({
  view,
  error,
  dayTransitionErrorMessage,
  onPrepareDawn,
  onBeginDayDiscussion,
}: DawnPresentationProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prepareButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const confirmationWasOpenRef = useRef(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)

  useEffect(() => {
    headingRef.current?.focus()
  }, [view.status])

  useEffect(() => {
    if (confirmationOpen) {
      confirmButtonRef.current?.focus()
    } else if (confirmationWasOpenRef.current) {
      prepareButtonRef.current?.focus()
    }
    confirmationWasOpenRef.current = confirmationOpen
  }, [confirmationOpen])

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
                <strong>{death.playerDisplayLabel}</strong> died during the night.
                {death.revealedRoleDisplayName === null
                  ? null
                  : ` Their role was ${death.revealedRoleDisplayName}.`}
              </li>
            ))}
          </ul>
        )}
        <div className="dawn-public__boundary">
          <strong>Dawn complete</strong>
          <span>Begin the public daytime stage when the table is ready.</span>
        </div>
        {dayTransitionErrorMessage === null ? null : (
          <p className="dawn-error" role="alert">
            {dayTransitionErrorMessage}
          </p>
        )}
        <button type="button" className="button button--primary" onClick={onBeginDayDiscussion}>
          Begin day discussion
        </button>
      </section>
    )
  }

  return (
    <section className="dawn-ready" aria-labelledby="dawn-ready-heading">
      <div
        className="dawn-ready__content"
        aria-hidden={confirmationOpen || undefined}
        inert={confirmationOpen ? true : undefined}
      >
        <p className="dawn-ready__eyebrow">Host-only Dawn boundary</p>
        <h2 id="dawn-ready-heading" ref={headingRef} tabIndex={-1}>
          Night resolution complete
        </h2>
        <p>
          Ordinary deaths are still hidden. Make sure all players’ eyes are open before showing
          Dawn.
        </p>
        {error === null ? null : (
          <p className="dawn-error" role="alert">
            {getNightCompletionErrorMessage(error)}
          </p>
        )}
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
              setConfirmationOpen(false)
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
                setConfirmationOpen(false)
              }
            }}
          >
            <p className="dawn-confirmation__eyebrow">Final privacy check</p>
            <h3 id="dawn-confirmation-heading">Show the public Dawn announcement?</h3>
            <p id="dawn-confirmation-description">
              Confirm that every player’s eyes are open. This applies ordinary night deaths exactly
              once.
            </p>
            <div className="dawn-confirmation__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setConfirmationOpen(false)
                }}
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
