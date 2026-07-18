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
  onAcknowledgeOutcome: () => void
}>

export function NightRunner({
  workflow,
  error,
  onConfirmTarget,
  onContinue,
  onAcknowledgeOutcome,
}: NightRunnerProps) {
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
        onAcknowledge={onAcknowledgeOutcome}
      />
    )
  }

  if (workflow.status === 'outcome-acknowledged') {
    return (
      <OutcomeAcknowledged
        nightNumber={workflow.game.nightNumber}
        finalActor={workflow.currentStepIndex === workflow.steps.length - 1}
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

  return (
    <section className="night-runner" aria-labelledby="night-runner-heading">
      <header className="night-runner__header">
        <div>
          <p className="night-runner__eyebrow">Private host view · Night {step.nightNumber}</p>
          <h2 id="night-runner-heading" ref={headingRef} tabIndex={-1}>
            {step.type === 'mafia-overview'
              ? 'Living Mafia overview'
              : `Wake ${step.roleDisplayName} — ${step.actorDisplayLabel}`}
          </h2>
        </div>
        <div className="night-runner__progress" aria-live="polite">
          <strong>
            {step.position} of {step.totalSteps}
          </strong>
          <span>wake steps</span>
        </div>
      </header>

      <PrivacyWarning />
      {error === null ? null : <NightError error={error} />}

      {step.type === 'mafia-overview' ? (
        <div className="night-instruction night-instruction--mafia">
          <strong>Ask the Mafia to open their eyes.</strong>
          <p>Review the participating Mafia team. This is an overview, not an action.</p>
          <ul aria-label="Living Mafia overview">
            {step.mafiaMembers.map((member) => (
              <li key={member.playerId}>
                <span>{member.playerDisplayLabel}</span>
                <strong>{member.roleDisplayName}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={`actor-action actor-action--${step.faction}`}>
          <div className="actor-action__identity">
            <span>{step.factionLabel}</span>
            <strong>{step.roleDisplayName}</strong>
            <p>{step.actorDisplayLabel}</p>
          </div>
          <p className="actor-action__prompt">{step.hostPrompt}</p>
          <p className="actor-action__finality">
            Confirming this target finalizes the action. Earlier actions cannot be changed after
            their result is acknowledged.
          </p>
          <div
            className="target-grid"
            role="group"
            aria-label={`Targets for ${step.roleDisplayName}`}
          >
            {step.targetOptions.map((target) => {
              const selected = target.playerId === selectedTargetId
              const reasonId = `target-reason-${target.playerId}`
              const reason =
                target.disabledReason === null
                  ? null
                  : getNightActionCollectionErrorMessage(target.disabledReason)

              return (
                <div className="target-option" key={target.playerId}>
                  <button
                    type="button"
                    className={`target-button target-button--${target.faction}${selected ? ' is-selected' : ''}`}
                    disabled={!target.enabled}
                    aria-pressed={selected}
                    aria-describedby={reason === null ? undefined : reasonId}
                    aria-label={`${target.playerDisplayLabel}, ${target.roleDisplayName}, ${target.factionLabel}, ${target.alive ? 'alive' : 'dead'}, ${selected ? 'selected' : target.enabled ? 'available' : 'unavailable'}`}
                    onClick={() => {
                      setSelectedTargetId(target.playerId)
                    }}
                  >
                    <strong>{target.playerDisplayLabel}</strong>
                    <span className="target-button__role">
                      {target.roleDisplayName} · {target.factionLabel}
                    </span>
                    <span>
                      {target.alive ? 'Alive' : 'Dead'} —{' '}
                      {selected ? 'selected' : target.enabled ? 'available' : 'unavailable'}
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
          {step.type === 'actor-action' ? 'Confirm Target / Continue' : 'Continue'}
        </button>
      </div>
    </section>
  )
}

function ImmediateOutcome({
  view,
  error,
  headingRef,
  onAcknowledge,
}: Readonly<{
  view: ImmediateNightOutcomeView
  error: NightActionCollectionError | null
  headingRef: HeadingRef
  onAcknowledge: () => void
}>) {
  return (
    <section
      className={`immediate-outcome${view.kind === 'blocked' ? ' immediate-outcome--blocked' : ''}`}
      aria-labelledby="immediate-outcome-heading"
    >
      <PrivacyWarning />
      <p className="immediate-outcome__actor">
        {view.roleDisplayName} · {view.actorDisplayLabel}
      </p>
      <h2 id="immediate-outcome-heading" ref={headingRef} tabIndex={-1}>
        {getOutcomeHeading(view)}
      </h2>
      <ImmediateOutcomeContent view={view} />
      {error === null ? null : <NightError error={error} />}
      <button type="button" className="button button--prepare" onClick={onAcknowledge}>
        Acknowledge result
      </button>
    </section>
  )
}

function ImmediateOutcomeContent({ view }: Readonly<{ view: ImmediateNightOutcomeView }>) {
  switch (view.kind) {
    case 'blocked':
      return <p className="immediate-outcome__message">Your action cannot be performed tonight.</p>
    case 'action-recorded':
      return (
        <>
          <p className="immediate-outcome__message">Your target has been confirmed.</p>
          <p className="immediate-outcome__target">Target: {view.targetDisplayLabel}</p>
        </>
      )
    case 'sheriff-result':
      return (
        <>
          <p className="immediate-outcome__result">
            {view.status === 'suspicious' ? 'Suspicious' : 'Not suspicious'}
          </p>
          <p className="immediate-outcome__target">Target: {view.targetDisplayLabel}</p>
        </>
      )
    case 'investigation-result':
      return (
        <>
          <p className="immediate-outcome__result">{view.groupLabel}</p>
          <p className="immediate-outcome__group">{view.groupRoleDisplayNames.join(' · ')}</p>
          <p className="immediate-outcome__target">Target: {view.targetDisplayLabel}</p>
        </>
      )
    case 'detective-result':
      return (
        <>
          <p className="immediate-outcome__result">
            {view.result.status === 'visited-nobody'
              ? `${view.targetDisplayLabel} visited nobody`
              : `${view.targetDisplayLabel} visited ${view.result.visitedPlayerDisplayLabel}`}
          </p>
          <p className="immediate-outcome__target">Tracked: {view.targetDisplayLabel}</p>
        </>
      )
  }
}

function OutcomeAcknowledged({
  nightNumber,
  finalActor,
  error,
  headingRef,
  onContinue,
}: Readonly<{
  nightNumber: number
  finalActor: boolean
  error: NightActionCollectionError | null
  headingRef: HeadingRef
  onContinue: () => void
}>) {
  return (
    <section className="night-runner outcome-acknowledged" aria-labelledby="outcome-acknowledged">
      <p className="night-runner__eyebrow">Night {nightNumber}</p>
      <h2 id="outcome-acknowledged" ref={headingRef} tabIndex={-1}>
        Outcome acknowledged
      </h2>
      <p>The private outcome is sealed and is no longer displayed.</p>
      {error === null ? null : <NightError error={error} />}
      <button type="button" className="button button--prepare" onClick={onContinue}>
        {finalActor ? 'Complete Night Actions' : 'Continue to next actor'}
      </button>
    </section>
  )
}

function PrivacyWarning() {
  return (
    <p className="night-runner__privacy">
      Private screen — make sure only the current player can see this information.
    </p>
  )
}

function NightError({ error }: Readonly<{ error: NightActionCollectionError }>) {
  return (
    <p className="night-runner__error" role="alert">
      {getNightActionCollectionErrorMessage(error)}
    </p>
  )
}

function getOutcomeHeading(view: ImmediateNightOutcomeView): string {
  switch (view.kind) {
    case 'blocked':
      return 'BLOCKED'
    case 'action-recorded':
      return 'Action recorded'
    case 'sheriff-result':
      return 'Sheriff result'
    case 'investigation-result':
      return `${view.investigationRole === 'investigator' ? 'Investigator' : 'Consigliere'} result`
    case 'detective-result':
      return 'Detective result'
  }
}
