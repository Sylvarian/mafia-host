import { describe, expect, it } from 'vitest'

import { resolveNight } from './night-resolution.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'

describe('final visits', () => {
  it('records one canonically ordered visit for every effective acting role instance', () => {
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
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.detective },
          { roleId: ROLE_IDS.citizen },
        ],
        [10, 10, 3, 2, 10, 10, 10, 10, 10, 0, null],
      ),
    )

    expect(result.finalVisits.map((visit) => visit.actorRoleId)).toEqual([
      ROLE_IDS.consort,
      ROLE_IDS.consort,
      ROLE_IDS.framer,
      ROLE_IDS.godfather,
      ROLE_IDS.serialKiller,
      ROLE_IDS.doctor,
      ROLE_IDS.sheriff,
      ROLE_IDS.investigator,
      ROLE_IDS.consigliere,
    ])
    expect(new Set(result.finalVisits.map((visit) => visit.actorRoleInstanceId)).size).toBe(9)
    expect(result.finalVisits.some((visit) => visit.actorRoleId === ROLE_IDS.detective)).toBe(false)
    expect(result.finalVisits.some((visit) => visit.actorPlayerId === 'player-11')).toBe(false)
  })

  it('retains visits for protected, mutual-kill-disabled, and provisionally killed actors', () => {
    const protectedAttack = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
        [2, 2, null],
      ),
    )
    expect(protectedAttack.finalVisits.map((visit) => visit.actorPlayerId)).toEqual([
      'player-1',
      'player-2',
    ])

    const mutualDisabled = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
        [1, 0],
        { settings: { godfatherAndSerialCanKillEachOther: false } },
      ),
    )
    expect(mutualDisabled.finalVisits.map((visit) => visit.targetPlayerId)).toEqual([
      'player-2',
      'player-1',
    ])

    const killedDoctor = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )
    expect(killedDoctor.provisionalDeaths.map((death) => death.deadPlayerId)).toEqual(['player-2'])
    expect(killedDoctor.finalVisits).toContainEqual(
      expect.objectContaining({ actorPlayerId: 'player-2', targetPlayerId: 'player-3' }),
    )
    expect(killedDoctor.protections).toContainEqual(
      expect.objectContaining({ protectedPlayerId: 'player-3' }),
    )
  })

  it('canonicalises a caller-reordered action array and keeps duplicate instances independent', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 4, 3, 4, null],
    )
    const normal = resolveFixture(fixture)
    const reordered = resolveNight({
      ...fixture,
      collectedActions: {
        ...fixture.collectedActions,
        actions: [...fixture.collectedActions.actions].reverse(),
      },
    })

    expect(reordered).toEqual({ ok: true, value: normal })
    expect(normal.finalVisits.map((visit) => visit.actorRoleId)).toEqual([
      ROLE_IDS.godfather,
      ROLE_IDS.doctor,
      ROLE_IDS.doctor,
    ])
    expect(
      normal.finalVisits.filter((visit) => visit.actorRoleId === ROLE_IDS.doctor),
    ).toHaveLength(2)
  })
})

describe('temporary frames', () => {
  it.each([
    ['Town', ROLE_IDS.citizen, null],
    ['Mafia', ROLE_IDS.consort, 2],
    ['Godfather', ROLE_IDS.godfather, 2],
    ['Serial Killer', ROLE_IDS.serialKiller, 2],
  ] as const)(
    'frames a %s target without changing their actual role',
    (_name, targetRoleId, targetTarget) => {
      const fixture = createResolutionFixture(
        [{ roleId: ROLE_IDS.framer }, { roleId: targetRoleId }, { roleId: ROLE_IDS.citizen }],
        [1, targetTarget, null],
      )
      const before = JSON.stringify(fixture.game)
      const result = resolveFixture(fixture)

      expect(result.frames).toEqual([
        {
          framedPlayerId: 'player-2',
          sources: [{ framerPlayerId: 'player-1', framerRoleInstanceId: 'role-instance-1' }],
        },
      ])
      expect(fixture.game.players[1]?.role.roleId).toBe(targetRoleId)
      expect(JSON.stringify(fixture.game)).toBe(before)
    },
  )

  it('produces no visit or frame for a blocked Framer', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )

    expect(result.frames).toEqual([])
    expect(result.finalVisits.map((visit) => visit.actorPlayerId)).toEqual(['player-1'])
  })

  it('merges multiple Framer sources into one participant-ordered frame record', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.citizen }],
        [2, 2, null],
      ),
    )

    expect(result.frames).toEqual([
      {
        framedPlayerId: 'player-3',
        sources: [
          { framerPlayerId: 'player-1', framerRoleInstanceId: 'role-instance-1' },
          { framerPlayerId: 'player-2', framerRoleInstanceId: 'role-instance-2' },
        ],
      },
    ])
    expect(Object.isFrozen(result.frames[0]?.sources)).toBe(true)
  })
})
