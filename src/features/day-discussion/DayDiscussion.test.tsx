import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type {
  MayorRevealCandidateView,
  PublicDayDiscussionView,
} from '@/application/day-discussion/index.ts'
import { nightFixturePlayerId } from '../../../tests/support/night-action-fixtures.ts'
import { DayDiscussion } from './DayDiscussion.tsx'

const hiddenMayorId = nightFixturePlayerId('private-player-1')
const revealedMayorId = nightFixturePlayerId('private-player-2')
const deadPlayerId = nightFixturePlayerId('private-player-3')

function publicView(overrides: Partial<PublicDayDiscussionView> = {}): PublicDayDiscussionView {
  return {
    dayNumber: 1,
    dayLabel: 'Day 1',
    livingPlayers: [
      {
        playerId: hiddenMayorId,
        playerDisplayLabel: 'Alex (Player 1)',
        status: 'alive',
        publicRoleDisplayName: null,
        publiclyRevealedMayor: false,
        hasThreeVoteReminder: false,
      },
      {
        playerId: revealedMayorId,
        playerDisplayLabel: 'Alex (Player 2)',
        status: 'alive',
        publicRoleDisplayName: 'Mayor 2',
        publiclyRevealedMayor: true,
        hasThreeVoteReminder: true,
      },
    ],
    deadPlayers: [
      {
        playerId: deadPlayerId,
        playerDisplayLabel: 'Taylor',
        status: 'dead',
        publicRoleDisplayName: null,
        publiclyRevealedMayor: false,
        hasThreeVoteReminder: false,
      },
    ],
    mayorRevealAvailable: true,
    ...overrides,
  }
}

const candidates: readonly MayorRevealCandidateView[] = [
  {
    playerId: hiddenMayorId,
    playerDisplayLabel: 'Alex (Player 1)',
  },
]

describe('public day discussion UI', () => {
  it('focuses the day heading and renders semantic living/dead public-safe rosters', () => {
    const { container } = render(
      <DayDiscussion
        view={publicView()}
        privateMayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Day discussion' })).toHaveFocus()
    const living = screen.getByRole('heading', { name: 'Living players' }).closest('section')
    const dead = screen.getByRole('heading', { name: 'Dead players' }).closest('section')
    expect(living).not.toBeNull()
    expect(dead).not.toBeNull()
    expect(living).toHaveTextContent('Alex (Player 1)AliveRole hidden')
    expect(living).toHaveTextContent('Mayor 2 — publicly revealed')
    expect(living).toHaveTextContent('Mayor revealed — this player counts as 3 votes.')
    expect(dead).toHaveTextContent('TaylorDeadRole not revealed')
    expect(screen.getByText(/Players handle nominations and trial voting verbally/)).toBeVisible()
    expect(screen.getByText(/More guilty than innocent means execution/)).toBeVisible()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('button', { name: /execute|end day/i })).toBeNull()
    expect(container.innerHTML).not.toMatch(
      /private-player|role-instance|executionerTarget|actualRoleId|nightResolution/,
    )
  })

  it('shows a generic unavailable control without explaining hidden Mayor state', () => {
    render(
      <DayDiscussion
        view={publicView({ mayorRevealAvailable: false })}
        privateMayorCandidates={[]}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Mayor reveal unavailable' })).toBeDisabled()
    expect(screen.queryByText(/no Mayor|every Mayor|already revealed/i)).toBeNull()
  })

  it('renders a zero-living-player roster safely', () => {
    render(
      <DayDiscussion
        view={publicView({
          livingPlayers: [],
          mayorRevealAvailable: false,
        })}
        privateMayorCandidates={[]}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={() => undefined}
      />,
    )

    expect(screen.getByText('No players remain alive.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mayor reveal unavailable' })).toBeDisabled()
    expect(screen.queryByText(/winner|victory/i)).toBeNull()
  })
})

describe('private Mayor reveal boundary', () => {
  it('warns, receives focus, makes the background inert, cancels on Escape, and restores focus', () => {
    const onPrivatePresentationChange = vi.fn()
    const { container } = render(
      <DayDiscussion
        view={publicView()}
        privateMayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={onPrivatePresentationChange}
      />,
    )
    const openButton = screen.getByRole('button', { name: 'Confirm Mayor reveal' })
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.click(openButton)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveFocus()
    expect(dialog).toHaveTextContent('Private host-only screen')
    expect(dialog).toHaveTextContent('this list identifies living, unrevealed Mayors')
    expect(container.querySelector('.day-discussion__public')).toHaveAttribute('inert')
    expect(onPrivatePresentationChange).toHaveBeenLastCalledWith(true)
    expect(container.innerHTML).not.toMatch(/private-player/)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(openButton).toHaveFocus()
    expect(onPrivatePresentationChange).toHaveBeenLastCalledWith(false)
  })

  it('requires selection, uses duplicate-safe labels, and confirms clear public consequences', () => {
    const onConfirm = vi.fn(() => true)
    render(
      <DayDiscussion
        view={publicView()}
        privateMayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    const dialog = screen.getByRole('alertdialog')
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Publicly reveal as Mayor',
    })
    expect(confirmButton).toBeDisabled()

    fireEvent.click(
      within(dialog).getByRole('radio', {
        name: /Alex \(Player 1\).*Eligible living Mayor/,
      }),
    )
    expect(dialog).toHaveTextContent('Confirming will publicly reveal Alex (Player 1) as Mayor.')
    expect(dialog).toHaveTextContent('Their vote counts as three in every player vote')
    fireEvent.click(confirmButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(hiddenMayorId)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('guards rapid repeated confirmation in the private boundary', () => {
    const onConfirm = vi.fn(() => true)
    render(
      <DayDiscussion
        view={publicView()}
        privateMayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('radio'))
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Publicly reveal as Mayor',
    })
    act(() => {
      confirmButton.click()
      confirmButton.click()
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('re-arms confirmation only after the prior dialog has closed', () => {
    const onConfirm = vi.fn(() => true)
    const secondCandidate: MayorRevealCandidateView = {
      playerId: revealedMayorId,
      playerDisplayLabel: 'Alex (Player 2)',
    }
    const { rerender } = render(
      <DayDiscussion
        view={publicView()}
        privateMayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    fireEvent.click(screen.getByRole('radio', { name: /Alex \(Player 1\)/ }))
    const firstConfirm = screen.getByRole('button', { name: 'Publicly reveal as Mayor' })
    act(() => {
      firstConfirm.click()
      firstConfirm.click()
    })

    rerender(
      <DayDiscussion
        view={publicView()}
        privateMayorCandidates={[secondCandidate]}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onPrivatePresentationChange={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    fireEvent.click(screen.getByRole('radio', { name: /Alex \(Player 2\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicly reveal as Mayor' }))

    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onConfirm).toHaveBeenNthCalledWith(1, hiddenMayorId)
    expect(onConfirm).toHaveBeenNthCalledWith(2, revealedMayorId)
  })
})

describe('day discussion responsive ownership', () => {
  it('owns 390px and 320px layouts and uses 44px minimum controls', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/features/day-discussion/DayDiscussion.css'),
      'utf8',
    )

    expect(css).toContain('@media (max-width: 24.375rem)')
    expect(css).toContain('@media (max-width: 20rem)')
    expect(css).toContain('min-height: 2.75rem')
    expect(css).toContain('min-width: 0')
  })
})
