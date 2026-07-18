import { describe, expect, it } from 'vitest'

import type { DomainResult } from '@/domain/game/domain-result.ts'
import { playerId, roleId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'

import {
  addPlayer,
  createInitialGameSetupDraft,
  setGameSetting,
  setRoleCount,
  togglePlayerParticipation,
  type GameSetupDraft,
} from './game-setup-draft.ts'
import {
  inspectGameSetupDraft,
  validateGameSetupDraft,
  type GameSetupDraftCandidate,
} from './game-setup-validation.ts'

describe('game setup validation', () => {
  it('reports no participants and no Mafia for the initial draft', () => {
    const validation = inspectGameSetupDraft(createInitialGameSetupDraft())

    expect(validation.isValid).toBe(false)
    expect(validation.participatingPlayerCount).toBe(0)
    expect(validation.selectedRoleCount).toBe(0)
    expect(validation.errors).toEqual([
      { type: 'NO_PARTICIPATING_PLAYERS' },
      { type: 'NO_MAFIA_ROLE' },
    ])
  })

  it('reports the exact count mismatch', () => {
    const withAlice = expectSuccess(addPlayer(createInitialGameSetupDraft(), 'Alice'))
    const withBob = expectSuccess(addPlayer(withAlice, 'Bob'))
    const draft = expectSuccess(setRoleCount(withBob, ROLE_IDS.godfather, 1))
    const validation = inspectGameSetupDraft(draft)

    expect(validation.roleCountDifference).toBe(-1)
    expect(validation.errors).toContainEqual({
      type: 'ROLE_COUNT_MISMATCH',
      participatingCount: 2,
      selectedRoleCount: 1,
    })
  })

  it('rejects a matching composition with no Mafia role', () => {
    const withAlice = expectSuccess(addPlayer(createInitialGameSetupDraft(), 'Alice'))
    const draft = expectSuccess(setRoleCount(withAlice, ROLE_IDS.citizen, 1))
    const validation = inspectGameSetupDraft(draft)

    expect(validation.errors).toContainEqual({ type: 'NO_MAFIA_ROLE' })
    expect(validation.errors).not.toContainEqual(
      expect.objectContaining({
        type: 'ROLE_COUNT_MISMATCH',
      }),
    )
  })

  it.each([
    ['one Executioner', 1],
    ['multiple Executioners', 2],
  ])('rejects %s when no participating Town role is selected', (_label, executionerCount) => {
    let draft = createInitialGameSetupDraft()
    for (let index = 0; index < executionerCount + 1; index += 1) {
      draft = expectSuccess(addPlayer(draft, `Player ${String(index + 1)}`))
    }
    draft = expectSuccess(setRoleCount(draft, ROLE_IDS.godfather, 1))
    draft = expectSuccess(setRoleCount(draft, ROLE_IDS.executioner, executionerCount))

    expect(inspectGameSetupDraft(draft).errors).toContainEqual({
      type: 'EXECUTIONER_REQUIRES_TOWN_TARGET',
    })
  })

  it('accepts multiple Executioners sharing one selected Town candidate', () => {
    let draft = createInitialGameSetupDraft()
    for (const name of ['Alex', 'Blair', 'Casey', 'Dana']) {
      draft = expectSuccess(addPlayer(draft, name))
    }
    draft = expectSuccess(setRoleCount(draft, ROLE_IDS.godfather, 1))
    draft = expectSuccess(setRoleCount(draft, ROLE_IDS.executioner, 2))
    draft = expectSuccess(setRoleCount(draft, ROLE_IDS.citizen, 1))

    const result = validateGameSetupDraft(draft)
    expect(result.ok).toBe(true)
  })

  it('does not treat a non-playing Town roster member as a selected target candidate', () => {
    let draft = createInitialGameSetupDraft()
    for (const name of ['Mafia', 'Executioner', 'Watching Town']) {
      draft = expectSuccess(addPlayer(draft, name))
    }
    const nonPlayingTownId = draft.roster[2]?.id ?? missingPlayerId()
    draft = expectSuccess(togglePlayerParticipation(draft, nonPlayingTownId))
    draft = expectSuccess(setRoleCount(draft, ROLE_IDS.godfather, 1))
    draft = expectSuccess(setRoleCount(draft, ROLE_IDS.executioner, 1))

    expect(inspectGameSetupDraft(draft).errors).toContainEqual({
      type: 'EXECUTIONER_REQUIRES_TOWN_TARGET',
    })
  })

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('returns a structured error for the invalid draft count %s', (count) => {
    const initial = createInitialGameSetupDraft()
    const invalidDraft: GameSetupDraft = {
      ...initial,
      roleCounts: initial.roleCounts.map((roleCount) =>
        roleCount.roleId === ROLE_IDS.godfather ? { ...roleCount, count } : roleCount,
      ),
    }
    const validation = inspectGameSetupDraft(invalidDraft)
    const result = validateGameSetupDraft(invalidDraft)

    expect(validation.selectedRoleCount).toBe(0)
    expect(validation.roleCountDifference).toBe(0)
    expect(Number.isFinite(validation.selectedRoleCount)).toBe(true)
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected the invalid role count to fail validation.')
    }

    expect(result.error).toContainEqual({
      type: 'INVALID_ROLE_COUNT',
      roleId: ROLE_IDS.godfather,
      count,
    })
  })

  it('reports unknown, duplicate, and missing role entries in deterministic order', () => {
    const initial = createInitialGameSetupDraft()
    const unknownRoleId = roleId('unknown-role')
    const malformedDraft: GameSetupDraft = {
      ...initial,
      roleCounts: [
        ...initial.roleCounts.filter((entry) => entry.roleId !== ROLE_IDS.citizen),
        { roleId: ROLE_IDS.godfather, count: 0 },
        { roleId: unknownRoleId, count: 1 },
      ],
    }
    const validation = inspectGameSetupDraft(malformedDraft)

    expect(validation.errors).toEqual([
      { type: 'DUPLICATE_ROLE_COUNT', roleId: ROLE_IDS.godfather },
      { type: 'UNKNOWN_ROLE_COUNT', roleId: unknownRoleId },
      { type: 'MISSING_ROLE_COUNT', roleId: ROLE_IDS.citizen },
      { type: 'NO_PARTICIPATING_PLAYERS' },
      { type: 'ROLE_COUNT_MISMATCH', participatingCount: 0, selectedRoleCount: 1 },
      { type: 'NO_MAFIA_ROLE' },
    ])
  })

  it('rejects an empty stable player ID', () => {
    const withMafia = expectSuccess(
      setRoleCount(createInitialGameSetupDraft(), ROLE_IDS.godfather, 1),
    )
    const invalidDraft: GameSetupDraft = {
      ...withMafia,
      roster: [{ id: playerId('   '), name: 'Alice', playing: true }],
    }
    const validation = inspectGameSetupDraft(invalidDraft)

    expect(validation.errors).toEqual([{ type: 'INVALID_PLAYER_ID', playerId: '   ' }])
  })

  it('rejects a manually malformed setting instead of treating a missing value as false', () => {
    const initial = createInitialGameSetupDraft()
    const malformedDraft: GameSetupDraftCandidate = {
      ...initial,
      settings: {
        godfatherAndSerialCanKillEachOther: false,
        doctorCanSelfProtect: false,
        doctorCannotRepeatPreviousTarget: false,
        revealRoleOnDeath: false,
        allowFirstNightKills: false,
      },
    }

    expect(inspectGameSetupDraft(malformedDraft).errors).toContainEqual({
      type: 'INVALID_GAME_SETTING',
      setting: 'godfatherAppearsSuspiciousToSheriff',
      value: undefined,
    })
    const result = validateGameSetupDraft(malformedDraft)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected malformed settings to fail validation.')
    expect(result.error).toContainEqual({
      type: 'INVALID_GAME_SETTING',
      setting: 'godfatherAppearsSuspiciousToSheriff',
      value: undefined,
    })
  })

  it('creates an immutable validated setup with participating players only', () => {
    const withAlice = expectSuccess(addPlayer(createInitialGameSetupDraft(), 'Alice'))
    const withBob = expectSuccess(addPlayer(withAlice, 'Bob'))
    const bobId = withBob.roster[1]?.id ?? missingPlayerId()
    const withBobOff = expectSuccess(togglePlayerParticipation(withBob, bobId))
    const withGodfather = expectSuccess(setRoleCount(withBobOff, ROLE_IDS.godfather, 1))
    const configured = setGameSetting(withGodfather, 'revealRoleOnDeath', true)
    const result = validateGameSetupDraft(configured)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected the setup to be valid.')
    }

    expect(result.value.participatingPlayers).toEqual([
      { id: 'player-1', name: 'Alice', playing: true },
    ])
    expect(result.value.participatingPlayers).not.toContainEqual(
      expect.objectContaining({ name: 'Bob' }),
    )
    expect(result.value.settings.revealRoleOnDeath).toBe(true)
    expect(result.value).not.toHaveProperty('phase')
    expect(result.value.participatingPlayers[0]).not.toHaveProperty('role')
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.participatingPlayers)).toBe(true)
    expect(Object.isFrozen(result.value.participatingPlayers[0])).toBe(true)
    expect(Object.isFrozen(result.value.roleCounts)).toBe(true)
    expect(Object.isFrozen(result.value.settings)).toBe(true)
  })
})

function expectSuccess<Value, Failure>(result: DomainResult<Value, Failure>): Value {
  if (!result.ok) {
    throw new Error('Expected the setup operation to succeed.')
  }

  return result.value
}

function missingPlayerId(): never {
  throw new Error('Expected the test player to exist.')
}
