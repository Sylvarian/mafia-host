import { describe, expect, it } from 'vitest'

import {
  BrowserRememberedPlayerNamesRepository,
  REMEMBERED_PLAYER_NAMES_STORAGE_KEY,
} from './browser-remembered-player-names-repository.ts'
import { SESSION_STORAGE_KEY, type StorageLike } from './browser-game-session-store.ts'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('browser remembered player-name repository', () => {
  it('uses a dedicated key and stores names without active-session authority', () => {
    const storage = new MemoryStorage()
    const repository = new BrowserRememberedPlayerNamesRepository(storage)

    expect(repository.save(['Alex', 'Taylor'])).toEqual({ ok: true })
    expect(REMEMBERED_PLAYER_NAMES_STORAGE_KEY).not.toBe(SESSION_STORAGE_KEY)
    expect(storage.values.get(REMEMBERED_PLAYER_NAMES_STORAGE_KEY)).toBe('["Alex","Taylor"]')
    expect(storage.values.has(SESSION_STORAGE_KEY)).toBe(false)
    expect(repository.load()).toEqual({ ok: true, value: ['Alex', 'Taylor'] })
  })

  it('returns malformed JSON as untrusted data for application validation', () => {
    const storage = new MemoryStorage()
    storage.values.set(REMEMBERED_PLAYER_NAMES_STORAGE_KEY, '{not-json')
    const repository = new BrowserRememberedPlayerNamesRepository(storage)

    expect(repository.load()).toEqual({
      ok: true,
      value: { malformedJson: true },
    })
  })

  it('clears only the preference key', () => {
    const storage = new MemoryStorage()
    storage.values.set(REMEMBERED_PLAYER_NAMES_STORAGE_KEY, '["Alex"]')
    storage.values.set(SESSION_STORAGE_KEY, '{"active":true}')
    const repository = new BrowserRememberedPlayerNamesRepository(storage)

    expect(repository.clear()).toEqual({ ok: true })
    expect(storage.values.has(REMEMBERED_PLAYER_NAMES_STORAGE_KEY)).toBe(false)
    expect(storage.values.get(SESSION_STORAGE_KEY)).toBe('{"active":true}')
  })

  it('returns structured failures when browser storage is unavailable', () => {
    const repository = new BrowserRememberedPlayerNamesRepository(null)

    expect(repository.load()).toMatchObject({
      ok: false,
      error: { type: 'REMEMBERED_PLAYER_NAMES_LOAD_FAILURE' },
    })
    expect(repository.save(['Alex'])).toMatchObject({
      ok: false,
      error: { type: 'REMEMBERED_PLAYER_NAMES_SAVE_FAILURE' },
    })
    expect(repository.clear()).toMatchObject({
      ok: false,
      error: { type: 'REMEMBERED_PLAYER_NAMES_CLEAR_FAILURE' },
    })
  })
})
