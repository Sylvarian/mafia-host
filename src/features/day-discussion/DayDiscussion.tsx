import { useEffect, useRef, useState } from 'react'

import type {
  ConfirmMayorRevealWorkflowError,
  MayorRevealCandidateView,
  PublicDayDiscussionView,
  PublicDayPlayerView,
} from '@/application/day-discussion/index.ts'
import type { PlayerId } from '@/application/role-assignment/index.ts'

import { getMayorRevealErrorMessage } from './day-discussion-error.ts'

import './DayDiscussion.css'

type DayDiscussionProps = Readonly<{
  view: PublicDayDiscussionView
  privateMayorCandidates: readonly MayorRevealCandidateView[]
  revealError: ConfirmMayorRevealWorkflowError | null
  onConfirmMayorReveal: (selectedPlayerId: PlayerId) => boolean
  onClearRevealError: () => void
  onPrivatePresentationChange: (open: boolean) => void
}>

export function DayDiscussion({
  view,
  privateMayorCandidates,
  revealError,
  onConfirmMayorReveal,
  onClearRevealError,
  onPrivatePresentationChange,
}: DayDiscussionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const revealButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const dialogWasOpenRef = useRef(false)
  const confirmationPendingRef = useRef(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    if (dialogOpen) {
      dialogRef.current?.focus()
    } else if (dialogWasOpenRef.current) {
      confirmationPendingRef.current = false
      revealButtonRef.current?.focus()
    }
    dialogWasOpenRef.current = dialogOpen
  }, [dialogOpen])

  const selectedCandidate =
    selectedPlayerId === null
      ? undefined
      : privateMayorCandidates.find((candidate) => candidate.playerId === selectedPlayerId)

  function closeDialog(): void {
    confirmationPendingRef.current = false
    onPrivatePresentationChange(false)
    setDialogOpen(false)
    setSelectedPlayerId(null)
    onClearRevealError()
  }

  return (
    <section className="day-discussion" aria-labelledby="day-discussion-heading">
      <div
        className="day-discussion__public"
        aria-hidden={dialogOpen || undefined}
        inert={dialogOpen ? true : undefined}
      >
        <p className="day-discussion__eyebrow">{view.dayLabel} · Public-safe display</p>
        <h2 id="day-discussion-heading" ref={headingRef} tabIndex={-1}>
          Day discussion
        </h2>

        <div className="day-discussion__guidance" aria-label="Day discussion guidance">
          <p>Players handle nominations and trial voting verbally.</p>
          <p>
            A nomination requires a majority.
            <br />
            More guilty than innocent means execution.
            <br />A tie means innocent.
          </p>
          <p>The app will record the final day outcome in a later step.</p>
          <strong>Remember: each revealed Mayor counts as three votes.</strong>
        </div>

        <div className="day-discussion__rosters">
          <PlayerSection
            heading="Living players"
            headingId="living-players-heading"
            rows={view.livingPlayers}
            emptyMessage="No players remain alive."
          />
          <PlayerSection
            heading="Dead players"
            headingId="dead-players-heading"
            rows={view.deadPlayers}
            emptyMessage="No players are dead."
          />
        </div>

        <aside className="day-discussion__mayor-control" aria-label="Private host controls">
          <div>
            <strong>Host-only Mayor confirmation</strong>
            <span>Open only when a player has verbally asked to reveal as Mayor.</span>
          </div>
          <button
            ref={revealButtonRef}
            type="button"
            className="button button--primary"
            disabled={!view.mayorRevealAvailable || dialogOpen}
            onClick={() => {
              onClearRevealError()
              onPrivatePresentationChange(true)
              setDialogOpen(true)
            }}
          >
            {view.mayorRevealAvailable ? 'Confirm Mayor reveal' : 'Mayor reveal unavailable'}
          </button>
        </aside>
      </div>

      {dialogOpen ? (
        <div className="mayor-reveal__backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="mayor-reveal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mayor-reveal-heading"
            aria-describedby="mayor-reveal-warning"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeDialog()
              }
            }}
          >
            <p className="mayor-reveal__eyebrow">Private host-only screen</p>
            <h3 id="mayor-reveal-heading">Confirm a Mayor’s public reveal</h3>
            <p id="mayor-reveal-warning" className="mayor-reveal__warning">
              Privacy warning: this list identifies living, unrevealed Mayors. Keep it hidden from
              players until the selected reveal is confirmed.
            </p>

            <fieldset className="mayor-reveal__candidates">
              <legend>Select the player who verbally revealed</legend>
              {privateMayorCandidates.map((candidate, index) => (
                <label key={candidate.playerId}>
                  <input
                    type="radio"
                    name="mayor-reveal-candidate"
                    checked={selectedPlayerId === candidate.playerId}
                    onChange={() => {
                      setSelectedPlayerId(candidate.playerId)
                      onClearRevealError()
                    }}
                  />
                  <span>{candidate.playerDisplayLabel}</span>
                  <small>Eligible living Mayor</small>
                  <span className="mayor-reveal__candidate-number" aria-hidden="true">
                    {String(index + 1)}
                  </span>
                </label>
              ))}
            </fieldset>

            {selectedCandidate === undefined ? (
              <p>Select one player to continue.</p>
            ) : (
              <p className="mayor-reveal__confirmation-copy">
                Confirming will publicly reveal{' '}
                <strong>{selectedCandidate.playerDisplayLabel}</strong> as Mayor. Their vote counts
                as three in every player vote; the app will not count votes.
              </p>
            )}

            {revealError === null ? null : (
              <p className="mayor-reveal__error" role="alert">
                {getMayorRevealErrorMessage(revealError, privateMayorCandidates)}
              </p>
            )}

            <div className="mayor-reveal__actions">
              <button type="button" className="button button--secondary" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={selectedCandidate === undefined}
                onClick={() => {
                  if (selectedCandidate === undefined || confirmationPendingRef.current) {
                    return
                  }
                  confirmationPendingRef.current = true
                  if (onConfirmMayorReveal(selectedCandidate.playerId)) {
                    onPrivatePresentationChange(false)
                    setDialogOpen(false)
                    setSelectedPlayerId(null)
                  } else {
                    confirmationPendingRef.current = false
                  }
                }}
              >
                Publicly reveal as Mayor
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

type PlayerSectionProps = Readonly<{
  heading: string
  headingId: string
  rows: readonly PublicDayPlayerView[]
  emptyMessage: string
}>

function PlayerSection({ heading, headingId, rows, emptyMessage }: PlayerSectionProps) {
  return (
    <section className="day-roster" aria-labelledby={headingId}>
      <h3 id={headingId}>{heading}</h3>
      {rows.length === 0 ? (
        <p className="day-roster__empty">{emptyMessage}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.playerId} className={`day-player day-player--${row.status}`}>
              <div className="day-player__identity">
                <strong>{row.playerDisplayLabel}</strong>
                <span>{row.status === 'alive' ? 'Alive' : 'Dead'}</span>
              </div>
              <div className="day-player__role">
                {row.publicRoleDisplayName === null ? (
                  <span>{row.status === 'alive' ? 'Role hidden' : 'Role not revealed'}</span>
                ) : row.publiclyRevealedMayor ? (
                  <strong>{row.publicRoleDisplayName} — publicly revealed</strong>
                ) : (
                  <strong>{row.publicRoleDisplayName}</strong>
                )}
                {row.hasThreeVoteReminder ? (
                  <span className="day-player__mayor-reminder">
                    Mayor revealed — this player counts as 3 votes.
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
