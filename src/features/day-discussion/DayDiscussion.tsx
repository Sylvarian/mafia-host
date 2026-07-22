import { useEffect, useRef, useState } from 'react'

import type {
  ConfirmMayorRevealWorkflowError,
  DayDiscussionView,
  DayPlayerView,
  MayorRevealCandidateView,
} from '@/application/day-discussion/index.ts'
import type {
  CompleteDayOutcomeWorkflowError,
  DayExecutionCandidateView,
} from '@/application/day-outcome/index.ts'
import type { PlayerId } from '@/application/role-assignment/index.ts'

import { getDayOutcomeErrorMessage, getMayorRevealErrorMessage } from './day-discussion-error.ts'

import './DayDiscussion.css'

type HostDialog = 'mayor' | 'execution' | 'no-execution' | null

type DayDiscussionProps = Readonly<{
  view: DayDiscussionView
  mayorCandidates: readonly MayorRevealCandidateView[]
  executionCandidates?: readonly DayExecutionCandidateView[]
  revealError: ConfirmMayorRevealWorkflowError | null
  outcomeError?: CompleteDayOutcomeWorkflowError | null
  onConfirmMayorReveal: (selectedPlayerId: PlayerId) => boolean
  onExecutePlayer?: (selectedPlayerId: PlayerId) => boolean
  onEndDayWithoutExecution?: () => boolean
  onClearRevealError: () => void
  onClearOutcomeError?: () => void
  onDialogPresentationChange: (open: boolean) => void
}>

export function DayDiscussion({
  view,
  mayorCandidates,
  executionCandidates = [],
  revealError,
  outcomeError = null,
  onConfirmMayorReveal,
  onExecutePlayer = () => false,
  onEndDayWithoutExecution = () => false,
  onClearRevealError,
  onClearOutcomeError = () => undefined,
  onDialogPresentationChange,
}: DayDiscussionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const revealButtonRef = useRef<HTMLButtonElement>(null)
  const executionButtonRef = useRef<HTMLButtonElement>(null)
  const noExecutionButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLButtonElement | null>(null)
  const confirmationPendingRef = useRef(false)
  const [dialog, setDialog] = useState<HostDialog>(null)
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
      : mayorCandidates.find((candidate) => candidate.playerId === selectedMayorPlayerId)
  const selectedExecution =
    selectedExecutionPlayerId === null
      ? undefined
      : executionCandidates.find((candidate) => candidate.playerId === selectedExecutionPlayerId)

  function openDialog(
    nextDialog: Exclude<HostDialog, null>,
    invokingControl: HTMLButtonElement | null,
  ): void {
    confirmationPendingRef.current = false
    returnFocusRef.current = invokingControl
    onClearRevealError()
    onClearOutcomeError()
    onDialogPresentationChange(true)
    setDialog(nextDialog)
  }

  function closeDialog(): void {
    confirmationPendingRef.current = false
    onDialogPresentationChange(false)
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

  const hostDialogOpen = dialog !== null
  return (
    <section className="day-discussion" aria-labelledby="day-discussion-heading">
      <div
        className="day-discussion__content"
        aria-hidden={hostDialogOpen || undefined}
        inert={hostDialogOpen ? true : undefined}
      >
        <p className="day-discussion__eyebrow">{view.dayLabel} · Host display</p>
        <h2 id="day-discussion-heading" ref={headingRef} tabIndex={-1}>
          Day discussion
        </h2>

        <aside className="host-role-control" aria-label="Role visibility">
          <button
            type="button"
            className="button button--secondary"
            disabled={hostDialogOpen}
            aria-expanded={showHostRoles}
            aria-controls="day-player-cards"
            onClick={() => {
              setShowHostRoles((visible) => !visible)
            }}
          >
            {showHostRoles ? 'Hide roles' : 'Show roles'}
          </button>
          <span>This convenience control changes role details in place.</span>
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

        <div id="day-player-cards" className="host-role-view">
          <UnifiedDayPlayerCards view={view} showRoles={showHostRoles} />
        </div>

        <aside className="day-discussion__mayor-control" aria-label="Host controls">
          <div>
            <strong>Mayor reveal</strong>
            <span>Open only when a player has verbally asked to reveal as Mayor.</span>
          </div>
          <button
            ref={revealButtonRef}
            type="button"
            className="button button--primary"
            disabled={!view.mayorRevealAvailable || hostDialogOpen}
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
              disabled={executionCandidates.length === 0 || hostDialogOpen}
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
              disabled={hostDialogOpen}
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
            className={`mayor-reveal${dialog === 'execution' ? ' mayor-reveal--execution' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="host-day-dialog-heading"
            aria-describedby={dialog === 'no-execution' ? 'host-day-dialog-warning' : undefined}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeDialog()
              }
            }}
          >
            <p className="mayor-reveal__eyebrow">
              {dialog === 'mayor' ? 'Mayor reveal' : 'Final day outcome'}
            </p>
            {dialog === 'mayor' ? (
              <>
                <h3 id="host-day-dialog-heading">Confirm a Mayor’s public reveal</h3>
                <CandidateList
                  legend="Select the player who verbally revealed"
                  name="mayor-reveal-candidate"
                  candidates={mayorCandidates}
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
                    {getMayorRevealErrorMessage(revealError, mayorCandidates)}
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
                          onDialogPresentationChange(false)
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
                <h3 id="host-day-dialog-heading">Execute a player</h3>
                <ExecutionCandidateGroups
                  candidates={executionCandidates}
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
                <h3 id="host-day-dialog-heading">End {view.dayLabel} without an execution?</h3>
                <p id="host-day-dialog-warning" className="mayor-reveal__warning">
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

function UnifiedDayPlayerCards({
  view,
  showRoles,
}: Readonly<{ view: DayDiscussionView; showRoles: boolean }>) {
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
            <div className="host-role-group__states">
              {(['alive', 'dead'] as const).map((status) => {
                const players = group.players.filter((player) => player.status === status)
                return (
                  <section
                    className="host-role-state"
                    aria-labelledby={`host-role-${group.alignment}-${status}-heading`}
                    key={status}
                  >
                    <h4 id={`host-role-${group.alignment}-${status}-heading`}>
                      {status === 'alive' ? 'Living' : 'Dead'}
                    </h4>
                    {players.length === 0 ? (
                      <p className="host-role-state__empty">None</p>
                    ) : (
                      <ul className="host-role-view__players">
                        {players.map((player) => (
                          <li
                            className={`${getHostRoleCardClass(player.alignment)} host-role-card--${player.status}`}
                            key={player.playerId}
                          >
                            <div>
                              <strong>{player.playerDisplayLabel}</strong>
                              <span>{player.status === 'alive' ? 'Living' : 'Dead'}</span>
                            </div>
                            <div>
                              <strong>
                                {showRoles
                                  ? player.activeRoleDisplayName
                                  : (player.announcedRole?.displayName ?? 'Role hidden')}
                              </strong>
                              {!showRoles ||
                              player.originallyAssignedRoleDisplayName === null ? null : (
                                <span>Originally: {player.originallyAssignedRoleDisplayName}</span>
                              )}
                              {player.announcedRole?.status === 'publicly-revealed-mayor' ? (
                                <span>Mayor revealed</span>
                              ) : null}
                              {player.announcedRole?.status === 'publicly-revealed-mayor' &&
                              player.status === 'alive' ? (
                                <span className="day-player__mayor-reminder">
                                  This player counts as 3 votes.
                                </span>
                              ) : null}
                              {player.deathCause === null ? null : (
                                <span>{formatDayDeathCause(player.deathCause)}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function getHostRoleCardClass(
  alignment: DayDiscussionView['groups'][number]['alignment'],
):
  | 'host-role-card host-role-card--mafia'
  | 'host-role-card host-role-card--town'
  | 'host-role-card host-role-card--neutral' {
  switch (alignment) {
    case 'mafia':
      return 'host-role-card host-role-card--mafia'
    case 'town':
      return 'host-role-card host-role-card--town'
    case 'neutral':
      return 'host-role-card host-role-card--neutral'
  }
}

function formatDayDeathCause(cause: NonNullable<DayPlayerView['deathCause']>): string {
  switch (cause.kind) {
    case 'night-death':
      return `Died during Night ${String(cause.nightNumber)}`
    case 'day-execution':
      return `Executed on Day ${String(cause.dayNumber)}`
    case 'jester-revenge':
      return `Killed by Jester revenge during Night ${String(cause.nightNumber)}`
    case 'final-killing-role-showdown':
      return 'Died in the final killing-role showdown'
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

function ExecutionCandidateGroups({
  candidates,
  selectedPlayerId,
  onSelect,
}: Readonly<{
  candidates: readonly DayExecutionCandidateView[]
  selectedPlayerId: PlayerId | null
  onSelect: (playerId: PlayerId) => void
}>) {
  const groups = (['mafia', 'town', 'neutral'] as const).map((alignment) => ({
    alignment,
    label: alignment === 'mafia' ? 'MAFIA' : alignment === 'town' ? 'TOWN' : 'NEUTRAL',
    candidates: candidates.filter((candidate) => candidate.alignment === alignment),
  }))

  return (
    <div
      className="execution-candidate-groups"
      aria-label="Select the living player who was executed"
    >
      {groups.map((group) => (
        <fieldset
          className={`execution-candidate-group execution-candidate-group--${group.alignment}`}
          key={group.alignment}
        >
          <legend>{group.label}</legend>
          {group.candidates.length === 0 ? (
            <p>No living players.</p>
          ) : (
            group.candidates.map((candidate) => (
              <label
                className={`mayor-reveal__candidate mayor-reveal__candidate--${candidate.alignment}`}
                key={candidate.playerId}
              >
                <input
                  type="radio"
                  name="execution-candidate"
                  checked={selectedPlayerId === candidate.playerId}
                  onChange={() => {
                    onSelect(candidate.playerId)
                  }}
                />
                <span>{candidate.playerDisplayLabel}</span>
                <small>
                  {candidate.activeRoleDisplayName}
                  {candidate.originallyAssignedRoleDisplayName === null
                    ? ''
                    : ` · Originally: ${candidate.originallyAssignedRoleDisplayName}`}
                </small>
              </label>
            ))
          )}
        </fieldset>
      ))}
    </div>
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
