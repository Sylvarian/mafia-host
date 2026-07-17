import { describe, expect, it } from 'vitest'

import { roleId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { isSuspiciousToSheriff } from './sheriff-results.ts'

describe('Sheriff results', () => {
  it.each([
    ['Framer', ROLE_IDS.framer],
    ['Consort', ROLE_IDS.consort],
    ['Consigliere', ROLE_IDS.consigliere],
    ['Serial Killer', ROLE_IDS.serialKiller],
  ])('reports an unframed %s as suspicious', (_name, targetRoleId) => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.sheriff }, { roleId: targetRoleId }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )

    expect(result.sheriffResults).toEqual([
      {
        status: 'suspicious',
        actorPlayerId: 'player-1',
        actorRoleInstanceId: 'role-instance-1',
        targetPlayerId: 'player-2',
      },
    ])
  })

  it.each([
    [true, 'suspicious'],
    [false, 'not-suspicious'],
  ] as const)('applies the Godfather suspicion setting %s', (setting, expectedStatus) => {
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

    expect(result.sheriffResults[0]?.status).toBe(expectedStatus)
  })

  it.each([
    ['Citizen', ROLE_IDS.citizen, null],
    ['Doctor', ROLE_IDS.doctor, 2],
    ['Sheriff', ROLE_IDS.sheriff, 2],
    ['Detective', ROLE_IDS.detective, 2],
    ['Investigator', ROLE_IDS.investigator, 2],
    ['Mayor', ROLE_IDS.mayor, null],
    ['Jester', ROLE_IDS.jester, null],
    ['Executioner', ROLE_IDS.executioner, null],
  ] as const)('reports an unframed %s as not suspicious', (_name, targetRoleId, targetTarget) => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.sheriff }, { roleId: targetRoleId }, { roleId: ROLE_IDS.citizen }],
        [1, targetTarget, null],
      ),
    )

    expect(result.sheriffResults[0]?.status).toBe('not-suspicious')
  })

  it('makes a framed Godfather suspicious regardless of the setting', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 3, 1, null],
        { settings: { godfatherAppearsSuspiciousToSheriff: false } },
      ),
    )

    expect(result.sheriffResults[0]?.status).toBe('suspicious')
  })

  it('makes a framed Doctor suspicious without changing or revealing the actual role', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.citizen },
      ],
      [1, 3, 1, null],
    )
    const result = resolveFixture(fixture)
    const sheriffResult = result.sheriffResults[0]

    expect(sheriffResult?.status).toBe('suspicious')
    expect(sheriffResult).not.toHaveProperty('actualRoleId')
    expect(sheriffResult).not.toHaveProperty('targetRoleId')
    expect(fixture.game.players[1]?.role.roleId).toBe(ROLE_IDS.doctor)
  })

  it('gives a blocked Sheriff no visit and no result', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }],
        [1, 2, null],
      ),
    )

    expect(result.sheriffResults).toEqual([])
    expect(result.finalVisits.some((visit) => visit.actorRoleId === ROLE_IDS.sheriff)).toBe(false)
  })

  it('fails explicitly when no Sheriff rule exists for a role', () => {
    expect(isSuspiciousToSheriff(roleId('future-role'), false, true)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: 'future-role',
        reason: 'missing-registry-entry',
      },
    })
  })
})
