import { useEffect, useRef } from 'react'

import {
  selectCurrentNightStepView,
  selectNightActionReview,
  type ActiveNightActionCollectionWorkflow,
  type CollectingNightActionsWorkflow,
  type CompleteNightActionsWorkflow,
  type CurrentNightStepView,
  type NightActionCollectionError,
  type PlayerId,
  type ReviewingNightActionsWorkflow,
  type RoleInstanceId,
} from '@/application/night-actions/index.ts'

import { getNightActionCollectionErrorMessage } from './night-action-error.ts'

import './NightRunner.css'

type NightRunnerProps = Readonly<{
  workflow: ActiveNightActionCollectionWorkflow
  error: NightActionCollectionError | null
  onSelectTarget: (targetPlayerId: PlayerId) => void
  onContinue: () => void
  onPrevious: () => void
  onEditAction: (actorRoleInstanceId: RoleInstanceId) => void
  onFinalise: () => void
  onResolveNight: () => void
  resolutionErrorMessage: string | null
}>

export function NightRunner({
  workflow,
  error,
  onSelectTarget,
  onContinue,
  onPrevious,
  onEditAction,
  onFinalise,
  onResolveNight,
  resolutionErrorMessage,
}: NightRunnerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusKey =
    workflow.status === 'collecting'
      ? `${workflow.status}-${String(workflow.currentStepIndex)}`
      : workflow.status

  useEffect(() => {
    headingRef.current?.focus()
  }, [focusKey])

  if (workflow.status === 'complete') {
    return (
      <CollectionComplete
        workflow={workflow}
        headingRef={headingRef}
        resolutionErrorMessage={resolutionErrorMessage}
        onResolveNight={onResolveNight}
      />
    )
  }

  if (workflow.status === 'reviewing') {
    return (
      <ActionReview
        workflow={workflow}
        error={error}
        headingRef={headingRef}
        onPrevious={onPrevious}
        onEditAction={onEditAction}
        onFinalise={onFinalise}
      />
    )
  }

  return (
    <CollectionStep
      workflow={workflow}
      error={error}
      headingRef={headingRef}
      onSelectTarget={onSelectTarget}
      onContinue={onContinue}
      onPrevious={onPrevious}
    />
  )
}

type HeadingRef = Readonly<{ current: HTMLHeadingElement | null }>

function CollectionStep({
  workflow,
  error,
  headingRef,
  onSelectTarget,
  onContinue,
  onPrevious,
}: Readonly<{
  workflow: CollectingNightActionsWorkflow
  error: NightActionCollectionError | null
  headingRef: HeadingRef
  onSelectTarget: (targetPlayerId: PlayerId) => void
  onContinue: () => void
  onPrevious: () => void
}>) {
  const step = selectCurrentNightStepView(workflow)

  return (
    <section className="night-runner" aria-labelledby="night-runner-heading">
      <header className="night-runner__header">
        <div>
          <p className="night-runner__eyebrow">Private host view · Night {step.nightNumber}</p>
          <h2 id="night-runner-heading" ref={headingRef} tabIndex={-1}>
            {getStepHeading(step)}
          </h2>
        </div>
        <div className="night-runner__progress" aria-live="polite">
          <strong>
            {step.position} of {step.totalSteps}
          </strong>
          <span>sequence steps</span>
        </div>
      </header>

      {error === null ? null : <NightError error={error} />}

      {step.type === 'night-opening' ? (
        <div className="night-instruction">
          <strong>Everyone, close your eyes.</strong>
          <p>The host remains responsible for speaking this instruction to the room.</p>
        </div>
      ) : null}

      {step.type === 'mafia-opening' ? (
        <div className="night-instruction night-instruction--mafia">
          <strong>Ask the Mafia to open their eyes.</strong>
          <p>These identities are private to the host.</p>
          <ul aria-label="Living Mafia overview">
            {step.mafiaMembers.map((member) => (
              <li key={member.playerId}>
                <span>
                  {member.playerName}
                  {member.showStableId ? <small> ID {member.playerId}</small> : null}
                </span>
                <strong>{member.roleDisplayName}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.type === 'mafia-closing' ? (
        <div className="night-instruction night-instruction--mafia">
          <strong>Ask the Mafia to close their eyes.</strong>
          <p>Continue with each individual living role instance.</p>
        </div>
      ) : null}

      {step.type === 'actor-action' ? (
        <div className={`actor-action actor-action--${step.faction}`}>
          <div className="actor-action__identity">
            <span>{formatFaction(step.faction)}</span>
            <strong>{step.roleDisplayName}</strong>
            <p>
              {step.actorPlayerName}
              {step.showActorStableId ? <small> ID {step.actorPlayerId}</small> : null}
            </p>
          </div>
          <p className="actor-action__prompt">{step.hostPrompt}</p>
          {step.selectedTargetId === null ? null : (
            <p className="actor-action__selection" aria-live="polite">
              Previously selected target restored. Choose another target to replace it.
            </p>
          )}
          <div
            className="target-grid"
            role="group"
            aria-label={`Targets for ${step.roleDisplayName}`}
          >
            {step.targetOptions.map((target) => {
              const reasonId = `target-reason-${target.playerId}`
              const reason =
                target.disabledReason === null
                  ? null
                  : getNightActionCollectionErrorMessage(target.disabledReason)
              const playerLabel = target.showStableId
                ? `${target.playerName} (${target.playerId})`
                : target.playerName

              return (
                <div className="target-option" key={target.playerId}>
                  <button
                    type="button"
                    className={target.selected ? 'target-button is-selected' : 'target-button'}
                    disabled={!target.enabled}
                    aria-pressed={target.selected}
                    aria-describedby={reason === null ? undefined : reasonId}
                    aria-label={`${playerLabel}, ${target.alive ? 'alive' : 'dead'}${reason === null ? '' : `, unavailable: ${reason}`}`}
                    onClick={() => {
                      onSelectTarget(target.playerId)
                    }}
                  >
                    <strong>{target.playerName}</strong>
                    {target.showStableId ? <small>ID {target.playerId}</small> : null}
                    <span>
                      {target.alive ? 'Alive' : 'Dead'} ·{' '}
                      {target.selected
                        ? 'Selected target'
                        : target.enabled
                          ? 'Available'
                          : 'Unavailable'}
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
      ) : null}

      <div className="night-runner__actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={workflow.currentStepIndex === 0}
          onClick={onPrevious}
        >
          Previous
        </button>
        <button
          type="button"
          className="button button--prepare"
          disabled={step.type === 'actor-action' && step.selectedTargetId === null}
          onClick={onContinue}
        >
          {step.type === 'actor-action' ? 'Confirm Target / Continue' : 'Continue'}
        </button>
      </div>
    </section>
  )
}

function ActionReview({
  workflow,
  error,
  headingRef,
  onPrevious,
  onEditAction,
  onFinalise,
}: Readonly<{
  workflow: ReviewingNightActionsWorkflow
  error: NightActionCollectionError | null
  headingRef: HeadingRef
  onPrevious: () => void
  onEditAction: (actorRoleInstanceId: RoleInstanceId) => void
  onFinalise: () => void
}>) {
  const rows = selectNightActionReview(workflow)

  return (
    <section className="night-runner night-review" aria-labelledby="night-review-heading">
      <p className="night-runner__eyebrow">
        Private host review · Night {workflow.game.nightNumber}
      </p>
      <h2 id="night-review-heading" ref={headingRef} tabIndex={-1}>
        Review collected night actions
      </h2>
      <p>No effects or outcomes have been calculated.</p>
      {error === null ? null : <NightError error={error} />}
      <ol className="night-review__list">
        {rows.map((row) => (
          <li key={row.actorRoleInstanceId}>
            <div>
              <strong>{row.roleDisplayName}</strong>
              <span>
                {row.actorPlayerName}
                {row.showActorStableId ? ` (${row.actorPlayerId})` : ''} → {row.actionDescription}{' '}
                {row.targetPlayerName}
                {row.showTargetStableId ? ` (${row.targetPlayerId})` : ''}
              </span>
            </div>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                onEditAction(row.actorRoleInstanceId)
              }}
            >
              Edit {row.roleDisplayName} action for {row.actorPlayerName}
              {row.showActorStableId ? ` (${row.actorPlayerId})` : ''}
            </button>
          </li>
        ))}
      </ol>
      <div className="night-runner__actions">
        <button type="button" className="button button--secondary" onClick={onPrevious}>
          Previous
        </button>
        <button type="button" className="button button--prepare" onClick={onFinalise}>
          Finish Collecting Night Actions
        </button>
      </div>
    </section>
  )
}

function CollectionComplete({
  workflow,
  headingRef,
  resolutionErrorMessage,
  onResolveNight,
}: Readonly<{
  workflow: CompleteNightActionsWorkflow
  headingRef: HeadingRef
  resolutionErrorMessage: string | null
  onResolveNight: () => void
}>) {
  return (
    <section className="night-runner night-complete" aria-labelledby="night-complete-heading">
      <p className="night-runner__eyebrow">
        Night {workflow.game.nightNumber} · Collection complete
      </p>
      <h2 id="night-complete-heading" ref={headingRef} tabIndex={-1}>
        Night actions collected
      </h2>
      <p className="night-complete__lead">Ready to resolve night results</p>
      <p>
        {workflow.collectedActions.actions.length} action
        {workflow.collectedActions.actions.length === 1 ? '' : 's'} recorded as intent. The game
        remains in night-action-collection.
      </p>
      {resolutionErrorMessage === null ? null : (
        <p className="night-runner__error" role="alert">
          {resolutionErrorMessage}
        </p>
      )}
      <button type="button" className="button button--prepare" onClick={onResolveNight}>
        Resolve Night
      </button>
    </section>
  )
}

function NightError({ error }: Readonly<{ error: NightActionCollectionError }>) {
  return (
    <p className="night-runner__error" role="alert">
      {getNightActionCollectionErrorMessage(error)}
    </p>
  )
}

function getStepHeading(step: CurrentNightStepView): string {
  switch (step.type) {
    case 'night-opening':
      return 'Begin the night deliberately'
    case 'mafia-opening':
      return 'Living Mafia overview'
    case 'actor-action':
      return `Collect ${step.roleDisplayName} action for ${step.actorPlayerName}${step.showActorStableId ? ` (${step.actorPlayerId})` : ''}`
    case 'mafia-closing':
      return 'Close the Mafia wake window'
  }
}

function formatFaction(faction: 'mafia' | 'town' | 'neutral'): string {
  switch (faction) {
    case 'mafia':
      return 'Mafia'
    case 'town':
      return 'Town'
    case 'neutral':
      return 'Neutral'
  }
}
