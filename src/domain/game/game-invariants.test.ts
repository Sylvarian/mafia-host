import { describe, expect, it } from 'vitest'

import { gameId, playerId, roleId, roleInstanceId } from '../identifiers.ts'
import type { Player } from '../players/player.ts'
import type { RoleDefinition } from '../roles/role-definition.ts'
import type { RoleInstance } from '../roles/role-instance.ts'
import type { GameSettings } from './game-settings.ts'
import { createGame, validateGameState } from './game-invariants.ts'
import type { CreateGameInput, GamePlayerCandidate } from './game-state.ts'

const aliceId = playerId('alice')
const bobId = playerId('bob')
const charlieId = playerId('charlie')
const unknownPlayerId = playerId('unknown-player')
const citizenId = roleId('citizen')
const doctorId = roleId('doctor')
const unknownRoleId = roleId('unknown-role')

const citizenDefinition: RoleDefinition = {
  id: citizenId,
  name: 'Citizen',
  faction: 'town',
}
const doctorDefinition: RoleDefinition = {
  id: doctorId,
  name: 'Doctor',
  faction: 'town',
}
const aliceRole: RoleInstance = {
  instanceId: roleInstanceId('citizen-1'),
  roleId: citizenId,
  ordinal: null,
}
const bobRole: RoleInstance = {
  instanceId: roleInstanceId('doctor-1'),
  roleId: doctorId,
  ordinal: null,
}
const aliceGamePlayer: GamePlayerCandidate = {
  playerId: aliceId,
  role: aliceRole,
  alive: true,
  publiclyRevealedRoleId: null,
  mayorRevealed: false,
  executionerTargetId: null,
  personalWin: null,
}
const bobGamePlayer: GamePlayerCandidate = {
  playerId: bobId,
  role: bobRole,
  alive: true,
  publiclyRevealedRoleId: null,
  mayorRevealed: false,
  executionerTargetId: null,
  personalWin: null,
}
const roster: readonly Player[] = [
  { id: aliceId, name: 'Alice', playing: true },
  { id: bobId, name: 'Bob', playing: true },
  { id: charlieId, name: 'Charlie', playing: false },
]
const settings: GameSettings = {
  godfatherAndSerialCanKillEachOther: false,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: true,
  revealRoleOnDeath: true,
  allowFirstNightKills: false,
}

function validInput(): CreateGameInput {
  return {
    id: gameId('game-1'),
    roster,
    players: [aliceGamePlayer, bobGamePlayer],
    roleDefinitions: [citizenDefinition, doctorDefinition],
    settings,
  }
}

describe('game invariants', () => {
  it('accepts a valid minimal game and excludes non-participating roster players', () => {
    const result = createGame(validInput())

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected the game to be valid.')
    }

    expect(result.value).toMatchObject({
      phase: 'role-distribution',
      nightNumber: 0,
      dayNumber: 0,
    })
    expect(result.value.players.map((player) => player.playerId)).toEqual([aliceId, bobId])
  })

  it('rejects an active game with no participating players', () => {
    const result = createGame({
      ...validInput(),
      roster: [],
      players: [],
      roleDefinitions: [],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'NO_PARTICIPATING_PLAYERS' },
    })
  })

  it('rejects duplicate roster player IDs from distinct roster objects', () => {
    const result = createGame({
      ...validInput(),
      roster: [
        { id: aliceId, name: 'Alice', playing: true },
        { id: aliceId, name: 'Alice renamed', playing: true },
      ],
      players: [aliceGamePlayer],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'DUPLICATE_ROSTER_PLAYER', playerId: aliceId },
    })
  })

  it('rejects duplicate participating player IDs', () => {
    const result = createGame({
      ...validInput(),
      roster: [{ id: aliceId, name: 'Alice', playing: true }],
      players: [aliceGamePlayer, { ...bobGamePlayer, playerId: aliceId }],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'DUPLICATE_PARTICIPATING_PLAYER', playerId: aliceId },
    })
  })

  it('rejects assigning one role instance to multiple players', () => {
    const result = createGame({
      ...validInput(),
      players: [
        aliceGamePlayer,
        { ...bobGamePlayer, role: { ...bobRole, instanceId: aliceRole.instanceId } },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'DUPLICATE_ROLE_ASSIGNMENT', roleInstanceId: aliceRole.instanceId },
    })
  })

  it('rejects a game player without exactly one role instance', () => {
    const result = createGame({
      ...validInput(),
      players: [aliceGamePlayer, { ...bobGamePlayer, role: null }],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'MISSING_ROLE_ASSIGNMENT', playerId: bobId },
    })
  })

  it('rejects game players who are not active roster participants', () => {
    const result = createGame({
      ...validInput(),
      roster: [
        { id: aliceId, name: 'Alice', playing: true },
        { id: bobId, name: 'Bob', playing: false },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'NON_PARTICIPATING_PLAYER', playerId: bobId },
    })
  })

  it('rejects a participating roster player omitted from active game state', () => {
    const result = createGame({
      ...validInput(),
      players: [aliceGamePlayer],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'MISSING_PARTICIPATING_PLAYER', playerId: bobId },
    })
  })

  it('rejects an active game player absent from the roster', () => {
    const result = createGame({
      ...validInput(),
      roster: [{ id: aliceId, name: 'Alice', playing: true }],
      players: [aliceGamePlayer, { ...bobGamePlayer, playerId: unknownPlayerId }],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'UNKNOWN_PLAYER_REFERENCE',
        playerId: unknownPlayerId,
        reference: 'game-player',
      },
    })
  })

  it('rejects unknown player references', () => {
    const result = createGame({
      ...validInput(),
      players: [{ ...aliceGamePlayer, executionerTargetId: unknownPlayerId }, bobGamePlayer],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'UNKNOWN_PLAYER_REFERENCE',
        playerId: unknownPlayerId,
        reference: 'executioner-target',
      },
    })
  })

  it('rejects role-instance references to unknown role definitions', () => {
    const result = createGame({
      ...validInput(),
      players: [aliceGamePlayer, { ...bobGamePlayer, role: { ...bobRole, roleId: unknownRoleId } }],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'UNKNOWN_ROLE_REFERENCE',
        playerId: bobId,
        roleId: unknownRoleId,
        reference: 'assigned-role',
      },
    })
  })

  it('rejects duplicate role definitions', () => {
    const result = createGame({
      ...validInput(),
      roleDefinitions: [
        citizenDefinition,
        doctorDefinition,
        { ...citizenDefinition, name: 'Duplicate Citizen' },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: { type: 'DUPLICATE_ROLE_DEFINITION', roleId: citizenId },
    })
  })

  it('rejects public role reveals that reference an unknown role definition', () => {
    const result = createGame({
      ...validInput(),
      players: [aliceGamePlayer, { ...bobGamePlayer, publiclyRevealedRoleId: unknownRoleId }],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'UNKNOWN_ROLE_REFERENCE',
        playerId: bobId,
        roleId: unknownRoleId,
        reference: 'public-role-reveal',
      },
    })
  })

  it.each([0, -1, 1.5])('rejects the invalid role ordinal %s', (ordinal) => {
    const result = createGame({
      ...validInput(),
      players: [aliceGamePlayer, { ...bobGamePlayer, role: { ...bobRole, ordinal } }],
    })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_STATE',
        reason: {
          type: 'INVALID_ROLE_ORDINAL',
          roleInstanceId: bobRole.instanceId,
          ordinal,
        },
      },
    })
  })

  it('rejects an invalid current phase in an untrusted state candidate', () => {
    const created = createGame(validInput())

    if (!created.ok) {
      throw new Error('Expected the test game to be valid.')
    }

    const result = validateGameState({ ...created.value, phase: 'not-a-game-phase' })

    expect(result).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_STATE',
        reason: { type: 'INVALID_PHASE', phase: 'not-a-game-phase' },
      },
    })
  })

  it('rejects invalid day and night counter values', () => {
    const created = createGame(validInput())

    if (!created.ok) {
      throw new Error('Expected the test game to be valid.')
    }

    expect(validateGameState({ ...created.value, nightNumber: -1 })).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_STATE',
        reason: { type: 'INVALID_COUNTER', counter: 'night', value: -1 },
      },
    })
    expect(validateGameState({ ...created.value, dayNumber: 1.5 })).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_STATE',
        reason: { type: 'INVALID_COUNTER', counter: 'day', value: 1.5 },
      },
    })
  })
})
