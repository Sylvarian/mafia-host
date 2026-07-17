import { describe, expect, it } from 'vitest'

import { INVESTIGATION_GROUP_IDS } from '../investigation/investigation-groups.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'

describe('Investigator and Consigliere results', () => {
  it.each([
    ['Godfather', ROLE_IDS.godfather, INVESTIGATION_GROUP_IDS.groupA, 2],
    ['Doctor', ROLE_IDS.doctor, INVESTIGATION_GROUP_IDS.groupA, 2],
    ['Sheriff', ROLE_IDS.sheriff, INVESTIGATION_GROUP_IDS.groupA, 2],
    ['Framer', ROLE_IDS.framer, INVESTIGATION_GROUP_IDS.groupB, 2],
    ['Detective', ROLE_IDS.detective, INVESTIGATION_GROUP_IDS.groupB, 2],
    ['Mayor', ROLE_IDS.mayor, INVESTIGATION_GROUP_IDS.groupB, null],
    ['Consort', ROLE_IDS.consort, INVESTIGATION_GROUP_IDS.groupC, 2],
    ['Investigator', ROLE_IDS.investigator, INVESTIGATION_GROUP_IDS.groupC, 2],
    ['Executioner', ROLE_IDS.executioner, INVESTIGATION_GROUP_IDS.groupC, null],
    ['Consigliere', ROLE_IDS.consigliere, INVESTIGATION_GROUP_IDS.groupD, 2],
    ['Serial Killer', ROLE_IDS.serialKiller, INVESTIGATION_GROUP_IDS.groupD, 2],
    ['Jester', ROLE_IDS.jester, INVESTIGATION_GROUP_IDS.groupD, null],
    ['Citizen', ROLE_IDS.citizen, INVESTIGATION_GROUP_IDS.groupD, null],
  ] as const)(
    'returns the permanent group for %s to Investigator and Consigliere',
    (_name, targetRoleId, expectedGroupId, targetTarget) => {
      for (const actorRoleId of [ROLE_IDS.investigator, ROLE_IDS.consigliere]) {
        const result = resolveFixture(
          createResolutionFixture(
            [{ roleId: actorRoleId }, { roleId: targetRoleId }, { roleId: ROLE_IDS.citizen }],
            [1, targetTarget, null],
          ),
        )
        const actorResult = result.investigationResults.find(
          (entry) => entry.actorPlayerId === 'player-1',
        )

        expect(actorResult?.actorRoleId).toBe(actorRoleId)
        expect(actorResult?.group.id).toBe(expectedGroupId)
      }
    },
  )

  it('uses the same resolver and result card for Investigator and Consigliere', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consigliere },
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 2, null],
      ),
    )

    expect(result.investigationResults).toHaveLength(2)
    expect(result.investigationResults[0]?.group).toBe(result.investigationResults[1]?.group)
    expect(result.investigationResults.map((entry) => entry.group.id)).toEqual([
      INVESTIGATION_GROUP_IDS.groupD,
      INVESTIGATION_GROUP_IDS.groupD,
    ])
  })

  it('returns Group A to both roles for a framed target', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.consigliere },
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 3, 3, 4, null],
      ),
    )

    expect(result.investigationResults.map((entry) => entry.group.id)).toEqual([
      INVESTIGATION_GROUP_IDS.groupA,
      INVESTIGATION_GROUP_IDS.groupA,
    ])
  })

  it('gives blocked Investigator and Consigliere actors no result or visit', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.consigliere },
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 3, 4, 4, null],
      ),
    )

    expect(result.investigationResults).toEqual([])
    expect(
      result.finalVisits.some(
        (visit) =>
          visit.actorRoleId === ROLE_IDS.investigator || visit.actorRoleId === ROLE_IDS.consigliere,
      ),
    ).toBe(false)
  })

  it('returns Group D as four public card entries without exposing the target role separately', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 2, null],
      ),
    )
    const investigation = result.investigationResults[0]

    expect(investigation?.group.roleIds).toHaveLength(4)
    expect(investigation?.group.roleDisplayNames).toEqual([
      'Consigliere',
      'Serial Killer',
      'Jester',
      'Citizen',
    ])
    expect(investigation).not.toHaveProperty('actualRoleId')
    expect(investigation).not.toHaveProperty('targetRoleId')
  })

  it('keeps duplicate Investigators and role-instance identities independent', () => {
    const result = resolveFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.investigator },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 2, null],
      ),
    )

    expect(result.investigationResults.map((entry) => entry.actorRoleInstanceId)).toEqual([
      'role-instance-1',
      'role-instance-2',
    ])
  })
})
