import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '../roles/role-registry.ts'
import { resolveAttacks, determineProvisionalDeaths } from './attacks.ts'
import {
  buildImportantNightEvents,
  captureImportantNightEventCanonicalSource,
} from './important-night-events.ts'
import { resolveNight } from './night-resolution.ts'
import { resolveProtections } from './protections.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'

describe('Doctor protections', () => {
  it('defensively removes revealed-Mayor protection and produces no Doctor-save event', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.mayor }],
      [2, 2, null],
      { settings: { doctorCannotProtectRevealedMayor: false } },
    )
    const mayor = fixture.game.players[2]
    if (mayor === undefined) throw new Error('Expected Mayor target.')
    const restrictedGame = {
      ...fixture.game,
      settings: { ...fixture.game.settings, doctorCannotProtectRevealedMayor: true },
      players: fixture.game.players.map((player) =>
        player.playerId === mayor.playerId
          ? { ...player, publiclyRevealedRoleId: ROLE_IDS.mayor }
          : player,
      ),
    }

    const rejectedResolution = resolveNight({ ...fixture, game: restrictedGame })
    expect(rejectedResolution).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_COLLECTED_NIGHT_ACTIONS',
        error: { type: 'DOCTOR_CANNOT_PROTECT_REVEALED_MAYOR' },
      },
    })

    const protections = resolveProtections(restrictedGame, fixture.collectedActions.actions)
    const attacks = resolveAttacks(restrictedGame, fixture.collectedActions.actions, protections)
    const provisionalDeaths = determineProvisionalDeaths(restrictedGame, attacks)
    expect(protections).toEqual([])
    expect(attacks).toEqual([
      expect.objectContaining({ targetPlayerId: mayor.playerId, outcome: 'lethal' }),
    ])
    expect(provisionalDeaths).toEqual([
      expect.objectContaining({ deadPlayerId: mayor.playerId, actualRoleId: ROLE_IDS.mayor }),
    ])

    const baseline = resolveFixture(fixture)
    const evidence = buildImportantNightEvents(
      { ...baseline, protections, attackAttempts: attacks, provisionalDeaths },
      captureImportantNightEventCanonicalSource(restrictedGame, fixture.collectedActions),
    )
    expect(evidence.events).toEqual([
      expect.objectContaining({
        kind: 'attack',
        targetPlayerId: mayor.playerId,
        outcome: 'lethal',
        doctors: [],
      }),
    ])
  })

  it('protects an unrevealed Mayor when enabled and a revealed Mayor when disabled', () => {
    const enabledFixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.mayor }],
      [2, 2, null],
      { settings: { doctorCannotProtectRevealedMayor: true } },
    )
    expect(resolveFixture(enabledFixture).attackAttempts).toEqual([
      expect.objectContaining({ outcome: 'protected' }),
    ])

    const unrestrictedFixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.mayor }],
      [2, 2, null],
      { settings: { doctorCannotProtectRevealedMayor: false } },
    )
    const unrestrictedMayor = unrestrictedFixture.game.players[2]
    if (unrestrictedMayor === undefined) throw new Error('Expected unrestricted Mayor target.')
    const unrestrictedGame = {
      ...unrestrictedFixture.game,
      players: unrestrictedFixture.game.players.map((player) =>
        player.playerId === unrestrictedMayor.playerId
          ? { ...player, publiclyRevealedRoleId: ROLE_IDS.mayor }
          : player,
      ),
    }
    const result = resolveFixture({
      ...unrestrictedFixture,
      game: unrestrictedGame,
    })
    expect(result.attackAttempts).toEqual([expect.objectContaining({ outcome: 'protected' })])
    const evidence = buildImportantNightEvents(
      result,
      captureImportantNightEventCanonicalSource(
        unrestrictedGame,
        unrestrictedFixture.collectedActions,
      ),
    )
    expect(evidence.events).toEqual([
      expect.objectContaining({
        kind: 'attack',
        outcome: 'protected',
        doctors: [
          expect.objectContaining({
            doctorPlayerId: unrestrictedFixture.game.players[1]?.playerId,
          }),
        ],
      }),
    ])
  })

  it('records one protection with its Doctor source', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
        [1, null],
      ),
    )

    expect(result.protections).toEqual([
      {
        protectedPlayerId: 'player-2',
        sources: [{ doctorPlayerId: 'player-1', doctorRoleInstanceId: 'role-instance-1' }],
      },
    ])
  })

  it('merges multiple Doctors protecting one target while retaining every source', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
        [2, 2, null],
      ),
    )

    expect(result.protections).toEqual([
      {
        protectedPlayerId: 'player-3',
        sources: [
          { doctorPlayerId: 'player-1', doctorRoleInstanceId: 'role-instance-1' },
          { doctorPlayerId: 'player-2', doctorRoleInstanceId: 'role-instance-2' },
        ],
      },
    ])
  })

  it('gives a blocked Doctor no protection and no visit', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )

    expect(result.protections).toEqual([])
    expect(result.finalVisits.some((visit) => visit.actorRoleId === ROLE_IDS.doctor)).toBe(false)
  })

  it('does not prevent role blocks, frames, investigations, or tracking', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [5, 5, 5, 5, 3, null],
      ),
    )

    expect(result.protections.map((record) => record.protectedPlayerId)).toEqual(['player-6'])
    expect(result.frames.map((record) => record.framedPlayerId)).toEqual(['player-6'])
    expect(result.blockedActors.map((record) => record.blockedPlayerId)).toEqual(['player-6'])
    expect(result.sheriffResults).toContainEqual(
      expect.objectContaining({ targetPlayerId: 'player-6', status: 'suspicious' }),
    )
    expect(result.detectiveResults).toContainEqual(
      expect.objectContaining({ targetPlayerId: 'player-4', status: 'visited-player' }),
    )
  })
})

describe('Godfather and Serial Killer attacks', () => {
  it.each([
    ['Godfather', ROLE_IDS.godfather],
    ['Serial Killer', ROLE_IDS.serialKiller],
  ])('makes an unprotected %s attack lethal', (_name, attackerRoleId) => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: attackerRoleId }, { roleId: ROLE_IDS.citizen }],
        [1, null],
      ),
    )

    expect(result.attackAttempts).toEqual([
      expect.objectContaining({ outcome: 'lethal', targetPlayerId: 'player-2' }),
    ])
    expect(result.provisionalDeaths).toEqual([
      expect.objectContaining({
        deadPlayerId: 'player-2',
        actualRoleId: ROLE_IDS.citizen,
        nightNumber: 2,
      }),
    ])
  })

  it('lets one Doctor prevent both ordinary attacks against one player', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 3, 3, null],
      ),
    )

    expect(result.attackAttempts.map((attack) => attack.outcome)).toEqual([
      'protected',
      'protected',
    ])
    expect(result.provisionalDeaths).toEqual([])
    expect(result.finalVisits.map((visit) => visit.targetPlayerId)).toEqual([
      'player-4',
      'player-4',
      'player-4',
    ])
  })

  it('makes both attacks lethal when a Consort blocks the only Doctor', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [4, 4, 3, 4, null],
      ),
    )

    expect(result.protections).toEqual([])
    expect(result.attackAttempts.map((attack) => attack.outcome)).toEqual(['lethal', 'lethal'])
    expect(result.provisionalDeaths).toEqual([
      expect.objectContaining({
        deadPlayerId: 'player-5',
        sources: [
          expect.objectContaining({ attackerRoleId: ROLE_IDS.godfather }),
          expect.objectContaining({ attackerRoleId: ROLE_IDS.serialKiller }),
        ],
      }),
    ])
  })

  it('produces separate participant-ordered deaths for attacks on separate targets', () => {
    const result = resolveFixture(
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

    expect(result.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual([
      'player-3',
      'player-4',
    ])
  })

  it('merges two lethal attacks on one target into one death with both sources', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 2, null],
      ),
    )

    expect(result.provisionalDeaths).toEqual([
      {
        deadPlayerId: 'player-3',
        actualRoleId: ROLE_IDS.citizen,
        nightNumber: 2,
        sources: [
          {
            attackerPlayerId: 'player-1',
            attackerRoleId: ROLE_IDS.godfather,
            attackerRoleInstanceId: 'role-instance-1',
          },
          {
            attackerPlayerId: 'player-2',
            attackerRoleId: ROLE_IDS.serialKiller,
            attackerRoleInstanceId: 'role-instance-2',
          },
        ],
      },
    ])
  })

  it('records mutual attacks without lethal effect when mutual killing is disabled', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
        [1, 0],
        { settings: { godfatherAndSerialCanKillEachOther: false } },
      ),
    )

    expect(result.attackAttempts.map((attack) => attack.outcome)).toEqual([
      'mutual-kill-disabled',
      'mutual-kill-disabled',
    ])
    expect(result.finalVisits).toHaveLength(2)
    expect(result.provisionalDeaths).toEqual([])
  })

  it('reports mutual-kill immunity before Doctor protection', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 3, 1, null],
        { settings: { godfatherAndSerialCanKillEachOther: false } },
      ),
    )

    expect(result.protections).toEqual([expect.objectContaining({ protectedPlayerId: 'player-2' })])
    expect(result.attackAttempts[0]).toEqual(
      expect.objectContaining({
        attackerRoleId: ROLE_IDS.godfather,
        targetPlayerId: 'player-2',
        outcome: 'mutual-kill-disabled',
      }),
    )
  })

  it('makes both mutual attacks lethal when mutual killing is enabled', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
        [1, 0],
        { settings: { godfatherAndSerialCanKillEachOther: true } },
      ),
    )

    expect(result.attackAttempts.map((attack) => attack.outcome)).toEqual(['lethal', 'lethal'])
    expect(result.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual([
      'player-1',
      'player-2',
    ])
  })

  it.each([
    ['Godfather', ROLE_IDS.godfather],
    ['Serial Killer', ROLE_IDS.serialKiller],
  ])('gives a blocked %s no attack attempt and no visit', (_name, attackerRoleId) => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.consort }, { roleId: attackerRoleId }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )

    expect(result.attackAttempts).toEqual([])
    expect(result.provisionalDeaths).toEqual([])
    expect(result.finalVisits.map((visit) => visit.actorPlayerId)).toEqual(['player-1'])
  })

  it('does not recreate disabled first-night killing actions', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
        ],
        [null, null, null],
        { nightNumber: 1, settings: { allowFirstNightKills: false } },
      ),
    )

    expect(result.finalVisits).toEqual([])
    expect(result.attackAttempts).toEqual([])
    expect(result.provisionalDeaths).toEqual([])
  })
})
