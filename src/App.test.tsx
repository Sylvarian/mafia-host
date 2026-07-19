import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createExecutionerBriefingWorkflow } from '@/application/executioner-briefing/index.ts'
import {
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  ROLE_IDS,
} from '@/application/night-actions/index.ts'
import type { RoleAssignmentDependencies } from '@/application/role-assignment/index.ts'
import type {
  ClearPersistedSessionResult,
  GameSessionStore,
  LoadPersistedSessionResult,
  PersistedSessionEnvelopeV2,
  SavePersistedSessionResult,
  SequentialNightAppSession,
  SessionClock,
} from '@/application/session-persistence/index.ts'
import { restorePersistedSessionEnvelopeV2 } from '@/application/session-persistence/index.ts'
import { createNightFixture } from '../tests/support/night-action-fixtures.ts'
import { SequentialRoleAssignmentIdentitySource } from '../tests/support/sequential-role-assignment-identity-source.ts'
import App from './App.tsx'

const CLOCK: SessionClock = { now: () => '2026-07-18T10:00:00.000Z' }

class MemorySessionStore implements GameSessionStore {
  saveCount = 0
  failSave = false
  lastSuccessfulEnvelope: PersistedSessionEnvelopeV2 | null = null
  attemptedEnvelopes: PersistedSessionEnvelopeV2[] = []

  load(): LoadPersistedSessionResult {
    return { ok: false, error: { type: 'NO_SAVED_SESSION' } }
  }

  save(envelope: PersistedSessionEnvelopeV2): SavePersistedSessionResult {
    this.saveCount += 1
    this.attemptedEnvelopes.push(envelope)
    if (this.failSave) {
      return { ok: false, error: { type: 'SAVE_FAILURE', errorName: 'TestFailure' } }
    }
    this.lastSuccessfulEnvelope = envelope
    return { ok: true }
  }

  clear(): ClearPersistedSessionResult {
    return { ok: true }
  }
}

function dependencies(randomNext = vi.fn(() => 0)): RoleAssignmentDependencies {
  return {
    randomSource: { next: randomNext },
    identitySource: new SequentialRoleAssignmentIdentitySource(),
  }
}

function renderLoaded(
  session: Extract<LoadPersistedSessionResult, Readonly<{ ok: true }>>['value']['session'],
  store = new MemorySessionStore(),
  randomNext = vi.fn(() => 0),
) {
  const initialLoadResult: LoadPersistedSessionResult = {
    ok: true,
    value: { schemaVersion: 2, savedAt: CLOCK.now(), session },
  }
  const view = render(
    <StrictMode>
      <App
        roleAssignmentDependencies={dependencies(randomNext)}
        sessionStore={store}
        sessionClock={CLOCK}
        initialLoadResult={initialLoadResult}
      />
    </StrictMode>,
  )
  return { ...view, store, randomNext }
}

function activeWorkflow(
  roles: Parameters<typeof createNightFixture>[0],
): SequentialNightAppSession['workflow'] {
  const fixture = createNightFixture(roles, {
    phase: 'night-action-collection',
    nightNumber: 2,
    settings: { allowFirstNightKills: true, doctorCanSelfProtect: true },
  })
  const created = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
  if (!created.ok) throw new Error(`Could not create workflow: ${created.error.type}`)
  const advanced = continueNightActionCollection(created.value)
  if (!advanced.ok) throw new Error(`Could not pass overview: ${advanced.error.type}`)
  if (advanced.value.status === 'complete') {
    throw new Error('Expected an active actor after overview.')
  }
  return advanced.value
}

function dawnSession() {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.mayor, name: 'Morgan' },
      { roleId: ROLE_IDS.citizen, name: 'Casey' },
      { roleId: ROLE_IDS.mayor, name: 'Riley' },
    ],
    {
      phase: 'dawn-announcement',
      nightNumber: 1,
    },
  )
  return {
    stage: 'dawn' as const,
    workflow: {
      status: 'dawn' as const,
      game: fixture.game,
      participants: fixture.participants,
      dawnAnnouncement: { outcome: 'no-deaths' as const, nightNumber: 1 },
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Phase 7A.1 App integration', () => {
  it('guards rapid bulk delivery in Strict Mode, saves once, and preserves individual undo', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { distributionStatus: 'distributing' },
    )
    if (fixture.distribution.status !== 'distributing') {
      throw new Error('Expected distributing fixture.')
    }
    const { store } = renderLoaded({
      stage: 'role-distribution',
      workflow: fixture.distribution,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))

    const bulkButton = screen.getByRole('button', { name: 'Mark all cards delivered' })
    act(() => {
      bulkButton.click()
      bulkButton.click()
    })
    expect(store.saveCount).toBe(1)
    expect(
      screen.getByRole('button', {
        name: 'All participating players have received their cards.',
      }),
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Card delivered to Player 1' }))
    expect(store.saveCount).toBe(2)
    expect(screen.getByRole('button', { name: 'Mark all cards delivered' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Mark all cards delivered' }))
    expect(store.saveCount).toBe(3)
  })

  it('keeps recovery DOM, accessible labels, title, and URL public-safe until Continue', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Secret Sheriff' },
      { roleId: ROLE_IDS.jester, name: 'Secret Neutral' },
    ])
    const title = document.title
    const url = window.location.href
    const { container } = renderLoaded({ stage: 'sequential-night', workflow })

    expect(screen.getByRole('heading', { name: 'Saved game found' })).toBeVisible()
    expect(screen.getByText('Night 2 — Night actions')).toBeVisible()
    expect(container).not.toHaveTextContent('Secret Sheriff')
    expect(container).not.toHaveTextContent('Secret Neutral')
    expect(container).not.toHaveTextContent('Jester')
    expect(container.innerHTML).not.toMatch(
      /Secret Sheriff|Secret Neutral|role-instance|suspicious|visited-nobody/,
    )
    expect(document.title).toBe(title)
    expect(window.location.href).toBe(url)

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Wake Sheriff — Secret Sheriff' })).toHaveFocus()
    expect(
      screen.getByRole('button', {
        name: /Secret Neutral, Jester, Neutral, alive, available/,
      }),
    ).toBeVisible()
  })

  it('describes an Executioner recovery stage as a generic private briefing', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner, name: 'Hidden Executioner' },
        { roleId: ROLE_IDS.citizen, name: 'Hidden Target' },
        { roleId: ROLE_IDS.godfather, name: 'Hidden Mafia' },
      ],
      {
        phase: 'executioner-briefing',
        nightNumber: 1,
        executionerBriefingStatus: 'pending',
      },
    )
    const workflow = createExecutionerBriefingWorkflow(fixture.game)
    if (!workflow.ok) throw new Error('Expected Executioner briefing workflow.')
    const { container } = renderLoaded({
      stage: 'executioner-briefing',
      game: fixture.game,
      participants: fixture.participants,
      workflow: workflow.value,
    })

    expect(screen.getByText('Night 1 — Private briefing')).toBeVisible()
    expect(container).not.toHaveTextContent('Executioner')
    expect(container).not.toHaveTextContent('Hidden Target')
    expect(container.innerHTML).not.toMatch(/executioner|role-instance|player-/i)

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByText('Private Executioner briefing')).toBeVisible()
  })

  it('preserves the exact immediate result after save failure and retry without rerandomizing', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.jester, name: 'Target' },
    ])
    const store = new MemorySessionStore()
    const randomNext = vi.fn(() => 0.5)
    renderLoaded({ stage: 'sequential-night', workflow }, store, randomNext)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: /Target, Jester, Neutral/ }))
    expect(store.saveCount).toBe(0)

    store.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Target / Continue' }))
    expect(store.saveCount).toBe(1)
    expect(screen.getByText('Not suspicious')).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByText('Not suspicious')).toBeVisible()
    expect(randomNext).not.toHaveBeenCalled()
  })

  it('restores a current private result only after the public-safe recovery gate', () => {
    const collecting = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Hidden Sheriff' },
      { roleId: ROLE_IDS.jester, name: 'Hidden Target' },
    ])
    if (collecting.status !== 'collecting') throw new Error('Expected Sheriff collection.')
    const target = collecting.game.players[1]
    if (target === undefined) throw new Error('Expected Sheriff target.')
    const confirmed = confirmNightActionTarget(collecting, target.playerId)
    if (!confirmed.ok) throw new Error('Expected immediate Sheriff result.')
    const title = document.title
    const url = window.location.href
    const { container } = renderLoaded({
      stage: 'sequential-night',
      workflow: confirmed.value,
    })

    expect(screen.getByText('Night 2 — Night actions')).toBeVisible()
    expect(container).not.toHaveTextContent('Hidden Sheriff')
    expect(container).not.toHaveTextContent('Hidden Target')
    expect(container).not.toHaveTextContent('Not suspicious')
    expect(container.innerHTML).not.toMatch(/sheriff-result|role-instance|player-2/)
    expect(document.title).toBe(title)
    expect(window.location.href).toBe(url)

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Sheriff result' })).toHaveFocus()
    expect(screen.getByText('Not suspicious')).toBeVisible()
    expect(screen.getByText('Target: Hidden Target')).toBeVisible()
  })

  it('shows the result once, seals it, enters resolution, and reaches public Dawn without replay', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    renderLoaded({ stage: 'sequential-night', workflow })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    const targets = screen.getByRole('group', { name: 'Targets for Sheriff' })
    fireEvent.click(within(targets).getByRole('button', { name: /Citizen, Citizen/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Target / Continue' }))
    expect(screen.getByRole('heading', { name: 'Sheriff result' })).toBeVisible()
    expect(screen.getByText('Not suspicious')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge result' }))
    expect(screen.queryByText('Not suspicious')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Night Actions' }))
    expect(screen.getByRole('heading', { name: 'Night resolution complete' })).toBeVisible()
    expect(screen.queryByText(/Sheriff result/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Prepare Dawn Announcement' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Dawn Announcement' }))
    expect(screen.getByRole('heading', { name: 'A quiet Dawn' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Acknowledge result/ })).toBeNull()
    expect(screen.queryByText(/Sheriff result|Detective result|Investigator result/)).toBeNull()
  })
})

describe('Phase 7B App integration', () => {
  it('guards the Dawn-to-day transition in Strict Mode and saves it exactly once', () => {
    const { store } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'A quiet Dawn' })).toHaveFocus()

    const beginButton = screen.getByRole('button', { name: 'Begin day discussion' })
    act(() => {
      beginButton.click()
      beginButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Day discussion' })).toHaveFocus()
    expect(screen.getByText('Day 1 · Public-safe display')).toBeVisible()
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent('Role hidden')
    expect(screen.getByText('Casey').closest('li')).toHaveTextContent('Role hidden')
    expect(screen.getByRole('button', { name: 'Execute a player' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'End day without execution' })).toBeEnabled()
  })

  it('keeps Mayor candidates private, reveals independently, and guards rapid confirmation', () => {
    const { store, container } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    expect(store.saveCount).toBe(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(container.innerHTML).not.toMatch(/private-player|role-instance/)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    const firstDialog = screen.getByRole('alertdialog')
    expect(screen.getByLabelText('Local save status').parentElement).toHaveAttribute('inert')
    expect(within(firstDialog).getByRole('radio', { name: /Morgan/ })).toBeVisible()
    expect(within(firstDialog).getByRole('radio', { name: /Riley/ })).toBeVisible()
    expect(within(firstDialog).queryByRole('radio', { name: /Casey/ })).toBeNull()
    fireEvent.click(within(firstDialog).getByRole('radio', { name: /Morgan/ }))
    const firstConfirm = within(firstDialog).getByRole('button', {
      name: 'Publicly reveal as Mayor',
    })
    act(() => {
      firstConfirm.click()
      firstConfirm.click()
    })

    expect(store.saveCount).toBe(2)
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent(
      'Mayor 1 — publicly revealed',
    )
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent(
      'this player counts as 3 votes',
    )
    expect(screen.getByText('Riley').closest('li')).toHaveTextContent('Role hidden')
    expect(screen.getByLabelText('Local save status').parentElement).not.toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    const secondDialog = screen.getByRole('alertdialog')
    expect(within(secondDialog).queryByRole('radio', { name: /Morgan/ })).toBeNull()
    expect(within(secondDialog).getByRole('radio', { name: /Riley/ })).toBeVisible()
    fireEvent.click(within(secondDialog).getByRole('radio', { name: /Riley/ }))
    fireEvent.click(within(secondDialog).getByRole('button', { name: 'Publicly reveal as Mayor' }))
    expect(store.saveCount).toBe(3)
    expect(screen.getByText('Riley').closest('li')).toHaveTextContent('Mayor 2 — publicly revealed')
  })

  it('keeps day recovery generic until Continue and restores the exact public reveal', () => {
    const store = new MemorySessionStore()
    const firstRender = renderLoaded(dawnSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Morgan/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicly reveal as Mayor' }))
    const saved = store.lastSuccessfulEnvelope
    if (saved === null) throw new Error('Expected saved revealed Mayor.')
    const restored = restorePersistedSessionEnvelopeV2(JSON.parse(JSON.stringify(saved)) as unknown)
    if (!restored.ok) throw new Error('Expected day restoration.')

    firstRender.unmount()
    const title = document.title
    const url = window.location.href
    const logSpy = vi.spyOn(console, 'log')
    const recovered = renderLoaded(restored.value.session)
    expect(screen.getByText('Day 1 — Day discussion')).toBeVisible()
    expect(recovered.container).not.toHaveTextContent('Morgan')
    expect(recovered.container).not.toHaveTextContent('Casey')
    expect(recovered.container).not.toHaveTextContent('Riley')
    expect(recovered.container.innerHTML).not.toMatch(
      /role-instance|player-1|publiclyRevealedRoleId|executionerTarget/,
    )
    expect(document.title).toBe(title)
    expect(window.location.href).toBe(url)
    expect(logSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent(
      'Mayor 1 — publicly revealed',
    )
    expect(screen.getByText('Riley').closest('li')).toHaveTextContent('Role hidden')
  })

  it('keeps an in-memory reveal after save failure and retries the identical authority', () => {
    const store = new MemorySessionStore()
    renderLoaded(dawnSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    store.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Morgan/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicly reveal as Mayor' }))

    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent(
      'Mayor 1 — publicly revealed',
    )
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)).toBe(failedPayload)
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent(
      'Mayor 1 — publicly revealed',
    )
  })
})

describe('Phase 7C App integration', () => {
  it('guards rapid execution, saves once, and replaces editable day controls with a public summary', () => {
    const { store } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    expect(store.saveCount).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Execute a player' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Execute a player' })
    expect(screen.getByLabelText('Local save status').parentElement).toHaveAttribute('inert')
    expect(within(dialog).queryByText(/Mayor|Citizen|Jester|Executioner/)).toBeNull()
    fireEvent.click(within(dialog).getByRole('radio', { name: /CaseyLiving player/ }))
    const confirm = within(dialog).getByRole('button', { name: 'Execute Casey' })
    act(() => {
      confirm.click()
      confirm.click()
    })

    expect(store.saveCount).toBe(2)
    expect(screen.getByRole('heading', { name: 'Day 1 complete' })).toHaveFocus()
    expect(screen.getByText('Casey was executed.')).toBeVisible()
    expect(screen.queryByText(/Their role was/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Execute a player' })).toBeNull()
    expect(screen.queryByRole('button', { name: /next night|game over|revenge/i })).toBeNull()
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'day-outcome',
      workflowStatus: 'day-outcome',
      game: {
        phase: 'execution-resolution',
        dayOutcome: { kind: 'player-executed', dayNumber: 1 },
      },
    })
  })

  it('confirms no execution once without killing a player or exposing a later workflow', () => {
    const { store } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))

    fireEvent.click(screen.getByRole('button', { name: 'End day without execution' }))
    const dialog = screen.getByRole('alertdialog', {
      name: 'End Day 1 without an execution?',
    })
    const confirm = within(dialog).getByRole('button', {
      name: 'End day without execution',
    })
    act(() => {
      confirm.click()
      confirm.click()
    })

    expect(store.saveCount).toBe(2)
    expect(screen.getByText('No player was executed.')).toBeVisible()
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'day-outcome',
      game: {
        dayOutcome: { kind: 'no-execution', dayNumber: 1 },
        deathRecords: [],
        personalWins: [],
        pendingJesterRevenges: [],
      },
    })
  })

  it('keeps post-day recovery generic until Continue and leaks no neutral authority', () => {
    const store = new MemorySessionStore()
    const active = renderLoaded(dawnSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute a player' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /CaseyLiving player/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Execute Casey' }))
    const saved = store.lastSuccessfulEnvelope
    if (saved === null) throw new Error('Expected saved outcome.')
    const restored = restorePersistedSessionEnvelopeV2(JSON.parse(JSON.stringify(saved)) as unknown)
    if (!restored.ok) throw new Error('Expected outcome restoration.')

    active.unmount()
    const title = document.title
    const url = window.location.href
    const logSpy = vi.spyOn(console, 'log')
    const recovered = renderLoaded(restored.value.session)

    expect(screen.getByText('Day 1 — Day complete')).toBeVisible()
    expect(recovered.container).not.toHaveTextContent(/Morgan|Casey|Riley/)
    expect(recovered.container.innerHTML).not.toMatch(
      /jester|executioner|personalWins|pendingJester|role-instance|player-2/i,
    )
    expect(document.title).toBe(title)
    expect(window.location.href).toBe(url)
    expect(logSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByText('Casey was executed.')).toBeVisible()
  })

  it('retains the exact completed outcome after save failure and retries without reapplying it', () => {
    const store = new MemorySessionStore()
    renderLoaded(dawnSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    store.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'End day without execution' }))
    fireEvent.click(screen.getByRole('button', { name: 'End day without execution' }))

    expect(screen.getByText('No player was executed.')).toBeVisible()
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)).toBe(failedPayload)
    expect(screen.getByText('No player was executed.')).toBeVisible()
  })
})
