import { describe, expect, it, vi } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import {
  createInitialGameSetupDraft,
  setRoleCount,
  togglePlayerParticipation,
} from './game-setup-draft.ts'
import {
  createDefaultNextGameSetupTemplate,
  createGameSetupDraftFromTemplate,
  createNextGameSetupTemplate,
  loadNextGameSetupTemplate,
  saveNextGameSetupTemplate,
  validateNextGameSetupTemplate,
  type NextGameSetupTemplate,
  type NextGameSetupTemplateRepository,
} from './next-game-setup-template.ts'

describe('next-game setup template', () => {
  it('round-trips ordered names, exact role quantities, and every setting into an editable draft', () => {
    const template = validTemplate(['Alex', 'Alex'])
    const validated = validateNextGameSetupTemplate(template)
    expect(validated).toEqual({ ok: true, value: template })
    if (!validated.ok) {
      throw new Error('Expected valid template.')
    }

    const draft = createGameSetupDraftFromTemplate(validated.value)
    expect(draft.roster.map(({ name, playing }) => ({ name, playing }))).toEqual([
      { name: 'Alex', playing: true },
      { name: 'Alex', playing: true },
    ])
    expect(draft.roster.map((player) => player.id)).toEqual(['player-1', 'player-2'])
    expect(draft.roleCounts).toEqual(template.roleCounts)
    expect(draft.settings).toEqual(template.settings)
    expect(draft).not.toBe(template)
  })

  it('round-trips the complete ordered roster and participation choices without player IDs', () => {
    const initial = createInitialGameSetupDraft(['Alice', 'Bob'])
    const bob = initial.roster[1]
    if (bob === undefined) {
      throw new Error('Expected Bob in the setup roster.')
    }
    const toggled = togglePlayerParticipation(initial, bob.id)
    if (!toggled.ok) {
      throw new Error('Expected Bob participation to be editable.')
    }
    const configured = setRoleCount(toggled.value, ROLE_IDS.godfather, 1)
    if (!configured.ok) {
      throw new Error('Expected a valid Godfather count.')
    }

    const template = createNextGameSetupTemplate(configured.value)
    expect(template.roster).toEqual([
      { name: 'Alice', playing: true },
      { name: 'Bob', playing: false },
    ])
    expect(JSON.stringify(template)).not.toContain('player-')

    const restored = createGameSetupDraftFromTemplate(template)
    expect(restored.roster.map(({ name, playing }) => ({ name, playing }))).toEqual(template.roster)
    expect(restored.roster.map((player) => player.id)).toEqual(['player-1', 'player-2'])
  })

  it('allows the canonical all-zero distribution only for safe names-only migration defaults', () => {
    const template = createDefaultNextGameSetupTemplate(['Alex', 'Taylor'])
    expect(validateNextGameSetupTemplate(template)).toEqual({
      ok: true,
      value: template,
    })
    expect(template.roleCounts.every((entry) => entry.count === 0)).toBe(true)
  })

  it.each([
    {
      mutate: (template: NextGameSetupTemplate) => ({
        ...template,
        roster: [
          { name: 'Alex', playing: true },
          { name: '', playing: true },
        ],
      }),
      error: 'INVALID_SAVED_ROSTER',
    },
    {
      mutate: (template: NextGameSetupTemplate) => ({
        ...template,
        roster: [{ name: 'Alex', playing: 'yes' }],
      }),
      error: 'INVALID_SAVED_ROSTER',
    },
    {
      mutate: (template: NextGameSetupTemplate) => ({
        ...template,
        roleCounts: template.roleCounts.slice(1),
      }),
      error: 'INVALID_SAVED_ROLE_DISTRIBUTION',
    },
    {
      mutate: (template: NextGameSetupTemplate) => ({
        ...template,
        roleCounts: template.roleCounts.map((entry) =>
          entry.roleId === ROLE_IDS.citizen ? { ...entry, count: 2 } : entry,
        ),
      }),
      error: 'INVALID_SAVED_ROLE_DISTRIBUTION',
    },
    {
      mutate: (template: NextGameSetupTemplate) => ({
        ...template,
        settings: { ...template.settings, revealRoleOnDeath: 'yes' },
      }),
      error: 'INVALID_SAVED_SETTINGS',
    },
    {
      mutate: (template: NextGameSetupTemplate) => ({
        ...template,
        settings: { ...template.settings, hiddenMatchState: true },
      }),
      error: 'INVALID_SAVED_SETTINGS',
    },
    {
      mutate: (template: NextGameSetupTemplate) => ({
        ...template,
        gameId: 'must-not-enter-template',
      }),
      error: 'INVALID_SETUP_TEMPLATE_PAYLOAD',
    },
  ])('rejects malformed or authority-bearing payloads', ({ mutate, error }) => {
    expect(validateNextGameSetupTemplate(mutate(validTemplate()))).toEqual({
      ok: false,
      error: { type: error },
    })
  })

  it('migrates valid legacy names with canonical defaults and saves once', () => {
    const save = vi.fn(() => ({ ok: true as const }))
    const repository: NextGameSetupTemplateRepository = {
      load: () => ({
        ok: true,
        value: {
          source: 'legacy-player-names',
          payload: [' Alex ', 'Taylor'],
        },
      }),
      save,
      clear: () => ({ ok: true }),
    }

    const result = loadNextGameSetupTemplate(repository)
    expect(result.template?.roster).toEqual([
      { name: 'Alex', playing: true },
      { name: 'Taylor', playing: true },
    ])
    expect(result.template?.roleCounts.every((entry) => entry.count === 0)).toBe(true)
    expect(result.migratedLegacyPlayerNames).toBe(true)
    expect(save).toHaveBeenCalledOnce()
  })

  it('rejects malformed legacy names without writing a template', () => {
    const save = vi.fn(() => ({ ok: true as const }))
    const repository: NextGameSetupTemplateRepository = {
      load: () => ({
        ok: true,
        value: {
          source: 'legacy-player-names',
          payload: ['Alex', { name: 'Taylor' }],
        },
      }),
      save,
      clear: () => ({ ok: true }),
    }

    expect(loadNextGameSetupTemplate(repository)).toEqual({
      template: null,
      error: { type: 'INVALID_SAVED_ROSTER' },
      migratedLegacyPlayerNames: false,
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('reports a structured migration failure while retaining the safe in-memory defaults', () => {
    const repository: NextGameSetupTemplateRepository = {
      load: () => ({
        ok: true,
        value: {
          source: 'legacy-player-names',
          payload: ['Alex', 'Taylor'],
        },
      }),
      save: () => ({
        ok: false,
        error: {
          type: 'NEXT_GAME_SETUP_TEMPLATE_SAVE_FAILURE',
          errorName: 'SecurityError',
        },
      }),
      clear: () => ({ ok: true }),
    }

    const result = loadNextGameSetupTemplate(repository)
    expect(result.template?.roster).toEqual([
      { name: 'Alex', playing: true },
      { name: 'Taylor', playing: true },
    ])
    expect(result).toMatchObject({
      error: {
        type: 'NEXT_GAME_SETUP_TEMPLATE_MIGRATION_FAILURE',
        errorName: 'SecurityError',
      },
      migratedLegacyPlayerNames: false,
    })
  })

  it('prefers a valid new template and never invokes migration writes', () => {
    const template = validTemplate()
    const save = vi.fn(() => ({ ok: true as const }))
    const repository: NextGameSetupTemplateRepository = {
      load: () => ({
        ok: true,
        value: { source: 'template', payload: template },
      }),
      save,
      clear: () => ({ ok: true }),
    }
    expect(loadNextGameSetupTemplate(repository)).toEqual({
      template,
      error: null,
      migratedLegacyPlayerNames: false,
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('reports storage unavailability without preventing a fresh setup', () => {
    const repository: NextGameSetupTemplateRepository = {
      load: () => ({
        ok: false,
        error: {
          type: 'NEXT_GAME_SETUP_TEMPLATE_LOAD_FAILURE',
          errorName: 'StorageUnavailable',
        },
      }),
      save: () => ({ ok: true }),
      clear: () => ({ ok: true }),
    }

    expect(loadNextGameSetupTemplate(repository)).toEqual({
      template: null,
      error: {
        type: 'NEXT_GAME_SETUP_TEMPLATE_LOAD_FAILURE',
        errorName: 'StorageUnavailable',
      },
      migratedLegacyPlayerNames: false,
    })
  })

  it('does not send an invalid template to infrastructure', () => {
    const save = vi.fn(() => ({ ok: true as const }))
    const repository: NextGameSetupTemplateRepository = {
      load: () => ({ ok: true, value: null }),
      save,
      clear: () => ({ ok: true }),
    }
    expect(
      saveNextGameSetupTemplate(repository, {
        ...validTemplate(),
        roster: [{ name: '', playing: true }],
      }),
    ).toEqual({
      ok: false,
      error: { type: 'INVALID_SAVED_ROSTER' },
    })
    expect(save).not.toHaveBeenCalled()
  })
})

function validTemplate(playerNames: readonly string[] = ['Alex', 'Taylor']): NextGameSetupTemplate {
  const defaults = createDefaultNextGameSetupTemplate(playerNames)
  return {
    ...defaults,
    roleCounts: defaults.roleCounts.map((entry) =>
      entry.roleId === ROLE_IDS.godfather || entry.roleId === ROLE_IDS.citizen
        ? { ...entry, count: 1 }
        : entry,
    ),
    settings: {
      ...defaults.settings,
      godfatherAndSerialCanKillEachOther: true,
      godfatherAppearsSuspiciousToSheriff: false,
      doctorCanSelfProtect: true,
      doctorCannotRepeatPreviousTarget: true,
      revealRoleOnDeath: true,
      allowFirstNightKills: true,
    },
  }
}
