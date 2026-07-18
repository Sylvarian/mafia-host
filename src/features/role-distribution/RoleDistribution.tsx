import { useEffect, useRef, useState, type RefObject } from 'react'

import {
  getRoleDistributionProgress,
  selectRoleDistributionRows,
  type ConfirmedRoleDistributionWorkflow,
  type DistributingRolesWorkflow,
  type PlayerId,
  type RoleDistributionError,
} from '@/application/role-assignment/index.ts'

import { getRoleDistributionErrorMessage } from './role-distribution-error.ts'

import './RoleDistribution.css'

type ActiveRoleDistributionWorkflow = DistributingRolesWorkflow | ConfirmedRoleDistributionWorkflow

type RoleDistributionProps = Readonly<{
  workflow: ActiveRoleDistributionWorkflow
  error: RoleDistributionError | null
  beginNightErrorMessage: string | null
  onCardDeliveryChange: (playerId: PlayerId, delivered: boolean) => void
  onConfirmDistribution: () => void
  onReassignRoles: () => void
  onBeginFirstNight: () => void
}>

type Confirmation = 'none' | 'reassign'

export function RoleDistribution({
  workflow,
  error,
  beginNightErrorMessage,
  onCardDeliveryChange,
  onConfirmDistribution,
  onReassignRoles,
  onBeginFirstNight,
}: RoleDistributionProps) {
  const [confirmation, setConfirmation] = useState<Confirmation>('none')
  const confirmationButtonRef = useRef<HTMLButtonElement>(null)
  const reassignButtonRef = useRef<HTMLButtonElement>(null)

  if (workflow.status === 'confirmed') {
    return (
      <section className="distribution-complete" aria-labelledby="distribution-complete-heading">
        <p className="distribution-complete__eyebrow">Restored confirmed distribution</p>
        <h2 id="distribution-complete-heading">Role distribution complete</h2>
        <p className="distribution-complete__lead">Ready to begin the first night</p>
        <p>
          Continue once to assign any required Executioner targets and enter the correct private
          first-night stage. Existing targets will never be rerolled.
        </p>

        {error === null ? null : <DistributionError error={error} />}
        {beginNightErrorMessage === null ? null : (
          <p className="distribution-error" role="alert">
            {beginNightErrorMessage}
          </p>
        )}

        <div className="distribution-complete__actions">
          <button type="button" className="button button--prepare" onClick={onBeginFirstNight}>
            Continue to First Night
          </button>
        </div>
      </section>
    )
  }

  const rows = selectRoleDistributionRows(workflow)
  const progress = getRoleDistributionProgress(workflow)
  const duplicateNames = getDuplicateNames(rows.map((row) => row.playerName))

  return (
    <section className="role-distribution" aria-labelledby="role-distribution-heading">
      <div className="role-distribution__heading">
        <div>
          <p className="role-distribution__eyebrow">Private host view · Phase 3</p>
          <h2 id="role-distribution-heading">Distribute physical role cards</h2>
          <p>
            Hand each participating player the card shown beside their name, then mark it delivered.
          </p>
        </div>
        <div className="delivery-progress" aria-live="polite">
          <strong>
            {progress.deliveredCount} of {progress.totalCount}
          </strong>
          <span>cards delivered</span>
        </div>
      </div>

      <div
        className="delivery-progress-bar"
        role="progressbar"
        aria-label="Physical role cards delivered"
        aria-valuemin={0}
        aria-valuemax={progress.totalCount}
        aria-valuenow={progress.deliveredCount}
      >
        <span
          style={{
            width:
              progress.totalCount === 0
                ? '0%'
                : `${String((progress.deliveredCount / progress.totalCount) * 100)}%`,
          }}
        />
      </div>

      {error === null ? null : <DistributionError error={error} />}
      {beginNightErrorMessage === null ? null : (
        <p className="distribution-error" role="alert">
          {beginNightErrorMessage}
        </p>
      )}

      <ul className="assignment-list" aria-label="Private role assignments">
        {rows.map((row) => {
          const playerLabel = duplicateNames.has(row.playerName)
            ? `${row.playerName} (${row.playerId})`
            : row.playerName

          return (
            <li
              className={`assignment-card assignment-card--${row.faction}${row.delivered ? ' assignment-card--delivered' : ''}`}
              key={row.playerId}
            >
              <div className="assignment-card__player">
                <span>Player</span>
                <h3>{row.playerName}</h3>
                {duplicateNames.has(row.playerName) ? <small>ID {row.playerId}</small> : null}
              </div>
              <div className="assignment-card__role">
                <span className="assignment-card__faction">{formatFaction(row.faction)}</span>
                <strong>{row.roleDisplayName}</strong>
                <p>{row.description}</p>
              </div>
              <label className="card-delivery-control">
                <input
                  type="checkbox"
                  checked={row.delivered}
                  disabled={confirmation !== 'none'}
                  aria-label={`Card delivered to ${playerLabel}`}
                  onChange={(event) => {
                    onCardDeliveryChange(row.playerId, event.currentTarget.checked)
                  }}
                />
                <span aria-hidden="true" />
                <strong>{row.delivered ? 'Card delivered' : 'Mark card delivered'}</strong>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="role-distribution__actions">
        <div>
          <button
            ref={reassignButtonRef}
            type="button"
            className="button button--secondary"
            disabled={confirmation !== 'none'}
            onClick={() => {
              if (progress.deliveredCount === 0) {
                onReassignRoles()
              } else {
                setConfirmation('reassign')
              }
            }}
          >
            Reassign Roles
          </button>
        </div>
        <button
          type="button"
          className="button button--prepare"
          disabled={!progress.isComplete || confirmation !== 'none'}
          onClick={onConfirmDistribution}
        >
          Confirm Distribution and Continue
        </button>
      </div>

      {confirmation === 'reassign' ? (
        <ConfirmationDialog
          key="reassign"
          actionButtonRef={confirmationButtonRef}
          returnFocusRef={reassignButtonRef}
          title="Generate a new assignment?"
          description={
            progress.deliveredCount > 0
              ? `${String(progress.deliveredCount)} card ${progress.deliveredCount === 1 ? 'delivery' : 'deliveries'} will be cleared and every role will be reassigned.`
              : 'Every role will receive a fresh role-instance identity and be assigned again.'
          }
          actionLabel="Yes, reassign roles"
          onConfirm={() => {
            setConfirmation('none')
            onReassignRoles()
          }}
          onCancel={() => {
            setConfirmation('none')
          }}
        />
      ) : null}
    </section>
  )
}

type ConfirmationDialogProps = Readonly<{
  actionButtonRef: RefObject<HTMLButtonElement | null>
  returnFocusRef: RefObject<HTMLButtonElement | null>
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void
  onCancel: () => void
}>

function ConfirmationDialog({
  actionButtonRef,
  returnFocusRef,
  title,
  description,
  actionLabel,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const actionHandledRef = useRef(false)

  useEffect(() => {
    const returnFocusElement = returnFocusRef.current
    actionButtonRef.current?.focus()

    return () => {
      returnFocusElement?.focus()
    }
  }, [actionButtonRef, returnFocusRef])

  return (
    <div
      className="distribution-dialog"
      role="alertdialog"
      aria-label={title}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    >
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="distribution-dialog__actions">
        <button
          ref={actionButtonRef}
          type="button"
          className="button button--danger"
          onClick={() => {
            if (actionHandledRef.current) {
              return
            }

            actionHandledRef.current = true
            onConfirm()
          }}
        >
          {actionLabel}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function DistributionError({ error }: Readonly<{ error: RoleDistributionError }>) {
  return (
    <p className="distribution-error" role="alert">
      {getRoleDistributionErrorMessage(error)}
    </p>
  )
}

function getDuplicateNames(names: readonly string[]): ReadonlySet<string> {
  const seenNames = new Set<string>()
  const duplicateNames = new Set<string>()

  for (const name of names) {
    if (seenNames.has(name)) {
      duplicateNames.add(name)
    }

    seenNames.add(name)
  }

  return duplicateNames
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
