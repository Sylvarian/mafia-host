import type {
  ClearPersistedSessionResult,
  GameSessionStore,
  LoadPersistedSessionResult,
  PersistedSessionRestorer,
  SavePersistedSessionResult,
} from '@/application/session-persistence/game-session-store.ts'
import type { PersistedSessionEnvelopeV1 } from '@/application/session-persistence/persisted-session-v1.ts'

export const SESSION_STORAGE_KEY = 'mafia-host:active-session:v1'

export type StorageLike = Readonly<{
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}>

export class BrowserGameSessionStore implements GameSessionStore {
  readonly #storage: StorageLike | null
  readonly #restore: PersistedSessionRestorer

  constructor(storage: StorageLike | null, restore: PersistedSessionRestorer) {
    this.#storage = storage
    this.#restore = restore
  }

  load(): LoadPersistedSessionResult {
    if (this.#storage === null) {
      return {
        ok: false,
        error: { type: 'STORAGE_UNAVAILABLE', operation: 'load' },
      }
    }

    let storedText: string | null
    try {
      storedText = this.#storage.getItem(SESSION_STORAGE_KEY)
    } catch (error: unknown) {
      return {
        ok: false,
        error: { type: 'STORAGE_READ_FAILURE', errorName: getErrorName(error) },
      }
    }

    if (storedText === null) {
      return { ok: false, error: { type: 'NO_SAVED_SESSION' } }
    }

    let parsedValue: unknown
    try {
      parsedValue = JSON.parse(storedText) as unknown
    } catch {
      return { ok: false, error: { type: 'INVALID_JSON' } }
    }

    return this.#restore(parsedValue)
  }

  save(envelope: PersistedSessionEnvelopeV1): SavePersistedSessionResult {
    if (this.#storage === null) {
      return {
        ok: false,
        error: { type: 'STORAGE_UNAVAILABLE', operation: 'save' },
      }
    }

    const storedText = JSON.stringify(envelope)
    try {
      this.#storage.setItem(SESSION_STORAGE_KEY, storedText)
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
      return {
        ok: false,
        error: { type: 'STORAGE_UNAVAILABLE', operation: 'clear' },
      }
    }

    try {
      this.#storage.removeItem(SESSION_STORAGE_KEY)
      return { ok: true }
    } catch (error: unknown) {
      return {
        ok: false,
        error: { type: 'CLEAR_FAILURE', errorName: getErrorName(error) },
      }
    }
  }
}

export function createBrowserGameSessionStore(
  restore: PersistedSessionRestorer,
): BrowserGameSessionStore {
  try {
    return new BrowserGameSessionStore(window.localStorage, restore)
  } catch {
    return new BrowserGameSessionStore(null, restore)
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
