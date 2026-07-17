import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  acknowledgePrivateNightResult,
  beginNightResultPresentation,
  nextPrivateNightResult,
  prepareDawnAnnouncement,
  previousPrivateNightResult,
  selectNightPresentationView,
  type NightPresentationError,
  type NightPresentationWorkflow,
  type PrivateNightResultId,
} from '@/application/night-presentation/index.ts'
import { ROLE_IDS } from '@/application/night-actions/index.ts'
import {
  createCompleteNightWorkflow,
  createResolutionFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { DawnPresentation } from './DawnPresentation.tsx'

function createPresentation(
  roles: Parameters<typeof createResolutionFixture>[0],
  targetIndexes: Parameters<typeof createResolutionFixture>[1],
  names: readonly string[],
  revealRoleOnDeath = false,
): NightPresentationWorkflow {
  const fixture = createResolutionFixture(roles, targetIndexes, {
    settings: { revealRoleOnDeath },
  })
  const result = beginNightResultPresentation(createCompleteNightWorkflow(fixture, names))
  if (!result.ok) {
    throw new Error(`Expected presentation: ${result.error.type}`)
  }
  return result.value
}

function DawnHarness({
  initialWorkflow,
}: Readonly<{ initialWorkflow: NightPresentationWorkflow }>) {
  const [workflow, setWorkflow] = useState(initialWorkflow)
  const [error, setError] = useState<NightPresentationError | null>(null)
  const operationPendingRef = useRef(false)

  useEffect(() => {
    operationPendingRef.current = false
  }, [workflow, error])

  function applyOperation(
    operation: () =>
      | Readonly<{ ok: true; value: NightPresentationWorkflow }>
      | Readonly<{ ok: false; error: NightPresentationError }>,
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
    <DawnPresentation
      view={selectNightPresentationView(workflow)}
      error={error}
      onAcknowledgeResult={(resultId: PrivateNightResultId) => {
        applyOperation(() => acknowledgePrivateNightResult(workflow, resultId))
      }}
      onPreviousResult={() => {
        applyOperation(() => previousPrivateNightResult(workflow))
      }}
      onNextResult={() => {
        applyOperation(() => nextPrivateNightResult(workflow))
      }}
      onPrepareDawn={() => {
        applyOperation(() => prepareDawnAnnouncement(workflow))
      }}
    />
  )
}

function acknowledgeCurrentResult(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Result communicated' }))
}

function showDawn(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Prepare Dawn Announcement' }))
  fireEvent.click(screen.getByRole('button', { name: 'Show Dawn Announcement' }))
}

describe('Phase 6 private results and Dawn UI', () => {
  it('shows one private result at a time, preserves review acknowledgement, and crosses a deliberate privacy gate', () => {
    const workflow = createPresentation(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.consigliere },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.citizen },
      ],
      [5, 5, 0, 5, 0, null],
      ['Alex', 'Blair', 'Casey', 'Devon', 'Emery', 'Finley'],
      true,
    )
    render(<DawnHarness initialWorkflow={workflow} />)

    expect(
      screen.getByRole('heading', {
        name: 'Only show this result to Blair',
      }),
    ).toHaveFocus()
    expect(screen.getByText('Private host result')).toBeVisible()
    expect(screen.getByText('Show Group D')).toBeVisible()
    expect(screen.getByText('Consigliere · Serial Killer · Jester · Citizen')).toBeVisible()
    expect(screen.getByText('Result 1 of 4')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Prepare Dawn Announcement' })).toBeDisabled()
    expect(screen.queryByText(/died during the night/i)).toBeNull()
    expect(screen.queryByText(/attack|blocked|protected|framed/i)).toBeNull()

    acknowledgeCurrentResult()
    expect(
      screen.getByRole('heading', {
        name: 'Only show this result to Casey',
      }),
    ).toHaveFocus()
    expect(screen.getByText('Alex appears suspicious.')).toBeVisible()
    expect(screen.queryByText('Show Group D')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Previous result' }))
    expect(screen.getByText('Show Group D')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next result' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next result' }))
    acknowledgeCurrentResult()

    expect(screen.getByText('Show Group D')).toBeVisible()
    expect(screen.getByText('Investigator')).toBeVisible()
    acknowledgeCurrentResult()

    expect(screen.getByText('Alex visited Finley.')).toBeVisible()
    acknowledgeCurrentResult()

    const readyHeading = screen.getByRole('heading', {
      name: 'Private results are complete',
    })
    expect(readyHeading).toHaveFocus()
    const prepareButton = screen.getByRole('button', {
      name: 'Prepare Dawn Announcement',
    })
    fireEvent.click(prepareButton)
    const dialog = screen.getByRole('alertdialog', {
      name: 'Show the public Dawn announcement?',
    })
    expect(within(dialog).getByRole('button', { name: 'Show Dawn Announcement' })).toHaveFocus()
    expect(prepareButton).toBeDisabled()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(prepareButton).toHaveFocus()

    fireEvent.click(prepareButton)
    const confirmation = screen.getByRole('button', {
      name: 'Show Dawn Announcement',
    })
    act(() => {
      confirmation.click()
      confirmation.click()
    })

    expect(screen.getByRole('heading', { name: 'Dawn deaths' })).toHaveFocus()
    expect(screen.getByText('Finley').closest('li')).toHaveTextContent(
      'Finley died during the night. Their role was Citizen.',
    )
    expect(screen.getByText('Dawn complete')).toBeVisible()
    expect(screen.getByText('Day discussion will be added in Phase 7.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /enter day|day discussion/i })).toBeNull()
    expect(screen.queryByText(/victory|winner|executioner|jester suicide/i)).toBeNull()
    expect(screen.queryByText(/attack|blocked|protected|framed/i)).toBeNull()
  })

  it('keeps death roles absent from visible and accessible Dawn text when reveal is disabled', () => {
    const workflow = createPresentation(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.doctor }],
      [2, 0, 1],
      ['Gina', 'Sam', 'Drew'],
      false,
    )
    render(<DawnHarness initialWorkflow={workflow} />)

    acknowledgeCurrentResult()
    showDawn()

    const deathList = screen.getByRole('list', {
      name: 'Players who died during the night',
    })
    expect(deathList).toHaveTextContent('Drew died during the night.')
    expect(deathList).not.toHaveTextContent('Doctor')
    expect(deathList).not.toHaveAccessibleName(/Doctor/)
    expect(document.body.textContent).not.toContain('Their role was')
  })

  it('shows visited-nobody and a public-safe no-death Dawn message', () => {
    const workflow = createPresentation(
      [{ roleId: ROLE_IDS.detective }, { roleId: ROLE_IDS.citizen }],
      [1, null],
      ['Dana', 'Chris'],
    )
    render(<DawnHarness initialWorkflow={workflow} />)

    expect(screen.getByText('Chris visited nobody.')).toBeVisible()
    expect(screen.queryByText(/reason|blocked/i)).toBeNull()
    acknowledgeCurrentResult()
    showDawn()

    expect(screen.getByRole('heading', { name: 'A quiet Dawn' })).toHaveFocus()
    expect(screen.getByText('No one died during the night.')).toBeVisible()
    expect(screen.queryByText(/protected|failed|attack/i)).toBeNull()
  })
})
