import type {
  ClearPersistedSessionResult,
  GameSessionStore,
  LoadPersistedSessionResult,
  PersistedSessionMigratorV1,
  PersistedSessionRestorerV2,
  SavePersistedSessionResult,
} from '@/application/session-persistence/game-session-store.ts'
import type { PersistedSessionEnvelopeV2 } from '@/application/session-persistence/persisted-session-v2.ts'

export const SESSION_STORAGE_KEY = 'mafia-host:active-session:v2'
export const LEGACY_SESSION_STORAGE_KEY = 'mafia-host:active-session:v1'

export type StorageLike = Readonly<{
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}>

export class BrowserGameSessionStore implements GameSessionStore {
  readonly #storage: StorageLike | null
  readonly #restoreV2: PersistedSessionRestorerV2
  readonly #migrateV1: PersistedSessionMigratorV1

  constructor(
    storage: StorageLike | null,
    restoreV2: PersistedSessionRestorerV2,
    migrateV1: PersistedSessionMigratorV1,
  ) {
    this.#storage = storage
    this.#restoreV2 = restoreV2
    this.#migrateV1 = migrateV1
  }

  load(): LoadPersistedSessionResult {
    if (this.#storage === null) {
      return { ok: false, error: { type: 'STORAGE_UNAVAILABLE', operation: 'load' } }
    }

    const v2TextResult = this.#read(SESSION_STORAGE_KEY)
    if (!v2TextResult.ok) {
      return v2TextResult
    }
    if (v2TextResult.value !== null) {
      const parsed = parseStoredJson(v2TextResult.value)
      if (!parsed.ok) {
        return parsed
      }
      const restored = this.#restoreV2(parsed.value)
      if (!restored.ok || restored.value.writeBackEnvelope === undefined) {
        return restored
      }
      try {
        this.#storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(restored.value.writeBackEnvelope))
      } catch (error: unknown) {
        return {
          ok: false,
          error: {
            type: 'V2_WRITE_FAILURE_AFTER_CANONICAL_UPGRADE',
            errorName: getErrorName(error),
          },
        }
      }
      return restored
    }

    const v1TextResult = this.#read(LEGACY_SESSION_STORAGE_KEY)
    if (!v1TextResult.ok) {
      return v1TextResult
    }
    if (v1TextResult.value === null) {
      return { ok: false, error: { type: 'NO_SAVED_SESSION' } }
    }
    const parsedLegacy = parseStoredJson(v1TextResult.value)
    if (!parsedLegacy.ok) {
      return parsedLegacy
    }
    const migration = this.#migrateV1(parsedLegacy.value)
    if (!migration.ok) {
      return migration
    }
    const restored = this.#restoreV2(migration.value)
    if (!restored.ok) {
      return restored
    }

    try {
      this.#storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(migration.value))
    } catch (error: unknown) {
      return {
        ok: false,
        error: {
          type: 'V2_WRITE_FAILURE_AFTER_MIGRATION',
          errorName: getErrorName(error),
        },
      }
    }
    try {
      this.#storage.removeItem(LEGACY_SESSION_STORAGE_KEY)
    } catch (error: unknown) {
      try {
        this.#storage.removeItem(SESSION_STORAGE_KEY)
      } catch {
        // The load remains failed and V2 stays the only key used on the next attempt.
      }
      return {
        ok: false,
        error: {
          type: 'LEGACY_REMOVAL_FAILURE_AFTER_MIGRATION',
          errorName: getErrorName(error),
        },
      }
    }

    return restored
  }

  save(envelope: PersistedSessionEnvelopeV2): SavePersistedSessionResult {
    if (this.#storage === null) {
      return { ok: false, error: { type: 'STORAGE_UNAVAILABLE', operation: 'save' } }
    }
    try {
      this.#storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(envelope))
      return { ok: true }
    } catch (error: unknown) {
      const errorName = getErrorName(error)
      return isQuotaError(error)
        ? { ok: false, error: { type: 'QUOTA_EXCEEDED', errorName } }
        : { ok: false, error: { type: 'SAVE_FAILURE', errorName } }
    }
  }

  clear(): ClearPersistedSessionResult {
    if (this.#storage === null) {
      return { ok: false, error: { type: 'STORAGE_UNAVAILABLE', operation: 'clear' } }
    }
    try {
      const v2Exists = this.#storage.getItem(SESSION_STORAGE_KEY) !== null
      const v1Exists = this.#storage.getItem(LEGACY_SESSION_STORAGE_KEY) !== null

      if (v2Exists) {
        if (v1Exists) {
          this.#storage.removeItem(LEGACY_SESSION_STORAGE_KEY)
        }
        this.#storage.removeItem(SESSION_STORAGE_KEY)
      } else if (v1Exists) {
        this.#storage.removeItem(LEGACY_SESSION_STORAGE_KEY)
      }
      return { ok: true }
    } catch (error: unknown) {
      return {
        ok: false,
        error: { type: 'CLEAR_FAILURE', errorName: getErrorName(error) },
      }
    }
  }

  #read(
    key: string,
  ):
    | Readonly<{ ok: true; value: string | null }>
    | Extract<LoadPersistedSessionResult, Readonly<{ ok: false }>> {
    try {
      return { ok: true, value: this.#storage?.getItem(key) ?? null }
    } catch (error: unknown) {
      return {
        ok: false,
        error: { type: 'STORAGE_READ_FAILURE', errorName: getErrorName(error) },
      }
    }
  }
}

export function createBrowserGameSessionStore(
  restoreV2: PersistedSessionRestorerV2,
  migrateV1: PersistedSessionMigratorV1,
): BrowserGameSessionStore {
  try {
    return new BrowserGameSessionStore(window.localStorage, restoreV2, migrateV1)
  } catch {
    return new BrowserGameSessionStore(null, restoreV2, migrateV1)
  }
}

function parseStoredJson(
  text: string,
):
  | Readonly<{ ok: true; value: unknown }>
  | Extract<LoadPersistedSessionResult, Readonly<{ ok: false }>> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, error: { type: 'INVALID_JSON' } }
  }
}

function isQuotaError(error: unknown): boolean {
  const errorName = getErrorName(error)
  return errorName === 'QuotaExceededError' || errorName === 'NS_ERROR_DOM_QUOTA_REACHED'
}

function getErrorName(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string' &&
    error.name.length > 0
  ) {
    return error.name
  }
  return 'UnknownError'
}
