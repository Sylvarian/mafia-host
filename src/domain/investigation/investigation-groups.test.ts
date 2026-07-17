import { describe, expect, it } from 'vitest'

import { roleId } from '../identifiers.ts'
import { ROLE_IDS, ROLE_REGISTRY } from '../roles/role-registry.ts'
import {
  CANONICAL_INVESTIGATION_GROUP_MAPPINGS,
  INVESTIGATION_GROUP_IDS,
  INVESTIGATION_GROUPS,
  resolveInvestigationGroup,
  validateInvestigationGroups,
} from './investigation-groups.ts'

describe('permanent investigation groups', () => {
  it('defines the exact three-or-four-role cards', () => {
    expect(INVESTIGATION_GROUPS.map((group) => ({ id: group.id, roleIds: group.roleIds }))).toEqual(
      [
        {
          id: INVESTIGATION_GROUP_IDS.groupA,
          roleIds: [ROLE_IDS.godfather, ROLE_IDS.doctor, ROLE_IDS.sheriff],
        },
        {
          id: INVESTIGATION_GROUP_IDS.groupB,
          roleIds: [ROLE_IDS.framer, ROLE_IDS.detective, ROLE_IDS.mayor],
        },
        {
          id: INVESTIGATION_GROUP_IDS.groupC,
          roleIds: [ROLE_IDS.consort, ROLE_IDS.investigator, ROLE_IDS.executioner],
        },
        {
          id: INVESTIGATION_GROUP_IDS.groupD,
          roleIds: [ROLE_IDS.consigliere, ROLE_IDS.serialKiller, ROLE_IDS.jester, ROLE_IDS.citizen],
        },
      ],
    )
    expect(INVESTIGATION_GROUPS.slice(0, 3).every((group) => group.roleIds.length === 3)).toBe(true)
    expect(INVESTIGATION_GROUPS[3]?.roleIds).toHaveLength(4)
  })

  it('maps every registered role exactly once through explicit canonical data', () => {
    expect(validateInvestigationGroups()).toEqual({ ok: true, value: true })
    expect(CANONICAL_INVESTIGATION_GROUP_MAPPINGS).toHaveLength(ROLE_REGISTRY.length)

    for (const role of ROLE_REGISTRY) {
      const mappings = CANONICAL_INVESTIGATION_GROUP_MAPPINGS.filter(
        (mapping) => mapping.roleId === role.id,
      )
      expect(mappings, role.name).toHaveLength(1)
      expect(resolveInvestigationGroup(role.id, false).ok, role.name).toBe(true)
    }
  })

  it('is deeply immutable and independent of the selected setup', () => {
    expect(Object.isFrozen(INVESTIGATION_GROUPS)).toBe(true)
    expect(Object.isFrozen(CANONICAL_INVESTIGATION_GROUP_MAPPINGS)).toBe(true)
    for (const group of INVESTIGATION_GROUPS) {
      expect(Object.isFrozen(group)).toBe(true)
      expect(Object.isFrozen(group.roleIds)).toBe(true)
      expect(Object.isFrozen(group.roleDisplayNames)).toBe(true)
    }
    expect(CANONICAL_INVESTIGATION_GROUP_MAPPINGS.every(Object.isFrozen)).toBe(true)

    const citizenResult = resolveInvestigationGroup(ROLE_IDS.citizen, false)
    expect(citizenResult).toMatchObject({
      ok: true,
      value: {
        id: INVESTIGATION_GROUP_IDS.groupD,
        roleIds: [ROLE_IDS.consigliere, ROLE_IDS.serialKiller, ROLE_IDS.jester, ROLE_IDS.citizen],
      },
    })
  })

  it('returns Group A for a framed target and a structured error for an unmapped role', () => {
    expect(resolveInvestigationGroup(ROLE_IDS.serialKiller, true)).toMatchObject({
      ok: true,
      value: { id: INVESTIGATION_GROUP_IDS.groupA },
    })
    expect(resolveInvestigationGroup(roleId('future-role'), false)).toEqual({
      ok: false,
      error: {
        type: 'MISSING_CANONICAL_INVESTIGATION_GROUP',
        roleId: 'future-role',
      },
    })
  })
})
