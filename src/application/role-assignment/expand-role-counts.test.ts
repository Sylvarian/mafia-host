import { describe, expect, it } from 'vitest'

import { roleId, roleInstanceId, type GameId, type RoleInstanceId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { SequentialRoleAssignmentIdentitySource } from '../../../tests/support/sequential-role-assignment-identity-source.ts'

import type { RoleAssignmentIdentitySource } from './identity-source.ts'
import { expandRoleCounts } from './expand-role-counts.ts'

describe('role-count expansion', () => {
  it('omits zero counts and creates every selected copy with a unique identity', () => {
    const roleCounts = [
      { roleId: ROLE_IDS.godfather, count: 1 },
      { roleId: ROLE_IDS.doctor, count: 3 },
      { roleId: ROLE_IDS.citizen, count: 0 },
    ] as const
    const snapshot = JSON.stringify(roleCounts)
    const result = expandRoleCounts(roleCounts, 4, new SequentialRoleAssignmentIdentitySource())

    expect(result).toEqual({
      ok: true,
      value: [
        { instanceId: 'role-instance-1', roleId: ROLE_IDS.godfather, ordinal: null },
        { instanceId: 'role-instance-2', roleId: ROLE_IDS.doctor, ordinal: null },
        { instanceId: 'role-instance-3', roleId: ROLE_IDS.doctor, ordinal: null },
        { instanceId: 'role-instance-4', roleId: ROLE_IDS.doctor, ordinal: null },
      ],
    })
    expect(JSON.stringify(roleCounts)).toBe(snapshot)
  })

  it('rejects unknown roles, duplicate entries, malformed counts, and total mismatch', () => {
    const identitySource = new SequentialRoleAssignmentIdentitySource()
    const unknownRoleId = roleId('unknown')

    expect(expandRoleCounts([{ roleId: unknownRoleId, count: 1 }], 1, identitySource)).toEqual({
      ok: false,
      error: { type: 'UNKNOWN_ROLE', roleId: unknownRoleId },
    })
    expect(
      expandRoleCounts(
        [
          { roleId: ROLE_IDS.doctor, count: 1 },
          { roleId: ROLE_IDS.doctor, count: 1 },
        ],
        2,
        identitySource,
      ),
    ).toEqual({
      ok: false,
      error: { type: 'DUPLICATE_ROLE_COUNT', roleId: ROLE_IDS.doctor },
    })

    for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(expandRoleCounts([{ roleId: ROLE_IDS.doctor, count }], 1, identitySource)).toEqual({
        ok: false,
        error: { type: 'INVALID_ROLE_COUNT', roleId: ROLE_IDS.doctor, count },
      })
    }

    expect(expandRoleCounts([{ roleId: ROLE_IDS.doctor, count: 1 }], 2, identitySource)).toEqual({
      ok: false,
      error: {
        type: 'ASSIGNMENT_COUNT_MISMATCH',
        participatingPlayerCount: 2,
        roleInstanceCount: 1,
      },
    })
  })

  it('fails explicitly when an identity source collides', () => {
    const duplicateId = roleInstanceId('duplicate-role-instance')
    const identitySource: RoleAssignmentIdentitySource = {
      nextGameId(): GameId {
        throw new Error('A game ID is not needed during expansion.')
      },
      nextRoleInstanceId(): RoleInstanceId {
        return duplicateId
      },
    }

    expect(expandRoleCounts([{ roleId: ROLE_IDS.doctor, count: 2 }], 2, identitySource)).toEqual({
      ok: false,
      error: {
        type: 'IDENTIFIER_COLLISION',
        identityKind: 'role-instance',
        id: duplicateId,
      },
    })
  })
})
