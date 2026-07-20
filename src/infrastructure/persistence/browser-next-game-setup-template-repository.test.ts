import { describe, expect, it } from 'vitest'

import type { NextGameSetupTemplate } from '@/application/game-setup/next-game-setup-template.ts'
import { ROLE_REGISTRY } from '@/domain/roles/role-registry.ts'
import {
  BrowserNextGameSetupTemplateRepository,
  LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY,
  NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY,
} from './browser-next-game-setup-template-repository.ts'
import { SESSION_STORAGE_KEY, type StorageLike } from './browser-game-session-store.ts'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  failSet = false
  failRemove = false

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failSet) {
      throw new DOMException('Blocked', 'SecurityError')
    }
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    if (this.failRemove) {
      throw new DOMException('Blocked', 'SecurityError')
    }
    this.values.delete(key)
  }
}

function createTemplate(playerNames: readonly string[]): NextGameSetupTemplate {
  return {
    roster: playerNames.map((name) => ({ name, playing: true })),
    roleCounts: ROLE_REGISTRY.map((role) => ({ roleId: role.id, count: 0 })),
    settings: {
      godfatherAndSerialCanKillEachOther: false,
      godfatherAppearsSuspiciousToSheriff: false,
      doctorCanSelfProtect: false,
      doctorCannotRepeatPreviousTarget: false,
      revealRoleOnDeath: false,
      allowFirstNightKills: false,
    },
  }
}

describe('browser next-game setup-template repository', () => {
  it('uses a separate key, stores exact setup-only fields, and removes legacy names', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY, '["Legacy"]')
    const repository = new BrowserNextGameSetupTemplateRepository(storage)
    const template = createTemplate(['Alex', 'Taylor'])

    expect(repository.save(template)).toEqual({ ok: true })
    expect(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY).not.toBe(SESSION_STORAGE_KEY)
    expect(storage.values.has(SESSION_STORAGE_KEY)).toBe(false)
    expect(storage.values.has(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY)).toBe(false)
    expect(JSON.parse(storage.values.get(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY) ?? '')).toEqual(
      template,
    )
  })

  it('loads the new template in preference to legacy names', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY,
      '{"roster":[{"name":"New","playing":true}],"roleCounts":[],"settings":{}}',
    )
    storage.values.set(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY, '["Legacy"]')
    const repository = new BrowserNextGameSetupTemplateRepository(storage)

    expect(repository.load()).toEqual({
      ok: true,
      value: {
        source: 'template',
        payload: {
          roster: [{ name: 'New', playing: true }],
          roleCounts: [],
          settings: {},
        },
      },
    })
  })

  it('reads the names-only key only when no new template exists', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY, '["Legacy"]')
    const repository = new BrowserNextGameSetupTemplateRepository(storage)
    expect(repository.load()).toEqual({
      ok: true,
      value: {
        source: 'legacy-player-names',
        payload: ['Legacy'],
      },
    })
  })

  it('returns malformed JSON as untrusted data for application validation', () => {
    const storage = new MemoryStorage()
    storage.values.set(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY, '{not-json')
    const repository = new BrowserNextGameSetupTemplateRepository(storage)
    expect(repository.load()).toEqual({
      ok: true,
      value: {
        source: 'template',
        payload: { malformedJson: true },
      },
    })
  })

  it('clears template and legacy preference without touching the active game', () => {
    const storage = new MemoryStorage()
    storage.values.set(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY, '{"saved":true}')
    storage.values.set(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY, '["Legacy"]')
    storage.values.set(SESSION_STORAGE_KEY, '{"active":true}')
    const repository = new BrowserNextGameSetupTemplateRepository(storage)

    expect(repository.clear()).toEqual({ ok: true })
    expect(storage.values.has(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY)).toBe(false)
    expect(storage.values.has(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY)).toBe(false)
    expect(storage.values.get(SESSION_STORAGE_KEY)).toBe('{"active":true}')
  })

  it('returns structured unavailable, write, migration, and clear failures', () => {
    const unavailable = new BrowserNextGameSetupTemplateRepository(null)
    expect(unavailable.load()).toMatchObject({
      ok: false,
      error: { type: 'NEXT_GAME_SETUP_TEMPLATE_LOAD_FAILURE' },
    })

    const writeStorage = new MemoryStorage()
    writeStorage.failSet = true
    expect(
      new BrowserNextGameSetupTemplateRepository(writeStorage).save(createTemplate(['Alex'])),
    ).toMatchObject({
      ok: false,
      error: { type: 'NEXT_GAME_SETUP_TEMPLATE_SAVE_FAILURE' },
    })

    const migrationStorage = new MemoryStorage()
    migrationStorage.failRemove = true
    expect(
      new BrowserNextGameSetupTemplateRepository(migrationStorage).save(createTemplate(['Alex'])),
    ).toMatchObject({
      ok: false,
      error: { type: 'NEXT_GAME_SETUP_TEMPLATE_MIGRATION_FAILURE' },
    })

    const clearStorage = new MemoryStorage()
    clearStorage.failRemove = true
    expect(new BrowserNextGameSetupTemplateRepository(clearStorage).clear()).toMatchObject({
      ok: false,
      error: { type: 'NEXT_GAME_SETUP_TEMPLATE_CLEAR_FAILURE' },
    })
  })
})
