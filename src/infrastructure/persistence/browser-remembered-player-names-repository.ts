import type {
  RememberedPlayerNamesRepository,
  RememberedPlayerNamesRepositoryLoadResult,
  RememberedPlayerNamesRepositoryWriteResult,
} from '@/application/game-setup/index.ts'

import type { StorageLike } from './browser-game-session-store.ts'

export const REMEMBERED_PLAYER_NAMES_STORAGE_KEY = 'mafia-host:remembered-player-names:v1'

export class BrowserRememberedPlayerNamesRepository implements RememberedPlayerNamesRepository {
  readonly #storage: StorageLike | null

  constructor(storage: StorageLike | null) {
    this.#storage = storage
  }

  load(): RememberedPlayerNamesRepositoryLoadResult {
    if (this.#storage === null) {
      return storageFailure('REMEMBERED_PLAYER_NAMES_LOAD_FAILURE', 'StorageUnavailable')
    }
    try {
      const value = this.#storage.getItem(REMEMBERED_PLAYER_NAMES_STORAGE_KEY)
      if (value === null) {
        return { ok: true, value: null }
      }
      try {
        return { ok: true, value: JSON.parse(value) as unknown }
      } catch {
        return { ok: true, value: Object.freeze({ malformedJson: true }) }
      }
    } catch (error: unknown) {
      return storageFailure('REMEMBERED_PLAYER_NAMES_LOAD_FAILURE', getErrorName(error))
    }
  }

  save(names: readonly string[]): RememberedPlayerNamesRepositoryWriteResult {
    if (this.#storage === null) {
      return storageFailure('REMEMBERED_PLAYER_NAMES_SAVE_FAILURE', 'StorageUnavailable')
    }
    try {
      this.#storage.setItem(REMEMBERED_PLAYER_NAMES_STORAGE_KEY, JSON.stringify(names))
      return { ok: true }
    } catch (error: unknown) {
      return storageFailure('REMEMBERED_PLAYER_NAMES_SAVE_FAILURE', getErrorName(error))
    }
  }

  clear(): RememberedPlayerNamesRepositoryWriteResult {
    if (this.#storage === null) {
      return storageFailure('REMEMBERED_PLAYER_NAMES_CLEAR_FAILURE', 'StorageUnavailable')
    }
    try {
      this.#storage.removeItem(REMEMBERED_PLAYER_NAMES_STORAGE_KEY)
      return { ok: true }
    } catch (error: unknown) {
      return storageFailure('REMEMBERED_PLAYER_NAMES_CLEAR_FAILURE', getErrorName(error))
    }
  }
}

export function createBrowserRememberedPlayerNamesRepository(): BrowserRememberedPlayerNamesRepository {
  try {
    return new BrowserRememberedPlayerNamesRepository(window.localStorage)
  } catch {
    return new BrowserRememberedPlayerNamesRepository(null)
  }
}

function storageFailure(
  type:
    | 'REMEMBERED_PLAYER_NAMES_LOAD_FAILURE'
    | 'REMEMBERED_PLAYER_NAMES_SAVE_FAILURE'
    | 'REMEMBERED_PLAYER_NAMES_CLEAR_FAILURE',
  errorName: string,
): Readonly<{
  ok: false
  error: Readonly<{ type: typeof type; errorName: string }>
}> {
  return { ok: false, error: { type, errorName } }
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
