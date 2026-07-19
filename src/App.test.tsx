import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createExecutionerBriefingWorkflow } from '@/application/executioner-briefing/index.ts'
import {
  completeDayWithoutExecution,
  executePlayerAndCompleteDay,
} from '@/application/day-outcome/index.ts'
import { beginFinalNightResolution } from '@/application/night-completion/index.ts'
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
  ActiveAppSession,
} from '@/application/session-persistence/index.ts'
import {
  restorePersistedSessionEnvelopeV2,
  settleSessionAfterDayOutcome,
} from '@/application/session-persistence/index.ts'
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

function readyForDawnSession(
  roles: Parameters<typeof createNightFixture>[0],
  targetIndex: number,
): Extract<LoadPersistedSessionResult, Readonly<{ ok: true }>>['value']['session'] {
  const workflow = activeWorkflow(roles)
  if (workflow.status !== 'collecting') throw new Error('Expected active night actor.')
  const target = workflow.game.players[targetIndex]
  if (target === undefined) throw new Error('Expected final action target.')
  const completed = confirmNightActionTarget(workflow, target.playerId)
  if (!completed.ok || completed.value.status !== 'complete') {
    throw new Error('Expected completed night actions.')
  }
  const ready = beginFinalNightResolution(completed.value)
  if (!ready.ok) throw new Error(`Expected final night resolution: ${ready.error.type}`)
  return { stage: 'night-resolution', workflow: ready.value }
}

function dawnSession() {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.mayor, name: 'Morgan' },
      { roleId: ROLE_IDS.citizen, name: 'Casey' },
      { roleId: ROLE_IDS.mayor, name: 'Riley' },
      { roleId: ROLE_IDS.godfather, name: 'Taylor' },
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

function postDaySession(
  roles: Parameters<typeof createNightFixture>[0],
  executedIndex?: number,
): ActiveAppSession {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
  })
  const state = { game: { ...fixture.game, dayNumber: 1 }, participants: fixture.participants }
  const result = (() => {
    if (executedIndex === undefined) {
      return completeDayWithoutExecution(state)
    }
    const selectedPlayer = state.game.players[executedIndex]
    if (selectedPlayer === undefined) throw new Error('Expected execution player.')
    return executePlayerAndCompleteDay(state, selectedPlayer.playerId)
  })()
  if (!result.ok) throw new Error(`Expected post-day fixture: ${result.error.type}`)
  return { stage: 'day-outcome', game: result.value.game, participants: result.value.participants }
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))
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
    if (confirmed.value.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected the Sheriff result to remain visible.')
    }
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

  it('guards direct non-informational advancement and retries the identical failed save', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.framer, name: 'Framer' },
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    const { store } = renderLoaded({ stage: 'sequential-night', workflow })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: /Citizen, Citizen/ }))
    store.failSave = true
    const confirmButton = screen.getByRole('button', { name: 'Confirm target and continue' })
    act(() => {
      confirmButton.click()
      confirmButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Wake Sheriff — Sheriff' })).toHaveFocus()
    expect(screen.queryByText('Action recorded')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acknowledge result' })).toBeNull()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByRole('heading', { name: 'Wake Sheriff — Sheriff' })).toBeVisible()
  })

  it('guards one-button informational advancement and does not replay a result on retry', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.investigator, name: 'Investigator' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    const { store } = renderLoaded({ stage: 'sequential-night', workflow })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: /Citizen, Citizen/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))
    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Sheriff result' })).toBeVisible()

    store.failSave = true
    const continueButton = screen.getByRole('button', { name: 'Continue to next actor' })
    act(() => {
      continueButton.click()
      continueButton.click()
    })
    expect(store.saveCount).toBe(2)
    expect(screen.getByRole('heading', { name: 'Wake Investigator — Investigator' })).toHaveFocus()
    expect(screen.queryByText('Not suspicious')).toBeNull()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[1]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(3)
    expect(JSON.stringify(store.attemptedEnvelopes[2]?.session)).toBe(failedPayload)
    expect(screen.queryByText('Not suspicious')).toBeNull()
  })

  it('preserves one blocked screen through save failure and guards its direct continue', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.consort, name: 'Consort' },
      { roleId: ROLE_IDS.doctor, name: 'Doctor' },
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    const { store } = renderLoaded({ stage: 'sequential-night', workflow })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: /Doctor, Doctor/ }))
    store.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target and continue' }))
    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'BLOCKED' })).toHaveFocus()
    expect(screen.queryByRole('group', { name: /Targets for/ })).toBeNull()
    const blockedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(blockedPayload)
    const continueButton = screen.getByRole('button', { name: 'Continue to next actor' })
    act(() => {
      continueButton.click()
      continueButton.click()
    })
    expect(store.saveCount).toBe(3)
    expect(screen.getByRole('heading', { name: 'Wake Sheriff — Sheriff' })).toHaveFocus()
  })

  it('guards direct Dawn, retains its failed in-memory save, and retries without reapplication', () => {
    const session = readyForDawnSession(
      [
        { roleId: ROLE_IDS.godfather, name: 'Godfather' },
        { roleId: ROLE_IDS.citizen, name: 'Citizen' },
      ],
      1,
    )
    const { store } = renderLoaded(session)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    store.failSave = true
    const dawnButton = screen.getByRole('button', { name: 'Show Dawn announcement' })
    act(() => {
      dawnButton.click()
      dawnButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Dawn deaths' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Show Dawn announcement' })).toBeNull()
    const attemptedDawn = store.attemptedEnvelopes[0]?.session
    expect(attemptedDawn).toMatchObject({ stage: 'dawn' })
    if (attemptedDawn?.stage !== 'dawn') throw new Error('Expected attempted Dawn save.')
    expect(attemptedDawn.game.players.filter((player) => !player.alive)).toHaveLength(1)
    expect(attemptedDawn.game.deathRecords).toHaveLength(1)
    const failedPayload = JSON.stringify(attemptedDawn)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByRole('heading', { name: 'Dawn deaths' })).toBeVisible()
  })

  it('shows the result once, continues atomically, and reaches public Dawn without replay', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    renderLoaded({ stage: 'sequential-night', workflow })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    const targets = screen.getByRole('group', { name: 'Targets for Sheriff' })
    fireEvent.click(within(targets).getByRole('button', { name: /Citizen, Citizen/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))
    expect(screen.getByRole('heading', { name: 'Sheriff result' })).toBeVisible()
    expect(screen.getByText('Not suspicious')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to next actor' }))
    expect(screen.queryByText('Not suspicious')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Night resolution complete' })).toBeVisible()
    expect(screen.queryByText(/Sheriff result/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show Dawn announcement' }))
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

  it('keeps host roles transient, hidden by default, and absent after recovery', () => {
    const firstRender = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin day discussion' }))
    expect(firstRender.store.saveCount).toBe(1)
    expect(firstRender.container).not.toHaveTextContent('Host role: Mayor 1')

    fireEvent.click(screen.getByRole('button', { name: 'Show host-only roles' }))
    expect(screen.getByText('Host role: Mayor 1')).toBeVisible()
    expect(screen.getByText('Host role: Citizen')).toBeVisible()
    expect(screen.getByText('Host role: Mayor 2')).toBeVisible()
    expect(firstRender.store.saveCount).toBe(1)
    expect(firstRender.store.lastSuccessfulEnvelope?.session).not.toHaveProperty('showHostRoles')
    expect(JSON.stringify(firstRender.store.lastSuccessfulEnvelope?.session)).not.toMatch(
      /hostOnlyRoles|hostRoleView|hostRoleVisibility/,
    )

    const saved = firstRender.store.lastSuccessfulEnvelope
    if (saved === null) throw new Error('Expected saved day session.')
    const restored = restorePersistedSessionEnvelopeV2(JSON.parse(JSON.stringify(saved)) as unknown)
    if (!restored.ok) throw new Error('Expected day restoration.')
    firstRender.unmount()
    const recovered = renderLoaded(restored.value.session, firstRender.store)
    expect(recovered.container).not.toHaveTextContent('Host role: Mayor 1')
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('button', { name: 'Show host-only roles' })).toBeVisible()
    expect(recovered.container).not.toHaveTextContent('Host role: Mayor 1')
    expect(firstRender.store.saveCount).toBe(1)
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
    expect(screen.getByRole('heading', { name: 'Day complete' })).toHaveFocus()
    expect(screen.getByText('Casey was executed.')).toBeVisible()
    expect(screen.queryByText(/Their role was/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Execute a player' })).toBeNull()
    expect(screen.queryByRole('button', { name: /next night|game over|revenge/i })).toBeNull()
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'post-day-waiting',
      workflowStatus: 'post-day-waiting',
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
      stage: 'post-day-waiting',
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
    expect(recovered.container).not.toHaveTextContent(/Morgan|Casey|Riley|Taylor/)
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

describe('corrected Phase 7D App integration and privacy', () => {
  it('settles a legacy pending-revenge outcome once after Continue without public disclosure', () => {
    const randomNext = vi.fn(() => 0.75)
    const store = new MemorySessionStore()
    const session = postDaySession(
      [
        { roleId: ROLE_IDS.jester, name: 'Morgan' },
        { roleId: ROLE_IDS.godfather, name: 'Hidden Mafia' },
        { roleId: ROLE_IDS.citizen, name: 'Public Town' },
      ],
      0,
    )
    const { container } = renderLoaded(session, store, randomNext)

    expect(screen.getByText('Day 1 — Day complete')).toBeVisible()
    expect(container).not.toHaveTextContent(/Morgan|Jester|pending|revenge/i)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))

    expect(store.saveCount).toBe(1)
    expect(randomNext).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Day complete' })).toHaveFocus()
    expect(
      screen.getByText('Final victory evaluation is deferred until the next Dawn.'),
    ).toBeVisible()
    expect(container).not.toHaveTextContent(/Jester|pending|victim|personal win/i)
    expect(screen.queryByRole('button', { name: /next night|revenge|victim/i })).toBeNull()
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'pending-revenge-waiting',
      game: {
        phase: 'execution-resolution',
        nightNumber: 1,
        dayNumber: 1,
        pendingJesterRevenges: [{ status: 'pending' }],
      },
    })
    expect(JSON.stringify(store.lastSuccessfulEnvelope?.session)).not.toMatch(
      /victimPlayerId|revengeResolution|nextNight/,
    )
  })

  it('keeps game-over recovery public-safe and shows only the public result after Continue', () => {
    const legacy = postDaySession(
      [
        { roleId: ROLE_IDS.executioner, name: 'Hidden Executioner' },
        { roleId: ROLE_IDS.citizen, name: 'Executed Town' },
        { roleId: ROLE_IDS.godfather, name: 'Hidden Godfather' },
      ],
      1,
    )
    const settled = settleSessionAfterDayOutcome(legacy)
    if (!settled.ok || settled.value.stage !== 'game-over') {
      throw new Error('Expected Mafia game over.')
    }
    expect(settled.value.game.personalWins).toHaveLength(1)
    const store = new MemorySessionStore()
    const title = document.title
    const url = window.location.href
    const logSpy = vi.spyOn(console, 'log')
    const warnSpy = vi.spyOn(console, 'warn')
    const errorSpy = vi.spyOn(console, 'error')
    const { container } = renderLoaded(settled.value, store)

    expect(screen.getByText('Game over — Mafia wins')).toBeVisible()
    expect(screen.getByText('Day 1')).toBeVisible()
    expect(container).not.toHaveTextContent(
      /Hidden Executioner|Executed Town|Hidden Godfather|Executioner|Citizen|Godfather/,
    )
    expect(container.innerHTML).not.toMatch(/role-instance|player-1|personalWins|conversion/i)
    expect(document.title).toBe(title)
    expect(window.location.href).toBe(url)
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Game over' })).toHaveFocus()
    expect(screen.getByText('Mafia wins')).toBeVisible()
    expect(screen.getByText('Hidden Executioner')).toBeVisible()
    expect(screen.getByText('Executed Town')).toBeVisible()
    expect(screen.getByText('Hidden Godfather')).toBeVisible()
    expect(container).not.toHaveTextContent(/personal win|Executioner target/i)
    expect(screen.queryByText(/Public role: Godfather/)).toBeNull()
    expect(store.saveCount).toBe(0)
  })

  it('guards rapid pending-revenge settlement and retries the identical waiting save', () => {
    const randomNext = vi.fn(() => 0.25)
    const store = new MemorySessionStore()
    store.failSave = true
    const session = postDaySession(
      [
        { roleId: ROLE_IDS.jester, name: 'Executed neutral' },
        { roleId: ROLE_IDS.godfather, name: 'Hidden Mafia' },
        { roleId: ROLE_IDS.citizen, name: 'Living Town' },
      ],
      0,
    )
    const { container } = renderLoaded(session, store, randomNext)
    const continueButton = screen.getByRole('button', { name: 'Continue saved game' })

    act(() => {
      continueButton.click()
      continueButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(randomNext).not.toHaveBeenCalled()
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()
    expect(
      screen.getByText('Final victory evaluation is deferred until the next Dawn.'),
    ).toBeVisible()
    expect(container).not.toHaveTextContent(/Jester|pending|victim|personal win/i)
    const attemptedSession = store.attemptedEnvelopes[0]?.session
    expect(attemptedSession).toMatchObject({
      stage: 'pending-revenge-waiting',
      game: {
        phase: 'execution-resolution',
        nightNumber: 1,
        dayNumber: 1,
        pendingJesterRevenges: [{ status: 'pending' }],
      },
    })
    expect(JSON.stringify(attemptedSession)).not.toMatch(
      /victimPlayerId|revengeResolution|nextNight/,
    )
    const failedPayload = JSON.stringify(attemptedSession)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(randomNext).not.toHaveBeenCalled()
  })

  it('guards rapid restored evaluation and retries the identical game-over save after failure', () => {
    const store = new MemorySessionStore()
    store.failSave = true
    const session = postDaySession([
      { roleId: ROLE_IDS.citizen, name: 'Town player' },
      { roleId: ROLE_IDS.godfather, name: 'Dead Mafia', alive: false },
    ])
    renderLoaded(session, store)
    const continueButton = screen.getByRole('button', { name: 'Continue saved game' })

    act(() => {
      continueButton.click()
      continueButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByText('Town wins')).toBeVisible()
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByText('Town wins')).toBeVisible()
  })
})
