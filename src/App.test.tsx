import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createExecutionerBriefingWorkflow } from '@/application/executioner-briefing/index.ts'
import {
  completeDayWithoutExecution,
  executePlayerAndCompleteDay,
} from '@/application/day-outcome/index.ts'
import {
  createDefaultNextGameSetupTemplate,
  type NextGameSetupTemplate,
  type NextGameSetupTemplateRepository,
} from '@/application/game-setup/index.ts'
import {
  beginFinalNightResolution,
  prepareDawnAnnouncement,
} from '@/application/night-completion/index.ts'
import {
  beginNextNightActionCollection,
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
  createActiveAppSession,
  restorePersistedSessionEnvelopeV2,
  settleSessionAfterDayOutcome,
} from '@/application/session-persistence/index.ts'
import { createNightFixture } from '../tests/support/night-action-fixtures.ts'
import { SequentialRoleAssignmentIdentitySource } from '../tests/support/sequential-role-assignment-identity-source.ts'
import App from './App.tsx'

const CLOCK: SessionClock = { now: () => '2026-07-18T10:00:00.000Z' }

class MemorySessionStore implements GameSessionStore {
  saveCount = 0
  clearCount = 0
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
    this.clearCount += 1
    return { ok: true }
  }
}

class MemoryNextGameSetupTemplateRepository implements NextGameSetupTemplateRepository {
  savedTemplate: NextGameSetupTemplate | null = null
  saveCount = 0
  clearCount = 0
  failSave = false

  load() {
    return { ok: true as const, value: null }
  }

  save(template: NextGameSetupTemplate) {
    this.saveCount += 1
    if (this.failSave) {
      return {
        ok: false as const,
        error: {
          type: 'NEXT_GAME_SETUP_TEMPLATE_SAVE_FAILURE' as const,
          errorName: 'TestFailure',
        },
      }
    }
    this.savedTemplate = template
    return { ok: true as const }
  }

  clear() {
    this.clearCount += 1
    this.savedTemplate = null
    return { ok: true as const }
  }
}

function dependencies(randomNext = vi.fn(() => 0)): RoleAssignmentDependencies {
  return {
    randomSource: { next: randomNext },
    identitySource: new SequentialRoleAssignmentIdentitySource(),
  }
}

function replayTemplate(): NextGameSetupTemplate {
  const defaults = createDefaultNextGameSetupTemplate(['Alex', 'Taylor'])
  return {
    ...defaults,
    roleCounts: defaults.roleCounts.map((entry) =>
      entry.roleId === ROLE_IDS.godfather || entry.roleId === ROLE_IDS.citizen
        ? { ...entry, count: 1 }
        : entry,
    ),
    settings: { ...defaults.settings, revealRoleOnDeath: true },
  }
}

function renderLoaded(
  session: Extract<LoadPersistedSessionResult, Readonly<{ ok: true }>>['value']['session'],
  store = new MemorySessionStore(),
  randomNext = vi.fn(() => 0),
  savedSetupTemplate: NextGameSetupTemplate | null = null,
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
        initialNextGameSetupTemplate={{
          template: savedSetupTemplate,
          error: null,
          migratedLegacyPlayerNames: false,
        }}
      />
    </StrictMode>,
  )
  return { ...view, store, randomNext }
}

function renderFreshSavedSetup(
  template: NextGameSetupTemplate,
  repository = new MemoryNextGameSetupTemplateRepository(),
  store = new MemorySessionStore(),
) {
  const view = render(
    <StrictMode>
      <App
        roleAssignmentDependencies={dependencies()}
        sessionStore={store}
        sessionClock={CLOCK}
        initialLoadResult={{ ok: false, error: { type: 'NO_SAVED_SESSION' } }}
        nextGameSetupTemplateRepository={repository}
        initialNextGameSetupTemplate={{
          template,
          error: null,
          migratedLegacyPlayerNames: false,
        }}
      />
    </StrictMode>,
  )
  return { ...view, repository, store }
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
  settings: NonNullable<Parameters<typeof createNightFixture>[1]>['settings'] = {},
): ActiveAppSession {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
    settings,
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

function revengeResolutionSession(): ActiveAppSession {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.jester, name: 'Executed Jester' },
      { roleId: ROLE_IDS.godfather, name: 'Hidden Mafia' },
      { roleId: ROLE_IDS.citizen, name: 'Ordinary victim' },
      { roleId: ROLE_IDS.citizen, name: 'Revenge victim' },
    ],
    {
      phase: 'day-discussion',
      nightNumber: 1,
      settings: { allowFirstNightKills: false, revealRoleOnDeath: true },
    },
  )
  const executedJester = fixture.game.players[0]
  const ordinaryVictim = fixture.game.players[2]
  if (executedJester === undefined || ordinaryVictim === undefined) {
    throw new Error('Expected revenge-session players.')
  }
  const dayOutcome = executePlayerAndCompleteDay(
    {
      game: { ...fixture.game, dayNumber: 1 },
      participants: fixture.participants,
    },
    executedJester.playerId,
  )
  if (!dayOutcome.ok) throw new Error(`Expected Jester execution: ${dayOutcome.error.type}`)
  const begun = beginNextNightActionCollection(
    dayOutcome.value.game,
    dayOutcome.value.participants,
    { next: () => 0 },
  )
  if (!begun.ok) throw new Error(`Expected Night 2: ${begun.error.type}`)
  const advanced = continueNightActionCollection(begun.value.workflow)
  if (!advanced.ok || advanced.value.status !== 'collecting') {
    throw new Error('Expected the Night 2 Godfather.')
  }
  const completed = confirmNightActionTarget(advanced.value, ordinaryVictim.playerId)
  if (!completed.ok || completed.value.status !== 'complete') {
    throw new Error('Expected completed Night 2 actions.')
  }
  const ready = beginFinalNightResolution(completed.value)
  if (!ready.ok) throw new Error(`Expected Night 2 resolution: ${ready.error.type}`)
  const revenge = prepareDawnAnnouncement(ready.value, { next: () => 0.99 })
  if (!revenge.ok || revenge.value.status !== 'revenge-resolution') {
    throw new Error('Expected selected Jester revenge.')
  }
  return { stage: 'revenge-resolution', workflow: revenge.value }
}

function godfatherPromotionBriefingSession(): ActiveAppSession {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.godfather, alive: false },
      { roleId: ROLE_IDS.framer, name: 'Secret promoted player' },
      { roleId: ROLE_IDS.citizen, name: 'Public target' },
    ],
    { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
  )
  const begun = beginNextNightActionCollection(fixture.game, fixture.participants, {
    next: () => 0,
  })
  if (!begun.ok || begun.value.promotion === null) {
    throw new Error('Expected promotion briefing.')
  }
  return {
    stage: 'godfather-promotion-briefing',
    workflow: begun.value.workflow,
  }
}

function finalTwoGodfatherPromotionBriefingSession(
  godfatherAndSerialCanKillEachOther: boolean,
): ActiveAppSession {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.framer, name: 'Secret promoted player' },
      { roleId: ROLE_IDS.serialKiller, name: 'Other finalist' },
    ],
    {
      phase: 'execution-resolution',
      nightNumber: 1,
      dayNumber: 1,
      settings: { godfatherAndSerialCanKillEachOther },
    },
  )
  const begun = beginNextNightActionCollection(fixture.game, fixture.participants, {
    next: () => 0,
  })
  if (!begun.ok || begun.value.promotion === null) {
    throw new Error('Expected final-two promotion briefing.')
  }
  return {
    stage: 'godfather-promotion-briefing',
    workflow: begun.value.workflow,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Phase 7F.2 game-setting guidance', () => {
  it('describes the implemented final-two behavior without stale setup-only copy', () => {
    renderFreshSavedSetup(createDefaultNextGameSetupTemplate([]))

    expect(screen.getByText('Choose the rule switches that govern this game.')).toBeVisible()
    expect(screen.getByText('Applied during play')).toBeVisible()
    expect(
      screen.getByText(
        'When enabled, a final Godfather and Serial Killer eliminate each other; otherwise their final two is a stalemate.',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/Resolution is not implemented yet/)).toBeNull()
  })
})

describe('Phase 7F.1 next-game saved setup', () => {
  it('prefills names, roles, and settings and clears only future setup without wiping visible fields', () => {
    const template = replayTemplate()
    const { repository } = renderFreshSavedSetup(template)

    expect(screen.getByDisplayValue('Alex')).toBeVisible()
    expect(screen.getByDisplayValue('Taylor')).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
    expect(screen.getByRole('spinbutton', { name: 'Citizen count' })).toHaveValue(1)
    expect(screen.getByRole('checkbox', { name: 'Reveal role on death' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved setup' }))

    expect(repository.clearCount).toBe(1)
    expect(screen.getByDisplayValue('Alex')).toBeVisible()
    expect(screen.getByDisplayValue('Taylor')).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
    expect(screen.getByRole('checkbox', { name: 'Reveal role on death' })).toBeChecked()
    expect(
      screen.getByText('Saved setup cleared. The current setup remains unchanged.'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Clear saved setup' })).toBeNull()
  })

  it('saves names, role distribution, and settings only after successful assignment', () => {
    const repository = new MemoryNextGameSetupTemplateRepository()
    repository.failSave = true
    const { store } = renderFreshSavedSetup(
      createDefaultNextGameSetupTemplate(['Alex', 'Taylor']),
      repository,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Citizen count' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reveal role on death' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))

    expect(repository.saveCount).toBe(1)
    expect(repository.savedTemplate).toBeNull()
    expect(store.saveCount).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Distribute physical role cards' })).toBeVisible()
    expect(screen.getByText(/setup could not be saved for the next game/)).toBeVisible()

    repository.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved setup' }))
    expect(repository.savedTemplate?.roster).toEqual([
      { name: 'Alex', playing: true },
      { name: 'Taylor', playing: true },
    ])
    expect(repository.savedTemplate?.roleCounts.filter((entry) => entry.count > 0)).toEqual([
      { roleId: ROLE_IDS.godfather, count: 1 },
      { roleId: ROLE_IDS.citizen, count: 1 },
    ])
    expect(repository.savedTemplate?.settings.revealRoleOnDeath).toBe(true)
  })

  it('preserves sitting-out roster members and their participation choices for the next game', () => {
    const repository = new MemoryNextGameSetupTemplateRepository()
    renderFreshSavedSetup(createDefaultNextGameSetupTemplate(['Alice', 'Bob']), repository)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Bob (player-2) participation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))

    expect(repository.savedTemplate?.roster).toEqual([
      { name: 'Alice', playing: true },
      { name: 'Bob', playing: false },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Abandon game and delete local save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, abandon and delete' }))

    expect(screen.getByDisplayValue('Alice')).toBeVisible()
    expect(screen.getByDisplayValue('Bob')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Alice (player-1) participation' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Bob (player-2) participation' })).not.toBeChecked()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
  })

  it('keeps the successfully started setup available in memory when template storage fails', () => {
    const repository = new MemoryNextGameSetupTemplateRepository()
    repository.failSave = true
    renderFreshSavedSetup(
      createDefaultNextGameSetupTemplate(['Latest Alex', 'Latest Taylor']),
      repository,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Increase Godfather count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Citizen count' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reveal role on death' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abandon game and delete local save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, abandon and delete' }))

    expect(screen.getByDisplayValue('Latest Alex')).toBeVisible()
    expect(screen.getByDisplayValue('Latest Taylor')).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
    expect(screen.getByRole('spinbutton', { name: 'Citizen count' })).toHaveValue(1)
    expect(screen.getByRole('checkbox', { name: 'Reveal role on death' })).toBeChecked()
  })

  it('does not replace the saved template when role assignment fails', () => {
    const repository = new MemoryNextGameSetupTemplateRepository()
    const template = replayTemplate()
    const store = new MemorySessionStore()
    render(
      <StrictMode>
        <App
          roleAssignmentDependencies={dependencies(vi.fn(() => 1))}
          sessionStore={store}
          sessionClock={CLOCK}
          initialLoadResult={{ ok: false, error: { type: 'NO_SAVED_SESSION' } }}
          nextGameSetupTemplateRepository={repository}
          initialNextGameSetupTemplate={{
            template,
            error: null,
            migratedLegacyPlayerNames: false,
          }}
        />
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prepare Game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Roles' }))

    expect(repository.saveCount).toBe(0)
    expect(screen.getByRole('heading', { name: 'Setup prepared' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Return to setup' }))
    expect(screen.getByDisplayValue('Alex')).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
  })

  it('does not merge saved setup into a recovered setup session', () => {
    const repository = new MemoryNextGameSetupTemplateRepository()
    const setupSession = createActiveAppSession()
    render(
      <StrictMode>
        <App
          roleAssignmentDependencies={dependencies()}
          sessionStore={new MemorySessionStore()}
          sessionClock={CLOCK}
          initialLoadResult={{
            ok: true,
            value: { schemaVersion: 2, savedAt: CLOCK.now(), session: setupSession },
          }}
          nextGameSetupTemplateRepository={repository}
          initialNextGameSetupTemplate={{
            template: createDefaultNextGameSetupTemplate(['Should not merge']),
            error: null,
            migratedLegacyPlayerNames: false,
          }}
        />
      </StrictMode>,
    )

    expect(screen.queryByText('Should not merge')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.queryByDisplayValue('Should not merge')).toBeNull()
    expect(screen.getByText('No players yet.')).toBeVisible()
  })

  it('starts the next game from game over with editable saved setup and no prior match authority', () => {
    const legacy = postDaySession(
      [
        { roleId: ROLE_IDS.executioner, name: 'Prior Executioner' },
        { roleId: ROLE_IDS.citizen, name: 'Prior Town' },
        { roleId: ROLE_IDS.godfather, name: 'Prior Mafia' },
      ],
      1,
    )
    const settled = settleSessionAfterDayOutcome(legacy)
    if (!settled.ok || settled.value.stage !== 'game-over') {
      throw new Error('Expected game over.')
    }
    const store = new MemorySessionStore()
    const { container } = renderLoaded(
      settled.value,
      store,
      vi.fn(() => 0),
      replayTemplate(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start next game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, start next game' }))

    expect(store.clearCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Player roster' })).toBeVisible()
    expect(screen.getByDisplayValue('Alex')).toBeVisible()
    expect(screen.getByDisplayValue('Taylor')).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
    expect(screen.getByRole('spinbutton', { name: 'Citizen count' })).toHaveValue(1)
    expect(screen.getByRole('checkbox', { name: 'Reveal role on death' })).toBeChecked()
    expect(container).not.toHaveTextContent(/Prior Executioner|Prior Town|Prior Mafia|Game over/)

    fireEvent.change(screen.getByDisplayValue('Alex'), {
      target: { value: 'Edited Alex' },
    })
    expect(screen.getByDisplayValue('Edited Alex')).toBeVisible()
  })

  it('abandons an active game into the saved editable setup', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { distributionStatus: 'distributing' },
    )
    if (fixture.distribution.status !== 'distributing') {
      throw new Error('Expected distribution.')
    }
    const store = new MemorySessionStore()
    renderLoaded(
      { stage: 'role-distribution', workflow: fixture.distribution },
      store,
      vi.fn(() => 0),
      replayTemplate(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Abandon game and delete local save',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Yes, abandon and delete' }))

    expect(store.clearCount).toBe(1)
    expect(screen.getByDisplayValue('Alex')).toBeVisible()
    expect(screen.getByDisplayValue('Taylor')).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Godfather count' })).toHaveValue(1)
  })
})

describe('Phase 7F Godfather promotion briefing', () => {
  it('keeps recovery generic, restores the exact promotion, and advances once after saving', () => {
    const store = new MemorySessionStore()
    const randomNext = vi.fn(() => 0.9)
    const { container } = renderLoaded(godfatherPromotionBriefingSession(), store, randomNext)

    expect(screen.getByText('Night 2 — Night actions')).toBeVisible()
    expect(container).not.toHaveTextContent('Secret promoted player')
    expect(container).not.toHaveTextContent('Godfather')
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Godfather' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Godfather' }).closest('section')).toHaveTextContent(
      'Tell Secret promoted player they are the new Godfather.',
    )

    const continueButton = screen.getByRole('button', { name: 'Continue' })
    act(() => {
      continueButton.click()
      continueButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Mafia' })).toBeVisible()
    expect(randomNext).not.toHaveBeenCalled()
  })

  it('preserves the same briefing and acknowledgement payload after save failure', () => {
    const store = new MemorySessionStore()
    store.failSave = true
    renderLoaded(godfatherPromotionBriefingSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Godfather' })).toBeVisible()
    expect(screen.getByText(/promotion is preserved/)).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByRole('heading', { name: 'Mafia' })).toBeVisible()
  })

  it.each([
    [false, 'The final two players could not eliminate each other.', 0],
    [true, 'The final two players eliminated each other.', 2],
  ] as const)(
    'settles a promoted final two immediately after the private briefing (mutual killing: %s)',
    (setting, explanation, deathCount) => {
      const store = new MemorySessionStore()
      renderLoaded(finalTwoGodfatherPromotionBriefingSession(setting), store)
      fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))

      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

      expect(screen.getByRole('heading', { name: 'Game over' })).toHaveFocus()
      expect(screen.getByText('Draw')).toBeVisible()
      expect(screen.getByText(explanation)).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Mafia' })).toBeNull()
      expect(screen.queryByRole('button', { name: /night/i })).toBeNull()
      expect(store.lastSuccessfulEnvelope?.session).toMatchObject({ stage: 'game-over' })
      if (store.lastSuccessfulEnvelope?.session.stage !== 'game-over') {
        throw new Error('Expected persisted promoted final-two game over.')
      }
      expect(store.lastSuccessfulEnvelope.session.game.deathRecords).toHaveLength(deathCount)
    },
  )

  it('reuses the exact promoted mutual-elimination result after save failure', () => {
    const store = new MemorySessionStore()
    store.failSave = true
    renderLoaded(finalTwoGodfatherPromotionBriefingSession(true), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Godfather' })).toBeVisible()
    expect(screen.getByText(/promotion and final draw are preserved/)).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Game over' })).toBeVisible()
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    if (store.lastSuccessfulEnvelope?.session.stage !== 'game-over') {
      throw new Error('Expected persisted promoted final-two game over.')
    }
    expect(store.lastSuccessfulEnvelope.session.game.deathRecords).toHaveLength(2)
  })
})

describe('Phase 7A.1 App integration', () => {
  it('guards rapid one-click delivery, advances once, and writes no player flags', () => {
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

    expect(screen.queryByRole('checkbox')).toBeNull()
    const bulkButton = screen.getByRole('button', {
      name: 'Confirm all role cards delivered',
    })
    act(() => {
      bulkButton.click()
      bulkButton.click()
    })
    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Mafia' })).toBeVisible()
    expect(JSON.stringify(store.lastSuccessfulEnvelope)).not.toContain('deliveredPlayerIds')

    const continueButton = screen.getByRole('button', { name: 'Continue' })
    act(() => {
      continueButton.click()
      continueButton.click()
    })
    expect(store.saveCount).toBe(2)
    expect(screen.getByRole('heading', { name: 'Night resolution complete' })).toHaveFocus()
    expect(screen.queryByRole('group', { name: /Targets for/ })).toBeNull()
    if (store.lastSuccessfulEnvelope?.session.stage !== 'night-resolution') {
      throw new Error('Expected direct ready-for-Dawn persistence.')
    }
    expect(store.lastSuccessfulEnvelope.session.collectedActions).toEqual([])
  })

  it('transitions directly to Executioner briefing and retries the identical post-delivery save without rerolling', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner, name: 'Executioner' },
        { roleId: ROLE_IDS.citizen, name: 'Town target' },
        { roleId: ROLE_IDS.godfather, name: 'Mafia' },
      ],
      { distributionStatus: 'distributing' },
    )
    if (fixture.distribution.status !== 'distributing') {
      throw new Error('Expected distribution.')
    }
    const store = new MemorySessionStore()
    store.failSave = true
    const randomNext = vi.fn(() => 0)
    renderLoaded({ stage: 'role-distribution', workflow: fixture.distribution }, store, randomNext)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm all role cards delivered' }))

    expect(screen.getByRole('heading', { name: 'Executioner' })).toBeVisible()
    expect(randomNext).toHaveBeenCalledTimes(1)
    const failedPayload = JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)).toBe(failedPayload)
    expect(randomNext).toHaveBeenCalledTimes(1)
  })

  it('starts Night 1 once from the final Executioner acknowledgement and retries the same save', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner, name: 'Executioner' },
        { roleId: ROLE_IDS.citizen, name: 'Target' },
        { roleId: ROLE_IDS.godfather, name: 'Mafia' },
      ],
      {
        phase: 'executioner-briefing',
        nightNumber: 1,
        executionerBriefingStatus: 'pending',
      },
    )
    const workflow = createExecutionerBriefingWorkflow(fixture.game)
    if (!workflow.ok) throw new Error('Expected Executioner briefing.')
    const store = new MemorySessionStore()
    const randomNext = vi.fn(() => 0.75)
    renderLoaded(
      {
        stage: 'executioner-briefing',
        game: fixture.game,
        participants: fixture.participants,
        workflow: workflow.value,
      },
      store,
      randomNext,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    store.failSave = true
    const finalAcknowledgement = screen.getByRole('button', {
      name: 'Target delivered — begin Night 1',
    })
    act(() => {
      finalAcknowledgement.click()
      finalAcknowledgement.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Mafia' })).toHaveFocus()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByText(/Final private check|Begin Night 1\?/i)).toBeNull()
    const attemptedSession = store.attemptedEnvelopes[0]?.session
    if (attemptedSession?.stage !== 'sequential-night') {
      throw new Error('Expected one attempted Night 1 save.')
    }
    expect(attemptedSession.game.executionerTargets).toEqual(fixture.game.executionerTargets)
    const failedPayload = JSON.stringify(attemptedSession)
    expect(randomNext).not.toHaveBeenCalled()

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByRole('heading', { name: 'Mafia' })).toBeVisible()
    expect(randomNext).not.toHaveBeenCalled()
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
    expect(screen.getByRole('heading', { name: 'Sheriff' })).toHaveFocus()
    expect(
      screen.getByRole('button', {
        name: 'Secret Neutral, Jester, alive, available',
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
    expect(screen.getByRole('heading', { name: 'Executioner' })).toBeVisible()
    expect(screen.getByText('Hidden Executioner')).toBeVisible()
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
    fireEvent.click(screen.getByRole('button', { name: 'Target, Jester, alive, available' }))
    expect(store.saveCount).toBe(0)

    store.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))
    expect(store.saveCount).toBe(1)
    expect(screen.getByText('NOT SUSPICIOUS')).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByText('NOT SUSPICIOUS')).toBeVisible()
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
    expect(container).not.toHaveTextContent('NOT SUSPICIOUS')
    expect(container.innerHTML).not.toMatch(/sheriff-result|role-instance|player-2/)
    expect(document.title).toBe(title)
    expect(window.location.href).toBe(url)

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Sheriff' })).toHaveFocus()
    expect(screen.getByText('NOT SUSPICIOUS')).toBeVisible()
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
    fireEvent.click(screen.getByRole('button', { name: 'Citizen, Citizen, alive, available' }))
    store.failSave = true
    const confirmButton = screen.getByRole('button', { name: 'Confirm target and continue' })
    act(() => {
      confirmButton.click()
      confirmButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Sheriff' })).toHaveFocus()
    expect(screen.queryByText('Action recorded')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acknowledge result' })).toBeNull()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(screen.getByRole('heading', { name: 'Sheriff' })).toBeVisible()
  })

  it('guards one-button informational advancement and does not replay a result on retry', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.investigator, name: 'Investigator' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    const { store } = renderLoaded({ stage: 'sequential-night', workflow })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Citizen, Citizen, alive, available' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))
    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Sheriff' })).toBeVisible()

    store.failSave = true
    const continueButton = screen.getByRole('button', { name: 'Continue' })
    act(() => {
      continueButton.click()
      continueButton.click()
    })
    expect(store.saveCount).toBe(2)
    expect(screen.getByRole('heading', { name: 'Investigator' })).toHaveFocus()
    expect(screen.queryByText('NOT SUSPICIOUS')).toBeNull()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes[1]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(store.saveCount).toBe(3)
    expect(JSON.stringify(store.attemptedEnvelopes[2]?.session)).toBe(failedPayload)
    expect(screen.queryByText('NOT SUSPICIOUS')).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Doctor, Doctor, alive, available' }))
    store.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target and continue' }))
    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Doctor' })).toHaveFocus()
    expect(screen.getByText('BLOCKED')).toBeVisible()
    expect(screen.queryByRole('group', { name: /Targets for/ })).toBeNull()
    const blockedPayload = JSON.stringify(store.attemptedEnvelopes[0]?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(blockedPayload)
    const continueButton = screen.getByRole('button', { name: 'Continue' })
    act(() => {
      continueButton.click()
      continueButton.click()
    })
    expect(store.saveCount).toBe(3)
    expect(screen.getByRole('heading', { name: 'Sheriff' })).toHaveFocus()
  })

  it('guards direct Dawn, retains its failed in-memory save, and retries without reapplication', () => {
    const session = readyForDawnSession(
      [
        { roleId: ROLE_IDS.godfather, name: 'Godfather' },
        { roleId: ROLE_IDS.citizen, name: 'Citizen 1' },
        { roleId: ROLE_IDS.citizen, name: 'Citizen 2' },
        { roleId: ROLE_IDS.citizen, name: 'Citizen 3' },
      ],
      1,
    )
    const { store } = renderLoaded(session)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    store.failSave = true
    const dawnButton = screen.getByRole('button', { name: 'Finalize Dawn' })
    act(() => {
      dawnButton.click()
      dawnButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Dawn deaths' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Finalize Dawn' })).toBeNull()
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

  it('shows the result once and reaches a terminal public result without replay', () => {
    const workflow = activeWorkflow([
      { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
      { roleId: ROLE_IDS.citizen, name: 'Citizen' },
    ])
    renderLoaded({ stage: 'sequential-night', workflow })
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    const targets = screen.getByRole('group', { name: 'Targets for Sheriff' })
    fireEvent.click(
      within(targets).getByRole('button', { name: 'Citizen, Citizen, alive, available' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm target' }))
    expect(screen.getByRole('heading', { name: 'Sheriff' })).toBeVisible()
    expect(screen.getByText('NOT SUSPICIOUS')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByText('NOT SUSPICIOUS')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Night resolution complete' })).toBeVisible()
    expect(screen.queryByText(/Sheriff result/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Finalize Dawn' }))
    expect(screen.getByRole('heading', { name: 'Game over' })).toBeVisible()
    expect(screen.getByText('Town wins')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Acknowledge result/ })).toBeNull()
    expect(screen.queryByText(/Sheriff result|Detective result|Investigator result/)).toBeNull()
  })
})

describe('Phase 7B App integration', () => {
  it('guards the Dawn-to-day transition in Strict Mode and saves it exactly once', () => {
    const { store } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'A quiet Dawn' })).toHaveFocus()

    const beginButton = screen.getByRole('button', { name: 'Continue to Day 1' })
    act(() => {
      beginButton.click()
      beginButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Day discussion' })).toHaveFocus()
    expect(screen.getByText('Day 1 · Host display')).toBeVisible()
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent('Role hidden')
    expect(screen.getByText('Casey').closest('li')).toHaveTextContent('Role hidden')
    expect(screen.getByRole('button', { name: 'Execute a player' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'End day without execution' })).toBeEnabled()
  })

  it('keeps host roles transient, hidden by default, and absent after recovery', () => {
    const firstRender = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
    expect(firstRender.store.saveCount).toBe(1)
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent('Role hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Show roles' }))
    expect(screen.getByText('Mayor 1')).toBeVisible()
    expect(screen.getByText('Citizen')).toBeVisible()
    expect(screen.getByText('Mayor 2')).toBeVisible()
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
    expect(recovered.container).not.toHaveTextContent('Mayor 1')
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('button', { name: 'Show roles' })).toBeVisible()
    expect(recovered.container).not.toHaveTextContent('Mayor 1')
    expect(firstRender.store.saveCount).toBe(1)
  })

  it('keeps Mayor candidates private, reveals independently, and guards rapid confirmation', () => {
    const { store, container } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
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
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent('Mayor revealed')
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent(
      'This player counts as 3 votes',
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
    expect(screen.getByText('Riley').closest('li')).toHaveTextContent('Mayor revealed')
  })

  it('keeps day recovery generic until Continue and restores the exact public reveal', () => {
    const store = new MemorySessionStore()
    const firstRender = renderLoaded(dawnSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
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
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent('Mayor revealed')
    expect(screen.getByText('Riley').closest('li')).toHaveTextContent('Role hidden')
  })

  it('keeps an in-memory reveal after save failure and retries the identical authority', () => {
    const store = new MemorySessionStore()
    renderLoaded(dawnSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
    store.failSave = true
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Mayor reveal' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Morgan/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicly reveal as Mayor' }))

    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent('Mayor revealed')
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()
    const failedPayload = JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(JSON.stringify(store.attemptedEnvelopes.at(-1)?.session)).toBe(failedPayload)
    expect(screen.getByText('Morgan').closest('li')).toHaveTextContent('Mayor revealed')
  })
})

describe('Phase 7C App integration', () => {
  it('guards rapid execution and next-night creation while saving each boundary once', () => {
    const { store } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
    expect(store.saveCount).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Execute a player' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Execute a player' })
    expect(screen.getByLabelText('Local save status').parentElement).toHaveAttribute('inert')
    expect(within(dialog).getByText('Citizen')).toBeVisible()
    fireEvent.click(within(dialog).getByRole('radio', { name: /CaseyCitizen/ }))
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
    const beginNight = screen.getByRole('button', { name: 'Begin Night 2' })
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'post-day-waiting',
      workflowStatus: 'post-day-waiting',
      game: {
        phase: 'execution-resolution',
        dayOutcomes: [{ kind: 'player-executed', dayNumber: 1 }],
      },
    })
    act(() => {
      beginNight.click()
      beginNight.click()
    })
    expect(store.saveCount).toBe(3)
    expect(screen.getByRole('heading', { name: 'Mafia' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Begin Night 2' })).toBeNull()
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'sequential-night',
      game: { phase: 'night-action-collection', nightNumber: 2, dayNumber: 1 },
    })
  })

  it('confirms no execution once without killing a player and offers Night 2', () => {
    const { store } = renderLoaded(dawnSession())
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))

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
    expect(screen.getByRole('button', { name: 'Begin Night 2' })).toBeVisible()
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'post-day-waiting',
      game: {
        dayOutcomes: [{ kind: 'no-execution', dayNumber: 1 }],
        deathRecords: [],
        personalWins: [],
        pendingJesterRevenges: [],
      },
    })
  })

  it('shows a public-safe retry error when Godfather succession cannot start the next night', () => {
    const randomNext = vi.fn(() => 1)
    const { store } = renderLoaded(
      postDaySession([
        { roleId: ROLE_IDS.godfather, name: 'Dead Mafia', alive: false },
        { roleId: ROLE_IDS.framer, name: 'Hidden successor' },
        { roleId: ROLE_IDS.citizen, name: 'Town 1' },
        { roleId: ROLE_IDS.citizen, name: 'Town 2' },
        { roleId: ROLE_IDS.citizen, name: 'Town 3' },
      ]),
      new MemorySessionStore(),
      randomNext,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    const saveCountBeforeAttempt = store.saveCount

    fireEvent.click(screen.getByRole('button', { name: 'Begin Night 2' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The next night could not be started safely. Retry.')
    expect(alert).not.toHaveTextContent(/Godfather|promotion|Framer|successor/i)
    expect(screen.getByRole('button', { name: 'Begin Night 2' })).toBeVisible()
    expect(store.saveCount).toBe(saveCountBeforeAttempt)
    expect(randomNext).toHaveBeenCalledOnce()
  })

  it('keeps post-day recovery generic until Continue and leaks no neutral authority', () => {
    const store = new MemorySessionStore()
    const active = renderLoaded(dawnSession(), store)
    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute a player' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /CaseyCitizen/ }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Day 1' }))
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
    expect(screen.getByText('The game continues.')).toBeVisible()
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
    expect(screen.getByText('The game continues.')).toBeVisible()
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

  it('keeps mid-revenge recovery private and applies a selected victim once under rapid clicks', () => {
    const store = new MemorySessionStore()
    const randomNext = vi.fn(() => 0.1)
    const { container } = renderLoaded(revengeResolutionSession(), store, randomNext)

    expect(screen.getByText('Night 2 — Dawn resolution')).toBeVisible()
    expect(container).not.toHaveTextContent(
      /Executed Jester|Hidden Mafia|Ordinary victim|Revenge victim|Jester revenge/i,
    )
    expect(randomNext).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue saved game' }))
    expect(screen.getByRole('heading', { name: 'Jester' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Jester' }).closest('section')).toHaveClass(
      'turn-surface--neutral',
    )
    expect(screen.getByText('Revenge victim')).toBeVisible()
    const applyRevenge = screen.getByRole('button', {
      name: 'Apply revenge death and continue',
    })
    act(() => {
      applyRevenge.click()
      applyRevenge.click()
    })

    expect(store.saveCount).toBe(1)
    expect(randomNext).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Game over' })).toHaveFocus()
    expect(screen.getByText('Mafia wins')).toBeVisible()
    expect(store.lastSuccessfulEnvelope?.session).toMatchObject({
      stage: 'game-over',
      game: {
        phase: 'game-over',
        nightNumber: 2,
        dayNumber: 1,
        pendingJesterRevenges: [],
        jesterRevengeResolutions: [{ kind: 'victim-killed' }],
      },
    })
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

  it('saves a mutual final-two draw once in Strict Mode and retries identical deaths', () => {
    const store = new MemorySessionStore()
    store.failSave = true
    const session = postDaySession(
      [
        { roleId: ROLE_IDS.godfather, name: 'First finalist' },
        { roleId: ROLE_IDS.serialKiller, name: 'Second finalist' },
      ],
      undefined,
      { godfatherAndSerialCanKillEachOther: true },
    )
    renderLoaded(session, store)
    const continueButton = screen.getByRole('button', { name: 'Continue saved game' })

    act(() => {
      continueButton.click()
      continueButton.click()
    })

    expect(store.saveCount).toBe(1)
    expect(screen.getByRole('heading', { name: 'Game over' })).toHaveFocus()
    expect(screen.getByText('Draw')).toBeVisible()
    expect(screen.getByText('The final two players eliminated each other.')).toBeVisible()
    expect(screen.getByText(/Unable to save locally/)).toBeVisible()
    const attempted = store.attemptedEnvelopes[0]?.session
    expect(attempted).toMatchObject({
      stage: 'game-over',
      result: {
        kind: 'draw',
        reason: 'opposing-killers-mutual-elimination',
      },
      game: {
        phase: 'game-over',
        deathRecords: [
          { cause: { kind: 'final-killing-role-showdown' } },
          { cause: { kind: 'final-killing-role-showdown' } },
        ],
      },
    })
    const failedPayload = JSON.stringify(attempted)

    store.failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))

    expect(store.saveCount).toBe(2)
    expect(JSON.stringify(store.attemptedEnvelopes[1]?.session)).toBe(failedPayload)
    expect(
      (
        store.attemptedEnvelopes[1]?.session as
          { game?: { deathRecords?: readonly unknown[] } } | undefined
      )?.game?.deathRecords,
    ).toHaveLength(2)
    expect(screen.getByText('The final two players eliminated each other.')).toBeVisible()
  })
})
