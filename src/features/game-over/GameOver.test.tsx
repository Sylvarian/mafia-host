import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { nightFixturePlayerId } from '../../../tests/support/night-action-fixtures.ts'
import { GameOver } from './GameOver.tsx'

describe('host game-over feature', () => {
  it('keeps the result prominent and renders complete role, target, transformation, and win details', () => {
    render(
      <GameOver
        view={{
          heading: 'Mafia wins',
          status: 'mafia-victory',
          explanation: null,
          dayNumber: 2,
          endedAtLabel: 'after Day 2',
          players: [
            {
              playerId: nightFixturePlayerId('player-1'),
              playerDisplayLabel: 'Alex',
              status: 'alive',
              alive: true,
              activeRoleDisplayName: 'Godfather',
              originallyAssignedRoleDisplayName: 'Framer',
              alignment: 'mafia',
              alignmentDisplayName: 'Mafia',
              deathCause: null,
              executionerTargetDisplayLabel: null,
              promotionNightNumber: 2,
              conversionTargetDisplayLabel: null,
              personalWins: [],
              revengeResults: [],
            },
            {
              playerId: nightFixturePlayerId('player-2'),
              playerDisplayLabel: 'Taylor',
              status: 'dead',
              alive: false,
              activeRoleDisplayName: 'Jester',
              originallyAssignedRoleDisplayName: 'Executioner',
              alignment: 'neutral',
              alignmentDisplayName: 'Neutral',
              deathCause: { kind: 'day-execution', dayNumber: 2 },
              executionerTargetDisplayLabel: 'Morgan',
              promotionNightNumber: null,
              conversionTargetDisplayLabel: 'Morgan',
              personalWins: [{ kind: 'jester-executed', dayNumber: 2 }],
              revengeResults: [
                {
                  kind: 'victim-killed',
                  nightNumber: 3,
                  victimPlayerDisplayLabel: 'Jordan',
                },
              ],
            },
          ],
        }}
        onStartNextGame={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Game over' })).toHaveFocus()
    expect(screen.getByText('Mafia wins')).toBeVisible()
    expect(screen.getByText('Godfather · Mafia')).toBeVisible()
    expect(screen.getByText('Originally: Framer')).toBeVisible()
    expect(screen.getByText('Promoted to Godfather for Night 2')).toBeVisible()
    expect(screen.getByText('Executioner target: Morgan')).toBeVisible()
    expect(screen.getByText(/Personal win: executed as Jester/)).toBeVisible()
    expect(screen.getByText(/Jester revenge killed Jordan/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start next game' })).toBeVisible()
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
