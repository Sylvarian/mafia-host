import { useEffect, useRef, useState } from 'react'

import type {
  ConfirmMayorRevealWorkflowError,
  HostRoleDayView,
  HostRoleDayViewError,
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
  getHostRoleView?: () =>
    | Readonly<{ ok: true; value: HostRoleDayView }>
    | Readonly<{ ok: false; error: HostRoleDayViewError }>
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
  getHostRoleView,
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
  const [showHostRoles, setShowHostRoles] = useState(false)

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
  const hostRoleResult = showHostRoles && getHostRoleView !== undefined ? getHostRoleView() : null

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

        <aside className="host-role-control" aria-label="Host-only role visibility">
          <button
            type="button"
            className="button button--secondary"
            disabled={privateDialogOpen}
            aria-expanded={showHostRoles}
            aria-controls="host-role-view"
            onClick={() => {
              setShowHostRoles((visible) => !visible)
            }}
          >
            {showHostRoles ? 'Hide host-only roles' : 'Show host-only roles'}
          </button>
          {showHostRoles ? (
            <div id="host-role-view" className="host-role-view">
              <p className="host-role-view__warning" role="alert">
                <strong>HOST-ONLY VIEW</strong> — hide roles before showing this screen to players.
              </p>
              {hostRoleResult === null ? (
                <p className="host-role-view__error" role="alert">
                  Host roles are unavailable.
                </p>
              ) : hostRoleResult.ok ? (
                <HostRoleRows view={hostRoleResult.value} />
              ) : (
                <p className="host-role-view__error" role="alert">
                  {getHostRoleViewErrorMessage(hostRoleResult.error)}
                </p>
              )}
            </div>
          ) : null}
        </aside>

        <section className="day-discussion__guidance" aria-labelledby="voting-requirements-heading">
          <h3 id="voting-requirements-heading">Voting requirements</h3>
          <p>
            Votes to put someone on trial:{' '}
            <strong>{view.votingRequirements.votesToPutOnTrial}</strong>
          </p>
          <div>
            <strong>Execution verdict:</strong>
            <span>Guilty votes must exceed innocent votes.</span>
            <span>A tie results in innocent.</span>
          </div>
          <p>
            A revealed Mayor’s vote counts as 3. <strong>The host counts this manually.</strong>
          </p>
        </section>

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
                  public result. Only the information needed to record the execution is shown here.
                </p>
                <CandidateList
                  legend="Select the living player who was executed"
                  name="execution-candidate"
                  candidates={privateExecutionCandidates}
                  selectedPlayerId={selectedExecutionPlayerId}
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
                    Role: {selectedExecution.activeRoleDisplayName}
                    <br />
                    Alignment: {selectedExecution.alignmentDisplayName}
                    {selectedExecution.originallyAssignedRoleDisplayName === null ? null : (
                      <>
                        <br />
                        Originally assigned: {selectedExecution.originallyAssignedRoleDisplayName}
                      </>
                    )}
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

function HostRoleRows({ view }: Readonly<{ view: HostRoleDayView }>) {
  return (
    <div className="host-role-view__groups">
      {view.groups.map((group) => (
        <section
          key={group.alignment}
          className={`host-role-group host-role-group--${group.alignment}`}
          aria-labelledby={`host-role-${group.alignment}-heading`}
        >
          <h3 id={`host-role-${group.alignment}-heading`}>{group.alignmentDisplayName}</h3>
          {group.players.length === 0 ? (
            <p className="host-role-group__empty">No assigned players.</p>
          ) : (
            <ul className="host-role-view__players">
              {group.players.map((player, playerIndex) => (
                <li key={`${group.alignment}-${String(playerIndex)}`}>
                  <div>
                    <strong>{player.playerDisplayLabel}</strong>
                    <span>{player.status === 'alive' ? 'Alive' : 'Dead'}</span>
                  </div>
                  <div>
                    <strong>Host role: {player.activeRoleDisplayName}</strong>
                    <span>Alignment: {player.alignmentDisplayName}</span>
                    {player.originallyAssignedRoleDisplayName === null ? null : (
                      <span>Originally assigned: {player.originallyAssignedRoleDisplayName}</span>
                    )}
                    {player.publicRole === null ? null : (
                      <span>
                        Public role: {player.publicRole.displayName}
                        {player.publicRole.status === 'publicly-revealed-mayor'
                          ? ' — publicly revealed'
                          : ''}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

function getHostRoleViewErrorMessage(error: HostRoleDayViewError): string {
  switch (error.type) {
    case 'INVALID_ACTIVE_DAY_ROLE':
      return 'A player’s active role could not be derived safely. Host roles remain hidden.'
    case 'INVALID_DAY_DISCUSSION_GAME':
    case 'DAY_DISCUSSION_PHASE_MISMATCH':
    case 'INVALID_DAY_DISCUSSION_PARTICIPANTS':
    case 'INVALID_DAY_DISCUSSION_COUNTERS':
      return 'The current day state could not be validated. Host roles remain hidden.'
  }
}

type CandidateView = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
}> &
  Partial<
    Pick<
      DayExecutionCandidateView,
      | 'activeRoleDisplayName'
      | 'originallyAssignedRoleDisplayName'
      | 'alignment'
      | 'alignmentDisplayName'
    >
  >

type CandidateListProps = Readonly<{
  legend: string
  name: string
  candidates: readonly CandidateView[]
  selectedPlayerId: PlayerId | null
  detail?: string
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
        <label
          key={candidate.playerId}
          className={
            candidate.alignment === undefined
              ? undefined
              : `mayor-reveal__candidate mayor-reveal__candidate--${candidate.alignment}`
          }
        >
          <input
            type="radio"
            name={name}
            checked={selectedPlayerId === candidate.playerId}
            onChange={() => {
              onSelect(candidate.playerId)
            }}
          />
          <span>{candidate.playerDisplayLabel}</span>
          {candidate.activeRoleDisplayName === undefined ||
          candidate.alignmentDisplayName === undefined ? (
            <small>{detail}</small>
          ) : (
            <small>
              {candidate.activeRoleDisplayName} · {candidate.alignmentDisplayName}
              {candidate.originallyAssignedRoleDisplayName === null ||
              candidate.originallyAssignedRoleDisplayName === undefined
                ? ''
                : ` · Originally assigned: ${candidate.originallyAssignedRoleDisplayName}`}
            </small>
          )}
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
