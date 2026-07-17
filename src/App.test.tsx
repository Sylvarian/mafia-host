import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'

import type { RoleAssignmentDependencies } from '@/application/role-assignment/index.ts'
import { GameSetup } from '@/features/game-setup/index.ts'
import { SequentialRoleAssignmentIdentitySource } from '../tests/support/sequential-role-assignment-identity-source.ts'

import App from './App.tsx'

describe('Phase 2 and Phase 3 host workflow', () => {
  it('adds players, toggles participation, changes role counts, and shows mismatch feedback', () => {
    render(<App />)

    const prepareButton = screen.getByRole('button', { name: 'Prepare Game' })
    expect(prepareButton).toBeDisabled()

    addPlayer('Alice')
    expect(screen.getByText('1 role short')).toBeVisible()
    addPlayer('Bob')

    expect(screen.getByText('2 participating players')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    expect(
      screen.getByText('Add 1 more selected role to match the participating players.'),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Increase Citizen count' }))
    expect(screen.getByText('Counts match and at least one Mafia role is selected.')).toBeVisible()
    expect(prepareButton).toBeEnabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bob (player-2) participation' }))
    expect(screen.getByText('1 participating player')).toBeVisible()
    expect(
      screen.getByText('Remove 1 selected role to match the participating players.'),
    ).toBeVisible()
    expect(prepareButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Decrease Citizen count' }))
    expect(prepareButton).toBeEnabled()
  })

  it('configures every documented game setting with an explicit value', () => {
    render(<App />)

    const settingNames = [
      'Godfather and Serial Killer can kill each other',
      'Doctor can self-protect',
      'Doctor cannot repeat the previous target',
      'Reveal role on death',
      'Allow first-night kills',
    ]

    for (const [index, settingName] of settingNames.entries()) {
      const checkbox = screen.getByRole('checkbox', { name: new RegExp(settingName, 'i') })
      expect(checkbox).not.toBeChecked()
      fireEvent.click(checkbox)
      expect(checkbox).toBeChecked()
      expect(screen.getAllByText('Enabled')).toHaveLength(index + 1)

      for (const untouchedSettingName of settingNames.slice(index + 1)) {
        expect(
          screen.getByRole('checkbox', { name: new RegExp(untouchedSettingName, 'i') }),
        ).not.toBeChecked()
      }
    }

    expect(screen.getAllByText('Enabled')).toHaveLength(5)
  })

  it('reviews the exact validated setup and preserves the draft when returning before assignment', () => {
    render(<App />)

    addPlayer('Alice')
    addPlayer('Bob')
    addPlayer('Casey')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Casey (player-3) participation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Citizen count' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Reveal role on death/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Doctor can self-protect/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))

    expect(screen.getByRole('heading', { name: 'Setup prepared' })).toBeVisible()
    expect(screen.getByText('Alice')).toBeVisible()
    expect(screen.getByText('Bob')).toBeVisible()
    expect(screen.queryByText('Casey')).toBeNull()
    expect(screen.getByText('Godfather')).toBeVisible()
    expect(screen.getByText('Citizen')).toBeVisible()
    expect(
      screen.getByText(/No active game exists until you deliberately assign roles/),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Assign Roles' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Return to setup' }))

    expect(screen.getByDisplayValue('Alice')).toBeVisible()
    expect(screen.getByDisplayValue('Bob')).toBeVisible()
    expect(screen.getByDisplayValue('Casey')).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
    expect(screen.getByRole('spinbutton', { name: 'Citizen count' })).toHaveValue(1)
    expect(screen.getByRole('checkbox', { name: /Reveal role on death/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Doctor can self-protect/i })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Casey (player-3) participation' }),
    ).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Prepare Game' })).toBeEnabled()
  })

  it('assigns roles privately, numbers duplicates, tracks every card, and stops before Phase 4', () => {
    render(<App />)

    addPlayer('Alex')
    addPlayer('Alex')
    addPlayer('Casey')
    addPlayer('Dana')
    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Doctor count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Doctor count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Executioner count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))

    expect(screen.getByRole('heading', { name: 'Distribute physical role cards' })).toBeVisible()
    expect(screen.getByText('Godfather')).toBeVisible()
    expect(screen.getByText('Doctor 1')).toBeVisible()
    expect(screen.getByText('Doctor 2')).toBeVisible()
    expect(screen.getByText('Executioner')).toBeVisible()
    expect(screen.getByText('ID player-1')).toBeVisible()
    expect(screen.getByText('ID player-2')).toBeVisible()
    expect(screen.queryByText(/Executioner target:/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /submit night action|resolve night/i })).toBeNull()

    const confirmDistribution = screen.getByRole('button', {
      name: 'Confirm Role Distribution',
    })
    expect(screen.getByText('0 of 4')).toBeVisible()
    expect(confirmDistribution).toBeDisabled()

    const firstAlexDelivery = screen.getByRole('checkbox', {
      name: 'Card delivered to Alex (player-1)',
    })
    fireEvent.click(firstAlexDelivery)
    expect(screen.getByText('1 of 4')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Reassign Roles' }))
    const reassignDialog = screen.getByRole('alertdialog', {
      name: 'Generate a new assignment?',
    })
    expect(within(reassignDialog).getByText(/1 card delivery will be cleared/)).toBeVisible()
    const confirmReassignment = within(reassignDialog).getByRole('button', {
      name: 'Yes, reassign roles',
    })
    expect(confirmReassignment).toHaveFocus()
    const assignmentList = screen.getByRole('list', { name: 'Private role assignments' })
    const assignmentBeforeCancellation = assignmentList.textContent
    fireEvent.click(within(reassignDialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Reassign Roles' })).toHaveFocus()
    expect(assignmentList.textContent).toBe(assignmentBeforeCancellation)

    fireEvent.click(screen.getByRole('button', { name: 'Reassign Roles' }))
    const reopenedReassignDialog = screen.getByRole('alertdialog', {
      name: 'Generate a new assignment?',
    })
    const reopenedConfirmReassignment = within(reopenedReassignDialog).getByRole('button', {
      name: 'Yes, reassign roles',
    })
    fireEvent.click(reopenedConfirmReassignment)

    expect(screen.getByText('0 of 4')).toBeVisible()
    expect(firstAlexDelivery).not.toBeChecked()

    for (const checkbox of screen.getAllByRole('checkbox', { name: /Card delivered to/ })) {
      fireEvent.click(checkbox)
    }

    expect(screen.getByText('4 of 4')).toBeVisible()
    expect(confirmDistribution).toBeEnabled()
    fireEvent.click(confirmDistribution)

    expect(screen.getByRole('heading', { name: 'Role distribution complete' })).toBeVisible()
    expect(screen.getByText('Ready to begin the first night')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Begin First Night — available in Phase 4' }),
    ).toBeDisabled()
    expect(screen.getByText(/active game remains in role-distribution/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: /collect|target|resolve night/i })).toBeNull()
  })

  it('requires deliberate abandonment before returning an active assignment to setup', () => {
    render(<App />)

    addPlayer('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))
    const abandonButton = screen.getByRole('button', {
      name: 'Abandon assignment and return to setup',
    })
    fireEvent.click(abandonButton)

    const dialog = screen.getByRole('alertdialog', { name: 'Abandon this assignment?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Distribute physical role cards' })).toBeVisible()
    expect(abandonButton).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Abandon assignment and return to setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, abandon assignment' }))

    expect(screen.getByDisplayValue('Alice')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Distribute physical role cards' })).toBeNull()
  })

  it('reassigns directly before delivery and only confirms once delivery has started', () => {
    render(<App />)

    addPlayer('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))

    fireEvent.click(screen.getByRole('button', { name: 'Reassign Roles' }))
    expect(screen.queryByRole('alertdialog', { name: 'Generate a new assignment?' })).toBeNull()
    expect(screen.getByText('0 of 1')).toBeVisible()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Card delivered to Alice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reassign Roles' }))
    expect(screen.getByRole('alertdialog', { name: 'Generate a new assignment?' })).toBeVisible()
  })

  it('abandons, edits, prepares, and creates a new game only after another explicit assignment', () => {
    render(<App />)

    addPlayer('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abandon assignment and return to setup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, abandon assignment' }))

    addPlayer('Bob')
    fireEvent.click(screen.getByRole('button', { name: 'Increase Citizen count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))

    expect(screen.getByRole('heading', { name: 'Setup prepared' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Distribute physical role cards' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))
    expect(screen.getAllByRole('checkbox', { name: /Card delivered to/ })).toHaveLength(2)
  })

  it('keeps injected adapters idle in Strict Mode and guards repeated assignment actions', () => {
    let randomRequestCount = 0
    let gameIdRequestCount = 0
    let roleInstanceIdRequestCount = 0
    const sequentialIdentities = new SequentialRoleAssignmentIdentitySource()
    const dependencies: RoleAssignmentDependencies = {
      randomSource: {
        next: () => {
          randomRequestCount += 1
          return 0
        },
      },
      identitySource: {
        nextGameId: () => {
          gameIdRequestCount += 1
          return sequentialIdentities.nextGameId()
        },
        nextRoleInstanceId: () => {
          roleInstanceIdRequestCount += 1
          return sequentialIdentities.nextRoleInstanceId()
        },
      },
    }
    const view = render(
      <StrictMode>
        <GameSetup roleAssignmentDependencies={dependencies} />
      </StrictMode>,
    )

    view.rerender(
      <StrictMode>
        <GameSetup roleAssignmentDependencies={dependencies} />
      </StrictMode>,
    )
    expect({ randomRequestCount, gameIdRequestCount, roleInstanceIdRequestCount }).toEqual({
      randomRequestCount: 0,
      gameIdRequestCount: 0,
      roleInstanceIdRequestCount: 0,
    })

    addPlayer('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    const assignButton = screen.getByRole('button', { name: 'Assign Roles' })

    act(() => {
      assignButton.click()
      assignButton.click()
    })
    expect({ randomRequestCount, gameIdRequestCount, roleInstanceIdRequestCount }).toEqual({
      randomRequestCount: 0,
      gameIdRequestCount: 1,
      roleInstanceIdRequestCount: 1,
    })

    const reassignButton = screen.getByRole('button', { name: 'Reassign Roles' })
    act(() => {
      reassignButton.click()
      reassignButton.click()
    })
    expect({ randomRequestCount, gameIdRequestCount, roleInstanceIdRequestCount }).toEqual({
      randomRequestCount: 0,
      gameIdRequestCount: 2,
      roleInstanceIdRequestCount: 2,
    })
  })

  it('rejects blank names and confirms roster removal', () => {
    render(<App />)

    const nameInput = screen.getByLabelText('Player name')
    fireEvent.change(nameInput, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a player name before adding them.')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveAttribute('aria-describedby', 'roster-edit-error')

    fireEvent.change(nameInput, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }))
    expect(nameInput).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alice (player-1)' }))

    const confirmation = screen.getByRole('alertdialog', {
      name: 'Remove Alice (player-1)?',
    })
    expect(confirmation).toBeVisible()
    const confirmRemovalButton = within(confirmation).getByRole('button', { name: 'Yes, remove' })
    expect(confirmRemovalButton).toHaveFocus()
    fireEvent.keyDown(confirmRemovalButton, { key: 'Escape' })
    expect(screen.getByDisplayValue('Alice')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Remove Alice (player-1)' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Alice (player-1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    expect(screen.queryByDisplayValue('Alice')).toBeNull()
    expect(nameInput).toHaveFocus()
  })

  it('keeps duplicate display names distinguishable and renames only the selected identity', () => {
    render(<App />)

    addPlayer('Alex')
    addPlayer('Alex')

    const firstAlex = screen.getByRole('listitem', {
      name: 'Roster entry Alex, ID player-1',
    })
    const secondAlex = screen.getByRole('listitem', {
      name: 'Roster entry Alex, ID player-2',
    })
    const firstRenameInput = within(firstAlex).getByRole('textbox', {
      name: 'Rename Alex (player-1)',
    })

    fireEvent.change(firstRenameInput, { target: { value: 'Alexis' } })
    fireEvent.click(within(firstAlex).getByRole('button', { name: 'Save name' }))

    expect(screen.getByRole('listitem', { name: 'Roster entry Alexis, ID player-1' })).toBeVisible()
    expect(within(secondAlex).getByRole('textbox', { name: 'Rename Alex (player-2)' })).toHaveValue(
      'Alex',
    )
  })

  it('retains the roster when every player is switched off', () => {
    render(<App />)

    addPlayer('Alice')
    addPlayer('Bob')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alice (player-1) participation' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bob (player-2) participation' }))

    expect(screen.getByText('0 participating players')).toBeVisible()
    expect(screen.getByRole('listitem', { name: 'Roster entry Alice, ID player-1' })).toBeVisible()
    expect(screen.getByRole('listitem', { name: 'Roster entry Bob, ID player-2' })).toBeVisible()
  })

  it('normalises an empty role input and rejects invalid numeric values without corrupting totals', () => {
    render(<App />)

    const citizenCount = screen.getByRole('spinbutton', { name: 'Citizen count' })
    fireEvent.change(citizenCount, { target: { value: '' } })
    expect(citizenCount).toHaveValue(0)

    fireEvent.change(citizenCount, { target: { value: '-1' } })
    expect(citizenCount).toHaveValue(0)

    fireEvent.change(citizenCount, { target: { value: '1.5' } })
    expect(citizenCount).toHaveValue(0)
    expect(citizenCount).toHaveAttribute('aria-invalid', 'true')
    expect(citizenCount).toHaveAttribute('aria-describedby', 'role-count-edit-error')
    expect(
      screen.getByText(
        'Role counts must be non-negative whole numbers within the supported numeric range.',
      ),
    ).toBeVisible()
    expect(screen.getByText('0 — matched')).toBeVisible()
  })
})

function addPlayer(name: string): void {
  const input = screen.getByLabelText('Player name')
  fireEvent.change(input, { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Add player' }))
}
