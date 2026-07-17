import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { buildNightActionSequence } from './night-sequence.ts'

describe('night wake sequence', () => {
  it('builds the exact physical order with Mafia interstitials and stable duplicate ordinals', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather, name: 'Alex' },
      { roleId: ROLE_IDS.doctor, name: 'Alex' },
      { roleId: ROLE_IDS.framer },
      { roleId: ROLE_IDS.consort },
      { roleId: ROLE_IDS.consigliere },
      { roleId: ROLE_IDS.serialKiller },
      { roleId: ROLE_IDS.sheriff },
      { roleId: ROLE_IDS.investigator },
      { roleId: ROLE_IDS.detective },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.mayor },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.jester },
    ])
    const snapshot = JSON.stringify(fixture.game)
    const result = buildNightActionSequence(fixture.game)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a valid sequence.')
    expect(result.value).toEqual([
      { type: 'night-opening' },
      { type: 'mafia-opening', mafiaPlayerIds: ['player-1', 'player-3', 'player-4', 'player-5'] },
      { type: 'actor-action', actorPlayerId: 'player-1', actorRoleInstanceId: 'role-instance-1' },
      { type: 'actor-action', actorPlayerId: 'player-3', actorRoleInstanceId: 'role-instance-3' },
      { type: 'actor-action', actorPlayerId: 'player-4', actorRoleInstanceId: 'role-instance-4' },
      { type: 'actor-action', actorPlayerId: 'player-5', actorRoleInstanceId: 'role-instance-5' },
      { type: 'mafia-closing' },
      { type: 'actor-action', actorPlayerId: 'player-6', actorRoleInstanceId: 'role-instance-6' },
      { type: 'actor-action', actorPlayerId: 'player-2', actorRoleInstanceId: 'role-instance-2' },
      { type: 'actor-action', actorPlayerId: 'player-10', actorRoleInstanceId: 'role-instance-10' },
      { type: 'actor-action', actorPlayerId: 'player-7', actorRoleInstanceId: 'role-instance-7' },
      { type: 'actor-action', actorPlayerId: 'player-8', actorRoleInstanceId: 'role-instance-8' },
      { type: 'actor-action', actorPlayerId: 'player-9', actorRoleInstanceId: 'role-instance-9' },
      { type: 'review' },
    ])
    expect(JSON.stringify(fixture.game)).toBe(snapshot)
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(result.value.every(Object.isFrozen)).toBe(true)
  })

  it('omits dead and no-action roles and includes each living acting role exactly once', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.framer, alive: false },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.doctor, alive: false },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.executioner },
    ])
    const result = buildNightActionSequence(fixture.game)

    if (!result.ok) throw new Error('Expected a valid sequence.')
    const actorSteps = result.value.filter((step) => step.type === 'actor-action')
    expect(actorSteps.map((step) => step.actorPlayerId)).toEqual(['player-1', 'player-3'])
    expect(new Set(actorSteps.map((step) => step.actorRoleInstanceId)).size).toBe(actorSteps.length)
  })

  it('omits misleading Mafia interstitials when no Mafia are alive', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather, alive: false },
      { roleId: ROLE_IDS.citizen },
    ])
    const result = buildNightActionSequence(fixture.game)

    expect(result).toEqual({
      ok: true,
      value: [{ type: 'night-opening' }, { type: 'review' }],
    })
  })

  it('collects non-Mafia actors directly after opening when no Mafia are present', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.citizen },
    ])
    const result = buildNightActionSequence(fixture.game)

    expect(result).toEqual({
      ok: true,
      value: [
        { type: 'night-opening' },
        { type: 'actor-action', actorPlayerId: 'player-1', actorRoleInstanceId: 'role-instance-1' },
        { type: 'actor-action', actorPlayerId: 'player-2', actorRoleInstanceId: 'role-instance-2' },
        { type: 'actor-action', actorPlayerId: 'player-3', actorRoleInstanceId: 'role-instance-3' },
        { type: 'review' },
      ],
    })
  })

  it('moves from opening to review when the setup contains only no-action roles', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.mayor },
      { roleId: ROLE_IDS.jester },
    ])

    expect(buildNightActionSequence(fixture.game)).toEqual({
      ok: true,
      value: [{ type: 'night-opening' }, { type: 'review' }],
    })
  })
})
