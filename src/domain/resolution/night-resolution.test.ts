import { describe, expect, it } from 'vitest'

import { gameId, playerId, roleId, roleInstanceId } from '../identifiers.ts'
import { INVESTIGATION_GROUP_IDS } from '../investigation/investigation-groups.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { resolveNight } from './night-resolution.ts'

describe('complete night-resolution pipeline scenarios', () => {
  it('frames a Doctor while that Doctor saves an attacked player', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.citizen },
        ],
        [4, 2, 4, 2, null],
      ),
    )

    expect(result.frames.map((frame) => frame.framedPlayerId)).toEqual(['player-3'])
    expect(result.protections.map((protection) => protection.protectedPlayerId)).toEqual([
      'player-5',
    ])
    expect(result.attackAttempts[0]?.outcome).toBe('protected')
    expect(result.provisionalDeaths).toEqual([])
    expect(result.sheriffResults[0]?.status).toBe('suspicious')
  })

  it('kills the attacked player when a Consort blocks the Doctor', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 2, 3, null],
      ),
    )

    expect(result.protections).toEqual([])
    expect(result.attackAttempts[0]?.outcome).toBe('lethal')
    expect(result.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual(['player-4'])
  })

  it('produces no Godfather attack when a Consort blocks the Godfather', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 0, null],
      ),
    )

    expect(result.blockedActors.map((record) => record.blockedPlayerId)).toEqual(['player-1'])
    expect(result.attackAttempts).toEqual([])
    expect(result.provisionalDeaths).toEqual([])
  })

  it('handles chained and mutual Consort immunity scenarios simultaneously', () => {
    const chained = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 2, 3, null],
      ),
    )
    expect(chained.roleBlockAttempts.map((attempt) => attempt.outcome)).toEqual([
      'target-immune',
      'blocked-target',
    ])
    expect(chained.blockedActors.map((record) => record.blockedPlayerId)).toEqual(['player-3'])

    const mutual = resolveFixture(
      createResolutionFixture([{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.consort }], [1, 0]),
    )
    expect(mutual.blockedActors).toEqual([])
    expect(mutual.finalVisits.map((visit) => visit.targetPlayerId)).toEqual([
      'player-2',
      'player-1',
    ])
  })

  it.each([
    [false, ['mutual-kill-disabled', 'mutual-kill-disabled'], []],
    [true, ['lethal', 'lethal'], ['player-1', 'player-2']],
  ] as const)(
    'resolves mutual Godfather and Serial Killer attacks with setting %s',
    (setting, outcomes, deaths) => {
      const result = resolveFixture(
        createResolutionFixture(
          [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
          [1, 0],
          { settings: { godfatherAndSerialCanKillEachOther: setting } },
        ),
      )

      expect(result.attackAttempts.map((attack) => attack.outcome)).toEqual(outcomes)
      expect(result.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual(deaths)
    },
  )

  it.each([
    [false, 'not-suspicious'],
    [true, 'suspicious'],
  ] as const)('checks an unframed Godfather under Sheriff setting %s', (setting, status) => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 0, null],
        { settings: { godfatherAppearsSuspiciousToSheriff: setting } },
      ),
    )

    expect(result.sheriffResults[0]?.status).toBe(status)
  })

  it('lets Consigliere and Investigator inspect framed and unframed players in one night', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.consigliere },
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 3, 4, 4, null],
      ),
    )

    expect(result.investigationResults.map((entry) => entry.group.id)).toEqual([
      INVESTIGATION_GROUP_IDS.groupD,
      INVESTIGATION_GROUP_IDS.groupA,
    ])
  })

  it('uses final visits for a Detective in a mixed-role blocked night', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [5, 5, 3, 5, 0, null],
      ),
    )

    expect(result.finalVisits.some((visit) => visit.actorRoleId === ROLE_IDS.doctor)).toBe(false)
    expect(result.detectiveResults[0]).toMatchObject({
      status: 'visited-player',
      targetPlayerId: 'player-1',
      visitedPlayerId: 'player-6',
    })
  })

  it('groups attacks by target while retaining multiple separate provisional deaths', () => {
    const sharedTarget = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 2, null],
      ),
    )
    expect(sharedTarget.provisionalDeaths).toHaveLength(1)
    expect(sharedTarget.provisionalDeaths[0]?.sources).toHaveLength(2)

    const separateTargets = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 3, null, null],
      ),
    )
    expect(separateTargets.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual([
      'player-3',
      'player-4',
    ])
  })

  it('lets a player provisionally killed during the night still perform their action', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )

    expect(result.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual(['player-2'])
    expect(result.protections.map((protection) => protection.protectedPlayerId)).toEqual([
      'player-3',
    ])
    expect(result.finalVisits).toContainEqual(
      expect.objectContaining({ actorPlayerId: 'player-2', targetPlayerId: 'player-3' }),
    )
  })

  it.each([
    ['Framer', ROLE_IDS.framer, 'frames'],
    ['Doctor', ROLE_IDS.doctor, 'protections'],
    ['Consort', ROLE_IDS.consort, 'blockedActors'],
    ['Sheriff', ROLE_IDS.sheriff, 'sheriffResults'],
    ['Investigator', ROLE_IDS.investigator, 'investigationResults'],
    ['Detective', ROLE_IDS.detective, 'detectiveResults'],
  ] as const)(
    'lets a provisionally killed %s produce its same-night effect or result',
    (_name, actingRoleId, resultCollection) => {
      const result = resolveFixture(
        createResolutionFixture(
          [{ roleId: ROLE_IDS.godfather }, { roleId: actingRoleId }, { roleId: ROLE_IDS.citizen }],
          [1, 2, null],
        ),
      )

      expect(result.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual(['player-2'])
      if (actingRoleId === ROLE_IDS.detective) {
        expect(result.finalVisits).not.toContainEqual(
          expect.objectContaining({ actorPlayerId: 'player-2' }),
        )
      } else {
        expect(result.finalVisits).toContainEqual(
          expect.objectContaining({ actorPlayerId: 'player-2', targetPlayerId: 'player-3' }),
        )
      }
      expect(result[resultCollection]).toHaveLength(1)
    },
  )

  it('is deterministic across caller action order and repeated calls', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.citizen },
      ],
      [4, 2, 4, 0, null],
    )
    const first = resolveNight(fixture)
    const second = resolveNight(fixture)
    const reordered = resolveNight({
      ...fixture,
      collectedActions: {
        ...fixture.collectedActions,
        actions: [...fixture.collectedActions.actions].reverse(),
      },
    })

    expect(first).toEqual(second)
    expect(reordered).toEqual(first)
  })

  it('canonicalises every aggregated source array after caller action reordering', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
      ],
      [8, 8, 8, 8, 8, 8, 0, 0, null],
    )
    const expected = resolveFixture(fixture)
    const reordered = resolveNight({
      ...fixture,
      collectedActions: {
        ...fixture.collectedActions,
        actions: [...fixture.collectedActions.actions].reverse(),
      },
    })

    expect(reordered).toEqual({ ok: true, value: expected })
    expect(expected.frames[0]?.sources.map((source) => source.framerPlayerId)).toEqual([
      'player-2',
      'player-3',
    ])
    expect(expected.blockedActors[0]?.sources.map((source) => source.consortPlayerId)).toEqual([
      'player-4',
      'player-5',
    ])
    expect(expected.protections[0]?.sources.map((source) => source.doctorPlayerId)).toEqual([
      'player-7',
      'player-8',
    ])
    expect(expected.provisionalDeaths[0]?.sources.map((source) => source.attackerPlayerId)).toEqual(
      ['player-1', 'player-6'],
    )
  })

  it('returns independently owned nested collections on repeated calls', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 3, 0, null],
    )
    const first = resolveFixture(fixture)
    const second = resolveFixture(fixture)

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.finalVisits).not.toBe(first.finalVisits)
    expect(second.frames).not.toBe(first.frames)
    expect(second.frames[0]?.sources).not.toBe(first.frames[0]?.sources)
    expect(second.protections[0]?.sources).not.toBe(first.protections[0]?.sources)
    expect(second.provisionalDeaths[0]?.sources).not.toBe(first.provisionalDeaths[0]?.sources)
  })
})

describe('night-resolution revalidation and scope boundary', () => {
  it('rejects invalid phase, cross-game input, and wrong-night input explicitly', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )

    expect(
      resolveNight({ ...fixture, game: { ...fixture.game, phase: 'night-resolution' } }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_NIGHT_RESOLUTION_PHASE',
        currentPhase: 'night-resolution',
      },
    })
    expect(
      resolveNight({
        ...fixture,
        collectedActions: { ...fixture.collectedActions, gameId: gameId('other-game') },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'NIGHT_RESOLUTION_GAME_ID_MISMATCH',
        expectedGameId: fixture.game.id,
        batchGameId: 'other-game',
      },
    })
    expect(
      resolveNight({
        ...fixture,
        collectedActions: { ...fixture.collectedActions, nightNumber: 99 },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'NIGHT_RESOLUTION_NIGHT_NUMBER_MISMATCH',
        expectedNightNumber: 2,
        batchNightNumber: 99,
      },
    })
  })

  it('preserves structured Phase 4 errors for malformed batches', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      [2, 2, null],
    )
    const godfatherAction = fixture.collectedActions.actions[0]
    const doctorAction = fixture.collectedActions.actions[1]
    if (godfatherAction === undefined || doctorAction === undefined) {
      throw new Error('Expected fixture actions.')
    }

    const malformedCases = [
      {
        actions: [godfatherAction],
        expectedType: 'MISSING_REQUIRED_ACTION',
      },
      {
        actions: [godfatherAction, godfatherAction, doctorAction],
        expectedType: 'DUPLICATE_ACTOR_ACTION',
      },
      {
        actions: [{ ...godfatherAction, actorPlayerId: playerId('unknown') }, doctorAction],
        expectedType: 'UNKNOWN_ACTOR',
      },
      {
        actions: [
          { ...godfatherAction, actorRoleInstanceId: roleInstanceId('unknown') },
          doctorAction,
        ],
        expectedType: 'UNKNOWN_ROLE_INSTANCE',
      },
      {
        actions: [
          { ...godfatherAction, actorRoleInstanceId: doctorAction.actorRoleInstanceId },
          doctorAction,
        ],
        expectedType: 'ROLE_INSTANCE_DOES_NOT_BELONG_TO_ACTOR',
      },
      {
        actions: [{ ...godfatherAction, actorRoleId: roleId('doctor') }, doctorAction],
        expectedType: 'ACTOR_ROLE_MISMATCH',
      },
      {
        actions: [{ ...godfatherAction, actionKind: 'protect' as const }, doctorAction],
        expectedType: 'WRONG_ACTION_KIND',
      },
      {
        actions: [{ ...godfatherAction, targetPlayerId: playerId('unknown-target') }, doctorAction],
        expectedType: 'UNKNOWN_TARGET',
      },
    ]

    for (const malformed of malformedCases) {
      expect(
        resolveNight({
          ...fixture,
          collectedActions: { ...fixture.collectedActions, actions: malformed.actions },
        }),
      ).toMatchObject({
        ok: false,
        error: {
          type: 'INVALID_COLLECTED_NIGHT_ACTIONS',
          error: { type: malformed.expectedType },
        },
      })
    }
  })

  it('rejects a target that is dead at the beginning of resolution', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const game = {
      ...fixture.game,
      players: fixture.game.players.map((player) =>
        player.playerId === playerId('player-2') ? { ...player, alive: false } : player,
      ),
    }

    expect(resolveNight({ ...fixture, game })).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_COLLECTED_NIGHT_ACTIONS',
        error: { type: 'DEAD_TARGET', targetPlayerId: 'player-2' },
      },
    })
  })

  it('rejects a non-boolean alive value before a malformed actor can act', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const actor = fixture.game.players[0]
    if (actor === undefined) {
      throw new Error('Expected a Godfather actor.')
    }

    const malformedActor = { ...actor }
    Object.defineProperty(malformedActor, 'alive', { value: 'false', enumerable: true })
    const game = {
      ...fixture.game,
      players: [malformedActor, ...fixture.game.players.slice(1)],
    }

    expect(resolveNight({ ...fixture, game })).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_STATE_FOR_NIGHT_RESOLUTION',
        error: {
          type: 'INVALID_GAME_STATE',
          reason: {
            type: 'INVALID_PLAYER_ALIVE_STATE',
            playerId: 'player-1',
            value: 'false',
          },
        },
      },
    })
  })

  it('rejects fabricated disabled-first-night attacks as unexpected', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
      [null, null, null],
      { nightNumber: 1, settings: { allowFirstNightKills: false } },
    )
    const godfather = fixture.game.players[0]
    const target = fixture.game.players[2]
    if (godfather === undefined || target === undefined) {
      throw new Error('Expected first-night fixture players.')
    }

    expect(
      resolveNight({
        ...fixture,
        collectedActions: {
          ...fixture.collectedActions,
          actions: [
            {
              actorPlayerId: godfather.playerId,
              actorRoleId: godfather.role.roleId,
              actorRoleInstanceId: godfather.role.instanceId,
              actionKind: 'attack',
              targetPlayerId: target.playerId,
            },
          ],
        },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_COLLECTED_NIGHT_ACTIONS',
        error: { type: 'UNEXPECTED_ACTION' },
      },
    })
  })

  it('strips malicious extra action fields during canonicalisation', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const action = fixture.collectedActions.actions[0]
    if (action === undefined) {
      throw new Error('Expected a Godfather action.')
    }

    const maliciousAction = { ...action }
    Object.defineProperties(maliciousAction, {
      outcome: { value: 'protected', enumerable: true },
      status: { value: 'suspicious', enumerable: true },
      actualRoleId: { value: ROLE_IDS.godfather, enumerable: true },
    })
    const result = resolveNight({
      ...fixture,
      collectedActions: {
        ...fixture.collectedActions,
        actions: [maliciousAction],
      },
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        attackAttempts: [{ outcome: 'lethal' }],
      },
    })
    if (!result.ok) {
      throw new Error('Expected canonicalisation success.')
    }
    expect(result.value.finalVisits[0]).not.toHaveProperty('status')
    expect(result.value.attackAttempts[0]).not.toHaveProperty('actualRoleId')
  })

  it('rejects game role metadata that contradicts the registry', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const game = {
      ...fixture.game,
      roleDefinitions: fixture.game.roleDefinitions.map((definition) =>
        definition.id === ROLE_IDS.godfather
          ? { ...definition, name: 'Contradictory Godfather' }
          : definition,
      ),
    }

    expect(resolveNight({ ...fixture, game })).toEqual({
      ok: false,
      error: {
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: ROLE_IDS.godfather,
        reason: 'game-definition-mismatch',
      },
    })
  })

  it('rejects a game role definition that has no registry entry', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const futureRoleId = roleId('future-role')
    const game = {
      ...fixture.game,
      roleDefinitions: [
        ...fixture.game.roleDefinitions,
        { id: futureRoleId, name: 'Future Role', faction: 'neutral' as const },
      ],
    }

    expect(resolveNight({ ...fixture, game })).toEqual({
      ok: false,
      error: {
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: futureRoleId,
        reason: 'missing-registry-entry',
      },
    })
  })

  it('canonicalises through owned values without freezing mutable inputs', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const input = {
      game: fixture.game,
      collectedActions: {
        ...fixture.collectedActions,
        actions: [...fixture.collectedActions.actions],
      },
      previousTargets: [...fixture.previousTargets],
    }
    const before = JSON.stringify(input)

    expect(resolveNight(input).ok).toBe(true)
    expect(JSON.stringify(input)).toBe(before)
    expect(Object.isFrozen(input.game)).toBe(false)
    expect(Object.isFrozen(input.game.players)).toBe(false)
    expect(Object.isFrozen(input.collectedActions)).toBe(false)
    expect(Object.isFrozen(input.collectedActions.actions)).toBe(false)
    expect(Object.isFrozen(input.previousTargets)).toBe(false)
  })

  it('returns a deeply frozen result without applying Phase 6 state or presentation', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.citizen },
      ],
      [6, 6, 0, 6, 6, 0, null],
    )
    const before = JSON.stringify(fixture)
    const result = resolveFixture(fixture)

    expect(JSON.stringify(fixture)).toBe(before)
    expect(fixture.game.phase).toBe('night-action-collection')
    expect(fixture.game.players.every((player) => player.alive)).toBe(true)
    expect(fixture.game.executionerTargets).toEqual([])
    expect(fixture.game).not.toHaveProperty('personalWins')

    expect(Object.keys(result).sort()).toEqual(
      [
        'gameId',
        'nightNumber',
        'roleBlockAttempts',
        'blockedActors',
        'finalVisits',
        'frames',
        'protections',
        'attackAttempts',
        'provisionalDeaths',
        'sheriffResults',
        'investigationResults',
        'detectiveResults',
      ].sort(),
    )
    expect(result).not.toHaveProperty('game')
    expect(result).not.toHaveProperty('nextPhase')
    expect(result).not.toHaveProperty('publicAnnouncement')
    expect(result).not.toHaveProperty('conversions')
    expect(result).not.toHaveProperty('personalWins')
    expect(result).not.toHaveProperty('factionWinner')

    expect(Object.isFrozen(result)).toBe(true)
    for (const value of Object.values(result)) {
      if (Array.isArray(value)) {
        expect(Object.isFrozen(value)).toBe(true)
        expect(value.every(Object.isFrozen)).toBe(true)
      }
    }
    expect(Object.isFrozen(result.provisionalDeaths[0]?.sources)).toBe(true)
    expect(Object.isFrozen(result.investigationResults[0]?.group)).toBe(true)
  })

  it('rejects runtime mutation attempts across every nested result collection', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consigliere },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [11, 11, 6, 11, 11, 11, 11, 0, 11, 11, 0, null],
      ),
    )
    const collections: readonly (readonly object[])[] = [
      result.roleBlockAttempts,
      result.blockedActors,
      result.finalVisits,
      result.frames,
      result.protections,
      result.attackAttempts,
      result.provisionalDeaths,
      result.sheriffResults,
      result.investigationResults,
      result.detectiveResults,
    ]

    expect(Reflect.set(result, 'nightNumber', 99)).toBe(false)
    for (const collection of collections) {
      expect(Reflect.set(collection, String(collection.length), null)).toBe(false)
      for (const record of collection) {
        expect(Reflect.set(record, 'maliciousField', true)).toBe(false)
      }
    }

    for (const record of result.blockedActors) {
      expect(Reflect.set(record.sources, String(record.sources.length), null)).toBe(false)
    }
    for (const record of result.frames) {
      expect(Reflect.set(record.sources, String(record.sources.length), null)).toBe(false)
    }
    for (const record of result.protections) {
      expect(Reflect.set(record.sources, String(record.sources.length), null)).toBe(false)
    }
    for (const record of result.provisionalDeaths) {
      expect(Reflect.set(record.sources, String(record.sources.length), null)).toBe(false)
    }
    for (const investigation of result.investigationResults) {
      expect(Reflect.set(investigation.group, 'label', 'Tampered')).toBe(false)
      expect(Reflect.set(investigation.group.roleIds, '0', ROLE_IDS.citizen)).toBe(false)
      expect(Reflect.set(investigation.group.roleDisplayNames, '0', 'Tampered')).toBe(false)
    }
  })
})
