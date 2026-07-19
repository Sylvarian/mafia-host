import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GameOver } from './GameOver.tsx'

describe('public game-over feature', () => {
  it.each(['Town wins', 'Mafia wins', 'Serial Killer wins', 'Draw'] as const)(
    'focuses the final heading and displays %s without controls or hidden authority',
    (heading) => {
      const status =
        heading === 'Town wins'
          ? 'town-victory'
          : heading === 'Mafia wins'
            ? 'mafia-victory'
            : heading === 'Serial Killer wins'
              ? 'serial-killer-victory'
              : 'draw'
      render(
        <GameOver
          view={{
            heading,
            status,
            dayNumber: 1,
            players: [
              {
                playerDisplayLabel: 'Alex (Player 1)',
                alive: false,
                revealedRoleDisplayName: 'Citizen',
              },
              {
                playerDisplayLabel: 'Alex (Player 2)',
                alive: true,
                revealedRoleDisplayName: null,
              },
            ],
          }}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Game over' })).toHaveFocus()
      expect(screen.getByText(heading)).toBeVisible()
      expect(screen.getByText('Alex (Player 1)')).toBeVisible()
      expect(screen.getByText('Public role: Citizen')).toBeVisible()
      expect(screen.queryByRole('button')).toBeNull()
      expect(document.body).not.toHaveTextContent(
        /personal win|Executioner target|pending revenge|conversion record|player-1/i,
      )
    },
  )
})
