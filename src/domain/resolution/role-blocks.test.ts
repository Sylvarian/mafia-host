import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { resolveNight } from './night-resolution.ts'

describe('Consort role-block resolution', () => {
  it.each([
    ['Doctor', ROLE_IDS.doctor],
    ['Godfather', ROLE_IDS.godfather],
    ['Serial Killer', ROLE_IDS.serialKiller],
    ['Sheriff', ROLE_IDS.sheriff],
    ['Investigator', ROLE_IDS.investigator],
    ['Detective', ROLE_IDS.detective],
    ['Framer', ROLE_IDS.framer],
  ])('blocks a non-Consort %s action, visit, and private result', (_name, targetRoleId) => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.consort }, { roleId: targetRoleId }, { roleId: ROLE_IDS.citizen }],
      [1, 2, null],
    )
    const result = resolveFixture(fixture)

    expect(result.roleBlockAttempts).toEqual([
      expect.objectContaining({ targetPlayerId: 'player-2', outcome: 'blocked-target' }),
    ])
    expect(result.blockedActors).toEqual([
      expect.objectContaining({
        blockedPlayerId: 'player-2',
        blockedRoleInstanceId: 'role-instance-2',
      }),
    ])
    expect(result.finalVisits.map((visit) => visit.actorPlayerId)).toEqual(['player-1'])
    expect(result.frames).toEqual([])
    expect(result.protections).toEqual([])
    expect(result.attackAttempts).toEqual([])
    expect(result.sheriffResults).toEqual([])
    expect(result.investigationResults).toEqual([])
    expect(result.detectiveResults).toEqual([])
  })

  it('blocks a Citizen once even though the Citizen submitted no action', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.citizen }],
        [1, null],
      ),
    )

    expect(result.blockedActors).toEqual([
      {
        blockedPlayerId: 'player-2',
        blockedRoleInstanceId: 'role-instance-2',
        sources: [
          {
            consortPlayerId: 'player-1',
            consortRoleInstanceId: 'role-instance-1',
          },
        ],
      },
    ])
  })

  it('lets an immune targeted Consort visit and block the Doctor', () => {
    const result = resolveFixture(
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

    expect(result.roleBlockAttempts.map((attempt) => attempt.outcome)).toEqual([
      'target-immune',
      'blocked-target',
    ])
    expect(result.blockedActors.map((record) => record.blockedPlayerId)).toEqual(['player-3'])
    expect(result.finalVisits).toEqual([
      expect.objectContaining({ actorPlayerId: 'player-1', targetPlayerId: 'player-2' }),
      expect.objectContaining({ actorPlayerId: 'player-2', targetPlayerId: 'player-3' }),
    ])
    expect(result.protections).toEqual([])
  })

  it('resolves two Consorts targeting one another as two immune visits', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.citizen }],
        [1, 0, null],
      ),
    )

    expect(result.roleBlockAttempts.map((attempt) => attempt.outcome)).toEqual([
      'target-immune',
      'target-immune',
    ])
    expect(result.blockedActors).toEqual([])
    expect(result.finalVisits).toEqual([
      expect.objectContaining({ actorPlayerId: 'player-1', targetPlayerId: 'player-2' }),
      expect.objectContaining({ actorPlayerId: 'player-2', targetPlayerId: 'player-1' }),
    ])
  })

  it('merges multiple Consort sources for one non-Consort in canonical source order', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 2, 3, null],
      ),
    )

    expect(result.blockedActors).toEqual([
      {
        blockedPlayerId: 'player-3',
        blockedRoleInstanceId: 'role-instance-3',
        sources: [
          { consortPlayerId: 'player-1', consortRoleInstanceId: 'role-instance-1' },
          { consortPlayerId: 'player-2', consortRoleInstanceId: 'role-instance-2' },
        ],
      },
    ])
    expect(Object.isFrozen(result.blockedActors[0]?.sources)).toBe(true)
  })

  it('merges three Consort sources independently of caller action order', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 3, 3, 4, null],
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
    expect(expected.blockedActors[0]?.sources).toEqual([
      { consortPlayerId: 'player-1', consortRoleInstanceId: 'role-instance-1' },
      { consortPlayerId: 'player-2', consortRoleInstanceId: 'role-instance-2' },
      { consortPlayerId: 'player-3', consortRoleInstanceId: 'role-instance-3' },
    ])
    expect(expected.finalVisits.map((visit) => visit.actorPlayerId)).toEqual([
      'player-1',
      'player-2',
      'player-3',
    ])
  })

  it('keeps a Consort immune to several attempts while preserving every visit and its action', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 3, 3, 4, 5, null],
      ),
    )

    expect(result.roleBlockAttempts.map((attempt) => attempt.outcome)).toEqual([
      'target-immune',
      'target-immune',
      'target-immune',
      'blocked-target',
    ])
    expect(result.blockedActors.map((record) => record.blockedPlayerId)).toEqual(['player-5'])
    expect(result.finalVisits.map((visit) => visit.actorPlayerId)).toEqual([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
    ])
    expect(result.protections).toEqual([])
  })

  it('does not mutate the game or collected actions', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      [1, 2, null],
    )
    const before = JSON.stringify(fixture)
    const result = resolveFixture(fixture)

    expect(JSON.stringify(fixture)).toBe(before)
    expect(fixture.game.phase).toBe('night-action-collection')
    expect(fixture.game.players.every((player) => player.alive)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
  })
})
