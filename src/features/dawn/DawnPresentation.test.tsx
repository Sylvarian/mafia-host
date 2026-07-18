import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { NightCompletionView } from '@/application/night-completion/index.ts'
import { nightFixturePlayerId } from '../../../tests/support/night-action-fixtures.ts'
import { DawnPresentation } from './DawnPresentation.tsx'

describe('public Dawn presentation', () => {
  it('keeps deaths hidden behind a deliberate confirmation boundary', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Dawn Announcement' }))
    expect(screen.getByRole('alertdialog')).toBeVisible()
    expect(onPrepareDawn).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Show Dawn Announcement' }))
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
    expect(screen.queryByRole('button', { name: /Acknowledge result/i })).toBeNull()
    expect(screen.queryByText(/Sheriff result|Investigator result|Detective result/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    expect(onBeginDayDiscussion).toHaveBeenCalledTimes(1)
  })
})
