import { describe, expect, it, vi } from 'vitest'

import {
  clearRememberedPlayerNames,
  loadRememberedPlayerNames,
  saveRememberedPlayerNames,
  type RememberedPlayerNamesRepository,
} from './remembered-player-names.ts'

function repositoryWith(value: unknown): RememberedPlayerNamesRepository {
  return {
    load: () => ({ ok: true, value }),
    save: () => ({ ok: true }),
    clear: () => ({ ok: true }),
  }
}

describe('remembered player-name application boundary', () => {
  it('loads and canonicalizes only an array of nonblank display names', () => {
    expect(loadRememberedPlayerNames(repositoryWith([' Alex ', 'Alex', ' Taylor']))).toEqual({
      names: ['Alex', 'Alex', 'Taylor'],
      error: null,
    })
  })

  it.each([
    { names: ['Alex'], roles: ['Godfather'] },
    ['Alex', { name: 'Taylor' }],
    ['Alex', ''],
    'Alex',
    12,
  ])('fails malformed preference data safely to an empty list', (value) => {
    expect(loadRememberedPlayerNames(repositoryWith(value))).toEqual({
      names: [],
      error: { type: 'MALFORMED_REMEMBERED_PLAYER_NAMES' },
    })
  })

  it('reports load failures without breaking fresh setup', () => {
    const result = loadRememberedPlayerNames({
      load: () => ({
        ok: false,
        error: {
          type: 'REMEMBERED_PLAYER_NAMES_LOAD_FAILURE',
          errorName: 'SecurityError',
        },
      }),
      save: () => ({ ok: true }),
      clear: () => ({ ok: true }),
    })

    expect(result.names).toEqual([])
    expect(result.error).toEqual({
      type: 'REMEMBERED_PLAYER_NAMES_LOAD_FAILURE',
      errorName: 'SecurityError',
    })
  })

  it('saves canonical names only at an explicit use-case call and clears separately', () => {
    const save = vi.fn(() => ({ ok: true as const }))
    const clear = vi.fn(() => ({ ok: true as const }))
    const repository: RememberedPlayerNamesRepository = {
      load: () => ({ ok: true, value: null }),
      save,
      clear,
    }

    expect(saveRememberedPlayerNames(repository, [' Alex ', 'Taylor'])).toEqual({ ok: true })
    expect(save).toHaveBeenCalledWith(['Alex', 'Taylor'])
    expect(clearRememberedPlayerNames(repository)).toEqual({ ok: true })
    expect(clear).toHaveBeenCalledOnce()
  })

  it('does not pass malformed names to infrastructure', () => {
    const save = vi.fn(() => ({ ok: true as const }))
    const repository: RememberedPlayerNamesRepository = {
      load: () => ({ ok: true, value: null }),
      save,
      clear: () => ({ ok: true }),
    }

    expect(saveRememberedPlayerNames(repository, [''])).toEqual({
      ok: false,
      error: { type: 'MALFORMED_REMEMBERED_PLAYER_NAMES' },
    })
    expect(save).not.toHaveBeenCalled()
  })
})
