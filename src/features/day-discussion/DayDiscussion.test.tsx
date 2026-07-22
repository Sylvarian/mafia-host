import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type {
  DayDiscussionView,
  MayorRevealCandidateView,
} from '@/application/day-discussion/index.ts'
import { nightFixturePlayerId } from '../../../tests/support/night-action-fixtures.ts'
import { DayDiscussion } from './DayDiscussion.tsx'

const hiddenMayorId = nightFixturePlayerId('authority-player-1')
const revealedMayorId = nightFixturePlayerId('authority-player-2')
const deadPlayerId = nightFixturePlayerId('authority-player-3')

function hostView(overrides: Partial<DayDiscussionView> = {}): DayDiscussionView {
  return {
    dayNumber: 1,
    dayLabel: 'Day 1',
    mayorRevealAvailable: true,
    votingRequirements: {
      livingPlayerCount: 2,
      votesToPutOnTrial: 2,
    },
    groups: defaultHostView().groups,
    ...overrides,
  }
}

const candidates: readonly MayorRevealCandidateView[] = [
  {
    playerId: hiddenMayorId,
    playerDisplayLabel: 'Alex (Player 1)',
  },
]

function defaultHostView(): Pick<DayDiscussionView, 'groups'> {
  return {
    groups: [
      { alignment: 'mafia', alignmentDisplayName: 'Mafia', players: [] },
      {
        alignment: 'town',
        alignmentDisplayName: 'Town',
        players: [
          {
            playerId: hiddenMayorId,
            playerDisplayLabel: 'Alex (Player 1)',
            status: 'alive',
            activeRoleDisplayName: 'Mayor 1',
            alignment: 'town',
            alignmentDisplayName: 'Town',
            originallyAssignedRoleDisplayName: null,
            announcedRole: null,
            deathCause: null,
          },
          {
            playerId: revealedMayorId,
            playerDisplayLabel: 'Alex (Player 2)',
            status: 'alive',
            activeRoleDisplayName: 'Mayor 2',
            alignment: 'town',
            alignmentDisplayName: 'Town',
            originallyAssignedRoleDisplayName: null,
            announcedRole: { displayName: 'Mayor 2', status: 'publicly-revealed-mayor' },
            deathCause: null,
          },
        ],
      },
      {
        alignment: 'neutral',
        alignmentDisplayName: 'Neutral',
        players: [
          {
            playerId: deadPlayerId,
            playerDisplayLabel: 'Taylor',
            status: 'dead',
            activeRoleDisplayName: 'Jester',
            alignment: 'neutral',
            alignmentDisplayName: 'Neutral',
            originallyAssignedRoleDisplayName: null,
            announcedRole: { displayName: 'Jester', status: 'revealed-on-death' },
            deathCause: { kind: 'night-death', nightNumber: 1 },
          },
        ],
      },
    ],
  }
}

function executionCandidate(
  playerId: typeof hiddenMayorId,
  playerDisplayLabel: string,
  alignment: 'mafia' | 'town' | 'neutral' = 'town',
  roleDisplayName = 'Citizen',
) {
  return {
    playerId,
    playerDisplayLabel,
    activeRoleDisplayName: roleDisplayName,
    originallyAssignedRoleDisplayName: null,
    alignment,
    alignmentDisplayName:
      alignment === 'mafia'
        ? ('Mafia' as const)
        : alignment === 'town'
          ? ('Town' as const)
          : ('Neutral' as const),
  }
}

describe('host day discussion UI', () => {
  it('focuses the day heading and renders one alignment-grouped living/dead card region', () => {
    const { container } = render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Day discussion' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Mafia' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Town' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Neutral' })).toBeVisible()
    expect(screen.getAllByRole('heading', { name: 'Living' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { name: 'Dead' })).toHaveLength(2)
    expect(screen.getByText('Alex (Player 1)').closest('li')).toHaveTextContent(
      'Alex (Player 1)LivingRole hidden',
    )
    expect(screen.getByText('Alex (Player 2)').closest('li')).toHaveTextContent(
      'Mayor 2Mayor revealedThis player counts as 3 votes.',
    )
    expect(screen.getByText('Taylor').closest('li')).toHaveTextContent('TaylorDeadJester')
    expect(container.querySelectorAll('.host-role-card')).toHaveLength(3)
    expect(container).not.toHaveTextContent('Alignment:')
    expect(screen.getByText(/Votes to put someone on trial:/)).toHaveTextContent('2')
    expect(screen.getByText('Guilty votes must exceed innocent votes.')).toBeVisible()
    expect(screen.getByText('A tie results in innocent.')).toBeVisible()
    expect(screen.getByText(/The host counts this manually/)).toBeVisible()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByRole('button', { name: 'Execute a player' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'End day without execution' })).toBeEnabled()
    expect(container.innerHTML).not.toMatch(
      /authority-player|role-instance|executionerTarget|actualRoleId|nightResolution/,
    )
  })

  it('shows a generic unavailable control without explaining hidden Mayor state', () => {
    render(
      <DayDiscussion
        view={hostView({ mayorRevealAvailable: false })}
        mayorCandidates={[]}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Mayor reveal unavailable' })).toBeDisabled()
    expect(screen.queryByText(/no Mayor|every Mayor|already revealed/i)).toBeNull()
  })

  it('renders empty living groups safely', () => {
    const noLivingView: DayDiscussionView = {
      ...hostView(),
      groups: defaultHostView().groups.map((group) => ({
        ...group,
        players: group.players.map((player) => ({ ...player, status: 'dead' as const })),
      })),
    }
    render(
      <DayDiscussion
        view={{
          ...noLivingView,
          mayorRevealAvailable: false,
        }}
        mayorCandidates={[]}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    expect(screen.getAllByText('None')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Mayor reveal unavailable' })).toBeDisabled()
    expect(screen.queryByText(/winner|victory/i)).toBeNull()
  })

  it('keeps public Mayor and death-revealed roles visible in both toggle states', () => {
    render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    expect(screen.getByText('Mayor 2')).toBeVisible()
    expect(screen.getByText('Jester')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Show roles' }))
    expect(screen.getByText('Mayor 2')).toBeVisible()
    expect(screen.getByText('Jester')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Hide roles' }))
    expect(screen.getByText('Mayor 2')).toBeVisible()
    expect(screen.getByText('Jester')).toBeVisible()
  })
})

describe('host role convenience control', () => {
  it('changes role text in place without replacing or reordering alignment cards', () => {
    const roleView: DayDiscussionView = {
      ...hostView(),
      groups: [
        {
          alignment: 'mafia',
          alignmentDisplayName: 'Mafia',
          players: [
            {
              playerId: hiddenMayorId,
              playerDisplayLabel: 'Morgan',
              status: 'alive',
              activeRoleDisplayName: 'Godfather',
              alignment: 'mafia',
              alignmentDisplayName: 'Mafia',
              originallyAssignedRoleDisplayName: 'Framer',
              announcedRole: null,
              deathCause: null,
            },
          ],
        },
        {
          alignment: 'town',
          alignmentDisplayName: 'Town',
          players: [
            {
              playerId: revealedMayorId,
              playerDisplayLabel: 'Taylor',
              status: 'dead',
              activeRoleDisplayName: 'Doctor',
              alignment: 'town',
              alignmentDisplayName: 'Town',
              originallyAssignedRoleDisplayName: null,
              announcedRole: { displayName: 'Doctor', status: 'revealed-on-death' },
              deathCause: { kind: 'night-death', nightNumber: 1 },
            },
          ],
        },
        {
          alignment: 'neutral',
          alignmentDisplayName: 'Neutral',
          players: [
            {
              playerId: deadPlayerId,
              playerDisplayLabel: 'Alex (Player 1)',
              status: 'alive',
              activeRoleDisplayName: 'Jester',
              alignment: 'neutral',
              alignmentDisplayName: 'Neutral',
              originallyAssignedRoleDisplayName: 'Executioner',
              announcedRole: null,
              deathCause: null,
            },
          ],
        },
      ],
    }
    const { container } = render(
      <DayDiscussion
        view={roleView}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Mafia' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Town' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Neutral' })).toBeVisible()
    expect(screen.getAllByText('Role hidden')).toHaveLength(2)
    expect(screen.getByText('Doctor')).toBeVisible()
    expect(container).not.toHaveTextContent('Jester')
    expect(container).not.toHaveTextContent('Executioner')
    const cardsBefore = [...container.querySelectorAll('.host-role-card')]

    fireEvent.click(screen.getByRole('button', { name: 'Show roles' }))

    expect(screen.getByRole('button', { name: 'Hide roles' })).toBeVisible()
    expect(screen.getByText('Jester')).toBeVisible()
    expect(screen.getByText('Originally: Executioner')).toBeVisible()
    expect(screen.getByText('Doctor')).toBeVisible()
    expect(screen.getByText('Godfather')).toBeVisible()
    expect(screen.getByText('Originally: Framer')).toBeVisible()
    expect(screen.getByText('Godfather').closest('li')).toHaveClass('host-role-card--mafia')
    expect(screen.getByText('Doctor').closest('li')).toHaveClass('host-role-card--town')
    expect(screen.getByText('Jester').closest('li')).toHaveClass('host-role-card--neutral')
    expect([...container.querySelectorAll('.host-role-card')]).toEqual(cardsBefore)
    expect(container).not.toHaveTextContent('Alignment:')
    expect(container.innerHTML).not.toMatch(
      /authority-player|role-instance|targetPlayerId|personalWin|pendingJester|revenge/,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Hide roles' }))

    expect(screen.getByRole('button', { name: 'Show roles' })).toBeVisible()
    expect(screen.getAllByText('Role hidden')).toHaveLength(2)
    expect(screen.getByText('Doctor')).toBeVisible()
    expect(container).not.toHaveTextContent('Jester')
    expect(container).not.toHaveTextContent('Executioner')
    expect([...container.querySelectorAll('.host-role-card')]).toEqual(cardsBefore)
  })

  it('uses stable player identity when display labels collide without rendering raw IDs', () => {
    const collidingView: DayDiscussionView = {
      ...hostView(),
      groups: defaultHostView().groups.map((group) => ({
        ...group,
        players: group.players.map((player) => ({
          ...player,
          playerDisplayLabel: 'Colliding label',
        })),
      })),
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { container } = render(
      <DayDiscussion
        view={collidingView}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    expect(screen.getAllByText('Colliding label')).toHaveLength(3)
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key|unique.*key/i)
    expect(container.innerHTML).not.toMatch(/authority-player/)
    consoleError.mockRestore()
  })
})

describe('host Mayor reveal dialog', () => {
  it('receives focus, makes the background inert, cancels on Escape, and restores focus', () => {
    const onDialogPresentationChange = vi.fn()
    const { container } = render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={() => true}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={onDialogPresentationChange}
      />,
    )
    const openButton = screen.getByRole('button', { name: 'Confirm Mayor reveal' })
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.click(openButton)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveFocus()
    expect(dialog).toHaveTextContent('Mayor reveal')
    expect(dialog).not.toHaveTextContent(/host-only|keep this screen hidden/i)
    expect(container.querySelector('.day-discussion__content')).toHaveAttribute('inert')
    expect(onDialogPresentationChange).toHaveBeenLastCalledWith(true)
    expect(container.innerHTML).not.toMatch(/authority-player/)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(openButton).toHaveFocus()
    expect(onDialogPresentationChange).toHaveBeenLastCalledWith(false)
  })

  it('requires selection, uses duplicate-safe labels, and confirms clear public consequences', () => {
    const onConfirm = vi.fn(() => true)
    render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
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

  it('guards rapid repeated confirmation in the host dialog', () => {
    const onConfirm = vi.fn(() => true)
    render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
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
        view={hostView()}
        mayorCandidates={candidates}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
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
        view={hostView()}
        mayorCandidates={[secondCandidate]}
        revealError={null}
        onConfirmMayorReveal={onConfirm}
        onClearRevealError={() => undefined}
        onDialogPresentationChange={() => undefined}
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

describe('host final-day dialogs', () => {
  it('shows only living display labels and guards a deliberate execution confirmation', () => {
    const onExecute = vi.fn(() => true)
    const onDialogPresentationChange = vi.fn()
    const { container } = render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        executionCandidates={[
          executionCandidate(hiddenMayorId, 'Alex (Player 1)', 'mafia', 'Godfather'),
          executionCandidate(revealedMayorId, 'Alex (Player 2)'),
          executionCandidate(deadPlayerId, 'Taylor', 'neutral', 'Jester'),
        ]}
        revealError={null}
        outcomeError={null}
        onConfirmMayorReveal={() => true}
        onExecutePlayer={onExecute}
        onEndDayWithoutExecution={() => true}
        onClearRevealError={() => undefined}
        onClearOutcomeError={() => undefined}
        onDialogPresentationChange={onDialogPresentationChange}
      />,
    )

    const openButton = screen.getByRole('button', { name: 'Execute a player' })
    fireEvent.click(openButton)
    const dialog = screen.getByRole('alertdialog', { name: 'Execute a player' })
    expect(dialog).toHaveFocus()
    expect(container.querySelector('.day-discussion__content')).toHaveAttribute('inert')
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3)
    const mafiaGroup = within(dialog).getByRole('group', { name: 'MAFIA' })
    const townGroup = within(dialog).getByRole('group', { name: 'TOWN' })
    const neutralGroup = within(dialog).getByRole('group', { name: 'NEUTRAL' })
    expect(mafiaGroup).toHaveTextContent('Alex (Player 1)Godfather')
    expect(townGroup).toHaveTextContent('Alex (Player 2)Citizen')
    expect(neutralGroup).toHaveTextContent('TaylorJester')
    expect(mafiaGroup).toHaveClass('execution-candidate-group--mafia')
    expect(townGroup).toHaveClass('execution-candidate-group--town')
    expect(neutralGroup).toHaveClass('execution-candidate-group--neutral')
    expect(dialog).toHaveClass('mayor-reveal--execution')
    expect(dialog).not.toHaveTextContent('Alignment:')
    expect(dialog).not.toHaveTextContent(/role instance|target|revenge|personal win/i)

    const cardsBefore = [...dialog.querySelectorAll('.mayor-reveal__candidate')]
    fireEvent.click(within(dialog).getByRole('radio', { name: /Alex \(Player 2\)Citizen/ }))
    expect(dialog).toHaveTextContent('Execute Alex (Player 2)?')
    expect(dialog).toHaveTextContent('Role: Citizen')
    expect(dialog).not.toHaveTextContent('Alignment:')
    expect([...dialog.querySelectorAll('.mayor-reveal__candidate')]).toEqual(cardsBefore)
    expect(dialog).toHaveTextContent(
      'This permanently records Alex (Player 2) as the player executed on Day 1. This action cannot be undone.',
    )
    const confirm = within(dialog).getByRole('button', {
      name: 'Execute Alex (Player 2)',
    })
    act(() => {
      confirm.click()
      confirm.click()
    })

    expect(onExecute).toHaveBeenCalledTimes(1)
    expect(onExecute).toHaveBeenCalledWith(revealedMayorId)
    expect(onDialogPresentationChange).toHaveBeenCalledWith(true)
  })

  it('cancels execution with Escape and restores focus without applying an outcome', () => {
    const onExecute = vi.fn(() => true)
    render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        executionCandidates={[executionCandidate(hiddenMayorId, 'Alex (Player 1)')]}
        revealError={null}
        outcomeError={null}
        onConfirmMayorReveal={() => true}
        onExecutePlayer={onExecute}
        onEndDayWithoutExecution={() => true}
        onClearRevealError={() => undefined}
        onClearOutcomeError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    const openButton = screen.getByRole('button', { name: 'Execute a player' })
    fireEvent.click(openButton)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(openButton).toHaveFocus()
    expect(onExecute).not.toHaveBeenCalled()
  })

  it('keeps an unbroken selected-player label inside the narrow execution dialog', () => {
    const longPlayerLabel = `Alex${'UnbrokenName'.repeat(18)}`
    render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        executionCandidates={[executionCandidate(hiddenMayorId, longPlayerLabel)]}
        revealError={null}
        outcomeError={null}
        onConfirmMayorReveal={() => true}
        onExecutePlayer={() => true}
        onEndDayWithoutExecution={() => true}
        onClearRevealError={() => undefined}
        onClearOutcomeError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Execute a player' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Execute a player' })
    fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(longPlayerLabel) }))

    expect(dialog).toHaveTextContent(`Execute ${longPlayerLabel}?`)
    expect(within(dialog).getByRole('button', { name: `Execute ${longPlayerLabel}` })).toBeVisible()
  })

  it('confirms no execution once and persists no temporary selection in the component DOM', () => {
    const onEndDay = vi.fn(() => true)
    const { container } = render(
      <DayDiscussion
        view={hostView()}
        mayorCandidates={candidates}
        executionCandidates={[executionCandidate(hiddenMayorId, 'Alex (Player 1)')]}
        revealError={null}
        outcomeError={null}
        onConfirmMayorReveal={() => true}
        onExecutePlayer={() => true}
        onEndDayWithoutExecution={onEndDay}
        onClearRevealError={() => undefined}
        onClearOutcomeError={() => undefined}
        onDialogPresentationChange={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'End day without execution' }))
    const dialog = screen.getByRole('alertdialog', {
      name: 'End Day 1 without an execution?',
    })
    expect(dialog).toHaveTextContent('No player will be executed today.')
    const confirm = within(dialog).getByRole('button', {
      name: 'End day without execution',
    })
    act(() => {
      confirm.click()
      confirm.click()
    })

    expect(onEndDay).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).not.toMatch(/selectedExecutionPlayerId|operationPending/)
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
    expect(css).toContain('.host-role-card--mafia')
    expect(css).toContain('background: var(--faction-mafia-soft)')
    expect(css).toContain('.host-role-card--town')
    expect(css).toContain('background: var(--faction-town-soft)')
    expect(css).toContain('.host-role-card--neutral')
    expect(css).toContain('background: var(--faction-neutral-soft)')
    expect(css).toContain('.execution-candidate-group--mafia')
    expect(css).toContain('.execution-candidate-group--town')
    expect(css).toContain('.execution-candidate-group--neutral')
    expect(css).toMatch(
      /\.host-role-view__groups\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    )
    expect(css).toMatch(
      /\.execution-candidate-groups\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    )
    expect(css).toMatch(
      /\.execution-candidate-group label > span,[\s\S]*?\.execution-candidate-group label > small\s*\{[\s\S]*?overflow-wrap:\s*anywhere/,
    )
    expect(css).toContain('width: calc(100vw - 2rem)')
    expect(css).toMatch(/\.mayor-reveal--execution\s*\{[\s\S]*?overflow-wrap:\s*anywhere/)
    expect(css).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*14rem\),\s*1fr\)\)/,
    )
  })
})
