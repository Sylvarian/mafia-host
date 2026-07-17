import { describe, expect, it } from 'vitest'

import { playerId, roleInstanceId } from '../identifiers.ts'
import { ROLE_IDS } from './role-registry.ts'
import { assignDuplicateRoleOrdinals, type PlayerRoleAssignment } from './role-assignment.ts'

describe('duplicate role ordinals', () => {
  it('keeps a single role copy unnumbered', () => {
    const result = assignDuplicateRoleOrdinals([
      assignment('alice', 'doctor-instance', ROLE_IDS.doctor),
    ])

    expect(result).toEqual({
      ok: true,
      value: [
        {
          playerId: 'alice',
          role: { instanceId: 'doctor-instance', roleId: ROLE_IDS.doctor, ordinal: null },
        },
      ],
    })
  })

  it('numbers duplicate roles independently in participating roster order', () => {
    const input = [
      assignment('alex-1', 'doctor-a', ROLE_IDS.doctor),
      assignment('ben', 'citizen-a', ROLE_IDS.citizen),
      assignment('alex-2', 'doctor-b', ROLE_IDS.doctor),
      assignment('casey', 'citizen-b', ROLE_IDS.citizen),
    ]
    const snapshot = JSON.stringify(input)
    const result = assignDuplicateRoleOrdinals(input)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected ordinal assignment to succeed.')
    }

    expect(result.value.map(({ playerId: id, role }) => [id, role.ordinal])).toEqual([
      ['alex-1', 1],
      ['ben', 1],
      ['alex-2', 2],
      ['casey', 2],
    ])
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(result.value).not.toBe(input)
  })

  it('rejects duplicate player and role-instance assignments explicitly', () => {
    const first = assignment('alice', 'doctor-a', ROLE_IDS.doctor)

    expect(
      assignDuplicateRoleOrdinals([
        first,
        { ...assignment('bob', 'doctor-b', ROLE_IDS.doctor), playerId: first.playerId },
      ]),
    ).toEqual({
      ok: false,
      error: { type: 'DUPLICATE_PLAYER_ASSIGNMENT', playerId: first.playerId },
    })
    expect(
      assignDuplicateRoleOrdinals([
        first,
        {
          ...assignment('bob', 'doctor-b', ROLE_IDS.doctor),
          role: { ...first.role },
        },
      ]),
    ).toEqual({
      ok: false,
      error: {
        type: 'DUPLICATE_ROLE_INSTANCE_ASSIGNMENT',
        roleInstanceId: first.role.instanceId,
      },
    })
  })
})

function assignment(
  player: string,
  instance: string,
  roleId: PlayerRoleAssignment['role']['roleId'],
): PlayerRoleAssignment {
  return {
    playerId: playerId(player),
    role: { instanceId: roleInstanceId(instance), roleId, ordinal: null },
  }
}
