import { describe, expect, it } from 'vitest'

import type { DomainResult } from '@/domain/game/domain-result.ts'
import { playerId, roleId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'

import {
  addPlayer,
  createInitialGameSetupDraft,
  decrementRoleCount,
  getParticipatingPlayerCount,
  getRoleCount,
  getSelectedRoleCount,
  incrementRoleCount,
  removePlayer,
  renamePlayer,
  setRoleCount,
  togglePlayerParticipation,
  type GameSetupDraft,
} from './game-setup-draft.ts'

describe('game setup draft', () => {
  it('creates an empty roster, zero role counts, and explicit disabled settings', () => {
    const draft = createInitialGameSetupDraft()

    expect(draft.roster).toEqual([])
    expect(draft.roleCounts).toHaveLength(13)
    expect(draft.roleCounts.every((roleCount) => roleCount.count === 0)).toBe(true)
    expect(draft.settings).toEqual({
      godfatherAndSerialCanKillEachOther: false,
      godfatherAppearsSuspiciousToSheriff: true,
      doctorCanSelfProtect: false,
      doctorCannotRepeatPreviousTarget: false,
      revealRoleOnDeath: false,
      allowFirstNightKills: false,
    })
    expect(draft.nextPlayerNumber).toBe(1)
  })

  it('adds trimmed names, permits duplicate display names, and keeps stable player IDs', () => {
    const initial = createInitialGameSetupDraft()
    const withFirstAlex = expectSuccess(addPlayer(initial, '  Alex  '))
    const withSecondAlex = expectSuccess(addPlayer(withFirstAlex, 'Alex'))
    const renamed = expectSuccess(
      renamePlayer(withSecondAlex, withFirstAlex.roster[0]?.id ?? missingPlayerId(), '  Alexis '),
    )
    const removed = expectSuccess(
      removePlayer(renamed, withSecondAlex.roster[1]?.id ?? missingPlayerId()),
    )
    const withThirdPlayer = expectSuccess(addPlayer(removed, 'Jordan'))

    expect(withFirstAlex.roster).toEqual([{ id: 'player-1', name: 'Alex', playing: true }])
    expect(withSecondAlex.roster.map((player) => player.id)).toEqual(['player-1', 'player-2'])
    expect(renamed.roster[0]).toEqual({ id: 'player-1', name: 'Alexis', playing: true })
    expect(withThirdPlayer.roster.map((player) => player.id)).toEqual(['player-1', 'player-3'])
  })

  it('rejects blank additions and renames without changing the draft', () => {
    const initial = createInitialGameSetupDraft()
    const addResult = addPlayer(initial, '   ')

    expect(addResult).toEqual({
      ok: false,
      error: { type: 'EMPTY_PLAYER_NAME', operation: 'add' },
    })
    expect(initial.roster).toEqual([])

    const withPlayer = expectSuccess(addPlayer(initial, 'Alice'))
    const renameResult = renamePlayer(
      withPlayer,
      withPlayer.roster[0]?.id ?? missingPlayerId(),
      '\t',
    )

    expect(renameResult).toEqual({
      ok: false,
      error: { type: 'EMPTY_PLAYER_NAME', operation: 'rename', playerId: 'player-1' },
    })
    expect(withPlayer.roster[0]?.name).toBe('Alice')
  })

  it('toggles participation without removing the player from the roster', () => {
    const withPlayer = expectSuccess(addPlayer(createInitialGameSetupDraft(), 'Alice'))
    const playerId = withPlayer.roster[0]?.id ?? missingPlayerId()
    const toggledOff = expectSuccess(togglePlayerParticipation(withPlayer, playerId))
    const toggledOn = expectSuccess(togglePlayerParticipation(toggledOff, playerId))

    expect(toggledOff.roster).toEqual([{ id: playerId, name: 'Alice', playing: false }])
    expect(getParticipatingPlayerCount(toggledOff)).toBe(0)
    expect(toggledOn.roster).toEqual([{ id: playerId, name: 'Alice', playing: true }])
  })

  it('removes only the requested roster player', () => {
    const withAlice = expectSuccess(addPlayer(createInitialGameSetupDraft(), 'Alice'))
    const withBob = expectSuccess(addPlayer(withAlice, 'Bob'))
    const aliceId = withBob.roster[0]?.id ?? missingPlayerId()
    const withoutAlice = expectSuccess(removePlayer(withBob, aliceId))

    expect(withoutAlice.roster).toEqual([{ id: 'player-2', name: 'Bob', playing: true }])
  })

  it('returns consistent structured errors for unknown roster identities', () => {
    const initial = createInitialGameSetupDraft()
    const unknownPlayerId = playerId('missing-player')

    expect(renamePlayer(initial, unknownPlayerId, 'Alice')).toEqual({
      ok: false,
      error: { type: 'PLAYER_NOT_FOUND', playerId: unknownPlayerId },
    })
    expect(removePlayer(initial, unknownPlayerId)).toEqual({
      ok: false,
      error: { type: 'PLAYER_NOT_FOUND', playerId: unknownPlayerId },
    })
    expect(togglePlayerParticipation(initial, unknownPlayerId)).toEqual({
      ok: false,
      error: { type: 'PLAYER_NOT_FOUND', playerId: unknownPlayerId },
    })
  })

  it('increments and decrements role counts while rejecting values below zero', () => {
    const initial = createInitialGameSetupDraft()
    const incremented = expectSuccess(incrementRoleCount(initial, ROLE_IDS.godfather))
    const decremented = expectSuccess(decrementRoleCount(incremented, ROLE_IDS.godfather))
    const belowZero = decrementRoleCount(decremented, ROLE_IDS.godfather)

    expect(getRoleCount(incremented, ROLE_IDS.godfather)).toBe(1)
    expect(getRoleCount(decremented, ROLE_IDS.godfather)).toBe(0)
    expect(belowZero).toEqual({
      ok: false,
      error: { type: 'INVALID_ROLE_COUNT', roleId: ROLE_IDS.godfather, count: -1 },
    })
  })

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects the invalid role count %s', (count) => {
    const initial = createInitialGameSetupDraft()
    const result = setRoleCount(initial, ROLE_IDS.citizen, count)

    expect(result).toEqual({
      ok: false,
      error: { type: 'INVALID_ROLE_COUNT', roleId: ROLE_IDS.citizen, count },
    })
    expect(getRoleCount(initial, ROLE_IDS.citizen)).toBe(0)
  })

  it('rejects unknown role IDs without changing any role count', () => {
    const initial = createInitialGameSetupDraft()
    const unknownRoleId = roleId('unknown-role')
    const result = setRoleCount(initial, unknownRoleId, 1)

    expect(result).toEqual({
      ok: false,
      error: { type: 'ROLE_NOT_FOUND', roleId: unknownRoleId },
    })
    expect(getRoleCount(initial, ROLE_IDS.citizen)).toBe(0)
  })

  it('repairs an inconsistent imported sequence before generating a player ID', () => {
    const initial = createInitialGameSetupDraft()
    const importedDraft: GameSetupDraft = {
      ...initial,
      roster: [
        { id: playerId('player-1'), name: 'Alice', playing: true },
        { id: playerId('player-4'), name: 'Bob', playing: true },
      ],
      nextPlayerNumber: 1,
    }
    const repaired = expectSuccess(addPlayer(importedDraft, 'Casey'))
    const withAnotherPlayer = expectSuccess(addPlayer(repaired, 'Devon'))

    expect(repaired.roster.map((player) => player.id)).toEqual(['player-1', 'player-4', 'player-5'])
    expect(repaired.nextPlayerNumber).toBe(6)
    expect(withAnotherPlayer.roster.at(-1)?.id).toBe('player-6')
  })

  it('repairs a non-finite imported sequence without colliding with the roster', () => {
    const initial = createInitialGameSetupDraft()
    const importedDraft: GameSetupDraft = {
      ...initial,
      roster: [{ id: playerId('player-2'), name: 'Alice', playing: true }],
      nextPlayerNumber: Number.NaN,
    }
    const repaired = expectSuccess(addPlayer(importedDraft, 'Bob'))

    expect(repaired.roster.map((player) => player.id)).toEqual(['player-2', 'player-3'])
    expect(repaired.nextPlayerNumber).toBe(4)
  })

  it('calculates participating and selected totals instead of storing them', () => {
    const withAlice = expectSuccess(addPlayer(createInitialGameSetupDraft(), 'Alice'))
    const withBob = expectSuccess(addPlayer(withAlice, 'Bob'))
    const bobId = withBob.roster[1]?.id ?? missingPlayerId()
    const withBobOff = expectSuccess(togglePlayerParticipation(withBob, bobId))
    const withGodfathers = expectSuccess(setRoleCount(withBobOff, ROLE_IDS.godfather, 2))
    const withCitizens = expectSuccess(setRoleCount(withGodfathers, ROLE_IDS.citizen, 3))

    expect(getParticipatingPlayerCount(withCitizens)).toBe(1)
    expect(getSelectedRoleCount(withCitizens)).toBe(5)
  })

  it('returns new draft structures without mutating earlier values', () => {
    const initial = createInitialGameSetupDraft()
    const initialSnapshot = JSON.stringify(initial)
    const withPlayer = expectSuccess(addPlayer(initial, 'Alice'))
    const withRole = expectSuccess(setRoleCount(withPlayer, ROLE_IDS.godfather, 1))

    expect(JSON.stringify(initial)).toBe(initialSnapshot)
    expect(withPlayer).not.toBe(initial)
    expect(withPlayer.roster).not.toBe(initial.roster)
    expect(withRole).not.toBe(withPlayer)
    expect(withRole.roleCounts).not.toBe(withPlayer.roleCounts)
    expect(getRoleCount(withPlayer, ROLE_IDS.godfather)).toBe(0)
  })
})

function expectSuccess<Value, Failure>(result: DomainResult<Value, Failure>): Value {
  expect(result.ok).toBe(true)

  if (!result.ok) {
    throw new Error('Expected the setup operation to succeed.')
  }

  return result.value
}

function missingPlayerId(): never {
  throw new Error('Expected the test player to exist.')
}
