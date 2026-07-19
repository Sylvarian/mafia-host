import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { NightCompletionView } from '@/application/night-completion/index.ts'
import { nightFixturePlayerId } from '../../../tests/support/night-action-fixtures.ts'
import { DawnPresentation } from './DawnPresentation.tsx'

describe('public Dawn presentation', () => {
  it('keeps deaths hidden and players asleep behind one deliberate finalization control', () => {
    const onPrepareDawn = vi.fn()
    const view: NightCompletionView = { status: 'ready-for-dawn' }
    render(
      <DawnPresentation
        view={view}
        error={null}
        dayTransitionErrorMessage={null}
        onPrepareDawn={onPrepareDawn}
        onBeginDayDiscussion={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Night resolution complete' })).toHaveFocus()
    expect(screen.queryByText(/died during the night/i)).toBeNull()
    expect(
      screen.getByText(
        'Keep every player’s eyes closed while all Dawn effects are finalized. The next screen may remain host-only.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finalize Dawn' }))
    expect(onPrepareDawn).toHaveBeenCalledTimes(1)
  })

  it('renders only public Dawn data and no private-result replay controls', () => {
    const onBeginDayDiscussion = vi.fn()
    const view: NightCompletionView = {
      status: 'dawn',
      announcement: {
        outcome: 'deaths',
        nightNumber: 1,
        deaths: [
          {
            playerId: nightFixturePlayerId('player-2'),
            playerDisplayLabel: 'Alex (Player 2)',
            revealedRoleDisplayName: 'Citizen',
          },
        ],
      },
    }
    render(
      <DawnPresentation
        view={view}
        error={null}
        dayTransitionErrorMessage={null}
        onPrepareDawn={() => undefined}
        onBeginDayDiscussion={onBeginDayDiscussion}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Dawn deaths' })).toHaveFocus()
    const deaths = screen.getByRole('list', {
      name: 'Players who died during the night',
    })
    expect(deaths).toHaveTextContent(
      'Alex (Player 2) died during the night. Their role was Citizen.',
    )
    expect(
      screen.getByText('Ask every player to open their eyes, then begin the daytime stage.'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /Acknowledge result/i })).toBeNull()
    expect(screen.queryByText(/Sheriff result|Investigator result|Detective result/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
    expect(onBeginDayDiscussion).toHaveBeenCalledTimes(1)
  })
})
