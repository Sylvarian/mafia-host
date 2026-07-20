import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
            explanation: null,
            dayNumber: 1,
            endedAtLabel: 'Day 1',
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
          onStartNextGame={() => undefined}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Game over' })).toHaveFocus()
      expect(screen.getByText(heading)).toBeVisible()
      expect(screen.getByText('Alex (Player 1)')).toBeVisible()
      expect(screen.getByText('Public role: Citizen')).toBeVisible()
      expect(screen.getByRole('button', { name: 'Start next game' })).toBeVisible()
      expect(document.body).not.toHaveTextContent(
        /personal win|Executioner target|pending revenge|conversion record|player-1/i,
      )
    },
  )

  it.each([
    'No players survived.',
    'The final two players could not eliminate each other.',
    'The final two players eliminated each other.',
  ])('shows the public-safe draw explanation: %s', (explanation) => {
    render(
      <GameOver
        view={{
          heading: 'Draw',
          status: 'draw',
          explanation,
          dayNumber: 2,
          endedAtLabel: 'after Day 2',
          players: [],
        }}
        onStartNextGame={() => undefined}
      />,
    )

    expect(screen.getByText(explanation)).toBeVisible()
    expect(document.body).not.toHaveTextContent(/Godfather|Serial Killer/i)
  })

  it('owns fluid 390px and 320px layouts without horizontal fixed-width content', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/features/game-over/GameOver.css'), 'utf8')

    expect(css).toContain('min-width: 0')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('@media (max-width: 24.375rem)')
    expect(css).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%, 14rem\)/)
    expect(css).not.toMatch(/min-width:\s*(?:[3-9]\d|\d{3,})rem/)
  })
})
