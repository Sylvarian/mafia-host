import { describe, expect, it } from 'vitest'

import { playerId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { buildCurrentDawnAnnouncement } from './dawn-announcement.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { applyResolvedNight, beginNightResolution } from './night-application.ts'

describe('night resolution application', () => {
  it('enters night-resolution without applying deaths or changing counters and then applies once', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.mayor }],
      [1, null, null],
      { settings: { revealRoleOnDeath: true } },
    )
    const resolution = resolveFixture(fixture)
    const originalGame = JSON.stringify(fixture.game)
    const originalResolution = JSON.stringify(resolution)
    const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)

    expect(begun.ok).toBe(true)
    if (!begun.ok) throw new Error('Expected night-resolution entry.')
    expect(begun.value).toMatchObject({
      phase: 'night-resolution',
      nightNumber: fixture.game.nightNumber,
      dayNumber: fixture.game.dayNumber,
    })
    expect(begun.value.players.every((player) => player.alive)).toBe(true)

    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    expect(applied.ok).toBe(true)
    if (!applied.ok) throw new Error('Expected night application.')

    expect(applied.value.game.phase).toBe('dawn-resolution')
    expect(applied.value.game.players[1]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: ROLE_IDS.citizen,
    })
    expect(applied.value.game.players[0]?.alive).toBe(true)
    expect(applied.value.game.players[2]?.alive).toBe(true)
    expect(applied.value.game.nightNumber).toBe(fixture.game.nightNumber)
    expect(applied.value.game.dayNumber).toBe(fixture.game.dayNumber)
    expect(applied.value.game.settings).toEqual(fixture.game.settings)
    expect(applied.value.game.players.map((player) => player.role)).toEqual(
      fixture.game.players.map((player) => player.role),
    )
    expect(applied.value.game.personalWins).toEqual([])
    expect(applied.value.game).not.toHaveProperty('factionWinner')
    expect(JSON.stringify(fixture.game)).toBe(originalGame)
    expect(JSON.stringify(resolution)).toBe(originalResolution)

    expect(
      applyResolvedNight(applied.value.game, resolution, fixture.collectedActions),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_NIGHT_APPLICATION_PHASE',
        currentPhase: 'dawn-resolution',
      },
    })
  })

  it('keeps death roles hidden and rejects a forged matching-role reveal', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
      { settings: { revealRoleOnDeath: false } },
    )
    const resolution = resolveFixture(fixture)
    const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected night-resolution entry.')
    const hidden = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!hidden.ok) throw new Error('Expected hidden-role application.')

    expect(hidden.value.game.players[1]?.publiclyRevealedRoleId).toBeNull()
    expect(buildCurrentDawnAnnouncement(hidden.value.game)).toEqual({
      outcome: 'deaths',
      nightNumber: fixture.game.nightNumber,
      deaths: [{ playerId: playerId('player-2'), revealedRoleId: null }],
    })

    const forgedRevealGame = {
      ...fixture.game,
      players: fixture.game.players.map((player) =>
        player.playerId === playerId('player-2')
          ? { ...player, publiclyRevealedRoleId: ROLE_IDS.citizen }
          : player,
      ),
    }
    expect(
      beginNightResolution(forgedRevealGame, resolution, fixture.collectedActions),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_GAME_STATE_FOR_NIGHT_APPLICATION',
        error: {
          type: 'INVALID_DEATH_RECORDS',
          reason: 'public-reveal-mismatch',
        },
      },
    })
  })

  it('converts every shared-target Executioner at the applied-death boundary', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.executioner, alive: false },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, null, null, null],
    )
    const resolution = resolveFixture(fixture)
    const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected night-resolution entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected shared-target conversion application.')

    expect(
      applied.value.game.executionerConversions.map((conversion) => ({
        playerId: conversion.playerId,
        roleInstanceId: conversion.roleInstanceId,
        targetPlayerId: conversion.targetPlayerId,
      })),
    ).toEqual([
      {
        playerId: fixture.game.players[1]?.playerId,
        roleInstanceId: fixture.game.players[1]?.role.instanceId,
        targetPlayerId: fixture.game.players[3]?.playerId,
      },
      {
        playerId: fixture.game.players[2]?.playerId,
        roleInstanceId: fixture.game.players[2]?.role.instanceId,
        targetPlayerId: fixture.game.players[3]?.playerId,
      },
    ])
    expect(applied.value.game.players[1]?.alive).toBe(true)
    expect(applied.value.game.players[2]?.alive).toBe(false)
    expect(applied.value.game.players[3]?.alive).toBe(false)
    expect(applied.value.game.personalWins).toEqual([])
    expect(applied.value.game.pendingJesterRevenges).toEqual([])
    expect(
      applyResolvedNight(applied.value.game, resolution, fixture.collectedActions),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_NIGHT_APPLICATION_PHASE',
        currentPhase: 'dawn-resolution',
      },
    })
  })

  it('preserves mixed legitimate public reveals across multiple hidden-role deaths', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.mayor },
        { roleId: ROLE_IDS.citizen },
      ],
      [2, 3, null, null],
      { settings: { revealRoleOnDeath: false } },
    )
    const resolution = resolveFixture(fixture)
    const preRevealedGame = {
      ...fixture.game,
      dayNumber: 1,
      players: fixture.game.players.map((player) =>
        player.playerId === playerId('player-3')
          ? { ...player, publiclyRevealedRoleId: ROLE_IDS.mayor }
          : player,
      ),
    }
    const begun = beginNightResolution(preRevealedGame, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected mixed-reveal night-resolution entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected mixed-reveal application.')

    expect(buildCurrentDawnAnnouncement(applied.value.game)).toEqual({
      outcome: 'deaths',
      nightNumber: fixture.game.nightNumber,
      deaths: [
        { playerId: playerId('player-3'), revealedRoleId: ROLE_IDS.mayor },
        { playerId: playerId('player-4'), revealedRoleId: null },
      ],
    })
  })

  it('preserves a voluntary Mayor reveal after death and does not create separate reveal authority', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.mayor }],
      [1, null],
      { settings: { revealRoleOnDeath: false } },
    )
    const mayor = fixture.game.players[1]
    if (mayor === undefined) throw new Error('Expected Mayor.')
    const preRevealedGame = {
      ...fixture.game,
      dayNumber: 1,
      players: fixture.game.players.map((player) =>
        player.playerId === mayor.playerId
          ? { ...player, publiclyRevealedRoleId: ROLE_IDS.mayor }
          : player,
      ),
    }
    const resolution = resolveFixture(fixture)
    const begun = beginNightResolution(preRevealedGame, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected pre-revealed Mayor entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected revealed Mayor death application.')

    expect(applied.value.game.players[1]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: ROLE_IDS.mayor,
    })
    expect(applied.value.game.players[1]).not.toHaveProperty('mayorRevealed')
  })

  it('keeps a Mayor killed before revealing hidden when death reveal is disabled', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.mayor }],
      [1, null],
      { settings: { revealRoleOnDeath: false } },
    )
    const resolution = resolveFixture(fixture)
    const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected hidden Mayor entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected hidden Mayor death application.')

    expect(applied.value.game.players[1]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: null,
    })
  })

  it('does not record a Doctor target when the Doctor is blocked and killed that night', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
      ],
      [2, 2, 3, null],
    )
    const resolution = resolveFixture(fixture)
    expect(resolution.protections).toEqual([])
    expect(resolution.provisionalDeaths[0]?.deadPlayerId).toBe(playerId('player-3'))

    const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected night-resolution entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected night application.')

    expect(applied.value.game.doctorPreviousTargets).toEqual([])
    expect(Object.isFrozen(applied.value.game.doctorPreviousTargets)).toBe(true)
  })

  it('records duplicate Doctors independently in participating-player order', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      [2, 2, null],
    )
    const resolution = resolveFixture(fixture)
    const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected night-resolution entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected night application.')

    expect(
      applied.value.game.doctorPreviousTargets.map((entry) => [
        entry.doctorRoleInstanceId,
        entry.targetPlayerId,
      ]),
    ).toEqual([
      [fixture.game.players[0]?.role.instanceId, playerId('player-3')],
      [fixture.game.players[1]?.role.instanceId, playerId('player-3')],
    ])
  })

  it('replaces acting Doctor history while preserving a non-acting dead Doctor record', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.doctor, alive: false },
        { roleId: ROLE_IDS.citizen },
      ],
      [2, null, null],
      { nightNumber: 3 },
    )
    const firstDoctor = fixture.game.players[0]
    const secondDoctor = fixture.game.players[1]
    const citizen = fixture.game.players[2]
    if (firstDoctor === undefined || secondDoctor === undefined || citizen === undefined) {
      throw new Error('Expected two Doctors and a Citizen.')
    }
    const gameWithHistory = {
      ...fixture.game,
      doctorPreviousTargets: [
        {
          doctorRoleInstanceId: firstDoctor.role.instanceId,
          targetPlayerId: secondDoctor.playerId,
          nightNumber: 2,
        },
        {
          doctorRoleInstanceId: secondDoctor.role.instanceId,
          targetPlayerId: firstDoctor.playerId,
          nightNumber: 2,
        },
      ],
    }
    const resolution = resolveFixture(fixture)
    const begun = beginNightResolution(gameWithHistory, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected history-preserving night-resolution entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected history-preserving application.')

    expect(applied.value.game.doctorPreviousTargets).toEqual([
      {
        doctorRoleInstanceId: firstDoctor.role.instanceId,
        targetPlayerId: citizen.playerId,
        nightNumber: 3,
      },
      {
        doctorRoleInstanceId: secondDoctor.role.instanceId,
        targetPlayerId: firstDoctor.playerId,
        nightNumber: 2,
      },
    ])
  })

  it('does not record a blocked Doctor target when that target dies', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 2, 3, null],
    )
    const resolution = resolveFixture(fixture)
    expect(resolution.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual([
      playerId('player-4'),
    ])

    const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
    if (!begun.ok) throw new Error('Expected night-resolution entry.')
    const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
    if (!applied.ok) throw new Error('Expected night application.')

    expect(applied.value.game.doctorPreviousTargets).toEqual([])
  })

  it('rejects stale, duplicate, unknown, already-dead, and role-mismatched deaths', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const resolution = resolveFixture(fixture)

    expect(
      beginNightResolution(
        { ...fixture.game, id: 'another-game' as typeof fixture.game.id },
        resolution,
        fixture.collectedActions,
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'NIGHT_APPLICATION_GAME_ID_MISMATCH' },
    })
    expect(
      beginNightResolution(
        { ...fixture.game, nightNumber: fixture.game.nightNumber + 1 },
        resolution,
        fixture.collectedActions,
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'NIGHT_APPLICATION_NIGHT_NUMBER_MISMATCH' },
    })

    const death = resolution.provisionalDeaths[0]
    if (death === undefined) throw new Error('Expected one provisional death.')
    expect(
      beginNightResolution(
        fixture.game,
        {
          ...resolution,
          provisionalDeaths: [death, death],
        },
        fixture.collectedActions,
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'DUPLICATE_PROVISIONAL_DEATH' },
    })
    expect(
      beginNightResolution(
        fixture.game,
        {
          ...resolution,
          provisionalDeaths: [{ ...death, deadPlayerId: playerId('unknown-player') }],
        },
        fixture.collectedActions,
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'UNKNOWN_PROVISIONAL_DEATH_PLAYER' },
    })
    expect(
      beginNightResolution(
        fixture.game,
        {
          ...resolution,
          provisionalDeaths: [{ ...death, actualRoleId: ROLE_IDS.doctor }],
        },
        fixture.collectedActions,
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_PROVISIONAL_DEATH_ROLE' },
    })
    expect(
      beginNightResolution(
        {
          ...fixture.game,
          players: fixture.game.players.map((player) =>
            player.playerId === death.deadPlayerId ? { ...player, alive: false } : player,
          ),
        },
        resolution,
        fixture.collectedActions,
      ),
    ).toMatchObject({
      ok: false,
      error: { type: 'PROVISIONAL_DEATH_PLAYER_ALREADY_DEAD' },
    })

    expect(
      beginNightResolution(
        fixture.game,
        { ...resolution, attackAttempts: [] },
        fixture.collectedActions,
      ),
    ).toEqual({
      ok: false,
      error: { type: 'NIGHT_RESOLUTION_CONTENT_MISMATCH' },
    })
    expect(
      beginNightResolution(fixture.game, resolution, {
        ...fixture.collectedActions,
        actions: [null],
      } as never),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_COLLECTED_ACTIONS_FOR_NIGHT_APPLICATION',
        error: {
          type: 'INVALID_ACTION_BATCH',
          reason: 'invalid-action',
          index: 0,
        },
      },
    })
  })

  it('builds an immutable participant-ordered no-death or multi-death Dawn model', () => {
    const quietFixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const quietResolution = resolveFixture(quietFixture)
    const quietBegun = beginNightResolution(
      quietFixture.game,
      quietResolution,
      quietFixture.collectedActions,
    )
    if (!quietBegun.ok) throw new Error('Expected quiet night entry.')
    const quiet = applyResolvedNight(
      quietBegun.value,
      quietResolution,
      quietFixture.collectedActions,
    )
    if (!quiet.ok) throw new Error('Expected quiet Dawn.')
    expect(buildCurrentDawnAnnouncement(quiet.value.game)).toEqual({
      outcome: 'no-deaths',
      nightNumber: quietFixture.game.nightNumber,
    })

    const deathsFixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 2, null, null],
    )
    const deathsResolution = resolveFixture(deathsFixture)
    const deathsBegun = beginNightResolution(
      deathsFixture.game,
      deathsResolution,
      deathsFixture.collectedActions,
    )
    if (!deathsBegun.ok) throw new Error('Expected death night entry.')
    const deaths = applyResolvedNight(
      deathsBegun.value,
      deathsResolution,
      deathsFixture.collectedActions,
    )
    if (!deaths.ok) throw new Error('Expected death Dawn.')
    expect(buildCurrentDawnAnnouncement(deaths.value.game)).toEqual({
      outcome: 'deaths',
      nightNumber: deathsFixture.game.nightNumber,
      deaths: [
        { playerId: playerId('player-3'), revealedRoleId: null },
        { playerId: playerId('player-4'), revealedRoleId: null },
      ],
    })
    const announcement = buildCurrentDawnAnnouncement(deaths.value.game)
    expect(Object.isFrozen(announcement)).toBe(true)
    if (announcement.outcome === 'deaths') {
      expect(Object.isFrozen(announcement.deaths)).toBe(true)
      expect(announcement.deaths[0]).not.toHaveProperty('source')
      expect(announcement.deaths[0]).not.toHaveProperty('roleId')
    }
  })

  it('produces the same public no-death Dawn for every hidden cause', () => {
    const fixtures = [
      createResolutionFixture([{ roleId: ROLE_IDS.citizen }], [null]),
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
        [2, 2, null],
      ),
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
        [1, 0],
        { settings: { godfatherAndSerialCanKillEachOther: false } },
      ),
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 2, null],
      ),
    ]

    for (const fixture of fixtures) {
      const resolution = resolveFixture(fixture)
      expect(resolution.provisionalDeaths).toEqual([])
      const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
      if (!begun.ok) throw new Error('Expected no-death night-resolution entry.')
      const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
      if (!applied.ok) throw new Error('Expected no-death application.')
      expect(buildCurrentDawnAnnouncement(applied.value.game)).toEqual({
        outcome: 'no-deaths',
        nightNumber: fixture.game.nightNumber,
      })
      expect(applied.value.game.players.map((player) => player.alive)).toEqual(
        fixture.game.players.map((player) => player.alive),
      )
    }
  })
})
