import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { ROLE_IDS } from '@/application/night-actions/index.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { RoleDistribution } from './RoleDistribution.tsx'

describe('role distribution bulk delivery UI', () => {
  it('shows all private cards with exactly one delivery action and no player controls', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, name: 'Alex' },
        { roleId: ROLE_IDS.citizen, name: 'Alex' },
      ],
      { distributionStatus: 'distributing' },
    )
    if (fixture.distribution.status !== 'distributing') {
      throw new Error('Expected distribution.')
    }
    const confirmAll = vi.fn()
    render(
      <RoleDistribution
        workflow={fixture.distribution}
        error={null}
        beginNightErrorMessage={null}
        onConfirmAllRoleCardsDelivered={confirmAll}
        onReassignRoles={() => undefined}
        onBeginFirstNight={() => undefined}
      />,
    )

    expect(screen.getByText('Role cards')).toBeVisible()
    expect(screen.queryByText(/HOST-ONLY VIEW/)).toBeNull()
    expect(screen.getByText('Godfather')).toBeVisible()
    expect(screen.getByText('Citizen')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Mafia' }).closest('section')).toHaveClass(
      'assignment-group--mafia',
    )
    expect(screen.getByRole('heading', { name: 'Town' }).closest('section')).toHaveClass(
      'assignment-group--town',
    )
    expect(screen.getByRole('heading', { name: 'Neutral' }).closest('section')).toHaveClass(
      'assignment-group--neutral',
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /mark.*delivered/i })).toBeNull()
    const button = screen.getByRole('button', {
      name: 'Confirm all role cards delivered',
    })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(confirmAll).toHaveBeenCalledOnce()
  })

  it('renders a legacy completed boundary without private cards or a second delivery action', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { distributionStatus: 'confirmed' },
    )
    if (fixture.distribution.status !== 'confirmed') {
      throw new Error('Expected confirmed distribution.')
    }
    const begin = vi.fn()
    render(
      <RoleDistribution
        workflow={fixture.distribution}
        error={null}
        beginNightErrorMessage={null}
        onConfirmAllRoleCardsDelivered={() => undefined}
        onReassignRoles={() => undefined}
        onBeginFirstNight={begin}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Role cards delivered' })).toBeVisible()
    expect(
      screen.queryByRole('button', {
        name: 'Confirm all role cards delivered',
      }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(begin).toHaveBeenCalledOnce()
  })

  it('owns narrow 390px and 320px layouts without fixed-width card or action columns', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/features/role-distribution/RoleDistribution.css'),
      'utf8',
    )

    expect(css).toContain('@media (max-width: 42rem)')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(css).toContain('background: var(--faction-mafia-soft)')
    expect(css).toContain('background: var(--faction-town-soft)')
    expect(css).toContain('background: var(--faction-neutral-soft)')
    expect(css).toMatch(/\.role-distribution__actions > \.button,[\s\S]*width: 100%/)
    expect(css).not.toMatch(/min-width:\s*(?:[3-9]\d|\d{3,})rem/)
  })
})
