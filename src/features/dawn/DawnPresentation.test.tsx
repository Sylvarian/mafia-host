import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  HostNightPlayerView,
  NightCompletionView,
} from '@/application/night-completion/index.ts'
import { nightFixturePlayerId } from '../../../tests/support/night-action-fixtures.ts'
import { DawnPresentation } from './DawnPresentation.tsx'

const sarah: HostNightPlayerView = {
  playerId: nightFixturePlayerId('player-1'),
  playerDisplayLabel: 'Sarah',
  activeRoleDisplayName: 'Sheriff',
  originallyAssignedRoleDisplayName: null,
  alignment: 'town',
  alignmentDisplayName: 'Town',
}
const george: HostNightPlayerView = {
  playerId: nightFixturePlayerId('player-2'),
  playerDisplayLabel: 'George',
  activeRoleDisplayName: 'Godfather',
  originallyAssignedRoleDisplayName: 'Framer',
  alignment: 'mafia',
  alignmentDisplayName: 'Mafia',
}
const peter: HostNightPlayerView = {
  playerId: nightFixturePlayerId('player-3'),
  playerDisplayLabel: 'Peter',
  activeRoleDisplayName: 'Doctor',
  originallyAssignedRoleDisplayName: null,
  alignment: 'town',
  alignmentDisplayName: 'Town',
}

describe('host Dawn presentation', () => {
  it('keeps deaths unapplied behind the one deliberate finalization control', () => {
    const onPrepareDawn = vi.fn()
    render(
      <DawnPresentation
        view={{ status: 'ready-for-dawn' }}
        error={null}
        dayTransitionErrorMessage={null}
        onPrepareDawn={onPrepareDawn}
        onBeginDayDiscussion={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Night resolution complete' })).toHaveFocus()
    expect(screen.queryByText(/died during the night/i)).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finalize Dawn' }))
    expect(onPrepareDawn).toHaveBeenCalledOnce()
  })

  it('separates rule-compliant announcement text from exact host roles and attackers', () => {
    const view: NightCompletionView = {
      status: 'dawn',
      announcement: {
        outcome: 'deaths',
        nightNumber: 2,
        deaths: [
          {
            playerId: sarah.playerId,
            playerDisplayLabel: sarah.playerDisplayLabel,
            revealedRoleDisplayName: null,
          },
        ],
      },
      hostResults: {
        deaths: [
          {
            ...sarah,
            cause: { kind: 'ordinary-night-attack', attackers: [george] },
          },
        ],
        conversions: [],
      },
      importantEvents: [],
    }
    render(
      <DawnPresentation
        view={view}
        error={null}
        dayTransitionErrorMessage={null}
        onPrepareDawn={() => undefined}
        onBeginDayDiscussion={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Dawn' })).toHaveFocus()
    const announcement = screen.getByRole('heading', { name: 'Announce to players' }).parentElement
    expect(announcement).toHaveTextContent('Sarah died during the night.')
    expect(announcement).not.toHaveTextContent(/Sheriff|Godfather|Framer/)
    const hostResults = screen.getByRole('heading', { name: 'Host results' }).parentElement
    expect(hostResults).toHaveTextContent('Sarah (Sheriff) died')
    expect(hostResults).toHaveTextContent('George (Godfather, originally Framer)')
  })

  it('shows exact Doctor-save and two-way immunity participants without duplicate events', () => {
    const view: NightCompletionView = {
      status: 'dawn',
      announcement: { outcome: 'no-deaths', nightNumber: 2 },
      hostResults: { deaths: [], conversions: [] },
      importantEvents: [
        { kind: 'doctor-save', attacker: george, target: sarah, doctors: [peter] },
        { kind: 'mutual-attack-immunity', firstAttacker: george, secondAttacker: sarah },
      ],
    }
    render(
      <DawnPresentation
        view={view}
        error={null}
        dayTransitionErrorMessage={null}
        onPrepareDawn={() => undefined}
        onBeginDayDiscussion={() => undefined}
      />,
    )

    const events = screen.getByRole('heading', { name: 'Important night events' }).parentElement
    expect(events).toHaveTextContent(
      'Peter (Doctor) prevented George (Godfather, originally Framer) from killing Sarah (Sheriff).',
    )
    expect(events).toHaveTextContent(/attacked each other, but neither attack had any effect/)
    expect(events?.querySelectorAll('li')).toHaveLength(2)
  })
})
