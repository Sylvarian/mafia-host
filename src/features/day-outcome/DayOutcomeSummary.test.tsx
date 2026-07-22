import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DayOutcomeSummary } from './DayOutcomeSummary.tsx'

describe('host day-outcome summary', () => {
  it('focuses and separates the announcement from exact host role details', () => {
    render(
      <DayOutcomeSummary
        view={{
          dayNumber: 1,
          dayLabel: 'Day 1',
          announcement: {
            kind: 'player-executed',
            playerDisplayLabel: 'Alex (Player 1)',
            revealedRoleDisplayName: null,
          },
          hostResult: {
            kind: 'player-executed',
            playerDisplayLabel: 'Alex (Player 1)',
            currentRoleDisplayName: 'Jester',
            originalRoleDisplayName: null,
            alignmentDisplayName: 'Neutral',
          },
        }}
        status="game-continues"
        errorMessage={null}
      />,
    )

    const heading = screen.getByRole('heading', { name: 'Day complete' })
    expect(heading).toHaveFocus()
    expect(screen.getByText('Alex (Player 1) was executed.')).toBeVisible()
    expect(screen.queryByText(/Their role was/)).toBeNull()
    expect(screen.getByText('Alex (Player 1) — Jester (Neutral)')).toBeVisible()
    expect(screen.getByText('Death cause: executed on Day 1')).toBeVisible()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders no execution without a role or private consequence', () => {
    render(
      <DayOutcomeSummary
        view={{
          dayNumber: 1,
          dayLabel: 'Day 1',
          announcement: { kind: 'no-execution' },
          hostResult: { kind: 'no-execution' },
        }}
        status="game-continues"
        errorMessage={null}
      />,
    )

    expect(screen.getByText('No player was executed.')).toBeVisible()
    expect(screen.getByText('The game continues.')).toBeVisible()
    expect(screen.getByText('No execution was recorded.')).toBeVisible()
  })
})
