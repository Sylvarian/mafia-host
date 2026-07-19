import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DayOutcomeSummary } from './DayOutcomeSummary.tsx'

describe('public day-outcome summary', () => {
  it('focuses and renders an authorized execution reveal without private effects or later controls', () => {
    render(
      <DayOutcomeSummary
        view={{
          dayNumber: 1,
          dayLabel: 'Day 1',
          outcome: {
            kind: 'player-executed',
            playerDisplayLabel: 'Alex (Player 1)',
            revealedRoleDisplayName: 'Citizen',
          },
        }}
        status="game-continues"
        errorMessage={null}
      />,
    )

    const heading = screen.getByRole('heading', { name: 'Day complete' })
    expect(heading).toHaveFocus()
    expect(screen.getByText('Alex (Player 1) was executed.')).toBeVisible()
    expect(screen.getByText('Their role was Citizen.')).toBeVisible()
    expect(document.body).not.toHaveTextContent(/Jester|Executioner|revenge victim|personal win/i)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders no execution without a role or private consequence', () => {
    render(
      <DayOutcomeSummary
        view={{
          dayNumber: 1,
          dayLabel: 'Day 1',
          outcome: { kind: 'no-execution' },
        }}
        status="game-continues"
        errorMessage={null}
      />,
    )

    expect(screen.getByText('No player was executed.')).toBeVisible()
    expect(screen.getByText('The game continues.')).toBeVisible()
    expect(document.body).not.toHaveTextContent(/role was|personal win|target|faction winner/i)
  })
})
