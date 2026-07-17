import { fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RoleAssignmentDependencies } from '@/application/role-assignment/index.ts'
import {
  restorePersistedSessionEnvelopeV1,
  type ClearPersistedSessionResult,
  type GameSessionStore,
  type LoadPersistedSessionResult,
  type PersistedSessionEnvelopeV1,
  type SavePersistedSessionResult,
  type SessionClock,
} from '@/application/session-persistence/index.ts'
import { SequentialRoleAssignmentIdentitySource } from '../tests/support/sequential-role-assignment-identity-source.ts'

import App from './App.tsx'

const CLOCK: SessionClock = {
  now: () => '2026-07-17T10:00:00.000Z',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('local session refresh recovery', () => {
  it('restores editing setup only after acknowledgement and keeps the summary public-safe', () => {
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)

    addPlayer('Secret Alice')
    expect(store.envelope).not.toBeNull()
    const savedUrl = window.location.href
    const savedTitle = document.title
    firstView.unmount()

    const restoredView = renderApp(store)
    expect(screen.getByRole('heading', { name: 'Saved game found' })).toBeVisible()
    expect(screen.getByText('Setup editing')).toBeVisible()
    expect(document.body).not.toHaveTextContent('Secret Alice')
    expect(window.location.href).toBe(savedUrl)
    expect(document.title).toBe(savedTitle)

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByDisplayValue('Secret Alice')).toBeVisible()
    restoredView.unmount()
  })

  it('restores partial card delivery without exposing assignments on the resume screen', () => {
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)
    prepareTwoPlayerGame()
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Card delivered to Alice' }))
    expect(screen.getByText('1 of 2')).toBeVisible()
    firstView.unmount()

    renderApp(store)
    expect(screen.getByText('Role distribution')).toBeVisible()
    expect(document.body).not.toHaveTextContent('Godfather')
    expect(document.body).not.toHaveTextContent('Sheriff')
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByText('1 of 2')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Card delivered to Alice' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Card delivered to Bob' })).not.toBeChecked()
  })

  it('does not save or restore a tentative target before host confirmation', () => {
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)
    enterFirstNight()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const saveCountBeforeSelection = store.saveCount
    const savedSessionBeforeSelection = JSON.stringify(store.envelope)
    const godfatherTargets = screen.getByRole('group', { name: 'Targets for Godfather' })
    fireEvent.click(within(godfatherTargets).getByRole('button', { name: 'Alice, alive' }))
    expect(within(godfatherTargets).getByRole('button', { name: /Alice, alive/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(store.saveCount).toBe(saveCountBeforeSelection)
    expect(JSON.stringify(store.envelope)).toBe(savedSessionBeforeSelection)
    firstView.unmount()

    renderApp(store)
    expect(screen.getByText('Night 1 — Night action collection')).toBeVisible()
    expect(document.body).not.toHaveTextContent('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Collect Godfather action for Bob' })).toBeVisible()
    expect(screen.queryByText(/Previously confirmed target restored/)).toBeNull()
    expect(
      within(screen.getByRole('group', { name: 'Targets for Godfather' })).getByRole('button', {
        name: /Alice, alive/,
      }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('saves one canonical transition after target confirmation and restores the next step', () => {
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)
    enterFirstNight()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Targets for Godfather' })).getByRole('button', {
        name: 'Alice, alive',
      }),
    )
    const saveCountBeforeConfirmation = store.saveCount
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Target / Continue' }))
    expect(store.saveCount).toBe(saveCountBeforeConfirmation + 1)
    expect(screen.getByRole('heading', { name: 'Close the Mafia wake window' })).toBeVisible()
    firstView.unmount()

    renderApp(store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Close the Mafia wake window' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText(/Previously confirmed target restored/)).toBeVisible()
    expect(
      within(screen.getByRole('group', { name: 'Targets for Godfather' })).getByRole('button', {
        name: /Alice, alive/,
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores private result presentation without leaking it into the resume summary', () => {
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)
    resolveTwoPlayerNight()
    expect(screen.getByRole('heading', { name: 'Only show this result to Alice' })).toBeVisible()
    expect(screen.getByText('Bob appears suspicious.')).toBeVisible()
    firstView.unmount()

    renderApp(store)
    expect(screen.getByText('Night 1 — Private results')).toBeVisible()
    expect(document.body).not.toHaveTextContent('Alice')
    expect(document.body).not.toHaveTextContent('Bob')
    expect(document.body).not.toHaveTextContent('suspicious')
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Only show this result to Alice' })).toBeVisible()
    expect(screen.getByText('Bob appears suspicious.')).toBeVisible()
  })

  it('restores public Dawn and the Dawn save retains no private resolution material', () => {
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)
    resolveTwoPlayerNight()
    fireEvent.click(screen.getByRole('button', { name: 'Result communicated' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Dawn Announcement' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Dawn Announcement' }))
    expect(screen.getByRole('heading', { name: 'Dawn deaths' })).toBeVisible()
    const savedText = JSON.stringify(store.envelope)
    expect(savedText).not.toContain('resolution')
    expect(savedText).not.toContain('collectedActions')
    expect(savedText).not.toContain('attackAttempts')
    expect(savedText).not.toContain('acknowledgedResultIds')
    firstView.unmount()

    renderApp(store)
    expect(screen.getByText('Night 1 — Dawn announcement')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Dawn deaths' })).toBeVisible()
    expect(screen.getByText('Alice').closest('li')).toHaveTextContent(
      'Alice died during the night.',
    )
    expect(screen.queryByText(/suspicious|protected|blocked|framed/i)).toBeNull()
  })

  it('confirms deletion, supports cancellation, and clears only after success', () => {
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)
    addPlayer('Alice')
    firstView.unmount()
    renderApp(store)

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved game' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this saved game?' })
    expect(within(dialog).getByRole('button', { name: 'Yes, delete saved game' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('heading', { name: 'Saved game found' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Delete saved game' })).toHaveFocus()
    expect(store.envelope).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Start a new game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete save and start new' }))
    expect(store.envelope).toBeNull()
    expect(screen.getByText('0 participating players')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Saved game found' })).toBeNull()
  })

  it('keeps gameplay in memory after save failure and retries without duplicate Strict Mode writes', () => {
    const store = new MemoryGameSessionStore()
    store.failSave = true
    renderApp(store, true)

    addPlayer('Alice')
    expect(screen.getByDisplayValue('Alice')).toBeVisible()
    expect(
      screen.getByText(/Unable to save locally — the current game will continue in this tab/),
    ).toBeVisible()
    expect(store.saveCount).toBe(1)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(screen.getByText('Saved locally')).toBeVisible()
    expect(store.saveCount).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    expect(store.saveCount).toBe(3)
  })

  it('does not reset the in-memory session when confirmed deletion fails', () => {
    const store = new MemoryGameSessionStore()
    store.failClear = true
    renderApp(store)
    addPlayer('Alice')

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete saved game' }))

    expect(screen.getByDisplayValue('Alice')).toBeVisible()
    expect(store.envelope).not.toBeNull()
    expect(
      screen.getByText('The local save could not be deleted. The current session is unchanged.'),
    ).toBeVisible()

    store.failClear = false
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete saved game' }))
    expect(store.envelope).toBeNull()
    expect(screen.getByText('0 participating players')).toBeVisible()
  })

  it('shows safe invalid and incompatible recovery without deleting or overwriting automatically', () => {
    const invalidStore = new MemoryGameSessionStore()
    invalidStore.loadOverride = { ok: false, error: { type: 'INVALID_JSON' } }
    const invalidView = renderApp(invalidStore)
    expect(
      screen.getByRole('heading', { name: 'The saved game could not be restored.' }),
    ).toBeVisible()
    expect(screen.getByText(/damaged or incomplete/)).toBeVisible()
    expect(screen.queryByLabelText('Player name')).toBeNull()
    expect(invalidStore.clearCount).toBe(0)
    expect(invalidStore.saveCount).toBe(0)
    invalidView.unmount()

    const incompatibleStore = new MemoryGameSessionStore()
    incompatibleStore.loadOverride = {
      ok: false,
      error: { type: 'UNSUPPORTED_SCHEMA_VERSION', schemaVersion: 2 },
    }
    renderApp(incompatibleStore)
    expect(
      screen.getByRole('heading', {
        name: 'This saved game was created by an incompatible version of the app.',
      }),
    ).toBeVisible()
    expect(incompatibleStore.clearCount).toBe(0)
    expect(incompatibleStore.saveCount).toBe(0)
  })

  it('does not log saved secrets or autosave again merely by continuing a restored session', () => {
    const consoleLog = vi.spyOn(console, 'log')
    const store = new MemoryGameSessionStore()
    const firstView = renderApp(store)
    addPlayer('Secret Alice')
    const saveCount = store.saveCount
    firstView.unmount()

    renderApp(store, true)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(store.saveCount).toBe(saveCount)
    expect(consoleLog).not.toHaveBeenCalled()
  })
})

function prepareTwoPlayerGame(): void {
  addPlayer('Alice')
  addPlayer('Bob')
  fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase Sheriff count' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Allow first-night kills/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
}

function enterFirstNight(): void {
  prepareTwoPlayerGame()
  fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))
  for (const checkbox of screen.getAllByRole('checkbox', { name: /Card delivered to/ })) {
    fireEvent.click(checkbox)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Role Distribution' }))
  fireEvent.click(screen.getByRole('button', { name: 'Begin First Night' }))
}

function resolveTwoPlayerNight(): void {
  enterFirstNight()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Targets for Godfather' })).getByRole('button', {
      name: 'Alice, alive',
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Target / Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Targets for Sheriff' })).getByRole('button', {
      name: 'Bob, alive',
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Target / Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish Collecting Night Actions' }))
  fireEvent.click(screen.getByRole('button', { name: 'Resolve Night' }))
}

function addPlayer(name: string): void {
  const input = screen.getByLabelText('Player name')
  fireEvent.change(input, { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Add player' }))
}

function renderApp(store: MemoryGameSessionStore, strict = false) {
  const app = (
    <App
      roleAssignmentDependencies={createDependencies()}
      sessionStore={store}
      sessionClock={CLOCK}
      initialLoadResult={store.load()}
    />
  )
  return render(strict ? <StrictMode>{app}</StrictMode> : app)
}

function createDependencies(): RoleAssignmentDependencies {
  return {
    randomSource: { next: () => 0 },
    identitySource: new SequentialRoleAssignmentIdentitySource(),
  }
}

class MemoryGameSessionStore implements GameSessionStore {
  envelope: PersistedSessionEnvelopeV1 | null = null
  loadOverride: LoadPersistedSessionResult | null = null
  failSave = false
  failClear = false
  loadCount = 0
  saveCount = 0
  clearCount = 0

  load(): LoadPersistedSessionResult {
    this.loadCount += 1
    if (this.loadOverride !== null) {
      return this.loadOverride
    }
    if (this.envelope === null) {
      return { ok: false, error: { type: 'NO_SAVED_SESSION' } }
    }
    return restorePersistedSessionEnvelopeV1(JSON.parse(JSON.stringify(this.envelope)) as unknown)
  }

  save(envelope: PersistedSessionEnvelopeV1): SavePersistedSessionResult {
    this.saveCount += 1
    if (this.failSave) {
      return { ok: false, error: { type: 'SAVE_FAILURE', errorName: 'TestWriteError' } }
    }
    this.envelope = envelope
    return { ok: true }
  }

  clear(): ClearPersistedSessionResult {
    this.clearCount += 1
    if (this.failClear) {
      return { ok: false, error: { type: 'CLEAR_FAILURE', errorName: 'TestClearError' } }
    }
    this.envelope = null
    return { ok: true }
  }
}
