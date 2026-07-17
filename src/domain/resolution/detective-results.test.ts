import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'

describe('Detective tracking results', () => {
  it.each([
    ['Godfather', ROLE_IDS.godfather],
    ['Serial Killer', ROLE_IDS.serialKiller],
    ['Doctor', ROLE_IDS.doctor],
    ['Framer', ROLE_IDS.framer],
    ['Consort', ROLE_IDS.consort],
  ])('tracks a %s final visit', (_name, trackedRoleId) => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.detective }, { roleId: trackedRoleId }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )

    expect(result.detectiveResults[0]).toEqual({
      status: 'visited-player',
      actorPlayerId: 'player-1',
      actorRoleInstanceId: 'role-instance-1',
      targetPlayerId: 'player-2',
      visitedPlayerId: 'player-3',
    })
  })

  it('tracks a Consort-on-Consort immune visit', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 2, 1, null],
      ),
    )

    expect(result.detectiveResults[0]).toMatchObject({
      status: 'visited-player',
      targetPlayerId: 'player-2',
      visitedPlayerId: 'player-3',
    })
  })

  it('counts a Detective tracking action as that Detective own visit', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 2, null],
      ),
    )

    expect(result.detectiveResults).toEqual([
      expect.objectContaining({
        actorRoleInstanceId: 'role-instance-1',
        targetPlayerId: 'player-2',
        status: 'visited-player',
        visitedPlayerId: 'player-3',
      }),
      expect.objectContaining({
        actorRoleInstanceId: 'role-instance-2',
        targetPlayerId: 'player-3',
        status: 'visited-nobody',
      }),
    ])
  })

  it('tracks a protected attacker intended target', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 3, 3, null],
      ),
    )

    expect(result.attackAttempts[0]?.outcome).toBe('protected')
    expect(result.detectiveResults[0]).toMatchObject({
      status: 'visited-player',
      visitedPlayerId: 'player-4',
    })
  })

  it('tracks a mutual-kill-disabled attacker intended target', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
        ],
        [1, 2, 1],
        { settings: { godfatherAndSerialCanKillEachOther: false } },
      ),
    )

    expect(result.attackAttempts[0]?.outcome).toBe('mutual-kill-disabled')
    expect(result.detectiveResults[0]).toMatchObject({
      status: 'visited-player',
      visitedPlayerId: 'player-3',
    })
  })

  it('reports visited nobody for a role-blocked target', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 2, 3, null],
      ),
    )

    expect(result.detectiveResults[0]).toMatchObject({
      status: 'visited-nobody',
      targetPlayerId: 'player-3',
    })
  })

  it('reports visited nobody when several Consorts block the tracked Detective', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 3, 3, 4, null],
      ),
    )

    expect(result.blockedActors[0]?.sources).toHaveLength(2)
    expect(result.detectiveResults).toEqual([
      expect.objectContaining({
        actorPlayerId: 'player-1',
        targetPlayerId: 'player-4',
        status: 'visited-nobody',
      }),
    ])
  })

  it.each([
    ['Mayor', ROLE_IDS.mayor],
    ['Citizen', ROLE_IDS.citizen],
    ['Jester', ROLE_IDS.jester],
    ['Executioner', ROLE_IDS.executioner],
  ])('reports visited nobody for a no-action %s', (_name, targetRoleId) => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.detective }, { roleId: targetRoleId }],
        [1, null],
      ),
    )

    expect(result.detectiveResults[0]?.status).toBe('visited-nobody')
  })

  it('still sees the visit made by a provisionally killed target', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 3, 1, null],
      ),
    )

    expect(result.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual(['player-2'])
    expect(result.detectiveResults[0]).toMatchObject({
      status: 'visited-player',
      targetPlayerId: 'player-2',
      visitedPlayerId: 'player-4',
    })
  })

  it('gives a blocked Detective no visit or result', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 2, null],
      ),
    )

    expect(result.detectiveResults).toEqual([])
    expect(result.finalVisits.some((visit) => visit.actorRoleId === ROLE_IDS.detective)).toBe(false)
  })
})
