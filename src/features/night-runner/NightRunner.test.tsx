import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  beginFirstNight,
  continueNightActionCollection,
  createNightActionCollectionWorkflow,
  editNightAction,
  finaliseNightActionCollection,
  previousNightActionCollection,
  selectNightActionTarget,
  type ActiveNightActionCollectionWorkflow,
  type NightActionCollectionError,
  type PlayerId,
  type RoleInstanceId,
  ROLE_IDS,
} from '@/application/night-actions/index.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { NightRunner } from './NightRunner.tsx'

type NightFixture = ReturnType<typeof createNightFixture>

function startFixture(fixture: NightFixture): ActiveNightActionCollectionWorkflow {
  const result = beginFirstNight(createNightActionCollectionWorkflow(fixture.distribution))
  if (!result.ok) throw new Error(`Expected fixture to begin: ${result.error.type}`)
  return result.value
}

function NightHarness({ fixture }: Readonly<{ fixture: NightFixture }>) {
  const [workflow, setWorkflow] = useState(() => startFixture(fixture))
  const [error, setError] = useState<NightActionCollectionError | null>(null)
  const operationPendingRef = useRef(false)

  useEffect(() => {
    operationPendingRef.current = false
  }, [workflow, error])

  function applyOperation(
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
      setError(result.error)
    }
  }

  return (
    <NightRunner
      workflow={workflow}
      error={error}
      onConfirmTarget={(targetPlayerId: PlayerId) => {
        applyOperation(() => {
          const selectionResult = selectNightActionTarget(workflow, targetPlayerId)
          return selectionResult.ok
            ? continueNightActionCollection(selectionResult.value)
            : selectionResult
        })
      }}
      onContinue={() => {
        applyOperation(() => continueNightActionCollection(workflow))
      }}
      onPrevious={() => {
        applyOperation(() => previousNightActionCollection(workflow))
      }}
      onEditAction={(actorRoleInstanceId: RoleInstanceId) => {
        applyOperation(() => editNightAction(workflow, actorRoleInstanceId))
      }}
      onFinalise={() => {
        applyOperation(() => finaliseNightActionCollection(workflow))
      }}
      onResolveNight={() => undefined}
      resolutionErrorMessage={null}
    />
  )
}

function selectFirstAvailableTarget(roleDisplayName: string): void {
  const group = screen.getByRole('group', { name: `Targets for ${roleDisplayName}` })
  const target = within(group)
    .getAllByRole('button')
    .find((button) => !button.hasAttribute('disabled'))
  if (target === undefined) throw new Error(`No target available for ${roleDisplayName}.`)
  fireEvent.click(target)
}

function confirmTarget(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Target / Continue' }))
}

describe('night runner host UI', () => {
  it('guides the full private sequence, corrects actions, reviews, edits, and stops before resolution', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, name: 'Alex' },
        { roleId: ROLE_IDS.framer, name: 'Alex' },
        { roleId: ROLE_IDS.consort, name: 'Casey' },
        { roleId: ROLE_IDS.consigliere, name: 'Dana' },
        { roleId: ROLE_IDS.serialKiller, name: 'Eli' },
        { roleId: ROLE_IDS.doctor, name: 'Fran' },
        { roleId: ROLE_IDS.doctor, name: 'Gale' },
        { roleId: ROLE_IDS.sheriff, name: 'Harper' },
        { roleId: ROLE_IDS.investigator, name: 'Indigo' },
        { roleId: ROLE_IDS.detective, name: 'Jules' },
      ],
      { settings: { doctorCanSelfProtect: true, allowFirstNightKills: true } },
    )
    render(<NightHarness fixture={fixture} />)

    expect(screen.getByRole('heading', { name: 'Begin the night deliberately' })).toHaveFocus()
    expect(screen.getByText('Everyone, close your eyes.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Living Mafia overview' })).toHaveFocus()
    const mafiaOverview = screen.getByRole('list', { name: 'Living Mafia overview' })
    expect(within(mafiaOverview).getAllByRole('listitem')).toHaveLength(4)
    expect(within(mafiaOverview).getByText('ID player-1')).toBeVisible()
    expect(within(mafiaOverview).getByText('ID player-2')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    selectFirstAvailableTarget('Godfather')
    const godfatherContinue = screen.getByRole('button', { name: 'Confirm Target / Continue' })
    act(() => {
      godfatherContinue.click()
      godfatherContinue.click()
    })
    expect(screen.getByText('Framer')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Collect Framer action for Alex (player-2)' }),
    ).toHaveFocus()

    for (const role of ['Framer', 'Consort', 'Consigliere']) {
      selectFirstAvailableTarget(role)
      confirmTarget()
    }
    expect(screen.getByText('Ask the Mafia to close their eyes.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    selectFirstAvailableTarget('Serial Killer')
    confirmTarget()
    selectFirstAvailableTarget('Doctor 1')
    confirmTarget()
    expect(screen.getByText('Doctor 2')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('Doctor 1')).toBeVisible()
    expect(screen.getByText(/Previously confirmed target restored/)).toBeVisible()
    const doctorOneGroup = screen.getByRole('group', { name: 'Targets for Doctor 1' })
    const alternative = within(doctorOneGroup)
      .getAllByRole('button')
      .find(
        (button) =>
          !button.hasAttribute('disabled') && button.getAttribute('aria-pressed') === 'false',
      )
    if (alternative === undefined) throw new Error('Expected an alternative Doctor target.')
    fireEvent.click(alternative)
    expect(within(alternative).getByText(/Selected target/)).toBeVisible()
    confirmTarget()

    for (const role of ['Doctor 2', 'Sheriff', 'Investigator', 'Detective']) {
      selectFirstAvailableTarget(role)
      confirmTarget()
    }

    expect(screen.getByRole('heading', { name: 'Review collected night actions' })).toHaveFocus()
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('No effects or outcomes have been calculated.')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Godfather action for Alex (player-1)' }),
    )
    expect(screen.getByText('Godfather')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Collect Godfather action for Alex (player-1)' }),
    ).toHaveFocus()
    const godfatherGroup = screen.getByRole('group', { name: 'Targets for Godfather' })
    const newGodfatherTarget = within(godfatherGroup)
      .getAllByRole('button')
      .find(
        (button) =>
          !button.hasAttribute('disabled') && button.getAttribute('aria-pressed') === 'false',
      )
    if (newGodfatherTarget === undefined) throw new Error('Expected an alternative target.')
    fireEvent.click(newGodfatherTarget)
    confirmTarget()
    expect(screen.getByRole('heading', { name: 'Review collected night actions' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Finish Collecting Night Actions' }))
    expect(screen.getByRole('heading', { name: 'Night actions collected' })).toHaveFocus()
    expect(screen.getByText('Ready to resolve night results')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Resolve Night' })).toBeVisible()
    expect(screen.getByText(/game remains in night-action-collection/i)).toBeVisible()
    expect(screen.queryByText(/was killed|appears suspicious|investigation result/i)).toBeNull()
  })

  it('makes Doctor self-target availability follow the central setting', () => {
    const roles = [
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.citizen },
    ]
    const disabledView = render(
      <NightHarness
        fixture={createNightFixture(roles, {
          settings: { doctorCanSelfProtect: false, allowFirstNightKills: true },
        })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    selectFirstAvailableTarget('Godfather')
    confirmTarget()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('button', { name: /Player 2, alive, unavailable/ })).toBeDisabled()
    disabledView.unmount()

    render(
      <NightHarness
        fixture={createNightFixture(roles, {
          settings: { doctorCanSelfProtect: true, allowFirstNightKills: true },
        })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    selectFirstAvailableTarget('Godfather')
    confirmTarget()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('button', { name: 'Player 2, alive' })).toBeEnabled()
  })

  it('skips Mafia instructions when no living Mafia are present', () => {
    render(
      <NightHarness
        fixture={createNightFixture([
          { roleId: ROLE_IDS.doctor, name: 'Dana' },
          { roleId: ROLE_IDS.citizen, name: 'Chris' },
        ])}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.queryByRole('heading', { name: 'Living Mafia overview' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Collect Doctor action for Dana' })).toHaveFocus()
  })

  it('reviews and completes a night containing no acting roles', () => {
    render(
      <NightHarness
        fixture={createNightFixture([{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.mayor }])}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Review collected night actions' })).toHaveFocus()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Finish Collecting Night Actions' }))
    expect(screen.getByRole('heading', { name: 'Night actions collected' })).toHaveFocus()
    expect(screen.getByText(/0 actions recorded as intent/i)).toBeVisible()
  })

  it('skips first-night killing controls while retaining the private Godfather overview', () => {
    render(
      <NightHarness
        fixture={createNightFixture([
          { roleId: ROLE_IDS.godfather, name: 'Gina' },
          { roleId: ROLE_IDS.serialKiller, name: 'Sam' },
          { roleId: ROLE_IDS.sheriff, name: 'Shae' },
        ])}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const mafiaOverview = screen.getByRole('list', { name: 'Living Mafia overview' })
    expect(within(mafiaOverview).getByText('Gina')).toBeVisible()
    expect(within(mafiaOverview).getByText('Godfather')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('Ask the Mafia to close their eyes.')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Targets for Godfather' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Collect Sheriff action for Shae' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Targets for Serial Killer' })).toBeNull()
  })

  it('keeps another Consort enabled as a target without claiming a block was resolved', () => {
    render(
      <NightHarness
        fixture={createNightFixture([
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.consort, name: 'Connie' },
          { roleId: ROLE_IDS.consort, name: 'Cora' },
          { roleId: ROLE_IDS.doctor },
        ])}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      screen.getByRole('heading', { name: 'Collect Consort 1 action for Connie' }),
    ).toBeVisible()

    const consortOneTargets = screen.getByRole('group', { name: 'Targets for Consort 1' })
    const consortTwoTarget = within(consortOneTargets).getByRole('button', {
      name: 'Cora, alive',
    })
    expect(consortTwoTarget).toBeEnabled()
    fireEvent.click(consortTwoTarget)
    confirmTarget()

    const consortTwoTargets = screen.getByRole('group', { name: 'Targets for Consort 2' })
    expect(within(consortTwoTargets).getByRole('button', { name: 'Connie, alive' })).toBeEnabled()
    expect(screen.queryByText(/has been blocked|was blocked/i)).toBeNull()
  })
})
