import type {
  NextGameSetupTemplate,
  NextGameSetupTemplateRepository,
  NextGameSetupTemplateRepositoryError,
  NextGameSetupTemplateRepositoryLoadResult,
  NextGameSetupTemplateRepositoryWriteResult,
} from '@/application/game-setup/next-game-setup-template.ts'

import type { StorageLike } from './browser-game-session-store.ts'

export const NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY = 'mafia-host:next-game-setup-template:v1'
export const LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY = 'mafia-host:remembered-player-names:v1'

export class BrowserNextGameSetupTemplateRepository implements NextGameSetupTemplateRepository {
  readonly #storage: StorageLike | null

  constructor(storage: StorageLike | null) {
    this.#storage = storage
  }

  load(): NextGameSetupTemplateRepositoryLoadResult {
    if (this.#storage === null) {
      return storageFailure('NEXT_GAME_SETUP_TEMPLATE_LOAD_FAILURE', 'StorageUnavailable')
    }
    try {
      const templateText = this.#storage.getItem(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY)
      if (templateText !== null) {
        return {
          ok: true,
          value: {
            source: 'template',
            payload: parseUntrustedJson(templateText),
          },
        }
      }

      const legacyNamesText = this.#storage.getItem(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY)
      return legacyNamesText === null
        ? { ok: true, value: null }
        : {
            ok: true,
            value: {
              source: 'legacy-player-names',
              payload: parseUntrustedJson(legacyNamesText),
            },
          }
    } catch (error: unknown) {
      return storageFailure('NEXT_GAME_SETUP_TEMPLATE_LOAD_FAILURE', getErrorName(error))
    }
  }

  save(template: NextGameSetupTemplate): NextGameSetupTemplateRepositoryWriteResult {
    if (this.#storage === null) {
      return storageFailure('NEXT_GAME_SETUP_TEMPLATE_SAVE_FAILURE', 'StorageUnavailable')
    }
    try {
      this.#storage.setItem(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY, JSON.stringify(template))
    } catch (error: unknown) {
      return storageFailure('NEXT_GAME_SETUP_TEMPLATE_SAVE_FAILURE', getErrorName(error))
    }

    try {
      this.#storage.removeItem(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY)
      return { ok: true }
    } catch (error: unknown) {
      return storageFailure('NEXT_GAME_SETUP_TEMPLATE_MIGRATION_FAILURE', getErrorName(error))
    }
  }

  clear(): NextGameSetupTemplateRepositoryWriteResult {
    if (this.#storage === null) {
      return storageFailure('NEXT_GAME_SETUP_TEMPLATE_CLEAR_FAILURE', 'StorageUnavailable')
    }
    try {
      this.#storage.removeItem(LEGACY_REMEMBERED_PLAYER_NAMES_STORAGE_KEY)
      this.#storage.removeItem(NEXT_GAME_SETUP_TEMPLATE_STORAGE_KEY)
      return { ok: true }
    } catch (error: unknown) {
      return storageFailure('NEXT_GAME_SETUP_TEMPLATE_CLEAR_FAILURE', getErrorName(error))
    }
  }
}

export function createBrowserNextGameSetupTemplateRepository(): BrowserNextGameSetupTemplateRepository {
  try {
    return new BrowserNextGameSetupTemplateRepository(window.localStorage)
  } catch {
    return new BrowserNextGameSetupTemplateRepository(null)
  }
}

function parseUntrustedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return Object.freeze({ malformedJson: true })
  }
}

function storageFailure(
  type: NextGameSetupTemplateRepositoryError['type'],
  errorName: string,
): Readonly<{
  ok: false
  error: NextGameSetupTemplateRepositoryError
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
