import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useEffect, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  acknowledgeExecutionerBriefing,
  createExecutionerBriefingWorkflow,
  nextExecutionerBriefing,
  previousExecutionerBriefing,
  selectExecutionerBriefingView,
  type ActiveExecutionerBriefingWorkflow,
  type ExecutionerBriefingError,
  type ExecutionerBriefingId,
} from '@/application/executioner-briefing/index.ts'
import {
  createNightFixture,
  FIXTURE_ROLE_IDS as ROLE_IDS,
  nightFixturePlayerId,
} from '../../../tests/support/night-action-fixtures.ts'
import { getExecutionerBriefingErrorMessage } from './executioner-briefing-error.ts'
import { ExecutionerBriefing } from './ExecutionerBriefing.tsx'

type BriefingFixture = ReturnType<typeof briefingFixture>

function BriefingHarness({ fixture }: Readonly<{ fixture: BriefingFixture }>) {
  const [workflow, setWorkflow] = useState(() => requireWorkflow(fixture))
  const [error, setError] = useState<ExecutionerBriefingError | null>(null)
  const [nightBeginCount, setNightBeginCount] = useState(0)
  const operationPendingRef = useRef(false)

  useEffect(() => {
    operationPendingRef.current = false
  }, [workflow, error, nightBeginCount])

  function applyOperation(
    operation: () =>
      | Readonly<{ ok: true; value: ActiveExecutionerBriefingWorkflow }>
      | Readonly<{ ok: false; error: ExecutionerBriefingError }>,
  ): void {
    if (operationPendingRef.current) return
    operationPendingRef.current = true
    const result = operation()
    if (result.ok) {
      setWorkflow(result.value)
      setError(null)
    } else {
      setError(result.error)
    }
  }

  return (
    <>
      <ExecutionerBriefing
        view={selectExecutionerBriefingView(fixture.game, fixture.participants, workflow)}
        errorMessage={error === null ? null : getExecutionerBriefingErrorMessage(error)}
        onAcknowledge={(briefingId: ExecutionerBriefingId) => {
          applyOperation(() => acknowledgeExecutionerBriefing(fixture.game, workflow, briefingId))
        }}
        onPrevious={() => {
          applyOperation(() => previousExecutionerBriefing(fixture.game, workflow))
        }}
        onNext={() => {
          applyOperation(() => nextExecutionerBriefing(fixture.game, workflow))
        }}
        onBeginNight={() => {
          if (operationPendingRef.current) return
          operationPendingRef.current = true
          setNightBeginCount((count) => count + 1)
        }}
      />
      <output aria-label="Night begin count">{nightBeginCount}</output>
    </>
  )
}

describe('private Executioner briefing UI', () => {
  it('renders only the current private briefing with no target-role disclosure', () => {
    const fixture = briefingFixture()
    const consoleLog = vi.spyOn(console, 'log')
    const originalTitle = document.title
    const originalUrl = window.location.href

    render(<BriefingHarness fixture={fixture} />)

    expect(screen.getByText('Private Executioner briefing')).toBeVisible()
    expect(
      screen.getByText('Ask everyone except the named Executioner to look away.'),
    ).toBeVisible()
    expect(screen.getByText('Tell this Executioner their target privately.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Executioner 1 — Jordan (Player 1)' })).toHaveFocus()
    expect(screen.getByText('Your target is Alex (Player 3).')).toBeVisible()
    expect(
      screen.getByText('You personally win if Alex (Player 3) is executed during the day.'),
    ).toBeVisible()
    expect(document.body).not.toHaveTextContent(/player-[1-5]/)
    expect(document.body).not.toHaveTextContent('player-2')
    expect(document.body).not.toHaveTextContent('player-4')
    expect(document.body).not.toHaveTextContent('Citizen')
    expect(document.body).not.toHaveTextContent('Sheriff')
    expect(screen.getByText('1 of 2')).toBeVisible()
    expect(screen.getByText('0 briefings acknowledged')).toBeVisible()
    expect(document.title).toBe(originalTitle)
    expect(window.location.href).toBe(originalUrl)
    expect(consoleLog).not.toHaveBeenCalled()
  })

  it('tracks acknowledgement, moves focus, and retains review evidence', () => {
    render(<BriefingHarness fixture={briefingFixture()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as briefed' }))
    expect(screen.getByText('1 briefing acknowledged')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Begin Night 1' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Executioner 2 — Jordan (Player 2)' })).toHaveFocus()
    expect(screen.getByText('Your target is Alex (Player 4).')).toBeVisible()
    expect(document.body).not.toHaveTextContent('player-3')

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Executioner 1 — Jordan (Player 1)' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Next' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Mark as briefed' })).toBeNull()
  })

  it('uses a deliberate inert confirmation gate with Escape and focus restoration', () => {
    render(<BriefingHarness fixture={briefingFixture()} />)
    acknowledgeEveryBriefing()

    const beginButton = screen.getByRole('button', { name: 'Begin Night 1' })
    expect(beginButton).toBeEnabled()
    fireEvent.click(beginButton)

    const dialog = screen.getByRole('alertdialog', { name: 'Begin Night 1?' })
    expect(within(dialog).getByRole('button', { name: 'Confirm and Begin Night 1' })).toHaveFocus()
    expect(document.querySelector('.executioner-briefing__content')).toHaveAttribute('inert')

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog', { name: 'Begin Night 1?' })).toBeNull()
    expect(beginButton).toHaveFocus()
    expect(screen.getByLabelText('Night begin count')).toHaveTextContent('0')
  })

  it('guards rapid repeated completion clicks so Night 1 begins once', () => {
    render(<BriefingHarness fixture={briefingFixture()} />)
    acknowledgeEveryBriefing()
    fireEvent.click(screen.getByRole('button', { name: 'Begin Night 1' }))
    const confirmation = screen.getByRole('button', {
      name: 'Confirm and Begin Night 1',
    })

    act(() => {
      confirmation.click()
      confirmation.click()
    })

    expect(screen.getByLabelText('Night begin count')).toHaveTextContent('1')
  })

  it('owns a 320px and 390px single-column layout with at least 44px touch controls', () => {
    const css = readFileSync(
      resolve('src/features/executioner-briefing/ExecutionerBriefing.css'),
      'utf8',
    )

    expect(css).toContain('@media (max-width: 32rem)')
    expect(css).toMatch(/\.executioner-briefing__actions > \.button,[\s\S]*?width: 100%;/)
    expect(css).toMatch(/\.executioner-briefing \.button,[\s\S]*?min-height: 2\.75rem;/)
  })
})

function acknowledgeEveryBriefing(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Mark as briefed' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mark as briefed' }))
}

function briefingFixture() {
  return createNightFixture(
    [
      {
        roleId: ROLE_IDS.executioner,
        name: 'Jordan',
        executionerTargetId: nightFixturePlayerId('player-3'),
      },
      {
        roleId: ROLE_IDS.executioner,
        name: 'Jordan',
        executionerTargetId: nightFixturePlayerId('player-4'),
      },
      { roleId: ROLE_IDS.citizen, name: 'Alex' },
      { roleId: ROLE_IDS.sheriff, name: 'Alex' },
      { roleId: ROLE_IDS.godfather, name: 'Casey' },
    ],
    { phase: 'executioner-briefing', nightNumber: 1 },
  )
}

function requireWorkflow(fixture: BriefingFixture): ActiveExecutionerBriefingWorkflow {
  const result = createExecutionerBriefingWorkflow(fixture.game)
  if (!result.ok) throw new Error(`Expected briefing workflow: ${result.error.type}`)
  return result.value
}
