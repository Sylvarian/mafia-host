import { useEffect, useRef, useState } from 'react'

import {
  selectCurrentNightStepView,
  selectImmediateNightOutcomeView,
  type ActiveNightActionCollectionWorkflow,
  type CollectingNightActionsWorkflow,
  type ImmediateNightOutcomeView,
  type NightActionCollectionError,
  type PlayerId,
} from '@/application/night-actions/index.ts'

import { getNightActionCollectionErrorMessage } from './night-action-error.ts'

import './NightRunner.css'

type NightRunnerProps = Readonly<{
  workflow: ActiveNightActionCollectionWorkflow
  error: NightActionCollectionError | null
  onConfirmTarget: (targetPlayerId: PlayerId) => void
  onContinue: () => void
}>

export function NightRunner({ workflow, error, onConfirmTarget, onContinue }: NightRunnerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusKey = `${workflow.status}-${String(workflow.currentStepIndex)}`

  useEffect(() => {
    headingRef.current?.focus()
  }, [focusKey])

  if (workflow.status === 'awaiting-outcome-acknowledgement') {
    return (
      <ImmediateOutcome
        view={selectImmediateNightOutcomeView(workflow)}
        error={error}
        headingRef={headingRef}
        onContinue={onContinue}
      />
    )
  }

  if (workflow.status === 'complete') {
    return (
      <section className="night-runner night-complete" aria-labelledby="night-complete-heading">
        <p className="night-runner__eyebrow">Night {workflow.game.nightNumber}</p>
        <h2 id="night-complete-heading" ref={headingRef} tabIndex={-1}>
          Final night resolution prepared
        </h2>
      </section>
    )
  }

  return (
    <CollectionStep
      key={focusKey}
      workflow={workflow}
      error={error}
      headingRef={headingRef}
      onConfirmTarget={onConfirmTarget}
      onContinue={onContinue}
    />
  )
}

type HeadingRef = Readonly<{ current: HTMLHeadingElement | null }>

function CollectionStep({
  workflow,
  error,
  headingRef,
  onConfirmTarget,
  onContinue,
}: Readonly<{
  workflow: CollectingNightActionsWorkflow
  error: NightActionCollectionError | null
  headingRef: HeadingRef
  onConfirmTarget: (targetPlayerId: PlayerId) => void
  onContinue: () => void
}>) {
  const step = selectCurrentNightStepView(workflow)
  const [selectedTargetId, setSelectedTargetId] = useState<PlayerId | null>(null)
  const surfaceClass =
    step.type === 'mafia-overview'
      ? 'night-runner turn-surface turn-surface--mafia'
      : `night-runner turn-surface turn-surface--${step.faction}`

  return (
    <section className={surfaceClass} aria-labelledby="night-runner-heading">
      <header className="night-runner__header">
        <div>
          <p className="night-runner__eyebrow">
            Night {step.nightNumber} ·{' '}
            {step.type === 'mafia-overview' ? 'Mafia' : step.factionLabel}
          </p>
          <h2 id="night-runner-heading" ref={headingRef} tabIndex={-1}>
            {step.type === 'mafia-overview' ? 'Mafia' : step.roleDisplayName}
          </h2>
          {step.type === 'mafia-overview' ? null : (
            <p className="night-runner__actor">{step.actorDisplayLabel}</p>
          )}
        </div>
        <p className="night-runner__progress" aria-live="polite">
          {step.position} of {step.totalSteps}
        </p>
      </header>

      {error === null ? null : <NightError error={error} />}

      {step.type === 'mafia-overview' ? (
        <div className="night-instruction night-instruction--mafia">
          <p className="night-instruction__prompt">MAFIA OPEN YOUR EYES</p>
          {step.promotion === null ? null : (
            <div className="night-instruction__promotion">
              <strong>{step.promotion.promotedPlayerDisplayLabel} is the new Godfather.</strong>
              <span>
                Originally: {step.promotion.originallyAssignedRoleDisplayName} · Current role:{' '}
                {step.promotion.currentRoleDisplayName}
              </span>
            </div>
          )}
          <ul aria-label="Living Mafia overview">
            {step.mafiaMembers.map((member) => (
              <li key={member.playerId}>
                <span>{member.playerDisplayLabel}</span>
                <strong>{member.roleDisplayName}</strong>
                {member.originallyAssignedRoleDisplayName === null ? null : (
                  <small>Originally: {member.originallyAssignedRoleDisplayName}</small>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="actor-action">
          <p className="actor-action__prompt">{step.hostPrompt}</p>
          <div
            className="target-columns"
            role="group"
            aria-label={`Targets for ${step.roleDisplayName}`}
          >
            {step.targetGroups.map((group, groupIndex) => (
              <section
                className={`target-column target-column--${group.alignment}`}
                aria-labelledby={`target-column-${group.alignment}-heading`}
                key={group.alignment}
              >
                <h3 id={`target-column-${group.alignment}-heading`}>
                  {group.alignmentDisplayName}
                </h3>
                {group.players.length === 0 ? (
                  <p className="target-column__empty">No players.</p>
                ) : (
                  <div className="target-grid">
                    {group.players.map((target, targetIndex) => {
                      const selected = target.playerId === selectedTargetId
                      const reasonId = `target-reason-${String(groupIndex)}-${String(targetIndex)}`
                      const reason =
                        target.disabledReason === null
                          ? null
                          : getNightActionCollectionErrorMessage(target.disabledReason)

                      return (
                        <div className="target-option" key={target.playerId}>
                          <button
                            type="button"
                            className={`target-button${selected ? ' is-selected' : ''}`}
                            disabled={!target.enabled}
                            aria-pressed={selected}
                            aria-describedby={reason === null ? undefined : reasonId}
                            aria-label={`${target.playerDisplayLabel}, ${target.activeRoleDisplayName}, ${target.alive ? 'alive' : 'dead'}, ${selected ? 'selected' : target.enabled ? 'available' : 'unavailable'}`}
                            onClick={() => {
                              setSelectedTargetId(target.playerId)
                            }}
                          >
                            <strong>{target.playerDisplayLabel}</strong>
                            <span className="target-button__role">
                              {target.activeRoleDisplayName}
                            </span>
                            {target.originallyAssignedRoleDisplayName === null ? null : (
                              <small>Originally: {target.originallyAssignedRoleDisplayName}</small>
                            )}
                            <span>
                              {selected
                                ? 'Selected'
                                : target.enabled
                                  ? 'Available'
                                  : target.alive
                                    ? 'Unavailable'
                                    : 'Dead'}
                            </span>
                          </button>
                          {reason === null ? null : (
                            <small className="target-option__reason" id={reasonId}>
                              {reason}
                            </small>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      <div className="night-runner__actions night-runner__actions--end">
        <button
          type="button"
          className="button button--prepare"
          disabled={step.type === 'actor-action' && selectedTargetId === null}
          onClick={() => {
            if (step.type === 'actor-action') {
              if (selectedTargetId !== null) {
                onConfirmTarget(selectedTargetId)
              }
            } else {
              onContinue()
            }
          }}
        >
          {step.type === 'actor-action'
            ? step.confirmationMode === 'advance-directly'
              ? 'Confirm target and continue'
              : 'Confirm target'
            : 'Continue'}
        </button>
      </div>
    </section>
  )
}

function ImmediateOutcome({
  view,
  error,
  headingRef,
  onContinue,
}: Readonly<{
  view: ImmediateNightOutcomeView
  error: NightActionCollectionError | null
  headingRef: HeadingRef
  onContinue: () => void
}>) {
  return (
    <section
      className={`immediate-outcome turn-surface turn-surface--${view.faction}${view.kind === 'blocked' ? ' immediate-outcome--blocked' : ''}`}
      aria-labelledby="immediate-outcome-heading"
    >
      <p className="immediate-outcome__eyebrow">
        Night {view.nightNumber} · {view.factionLabel}
      </p>
      <h2 id="immediate-outcome-heading" ref={headingRef} tabIndex={-1}>
        {view.roleDisplayName}
      </h2>
      <p className="immediate-outcome__actor">{view.actorDisplayLabel}</p>
      <ImmediateOutcomeContent view={view} />
      {error === null ? null : <NightError error={error} />}
      <button type="button" className="button button--prepare" onClick={onContinue}>
        Continue
      </button>
    </section>
  )
}

function ImmediateOutcomeContent({ view }: Readonly<{ view: ImmediateNightOutcomeView }>) {
  switch (view.kind) {
    case 'blocked':
      return (
        <>
          <p className="immediate-outcome__result">BLOCKED</p>
          <p className="immediate-outcome__message">Your action cannot be performed tonight.</p>
        </>
      )
    case 'sheriff-result':
      return (
        <>
          <p className={`immediate-outcome__result sheriff-result sheriff-result--${view.status}`}>
            {view.status === 'suspicious'
              ? 'YOUR TARGET IS SUSPICIOUS'
              : 'YOUR TARGET IS NOT SUSPICIOUS'}
          </p>
          <div className="sheriff-result__details">
            <strong>{view.targetDisplayLabel}</strong>
            <span>{view.targetRoleDisplayName}</span>
            {view.targetOriginallyAssignedRoleDisplayName === null ? null : (
              <span>Originally: {view.targetOriginallyAssignedRoleDisplayName}</span>
            )}
            <span>{view.targetAlignmentDisplayName}</span>
          </div>
          <p className="immediate-outcome__message">Reason: {getSheriffReason(view)}</p>
        </>
      )
    case 'investigation-result':
      return (
        <>
          <p className="immediate-outcome__result">
            Possible roles: {view.groupRoleDisplayNames.join(' · ')}
          </p>
          <p className="immediate-outcome__group">{view.groupLabel}</p>
          <p className="immediate-outcome__target">Target: {view.targetDisplayLabel}</p>
        </>
      )
    case 'detective-result':
      return (
        <>
          <p className="immediate-outcome__result">
            {view.result.status === 'visited-nobody'
              ? 'Visited: nobody'
              : `Visited: ${view.result.visitedPlayerDisplayLabel}`}
          </p>
          <p className="immediate-outcome__target">Tracked: {view.targetDisplayLabel}</p>
        </>
      )
  }
}

function getSheriffReason(
  view: Extract<ImmediateNightOutcomeView, Readonly<{ kind: 'sheriff-result' }>>,
): string {
  switch (view.reason) {
    case 'framed-tonight':
      return `${view.targetDisplayLabel} was framed tonight.`
    case 'serial-killer-role':
      return 'Serial Killers appear suspicious.'
    case 'godfather-detection-enabled':
      return 'Godfather detection is enabled for this game.'
    case 'godfather-detection-disabled':
      return 'Godfather detection is disabled for this game.'
    case 'role-appears-suspicious':
      return `${view.targetRoleDisplayName} appears suspicious.`
    case 'role-does-not-appear-suspicious':
      return `${view.targetRoleDisplayName} does not appear suspicious.`
  }
}

function NightError({ error }: Readonly<{ error: NightActionCollectionError }>) {
  return (
    <p className="night-runner__error" role="alert">
      {getNightActionCollectionErrorMessage(error)}
    </p>
  )
}
