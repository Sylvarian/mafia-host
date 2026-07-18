import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PlayerId } from '@/application/role-assignment/index.ts'
import {
  createNightFixture,
  FIXTURE_ROLE_IDS as ROLE_IDS,
} from '../../../tests/support/night-action-fixtures.ts'
import { RoleDistribution } from './RoleDistribution.tsx'

function distributingFixture() {
  const fixture = createNightFixture(
    [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
    { distributionStatus: 'distributing' },
  )
  if (fixture.distribution.status !== 'distributing') {
    throw new Error('Expected distribution fixture.')
  }
  return fixture.distribution
}

describe('role distribution bulk delivery UI', () => {
  it('offers the reversible bulk operation without finalising distribution', () => {
    const onMarkAllCardsDelivered = vi.fn()
    const onConfirmDistribution = vi.fn()
    render(
      <RoleDistribution
        workflow={distributingFixture()}
        error={null}
        beginNightErrorMessage={null}
        onCardDeliveryChange={() => undefined}
        onMarkAllCardsDelivered={onMarkAllCardsDelivered}
        onConfirmDistribution={onConfirmDistribution}
        onReassignRoles={() => undefined}
        onBeginFirstNight={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mark all cards delivered' }))
    expect(onMarkAllCardsDelivered).toHaveBeenCalledTimes(1)
    expect(onConfirmDistribution).not.toHaveBeenCalled()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('shows the completed label, keeps individual undo controls, and disables bulk repeat', () => {
    const workflow = distributingFixture()
    const completed = {
      ...workflow,
      deliveredPlayerIds: workflow.game.players.map((player) => player.playerId),
    }
    const onCardDeliveryChange = vi.fn<(playerId: PlayerId, delivered: boolean) => void>()

    render(
      <StrictMode>
        <RoleDistribution
          workflow={completed}
          error={null}
          beginNightErrorMessage={null}
          onCardDeliveryChange={onCardDeliveryChange}
          onMarkAllCardsDelivered={() => undefined}
          onConfirmDistribution={() => undefined}
          onReassignRoles={() => undefined}
          onBeginFirstNight={() => undefined}
        />
      </StrictMode>,
    )

    expect(
      screen.getByRole('button', {
        name: 'All participating players have received their cards.',
      }),
    ).toBeDisabled()
    const firstDelivery = screen.getAllByRole('checkbox')[0]
    if (firstDelivery === undefined) throw new Error('Expected a delivery checkbox.')
    fireEvent.click(firstDelivery)
    expect(onCardDeliveryChange).toHaveBeenCalledTimes(1)
    expect(onCardDeliveryChange).toHaveBeenCalledWith('player-1', false)
    expect(screen.getByRole('button', { name: 'Confirm Distribution and Continue' })).toBeEnabled()
  })
})
