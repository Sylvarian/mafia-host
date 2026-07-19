import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  type ActiveNightActionCollectionWorkflow,
  type NightActionCollectionError,
  type PlayerId,
  ROLE_IDS,
} from '@/application/night-actions/index.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { NightRunner } from './NightRunner.tsx'

function startedWorkflow(
  roles: Parameters<typeof createNightFixture>[0],
): ActiveNightActionCollectionWorkflow {
  const fixture = createNightFixture(roles, {
    phase: 'night-action-collection',
    nightNumber: 2,
    settings: { allowFirstNightKills: true, doctorCanSelfProtect: true },
  })
  const result = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
  if (!result.ok) throw new Error(`Could not start night: ${result.error.type}`)
  return result.value
}

function NightHarness({
  initialWorkflow,
}: Readonly<{ initialWorkflow: ActiveNightActionCollectionWorkflow }>) {
  const [workflow, setWorkflow] = useState(initialWorkflow)
  const [error, setError] = useState<NightActionCollectionError | null>(null)
  const operationPendingRef = useRef(false)

  useEffect(() => {
    operationPendingRef.current = false
  }, [workflow, error])

  function apply(
    operation: () =>
      | Readonly<{ ok: true; value: ActiveNightActionCollectionWorkflow }>
      | Readonly<{ ok: false; error: NightActionCollectionError }>,
  ): void {
    if (operationPendingRef.current) return
    operationPendingRef.current = true
    const result = operation()
    if (result.ok) {
      setWorkflow(result.value)
      setError(null)
    } else {
      operationPendingRef.current = false
      setError(result.error)
    }
  }

  return (
    <NightRunner
      workflow={workflow}
      error={error}
      onConfirmTarget={(targetPlayerId) => {
        apply(() => confirmNightActionTarget(workflow, targetPlayerId))
      }}
      onContinue={() => {
        apply(() => continueNightActionCollection(workflow))
      }}
    />
  )
}

function actorWorkflow(
  workflow: ActiveNightActionCollectionWorkflow,
  roleId: string,
): ActiveNightActionCollectionWorkflow {
  const index = workflow.steps.findIndex((step) => {
    if (step.type !== 'actor-action') return false
    return workflow.game.players.some(
      (player) =>
        player.role.instanceId === step.actorRoleInstanceId && player.role.roleId === roleId,
    )
  })
  if (index < 0 || workflow.status !== 'collecting') {
    throw new Error(`Could not find actor step for ${roleId}.`)
  }
  return { ...workflow, currentStepIndex: index }
}

describe('sequential Night Runner UI', () => {
  it('shows host-safe player, role, faction, availability, and faction treatments', () => {
    const workflow = actorWorkflow(
      startedWorkflow([
        { roleId: ROLE_IDS.doctor, name: 'Host Doctor' },
        { roleId: ROLE_IDS.godfather, name: 'Alex' },
        { roleId: ROLE_IDS.citizen, name: 'Alex' },
        { roleId: ROLE_IDS.serialKiller, name: 'Neutral target' },
      ]),
      ROLE_IDS.doctor,
    )
    render(
      <NightRunner
        workflow={workflow}
        error={null}
        onConfirmTarget={() => undefined}
        onContinue={() => undefined}
      />,
    )

    const group = screen.getByRole('group', { name: 'Targets for Doctor' })
    const mafia = within(group).getByRole('button', {
      name: /Alex \(Player 2\), Godfather, Mafia, alive, available/,
    })
    const town = within(group).getByRole('button', {
      name: /Alex \(Player 3\), Citizen, Town, alive, available/,
    })
    const neutral = within(group).getByRole('button', {
      name: /Neutral target, Serial Killer, Neutral, alive, available/,
    })

    expect(mafia).toHaveClass('target-button--mafia')
    expect(town).toHaveClass('target-button--town')
    expect(neutral).toHaveClass('target-button--neutral')
    expect(within(mafia).getByText('Godfather · Mafia')).toBeVisible()
    expect(within(town).getByText('Citizen · Town')).toBeVisible()
    expect(within(neutral).getByText('Serial Killer · Neutral')).toBeVisible()
    expect(screen.queryByText(/role-instance-|night-fixture-game/)).toBeNull()

    fireEvent.click(town)
    expect(town).toHaveClass('is-selected')
    expect(town).toHaveAttribute('aria-pressed', 'true')
    expect(within(town).getByText('Alive — selected')).toBeVisible()
  })

  it('keeps target rows responsive at 320px and 390px with 44px-plus touch controls', () => {
    const css = readFileSync(resolve('src/features/night-runner/NightRunner.css'), 'utf8')

    expect(css).toMatch(
      /\.target-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*12rem\),\s*1fr\)\)/,
    )
    expect(css).toMatch(/\.target-button\s*\{[\s\S]*?min-height:\s*4\.5rem;/)
    expect(4.5 * 16).toBeGreaterThanOrEqual(44)
    expect(css).toMatch(/@media \(max-width:\s*24\.5rem\)/)
    expect(320).toBeLessThanOrEqual(24.5 * 16)
    expect(390).toBeLessThanOrEqual(24.5 * 16)
  })

  it('keeps unavailable targets visible with their role and faction', () => {
    const workflow = actorWorkflow(
      startedWorkflow([
        { roleId: ROLE_IDS.doctor, name: 'Doctor' },
        { roleId: ROLE_IDS.citizen, name: 'Dead target', alive: false },
        { roleId: ROLE_IDS.citizen, name: 'Living target' },
      ]),
      ROLE_IDS.doctor,
    )
    render(
      <NightRunner
        workflow={workflow}
        error={null}
        onConfirmTarget={() => undefined}
        onContinue={() => undefined}
      />,
    )

    const unavailable = screen.getByRole('button', {
      name: /Dead target, Citizen 1, Town, dead, unavailable/,
    })
    expect(unavailable).toBeDisabled()
    expect(unavailable).toHaveClass('target-button--town')
    expect(within(unavailable).getByText('Citizen 1 · Town')).toBeVisible()
    expect(within(unavailable).getByText('Dead — unavailable')).toBeVisible()
  })

  it('keeps target selection temporary until explicit confirmation', () => {
    const workflow = actorWorkflow(
      startedWorkflow([
        { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
        { roleId: ROLE_IDS.citizen, name: 'Citizen' },
      ]),
      ROLE_IDS.sheriff,
    )
    const onConfirmTarget = vi.fn<(targetPlayerId: PlayerId) => void>()
    render(
      <NightRunner
        workflow={workflow}
        error={null}
        onConfirmTarget={onConfirmTarget}
        onContinue={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Citizen, Citizen, Town/ }))
    expect(onConfirmTarget).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))
    expect(onConfirmTarget).toHaveBeenCalledTimes(1)
    expect(onConfirmTarget).toHaveBeenCalledWith('player-2')
  })

  it('advances a non-informational action directly without rendering a result screen', () => {
    const workflow = actorWorkflow(
      startedWorkflow([
        { roleId: ROLE_IDS.framer, name: 'Framer' },
        { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
        { roleId: ROLE_IDS.citizen, name: 'Citizen' },
      ]),
      ROLE_IDS.framer,
    )
    render(<NightHarness initialWorkflow={workflow} />)

    fireEvent.click(screen.getByRole('button', { name: /Citizen, Citizen, Town/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target and continue' }))

    expect(screen.getByRole('heading', { name: /Wake Sheriff/ })).toHaveFocus()
    expect(screen.queryByText('Action recorded')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acknowledge result' })).toBeNull()
    expect(screen.queryByText('Outcome acknowledged')).toBeNull()
  })

  it('shows one current immediate result and advances with its only action', () => {
    const workflow = actorWorkflow(
      startedWorkflow([
        { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
        { roleId: ROLE_IDS.jester, name: 'Target' },
      ]),
      ROLE_IDS.sheriff,
    )
    render(<NightHarness initialWorkflow={workflow} />)

    fireEvent.click(screen.getByRole('button', { name: /Target, Jester, Neutral/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))

    const resultHeading = screen.getByRole('heading', { name: 'Sheriff result' })
    expect(resultHeading).toHaveFocus()
    expect(screen.getByText('Not suspicious')).toBeVisible()
    expect(screen.getByText(/Private screen/)).toBeVisible()
    expect(screen.queryByText('Action recorded')).toBeNull()

    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Continue to next actor' }))
    expect(screen.getByRole('heading', { name: 'Final night resolution prepared' })).toHaveFocus()
    expect(screen.queryByText('Not suspicious')).toBeNull()
    expect(screen.queryByText('Target: Target')).toBeNull()
    expect(screen.queryByText('Outcome acknowledged')).toBeNull()
  })

  it('shows the immediate four-role Group D card without revealing the actual role', () => {
    const workflow = actorWorkflow(
      startedWorkflow([
        { roleId: ROLE_IDS.investigator, name: 'Investigator' },
        { roleId: ROLE_IDS.jester, name: 'Target' },
      ]),
      ROLE_IDS.investigator,
    )
    render(<NightHarness initialWorkflow={workflow} />)

    fireEvent.click(screen.getByRole('button', { name: /Target, Jester, Neutral/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))

    expect(screen.getByRole('heading', { name: 'Investigator result' })).toHaveFocus()
    expect(screen.getByText('Group D')).toBeVisible()
    expect(screen.getByText('Consigliere · Serial Killer · Jester · Citizen')).toBeVisible()
    expect(screen.queryByText(/actual role|framed/i)).toBeNull()
  })

  it('renders a strong BLOCKED screen without target or result controls', () => {
    let workflow = startedWorkflow([
      { roleId: ROLE_IDS.consort, name: 'Consort' },
      { roleId: ROLE_IDS.doctor, name: 'Doctor' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    const overview = continueNightActionCollection(workflow)
    if (!overview.ok || overview.value.status !== 'collecting') {
      throw new Error('Could not pass overview.')
    }
    const doctor = overview.value.game.players[1]
    if (doctor === undefined) throw new Error('Expected blocked Doctor.')
    const consort = confirmNightActionTarget(overview.value, doctor.playerId)
    if (!consort.ok) throw new Error('Could not confirm Consort.')
    if (consort.value.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Could not reach blocked Doctor.')
    }
    workflow = consort.value

    render(
      <NightRunner
        workflow={workflow}
        error={null}
        onConfirmTarget={() => undefined}
        onContinue={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'BLOCKED' })).toHaveFocus()
    expect(screen.getByText('Your action cannot be performed tonight.')).toBeVisible()
    expect(screen.queryByRole('group', { name: /Targets for/ })).toBeNull()
    expect(screen.queryByText(/No result/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue to next actor' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Acknowledge result' })).toBeNull()
  })
})
