import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { GodfatherPromotionBriefing } from './GodfatherPromotionBriefing.tsx'

describe('private Godfather promotion briefing', () => {
  it('focuses the private heading and exposes one deliberate continuation', () => {
    const onContinue = vi.fn()
    render(
      <GodfatherPromotionBriefing
        view={{
          nightNumber: 2,
          roleDisplayName: 'Godfather',
          alignment: 'mafia',
          alignmentDisplayName: 'Mafia',
          promotedPlayerDisplayLabel: 'Alex (Player 2)',
        }}
        errorMessage={null}
        onContinue={onContinue}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Godfather' })).toHaveFocus()
    expect(screen.getByText('Night 2 · Mafia')).toBeVisible()
    const section = screen.getByRole('heading', { name: 'Godfather' }).closest('section')
    expect(section).toHaveClass('turn-surface--mafia')
    expect(section).toHaveTextContent('Alex (Player 2)')
    expect(section).toHaveTextContent('Tell Alex (Player 2) they are the new Godfather.')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    screen.getByRole('button', { name: 'Continue' }).click()
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('owns responsive 390px presentation and a 44px continuation target', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/features/godfather-promotion/GodfatherPromotionBriefing.css'),
      'utf8',
    )

    expect(css).toContain('@media (max-width: 24.375rem)')
    expect(css).toContain('min-height: 3.5rem')
    expect(css).toContain('overflow-wrap: anywhere')
  })
})
