export type RememberedPlayerNamesRepositoryError = Readonly<{
  type:
    | 'REMEMBERED_PLAYER_NAMES_LOAD_FAILURE'
    | 'REMEMBERED_PLAYER_NAMES_SAVE_FAILURE'
    | 'REMEMBERED_PLAYER_NAMES_CLEAR_FAILURE'
  errorName: string
}>

export type RememberedPlayerNamesRepositoryLoadResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; error: RememberedPlayerNamesRepositoryError }>

export type RememberedPlayerNamesRepositoryWriteResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; error: RememberedPlayerNamesRepositoryError }>

export interface RememberedPlayerNamesRepository {
  load(): RememberedPlayerNamesRepositoryLoadResult
  save(names: readonly string[]): RememberedPlayerNamesRepositoryWriteResult
  clear(): RememberedPlayerNamesRepositoryWriteResult
}

export type MalformedRememberedPlayerNamesError = Readonly<{
  type: 'MALFORMED_REMEMBERED_PLAYER_NAMES'
}>

export type LoadedRememberedPlayerNames = Readonly<{
  names: readonly string[]
  error: RememberedPlayerNamesRepositoryError | MalformedRememberedPlayerNamesError | null
}>

export function loadRememberedPlayerNames(
  repository: RememberedPlayerNamesRepository,
): LoadedRememberedPlayerNames {
  const result = repository.load()
  if (!result.ok) {
    return Object.freeze({ names: Object.freeze([]), error: result.error })
  }
  if (result.value === null) {
    return Object.freeze({ names: Object.freeze([]), error: null })
  }
  const names = canonicalizeRememberedPlayerNames(result.value)
  return names === null
    ? Object.freeze({
        names: Object.freeze([]),
        error: Object.freeze({ type: 'MALFORMED_REMEMBERED_PLAYER_NAMES' as const }),
      })
    : Object.freeze({ names, error: null })
}

export function saveRememberedPlayerNames(
  repository: RememberedPlayerNamesRepository,
  names: readonly string[],
):
  | RememberedPlayerNamesRepositoryWriteResult
  | Readonly<{
      ok: false
      error: MalformedRememberedPlayerNamesError
    }> {
  const canonicalNames = canonicalizeRememberedPlayerNames(names)
  return canonicalNames === null
    ? { ok: false, error: { type: 'MALFORMED_REMEMBERED_PLAYER_NAMES' } }
    : repository.save(canonicalNames)
}

export function clearRememberedPlayerNames(
  repository: RememberedPlayerNamesRepository,
): RememberedPlayerNamesRepositoryWriteResult {
  return repository.clear()
}

function canonicalizeRememberedPlayerNames(candidate: unknown): readonly string[] | null {
  if (!Array.isArray(candidate)) {
    return null
  }
  const names: string[] = []
  for (const value of candidate) {
    if (typeof value !== 'string') {
      return null
    }
    const name = value.trim()
    if (name.length === 0) {
      return null
    }
    names.push(name)
  }
  return Object.freeze(names)
}
