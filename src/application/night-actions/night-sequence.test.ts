import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { buildNightActionSequence } from './night-sequence.ts'

describe('night wake sequence', () => {
  it('builds the exact physical order with Mafia interstitials and stable duplicate ordinals', () => {
    const fixture = createNightFixture(
      [
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
      ],
      { nightNumber: 1, settings: { allowFirstNightKills: true } },
    )
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
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.framer, alive: false },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.doctor, alive: false },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.executioner },
      ],
      { nightNumber: 1, settings: { allowFirstNightKills: true } },
    )
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

  it.each([
    ['one Godfather', [ROLE_IDS.godfather]],
    ['multiple Godfathers', [ROLE_IDS.godfather, ROLE_IDS.godfather]],
    ['one Serial Killer', [ROLE_IDS.serialKiller]],
    ['multiple Serial Killers', [ROLE_IDS.serialKiller, ROLE_IDS.serialKiller]],
    [
      'both killing role types',
      [ROLE_IDS.godfather, ROLE_IDS.godfather, ROLE_IDS.serialKiller, ROLE_IDS.serialKiller],
    ],
  ])('omits %s from a disabled first-night action sequence', (_label, roleIds) => {
    const fixture = createNightFixture(
      [...roleIds.map((roleId) => ({ roleId })), { roleId: ROLE_IDS.citizen }],
      { nightNumber: 1 },
    )
    const result = buildNightActionSequence(fixture.game)

    if (!result.ok) throw new Error('Expected a valid first-night sequence.')
    expect(selectActorRoleIds(fixture, result.value)).toEqual([])
  })

  it('keeps the Godfather in the Mafia overview while every non-killing role still acts', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consigliere },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.detective },
      ],
      { nightNumber: 1 },
    )
    const result = buildNightActionSequence(fixture.game)

    if (!result.ok) throw new Error('Expected a valid first-night sequence.')
    expect(result.value.find((step) => step.type === 'mafia-opening')).toEqual({
      type: 'mafia-opening',
      mafiaPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4'],
    })
    expect(selectActorRoleIds(fixture, result.value)).toEqual([
      ROLE_IDS.framer,
      ROLE_IDS.consort,
      ROLE_IDS.consigliere,
      ROLE_IDS.doctor,
      ROLE_IDS.sheriff,
      ROLE_IDS.investigator,
      ROLE_IDS.detective,
    ])
  })

  it.each([
    ['enabled first night', 1, true],
    ['disabled second night', 2, false],
    ['enabled second night', 2, true],
  ])('collects both killing roles on an %s', (_label, nightNumber, allowFirstNightKills) => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
      { nightNumber, settings: { allowFirstNightKills } },
    )
    const result = buildNightActionSequence(fixture.game)

    if (!result.ok) throw new Error('Expected a valid killing-role sequence.')
    expect(selectActorRoleIds(fixture, result.value)).toEqual([
      ROLE_IDS.godfather,
      ROLE_IDS.serialKiller,
    ])
  })
})

function selectActorRoleIds(
  fixture: ReturnType<typeof createNightFixture>,
  steps: readonly Readonly<{ type: string; actorPlayerId?: string }>[],
) {
  return steps.flatMap((step) => {
    if (step.type !== 'actor-action' || step.actorPlayerId === undefined) {
      return []
    }

    const actor = fixture.game.players.find((player) => player.playerId === step.actorPlayerId)
    return actor === undefined ? [] : [actor.role.roleId]
  })
}
