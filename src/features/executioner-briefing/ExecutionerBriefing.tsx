import { useEffect, useRef, useState } from 'react'

import type {
  ExecutionerBriefingId,
  ExecutionerBriefingView,
} from '@/application/executioner-briefing/index.ts'

import './ExecutionerBriefing.css'

type ExecutionerBriefingProps = Readonly<{
  view: ExecutionerBriefingView
  errorMessage: string | null
  onAcknowledge: (briefingId: ExecutionerBriefingId) => void
  onPrevious: () => void
  onNext: () => void
  onBeginNight: () => void
}>

export function ExecutionerBriefing({
  view,
  errorMessage,
  onAcknowledge,
  onPrevious,
  onNext,
  onBeginNight,
}: ExecutionerBriefingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const beginButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const confirmationWasOpenRef = useRef(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)

  useEffect(() => {
    headingRef.current?.focus()
  }, [view.currentBriefing.id])

  useEffect(() => {
    if (confirmationOpen) {
      confirmButtonRef.current?.focus()
    } else if (confirmationWasOpenRef.current) {
      beginButtonRef.current?.focus()
    }
    confirmationWasOpenRef.current = confirmationOpen
  }, [confirmationOpen])

  const briefing = view.currentBriefing
  const executionerName = briefing.executionerDisplayLabel
  const targetName = briefing.targetDisplayLabel

  return (
    <section className="executioner-briefing" aria-labelledby="executioner-briefing-heading">
      <div
        className="executioner-briefing__content"
        aria-hidden={confirmationOpen || undefined}
        inert={confirmationOpen ? true : undefined}
      >
        <header className="executioner-briefing__header">
          <div>
            <p className="executioner-briefing__eyebrow">Private Executioner briefing</p>
            <h2 id="executioner-briefing-heading" ref={headingRef} tabIndex={-1}>
              {briefing.executionerRoleDisplayName} — {executionerName}
            </h2>
          </div>
          <div className="executioner-briefing__progress" aria-live="polite">
            <strong>
              {view.currentBriefingIndex + 1} of {view.briefingCount}
            </strong>
            <span>
              {view.acknowledgedCount} {view.acknowledgedCount === 1 ? 'briefing' : 'briefings'}{' '}
              acknowledged
            </span>
          </div>
        </header>

        <div className="executioner-briefing__privacy" role="note">
          <strong>Private host-only information</strong>
          <span>Ask everyone except the named Executioner to look away.</span>
          <span>Tell this Executioner their target privately.</span>
        </div>

        <article className="executioner-briefing__card">
          <p>
            <strong>{briefing.executionerRoleDisplayName}</strong> · {executionerName}
          </p>
          <p className="executioner-briefing__target">Your target is {targetName}.</p>
          <p>You personally win if {targetName} is executed during the day.</p>
          <small>Do not reveal the target’s role.</small>
        </article>

        {errorMessage === null ? null : (
          <p className="executioner-briefing__error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="executioner-briefing__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={view.currentBriefingIndex === 0 || confirmationOpen}
            onClick={onPrevious}
          >
            Previous
          </button>
          {view.acknowledged ? (
            <button
              type="button"
              className="button button--prepare"
              disabled={view.currentBriefingIndex === view.briefingCount - 1 || confirmationOpen}
              onClick={onNext}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="button button--prepare"
              disabled={confirmationOpen}
              onClick={() => {
                onAcknowledge(briefing.id)
              }}
            >
              Mark as briefed
            </button>
          )}
          <button
            ref={beginButtonRef}
            type="button"
            className="button button--prepare"
            disabled={view.status !== 'ready' || confirmationOpen}
            onClick={() => {
              setConfirmationOpen(true)
            }}
          >
            Begin Night 1
          </button>
        </div>
      </div>

      {confirmationOpen ? (
        <div
          className="executioner-briefing-dialog__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmationOpen(false)
            }
          }}
        >
          <section
            className="executioner-briefing-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="executioner-briefing-dialog-heading"
            aria-describedby="executioner-briefing-dialog-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setConfirmationOpen(false)
              }
            }}
          >
            <p className="executioner-briefing-dialog__eyebrow">Final private check</p>
            <h3 id="executioner-briefing-dialog-heading">Begin Night 1?</h3>
            <p id="executioner-briefing-dialog-description">
              Confirm that every Executioner received their target privately. Night actions will
              begin once.
            </p>
            <div className="executioner-briefing-dialog__actions">
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
                  setConfirmationOpen(false)
                  onBeginNight()
                }}
              >
                Confirm and Begin Night 1
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
