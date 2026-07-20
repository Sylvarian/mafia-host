import { useEffect, useRef, useState, type RefObject } from 'react'

import {
  selectRoleDistributionRows,
  type ConfirmedRoleDistributionWorkflow,
  type DistributingRolesWorkflow,
  type RoleDistributionError,
} from '@/application/role-assignment/index.ts'

import { getRoleDistributionErrorMessage } from './role-distribution-error.ts'

import './RoleDistribution.css'

type ActiveRoleDistributionWorkflow = DistributingRolesWorkflow | ConfirmedRoleDistributionWorkflow

type RoleDistributionProps = Readonly<{
  workflow: ActiveRoleDistributionWorkflow
  error: RoleDistributionError | null
  beginNightErrorMessage: string | null
  onConfirmAllRoleCardsDelivered: () => void
  onReassignRoles: () => void
  onBeginFirstNight: () => void
}>

export function RoleDistribution({
  workflow,
  error,
  beginNightErrorMessage,
  onConfirmAllRoleCardsDelivered,
  onReassignRoles,
  onBeginFirstNight,
}: RoleDistributionProps) {
  const [reassignConfirmationOpen, setReassignConfirmationOpen] = useState(false)
  const confirmationButtonRef = useRef<HTMLButtonElement>(null)
  const reassignButtonRef = useRef<HTMLButtonElement>(null)

  if (workflow.status === 'confirmed') {
    return (
      <section className="distribution-complete" aria-labelledby="distribution-complete-heading">
        <p className="distribution-complete__eyebrow">Restored completed delivery</p>
        <h2 id="distribution-complete-heading">Role-card delivery complete</h2>
        <p className="distribution-complete__lead">Ready to begin the first night</p>
        <p>
          This legacy save already recorded every role card as delivered. Continue once to assign
          any required Executioner targets without reassigning roles.
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
  const duplicateNames = getDuplicateNames(rows.map((row) => row.playerName))
  const roleCardsAvailable = rows.length > 0 && rows.length === workflow.game.players.length

  return (
    <section className="role-distribution" aria-labelledby="role-distribution-heading">
      <div className="role-distribution__heading">
        <div>
          <p className="role-distribution__eyebrow">Private host view</p>
          <h2 id="role-distribution-heading">Distribute physical role cards</h2>
          <p>
            Privately hand every participating player the card shown beside their name. Confirm only
            after every card has been delivered.
          </p>
        </div>
      </div>

      <p className="role-distribution__privacy-warning">
        <strong>HOST-ONLY VIEW</strong> — keep role assignments hidden from players.
      </p>

      {error === null ? null : <DistributionError error={error} />}
      {beginNightErrorMessage === null ? null : (
        <p className="distribution-error" role="alert">
          {beginNightErrorMessage}
        </p>
      )}

      <ul className="assignment-list" aria-label="Private role assignments">
        {rows.map((row) => (
          <li className={`assignment-card assignment-card--${row.faction}`} key={row.playerId}>
            <div className="assignment-card__player">
              <span>Player</span>
              <h3>{row.playerName}</h3>
              {duplicateNames.has(row.playerName) ? (
                <small>
                  Player{' '}
                  {String(
                    workflow.game.players.findIndex((player) => player.playerId === row.playerId) +
                      1,
                  )}
                </small>
              ) : null}
            </div>
            <div className="assignment-card__role">
              <span className="assignment-card__faction">{formatFaction(row.faction)}</span>
              <strong>{row.roleDisplayName}</strong>
              <p>{row.description}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="role-distribution__actions">
        <button
          ref={reassignButtonRef}
          type="button"
          className="button button--secondary"
          disabled={reassignConfirmationOpen}
          onClick={() => {
            setReassignConfirmationOpen(true)
          }}
        >
          Reassign Roles
        </button>
        <button
          type="button"
          className="button button--prepare"
          disabled={!roleCardsAvailable || reassignConfirmationOpen}
          onClick={onConfirmAllRoleCardsDelivered}
        >
          Confirm all role cards delivered
        </button>
      </div>

      {reassignConfirmationOpen ? (
        <ConfirmationDialog
          actionButtonRef={confirmationButtonRef}
          returnFocusRef={reassignButtonRef}
          title="Generate a new assignment?"
          description="Every role will receive a fresh role-instance identity and be assigned again. Any cards already handed out must be replaced."
          actionLabel="Yes, reassign roles"
          onConfirm={() => {
            setReassignConfirmationOpen(false)
            onReassignRoles()
          }}
          onCancel={() => {
            setReassignConfirmationOpen(false)
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
