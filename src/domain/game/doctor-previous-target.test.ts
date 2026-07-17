import { describe, expect, it } from 'vitest'

import { playerId, roleInstanceId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { validateGameState } from './game-invariants.ts'

describe('Doctor previous-target invariants', () => {
  it('copies, strips unknown fields, orders, and freezes valid history', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.doctor }],
      { phase: 'night-action-collection', nightNumber: 3 },
    )
    const result = validateGameState({
      ...fixture.game,
      doctorPreviousTargets: [
        {
          doctorRoleInstanceId: fixture.game.players[0]?.role.instanceId,
          targetPlayerId: playerId('player-2'),
          nightNumber: 2,
          ignored: 'not-canonical',
        },
        {
          doctorRoleInstanceId: fixture.game.players[2]?.role.instanceId,
          targetPlayerId: playerId('player-2'),
          nightNumber: 3,
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected valid Doctor history.')
    expect(result.value.doctorPreviousTargets).toEqual([
      {
        doctorRoleInstanceId: fixture.game.players[0]?.role.instanceId,
        targetPlayerId: playerId('player-2'),
        nightNumber: 2,
      },
      {
        doctorRoleInstanceId: fixture.game.players[2]?.role.instanceId,
        targetPlayerId: playerId('player-2'),
        nightNumber: 3,
      },
    ])
    expect(Object.isFrozen(result.value.doctorPreviousTargets)).toBe(true)
    expect(Object.isFrozen(result.value.doctorPreviousTargets[0])).toBe(true)
  })

  it('rejects non-array and malformed runtime history values', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      { nightNumber: 1 },
    )

    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: null,
      }),
    ).toEqual({
      ok: false,
      error: { type: 'INVALID_DOCTOR_HISTORY', value: null },
    })
    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: [
          {
            doctorRoleInstanceId: fixture.game.players[0]?.role.instanceId,
            targetPlayerId: playerId('player-2'),
            nightNumber: 'one',
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_DOCTOR_HISTORY_ENTRY',
        field: 'nightNumber',
      },
    })
  })

  it('rejects unknown, non-Doctor, unknown-target, duplicate, future, and reordered entries', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.doctor }],
      { nightNumber: 2 },
    )
    const firstDoctor = fixture.game.players[0]
    const citizen = fixture.game.players[1]
    const secondDoctor = fixture.game.players[2]
    if (firstDoctor === undefined || citizen === undefined || secondDoctor === undefined) {
      throw new Error('Expected complete Doctor fixture.')
    }
    const validFirst = {
      doctorRoleInstanceId: firstDoctor.role.instanceId,
      targetPlayerId: citizen.playerId,
      nightNumber: 1,
    }

    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: [
          {
            ...validFirst,
            doctorRoleInstanceId: roleInstanceId('unknown-role-instance'),
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'UNKNOWN_DOCTOR_ROLE_INSTANCE' },
    })
    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: [
          {
            ...validFirst,
            doctorRoleInstanceId: citizen.role.instanceId,
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'NON_DOCTOR_HISTORY_ENTRY' },
    })
    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: [{ ...validFirst, targetPlayerId: playerId('unknown-player') }],
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'UNKNOWN_DOCTOR_TARGET' },
    })
    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: [validFirst, validFirst],
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'DUPLICATE_DOCTOR_HISTORY' },
    })
    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: [{ ...validFirst, nightNumber: 3 }],
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_DOCTOR_HISTORY_NIGHT' },
    })
    expect(
      validateGameState({
        ...fixture.game,
        doctorPreviousTargets: [
          {
            doctorRoleInstanceId: secondDoctor.role.instanceId,
            targetPlayerId: citizen.playerId,
            nightNumber: 1,
          },
          validFirst,
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'DOCTOR_HISTORY_ORDER_MISMATCH' },
    })
  })
})
