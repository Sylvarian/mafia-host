import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App.tsx'

describe('Phase 2 host setup workflow', () => {
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

  it('prepares only a validated setup and preserves the draft when returning', () => {
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
    expect(screen.getByText(/No players are linked to roles/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /assign roles|start game|card given/i })).toBeNull()
    expect(
      screen.queryByText(/role assignment|active game|assign roles|start game|card given/i),
    ).toBeNull()

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
