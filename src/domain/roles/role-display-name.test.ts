import { describe, expect, it } from 'vitest'

import { roleInstanceId } from '../identifiers.ts'
import { getRoleInstanceDisplayName } from './role-display-name.ts'
import { ROLE_IDS, findRoleDefinition } from './role-registry.ts'

describe('role instance display name', () => {
  it('uses the registry name and appends only an assigned ordinal', () => {
    const doctor = findRoleDefinition(ROLE_IDS.doctor)

    if (doctor === undefined) {
      throw new Error('Expected Doctor in the role registry.')
    }

    expect(
      getRoleInstanceDisplayName(
        { instanceId: roleInstanceId('doctor-only'), roleId: doctor.id, ordinal: null },
        doctor,
      ),
    ).toBe('Doctor')
    expect(
      getRoleInstanceDisplayName(
        { instanceId: roleInstanceId('doctor-two'), roleId: doctor.id, ordinal: 2 },
        doctor,
      ),
    ).toBe('Doctor 2')
  })
})
