import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistedSessionRestorer } from '@/application/session-persistence/game-session-store.ts'
import type {
  PersistedSessionEnvelopeV1,
  RestoredSessionEnvelopeV1,
} from '@/application/session-persistence/persisted-session-v1.ts'
import { ROLE_REGISTRY } from '@/domain/roles/role-registry.ts'

import {
  BrowserGameSessionStore,
  SESSION_STORAGE_KEY,
  createBrowserGameSessionStore,
  type StorageLike,
} from './browser-game-session-store.ts'

const SETTINGS = {
  godfatherAndSerialCanKillEachOther: false,
  godfatherAppearsSuspiciousToSheriff: true,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: false,
  revealRoleOnDeath: false,
  allowFirstNightKills: false,
}
const ENVELOPE: PersistedSessionEnvelopeV1 = {
  schemaVersion: 1,
  savedAt: '2026-07-17T10:00:00.000Z',
  session: {
    stage: 'setup',
    workflowStatus: 'editing',
    draft: {
      roster: [],
      roleCounts: ROLE_REGISTRY.map((role) => ({ roleId: role.id, count: 0 })),
      settings: SETTINGS,
      nextPlayerNumber: 1,
    },
  },
}
const RESTORED_ENVELOPE: RestoredSessionEnvelopeV1 = {
  schemaVersion: 1,
  savedAt: ENVELOPE.savedAt,
  session: {
    stage: 'setup',
    workflow: {
      status: 'editing',
      draft: {
        roster: [],
        roleCounts: ROLE_REGISTRY.map((role) => ({ roleId: role.id, count: 0 })),
        settings: SETTINGS,
        nextPlayerNumber: 1,
      },
      editError: null,
    },
  },
}
const restoreFixture: PersistedSessionRestorer = () => ({
  ok: true,
  value: RESTORED_ENVELOPE,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BrowserGameSessionStore', () => {
  it('uses the exact namespaced key for successful load, save, and clear', () => {
    const storage = new RecordingStorage()
    const store = new BrowserGameSessionStore(storage, restoreFixture)

    expect(store.load()).toEqual({ ok: false, error: { type: 'NO_SAVED_SESSION' } })
    expect(storage.keysRead).toEqual([SESSION_STORAGE_KEY])
    expect(SESSION_STORAGE_KEY).toBe('mafia-host:active-session:v1')

    expect(store.save(ENVELOPE)).toEqual({ ok: true })
    expect(storage.keysWritten).toEqual([SESSION_STORAGE_KEY])
    expect(storage.value).toBe(JSON.stringify(ENVELOPE))

    const loadResult = store.load()
    expect(loadResult.ok).toBe(true)
    if (!loadResult.ok) {
      throw new Error('Expected successful load.')
    }
    expect(loadResult.value.session.stage).toBe('setup')
    if (loadResult.value.session.stage !== 'setup') {
      throw new Error('Expected restored setup.')
    }
    expect(loadResult.value.session.workflow.status).toBe('editing')

    expect(store.clear()).toEqual({ ok: true })
    expect(storage.keysRemoved).toEqual([SESSION_STORAGE_KEY])
    expect(storage.value).toBeNull()
  })

  it('distinguishes invalid JSON from an invalid envelope', () => {
    const invalidJsonStorage = new RecordingStorage('{')
    expect(new BrowserGameSessionStore(invalidJsonStorage, restoreFixture).load()).toEqual({
      ok: false,
      error: { type: 'INVALID_JSON' },
    })

    const invalidEnvelopeStorage = new RecordingStorage(
      JSON.stringify({ schemaVersion: 1, savedAt: 'invalid', session: {} }),
    )
    const result = new BrowserGameSessionStore(invalidEnvelopeStorage, () => ({
      ok: false,
      error: { type: 'INVALID_TIMESTAMP' },
    })).load()
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected invalid envelope.')
    }
    expect(result.error.type).toBe('INVALID_TIMESTAMP')
  })

  it('returns structured read, write, quota, and clear failures', () => {
    const readFailure = new BrowserGameSessionStore(
      {
        getItem: () => {
          throw Object.assign(new Error('blocked'), { name: 'SecurityError' })
        },
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      restoreFixture,
    )
    expect(readFailure.load()).toEqual({
      ok: false,
      error: { type: 'STORAGE_READ_FAILURE', errorName: 'SecurityError' },
    })

    const writeFailure = new BrowserGameSessionStore(
      {
        getItem: () => null,
        setItem: () => {
          throw Object.assign(new Error('blocked'), { name: 'SecurityError' })
        },
        removeItem: () => undefined,
      },
      restoreFixture,
    )
    expect(writeFailure.save(ENVELOPE)).toEqual({
      ok: false,
      error: { type: 'SAVE_FAILURE', errorName: 'SecurityError' },
    })

    const quotaFailure = new BrowserGameSessionStore(
      {
        getItem: () => null,
        setItem: () => {
          throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
        },
        removeItem: () => undefined,
      },
      restoreFixture,
    )
    expect(quotaFailure.save(ENVELOPE)).toEqual({
      ok: false,
      error: { type: 'QUOTA_EXCEEDED', errorName: 'QuotaExceededError' },
    })

    const clearFailure = new BrowserGameSessionStore(
      {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => {
          throw Object.assign(new Error('blocked'), { name: 'SecurityError' })
        },
      },
      restoreFixture,
    )
    expect(clearFailure.clear()).toEqual({
      ok: false,
      error: { type: 'CLEAR_FAILURE', errorName: 'SecurityError' },
    })
  })

  it('reports unavailable storage for every operation', () => {
    const store = new BrowserGameSessionStore(null, restoreFixture)
    expect(store.load()).toEqual({
      ok: false,
      error: { type: 'STORAGE_UNAVAILABLE', operation: 'load' },
    })
    expect(store.save(ENVELOPE)).toEqual({
      ok: false,
      error: { type: 'STORAGE_UNAVAILABLE', operation: 'save' },
    })
    expect(store.clear()).toEqual({
      ok: false,
      error: { type: 'STORAGE_UNAVAILABLE', operation: 'clear' },
    })
  })

  it('treats a throwing localStorage property getter as unavailable storage', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw Object.assign(new Error('blocked'), { name: 'SecurityError' })
      },
    })

    try {
      const store = createBrowserGameSessionStore(restoreFixture)
      expect(store.load()).toEqual({
        ok: false,
        error: { type: 'STORAGE_UNAVAILABLE', operation: 'load' },
      })
      expect(store.save(ENVELOPE)).toEqual({
        ok: false,
        error: { type: 'STORAGE_UNAVAILABLE', operation: 'save' },
      })
      expect(store.clear()).toEqual({
        ok: false,
        error: { type: 'STORAGE_UNAVAILABLE', operation: 'clear' },
      })
    } finally {
      if (descriptor !== undefined) {
        Object.defineProperty(window, 'localStorage', descriptor)
      }
    }
  })

  it('never logs saved session contents', () => {
    const consoleLog = vi.spyOn(console, 'log')
    const storage = new RecordingStorage()
    const store = new BrowserGameSessionStore(storage, restoreFixture)

    store.save(ENVELOPE)
    store.load()
    store.clear()

    expect(consoleLog).not.toHaveBeenCalled()
  })
})

class RecordingStorage implements StorageLike {
  value: string | null
  readonly keysRead: string[] = []
  readonly keysWritten: string[] = []
  readonly keysRemoved: string[] = []

  constructor(value: string | null = null) {
    this.value = value
  }

  getItem(key: string): string | null {
    this.keysRead.push(key)
    return this.value
  }

  setItem(key: string, value: string): void {
    this.keysWritten.push(key)
    this.value = value
  }

  removeItem(key: string): void {
    this.keysRemoved.push(key)
    this.value = null
  }
}
