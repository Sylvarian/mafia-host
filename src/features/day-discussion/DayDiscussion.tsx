import { useEffect, useRef, useState } from 'react'

import type {
  ConfirmMayorRevealWorkflowError,
  MayorRevealCandidateView,
  PublicDayDiscussionView,
  PublicDayPlayerView,
} from '@/application/day-discussion/index.ts'
import type {
  CompleteDayOutcomeWorkflowError,
  DayExecutionCandidateView,
} from '@/application/day-outcome/index.ts'
import type { PlayerId } from '@/application/role-assignment/index.ts'

import { getDayOutcomeErrorMessage, getMayorRevealErrorMessage } from './day-discussion-error.ts'

import './DayDiscussion.css'

type PrivateDialog = 'mayor' | 'execution' | 'no-execution' | null

type DayDiscussionProps = Readonly<{
  view: PublicDayDiscussionView
  privateMayorCandidates: readonly MayorRevealCandidateView[]
  privateExecutionCandidates?: readonly DayExecutionCandidateView[]
  revealError: ConfirmMayorRevealWorkflowError | null
  outcomeError?: CompleteDayOutcomeWorkflowError | null
  onConfirmMayorReveal: (selectedPlayerId: PlayerId) => boolean
  onExecutePlayer?: (selectedPlayerId: PlayerId) => boolean
  onEndDayWithoutExecution?: () => boolean
  onClearRevealError: () => void
  onClearOutcomeError?: () => void
  onPrivatePresentationChange: (open: boolean) => void
}>

export function DayDiscussion({
  view,
  privateMayorCandidates,
  privateExecutionCandidates = [],
  revealError,
  outcomeError = null,
  onConfirmMayorReveal,
  onExecutePlayer = () => false,
  onEndDayWithoutExecution = () => false,
  onClearRevealError,
  onClearOutcomeError = () => undefined,
  onPrivatePresentationChange,
}: DayDiscussionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const revealButtonRef = useRef<HTMLButtonElement>(null)
  const executionButtonRef = useRef<HTMLButtonElement>(null)
  const noExecutionButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLButtonElement | null>(null)
  const confirmationPendingRef = useRef(false)
  const [dialog, setDialog] = useState<PrivateDialog>(null)
  const [selectedMayorPlayerId, setSelectedMayorPlayerId] = useState<PlayerId | null>(null)
  const [selectedExecutionPlayerId, setSelectedExecutionPlayerId] = useState<PlayerId | null>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    if (dialog !== null) {
      dialogRef.current?.focus()
    } else {
      returnFocusRef.current?.focus()
    }
  }, [dialog])

  const selectedMayor =
    selectedMayorPlayerId === null
      ? undefined
      : privateMayorCandidates.find((candidate) => candidate.playerId === selectedMayorPlayerId)
  const selectedExecution =
    selectedExecutionPlayerId === null
      ? undefined
      : privateExecutionCandidates.find(
          (candidate) => candidate.playerId === selectedExecutionPlayerId,
        )

  function openDialog(
    nextDialog: Exclude<PrivateDialog, null>,
    invokingControl: HTMLButtonElement | null,
  ): void {
    confirmationPendingRef.current = false
    returnFocusRef.current = invokingControl
    onClearRevealError()
    onClearOutcomeError()
    onPrivatePresentationChange(true)
    setDialog(nextDialog)
  }

  function closeDialog(): void {
    confirmationPendingRef.current = false
    onPrivatePresentationChange(false)
    setDialog(null)
    setSelectedMayorPlayerId(null)
    setSelectedExecutionPlayerId(null)
    onClearRevealError()
    onClearOutcomeError()
  }

  function completeOutcome(operation: () => boolean): void {
    if (confirmationPendingRef.current) {
      return
    }
    confirmationPendingRef.current = true
    if (!operation()) {
      confirmationPendingRef.current = false
    }
  }

  const privateDialogOpen = dialog !== null

  return (
    <section className="day-discussion" aria-labelledby="day-discussion-heading">
      <div
        className="day-discussion__public"
        aria-hidden={privateDialogOpen || undefined}
        inert={privateDialogOpen ? true : undefined}
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
            disabled={!view.mayorRevealAvailable || privateDialogOpen}
            onClick={() => {
              openDialog('mayor', revealButtonRef.current)
            }}
          >
            {view.mayorRevealAvailable ? 'Confirm Mayor reveal' : 'Mayor reveal unavailable'}
          </button>
        </aside>

        <aside className="day-discussion__outcome-control" aria-label="Final day outcome">
          <div>
            <strong>Record the final day outcome</strong>
            <span>Nominations, trials, and votes remain verbal and are not stored.</span>
          </div>
          <div className="day-discussion__outcome-actions">
            <button
              ref={executionButtonRef}
              type="button"
              className="button button--danger"
              disabled={privateExecutionCandidates.length === 0 || privateDialogOpen}
              onClick={() => {
                openDialog('execution', executionButtonRef.current)
              }}
            >
              Execute a player
            </button>
            <button
              ref={noExecutionButtonRef}
              type="button"
              className="button button--secondary"
              disabled={privateDialogOpen}
              onClick={() => {
                openDialog('no-execution', noExecutionButtonRef.current)
              }}
            >
              End day without execution
            </button>
          </div>
        </aside>
      </div>

      {dialog === null ? null : (
        <div className="mayor-reveal__backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="mayor-reveal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="private-day-dialog-heading"
            aria-describedby="private-day-dialog-warning"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeDialog()
              }
            }}
          >
            <p className="mayor-reveal__eyebrow">Private host-only screen</p>
            {dialog === 'mayor' ? (
              <>
                <h3 id="private-day-dialog-heading">Confirm a Mayor’s public reveal</h3>
                <p id="private-day-dialog-warning" className="mayor-reveal__warning">
                  Privacy warning: this list identifies living, unrevealed Mayors. Keep it hidden
                  from players until the selected reveal is confirmed.
                </p>
                <CandidateList
                  legend="Select the player who verbally revealed"
                  name="mayor-reveal-candidate"
                  candidates={privateMayorCandidates}
                  selectedPlayerId={selectedMayorPlayerId}
                  detail="Eligible living Mayor"
                  onSelect={(playerId) => {
                    setSelectedMayorPlayerId(playerId)
                    onClearRevealError()
                  }}
                />
                {selectedMayor === undefined ? (
                  <p>Select one player to continue.</p>
                ) : (
                  <p className="mayor-reveal__confirmation-copy">
                    Confirming will publicly reveal{' '}
                    <strong>{selectedMayor.playerDisplayLabel}</strong> as Mayor. Their vote counts
                    as three in every player vote; the app will not count votes.
                  </p>
                )}
                {revealError === null ? null : (
                  <p className="mayor-reveal__error" role="alert">
                    {getMayorRevealErrorMessage(revealError, privateMayorCandidates)}
                  </p>
                )}
                <DialogActions
                  confirmLabel="Publicly reveal as Mayor"
                  confirmDisabled={selectedMayor === undefined}
                  onCancel={closeDialog}
                  onConfirm={() => {
                    if (selectedMayor !== undefined) {
                      completeOutcome(() => {
                        const completed = onConfirmMayorReveal(selectedMayor.playerId)
                        if (completed) {
                          onPrivatePresentationChange(false)
                          setDialog(null)
                          setSelectedMayorPlayerId(null)
                          onClearRevealError()
                        }
                        return completed
                      })
                    }
                  }}
                />
              </>
            ) : dialog === 'execution' ? (
              <>
                <h3 id="private-day-dialog-heading">Execute a player</h3>
                <p id="private-day-dialog-warning" className="mayor-reveal__warning">
                  Host-only warning: keep this selection hidden while you deliberately record the
                  public result. Hidden roles and private consequences are not shown here.
                </p>
                <CandidateList
                  legend="Select the living player who was executed"
                  name="execution-candidate"
                  candidates={privateExecutionCandidates}
                  selectedPlayerId={selectedExecutionPlayerId}
                  detail="Living player"
                  onSelect={(playerId) => {
                    setSelectedExecutionPlayerId(playerId)
                    onClearOutcomeError()
                  }}
                />
                {selectedExecution === undefined ? (
                  <p>Select one player to continue.</p>
                ) : (
                  <p className="mayor-reveal__confirmation-copy">
                    <strong>Execute {selectedExecution.playerDisplayLabel}?</strong>
                    <br />
                    This permanently records {selectedExecution.playerDisplayLabel} as the player
                    executed on {view.dayLabel}. This action cannot be undone.
                  </p>
                )}
                {outcomeError === null ? null : (
                  <p className="mayor-reveal__error" role="alert">
                    {getDayOutcomeErrorMessage(outcomeError)}
                  </p>
                )}
                <DialogActions
                  confirmLabel={
                    selectedExecution === undefined
                      ? 'Execute selected player'
                      : `Execute ${selectedExecution.playerDisplayLabel}`
                  }
                  confirmDisabled={selectedExecution === undefined}
                  destructive
                  onCancel={closeDialog}
                  onConfirm={() => {
                    if (selectedExecution !== undefined) {
                      completeOutcome(() => onExecutePlayer(selectedExecution.playerId))
                    }
                  }}
                />
              </>
            ) : (
              <>
                <h3 id="private-day-dialog-heading">End {view.dayLabel} without an execution?</h3>
                <p id="private-day-dialog-warning" className="mayor-reveal__warning">
                  No player will be executed today.
                  <br />
                  This action cannot be undone.
                </p>
                {outcomeError === null ? null : (
                  <p className="mayor-reveal__error" role="alert">
                    {getDayOutcomeErrorMessage(outcomeError)}
                  </p>
                )}
                <DialogActions
                  confirmLabel="End day without execution"
                  onCancel={closeDialog}
                  onConfirm={() => {
                    completeOutcome(onEndDayWithoutExecution)
                  }}
                />
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

type CandidateView = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
}>

type CandidateListProps = Readonly<{
  legend: string
  name: string
  candidates: readonly CandidateView[]
  selectedPlayerId: PlayerId | null
  detail: string
  onSelect: (playerId: PlayerId) => void
}>

function CandidateList({
  legend,
  name,
  candidates,
  selectedPlayerId,
  detail,
  onSelect,
}: CandidateListProps) {
  return (
    <fieldset className="mayor-reveal__candidates">
      <legend>{legend}</legend>
      {candidates.map((candidate, index) => (
        <label key={candidate.playerId}>
          <input
            type="radio"
            name={name}
            checked={selectedPlayerId === candidate.playerId}
            onChange={() => {
              onSelect(candidate.playerId)
            }}
          />
          <span>{candidate.playerDisplayLabel}</span>
          <small>{detail}</small>
          <span className="mayor-reveal__candidate-number" aria-hidden="true">
            {String(index + 1)}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

type DialogActionsProps = Readonly<{
  confirmLabel: string
  confirmDisabled?: boolean
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}>

function DialogActions({
  confirmLabel,
  confirmDisabled = false,
  destructive = false,
  onCancel,
  onConfirm,
}: DialogActionsProps) {
  return (
    <div className="mayor-reveal__actions">
      <button type="button" className="button button--secondary" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className={`button ${destructive ? 'button--danger' : 'button--primary'}`}
        disabled={confirmDisabled}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
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
