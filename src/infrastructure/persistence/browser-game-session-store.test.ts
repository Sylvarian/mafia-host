import { describe, expect, it, vi } from 'vitest'

import type {
  PersistedSessionMigratorV1,
  PersistedSessionRestorerV2,
} from '@/application/session-persistence/game-session-store.ts'
import type {
  PersistedSessionEnvelopeV2,
  RestoredSessionEnvelopeV2,
} from '@/application/session-persistence/persisted-session-v2.ts'
import { ROLE_REGISTRY } from '@/domain/roles/role-registry.ts'
import {
  BrowserGameSessionStore,
  LEGACY_SESSION_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  type StorageLike,
} from './browser-game-session-store.ts'

const SAVED_AT = '2026-07-18T10:00:00.000Z'
const SETTINGS = Object.freeze({
  godfatherAndSerialCanKillEachOther: false,
  godfatherAppearsSuspiciousToSheriff: false,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: false,
  revealRoleOnDeath: false,
  allowFirstNightKills: false,
})
const ROLE_COUNTS = Object.freeze(
  ROLE_REGISTRY.map((role) => Object.freeze({ roleId: role.id, count: 0 })),
)
const PERSISTED_V2: PersistedSessionEnvelopeV2 = Object.freeze({
  schemaVersion: 2,
  savedAt: SAVED_AT,
  session: Object.freeze({
    stage: 'setup',
    workflowStatus: 'editing',
    draft: Object.freeze({
      roster: Object.freeze([]),
      roleCounts: ROLE_COUNTS,
      settings: SETTINGS,
      nextPlayerNumber: 1,
    }),
  }),
})
const RESTORED_V2: RestoredSessionEnvelopeV2 = Object.freeze({
  schemaVersion: 2,
  savedAt: SAVED_AT,
  session: Object.freeze({
    stage: 'setup',
    workflow: Object.freeze({
      status: 'editing',
      draft: Object.freeze({
        roster: Object.freeze([]),
        roleCounts: ROLE_COUNTS,
        settings: SETTINGS,
        nextPlayerNumber: 1,
      }),
      editError: null,
    }),
  }),
})
const RESTORED_WITH_CANONICAL_WRITE_BACK: RestoredSessionEnvelopeV2 = Object.freeze({
  ...RESTORED_V2,
  writeBackEnvelope: PERSISTED_V2,
})

const restoreV2: PersistedSessionRestorerV2 = () => ({ ok: true, value: RESTORED_V2 })
const migrateV1: PersistedSessionMigratorV1 = () => ({ ok: true, value: PERSISTED_V2 })

function validV1SetupText(): string {
  return JSON.stringify({ ...PERSISTED_V2, schemaVersion: 1 })
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  readonly setItem = vi.fn((key: string, value: string) => {
    this.values.set(key, value)
  })
  readonly removeItem = vi.fn((key: string) => {
    this.values.delete(key)
  })

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
}

describe('browser game session store V2 authority', () => {
  it('writes a restored canonical upgrade once so the next refresh reads terminal authority', () => {
    const storage = new MemoryStorage()
    storage.values.set(SESSION_STORAGE_KEY, '{"preRuleWaiting":true}')
    const restoreUpgrade = vi.fn<PersistedSessionRestorerV2>((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(PERSISTED_V2)
        ? { ok: true, value: RESTORED_V2 }
        : { ok: true, value: RESTORED_WITH_CANONICAL_WRITE_BACK },
    )
    const store = new BrowserGameSessionStore(storage, restoreUpgrade, migrateV1)

    expect(store.load()).toEqual({ ok: true, value: RESTORED_WITH_CANONICAL_WRITE_BACK })
    expect(JSON.parse(storage.values.get(SESSION_STORAGE_KEY) ?? 'null')).toEqual(PERSISTED_V2)
    expect(store.load()).toEqual({ ok: true, value: RESTORED_V2 })
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(restoreUpgrade).toHaveBeenCalledTimes(2)
  })

  it('preserves the pre-upgrade V2 save when canonical write-back fails', () => {
    const storage = new MemoryStorage()
    const originalText = '{"preRuleWaiting":true}'
    storage.values.set(SESSION_STORAGE_KEY, originalText)
    storage.setItem.mockImplementation(() => {
      throw Object.assign(new Error('write failed'), { name: 'WriteError' })
    })
    const restoreUpgrade: PersistedSessionRestorerV2 = () => ({
      ok: true,
      value: RESTORED_WITH_CANONICAL_WRITE_BACK,
    })
    const store = new BrowserGameSessionStore(storage, restoreUpgrade, migrateV1)

    expect(store.load()).toEqual({
      ok: false,
      error: {
        type: 'V2_WRITE_FAILURE_AFTER_CANONICAL_UPGRADE',
        errorName: 'WriteError',
      },
    })
    expect(storage.values.get(SESSION_STORAGE_KEY)).toBe(originalText)
  })

  it('uses V2 as the sole authority when both keys exist', () => {
    const storage = new MemoryStorage()
    storage.values.set(SESSION_STORAGE_KEY, JSON.stringify(PERSISTED_V2))
    storage.values.set(
      LEGACY_SESSION_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: SAVED_AT,
        session: { stage: 'night-action' },
      }),
    )
    const migrate = vi.fn(migrateV1)
    const store = new BrowserGameSessionStore(storage, restoreV2, migrate)

    const result = store.load()
    expect(result.ok).toBe(true)
    expect(migrate).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('writes a safely migrated V2 save before removing V1', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_SESSION_STORAGE_KEY, validV1SetupText())
    const callOrder: string[] = []
    storage.setItem.mockImplementation((key, value) => {
      callOrder.push(`set:${key}`)
      storage.values.set(key, value)
    })
    storage.removeItem.mockImplementation((key) => {
      callOrder.push(`remove:${key}`)
      storage.values.delete(key)
    })
    const store = new BrowserGameSessionStore(storage, restoreV2, migrateV1)

    const result = store.load()
    expect(result.ok).toBe(true)
    expect(callOrder).toEqual([
      `set:${SESSION_STORAGE_KEY}`,
      `remove:${LEGACY_SESSION_STORAGE_KEY}`,
    ])
    expect(storage.values.has(SESSION_STORAGE_KEY)).toBe(true)
    expect(storage.values.has(LEGACY_SESSION_STORAGE_KEY)).toBe(false)
  })

  it('preserves V1 when V2 writing fails after migration', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_SESSION_STORAGE_KEY, validV1SetupText())
    storage.setItem.mockImplementation(() => {
      throw Object.assign(new Error('write failed'), { name: 'WriteError' })
    })
    const store = new BrowserGameSessionStore(storage, restoreV2, migrateV1)

    expect(store.load()).toEqual({
      ok: false,
      error: { type: 'V2_WRITE_FAILURE_AFTER_MIGRATION', errorName: 'WriteError' },
    })
    expect(storage.values.has(LEGACY_SESSION_STORAGE_KEY)).toBe(true)
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('leaves an incompatible V1 in place and returns its explicit error', () => {
    const storage = new MemoryStorage()
    storage.values.set(
      LEGACY_SESSION_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: SAVED_AT,
        session: { stage: 'night-presentation' },
      }),
    )
    const rejectMigration: PersistedSessionMigratorV1 = () => ({
      ok: false,
      error: { type: 'STALE_OLD_PRIVATE_RESULT_WORKFLOW' },
    })
    const store = new BrowserGameSessionStore(storage, restoreV2, rejectMigration)

    expect(store.load()).toEqual({
      ok: false,
      error: { type: 'STALE_OLD_PRIVATE_RESULT_WORKFLOW' },
    })
    expect(storage.values.has(LEGACY_SESSION_STORAGE_KEY)).toBe(true)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('clears both active and legacy keys deliberately', () => {
    const storage = new MemoryStorage()
    storage.values.set(SESSION_STORAGE_KEY, 'v2')
    storage.values.set(LEGACY_SESSION_STORAGE_KEY, 'v1')
    const store = new BrowserGameSessionStore(storage, restoreV2, migrateV1)

    expect(store.clear()).toEqual({ ok: true })
    expect(storage.removeItem).toHaveBeenNthCalledWith(1, LEGACY_SESSION_STORAGE_KEY)
    expect(storage.removeItem).toHaveBeenNthCalledWith(2, SESSION_STORAGE_KEY)
    expect(storage.values.size).toBe(0)
  })

  it('preserves V2 authority when legacy-key removal fails', () => {
    const storage = new MemoryStorage()
    storage.values.set(SESSION_STORAGE_KEY, 'v2')
    storage.values.set(LEGACY_SESSION_STORAGE_KEY, 'v1')
    storage.removeItem.mockImplementation((key) => {
      if (key === LEGACY_SESSION_STORAGE_KEY) {
        throw Object.assign(new Error('legacy removal failed'), { name: 'RemoveError' })
      }
      storage.values.delete(key)
    })
    const store = new BrowserGameSessionStore(storage, restoreV2, migrateV1)

    expect(store.clear()).toEqual({
      ok: false,
      error: { type: 'CLEAR_FAILURE', errorName: 'RemoveError' },
    })
    expect(storage.values.get(SESSION_STORAGE_KEY)).toBe('v2')
    expect(storage.values.get(LEGACY_SESSION_STORAGE_KEY)).toBe('v1')
    expect(storage.removeItem).toHaveBeenCalledTimes(1)
  })

  it('preserves V2 authority if its removal fails after legacy cleanup', () => {
    const storage = new MemoryStorage()
    storage.values.set(SESSION_STORAGE_KEY, 'v2')
    storage.values.set(LEGACY_SESSION_STORAGE_KEY, 'v1')
    storage.removeItem.mockImplementation((key) => {
      if (key === SESSION_STORAGE_KEY) {
        throw Object.assign(new Error('V2 removal failed'), { name: 'RemoveError' })
      }
      storage.values.delete(key)
    })
    const store = new BrowserGameSessionStore(storage, restoreV2, migrateV1)

    expect(store.clear()).toEqual({
      ok: false,
      error: { type: 'CLEAR_FAILURE', errorName: 'RemoveError' },
    })
    expect(storage.values.get(SESSION_STORAGE_KEY)).toBe('v2')
    expect(storage.values.has(LEGACY_SESSION_STORAGE_KEY)).toBe(false)
  })
})
