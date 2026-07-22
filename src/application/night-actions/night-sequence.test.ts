import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { buildNightActionSequence } from './night-sequence.ts'

describe('sequential night wake order', () => {
  it('uses the canonical global role order regardless of roster role order', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.consigliere },
      ],
      {
        phase: 'night-action-collection',
        nightNumber: 2,
        settings: { allowFirstNightKills: true },
      },
    )

    const result = buildNightActionSequence(fixture.game)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a canonical sequence.')

    expect(result.value[0]).toMatchObject({
      type: 'mafia-overview',
      mafiaPlayerIds: ['player-2', 'player-4', 'player-6', 'player-9'],
    })
    expect(
      result.value.slice(1).map((step) => {
        if (step.type !== 'actor-action') throw new Error('Expected an actor step.')
        return fixture.game.players.find(
          (player) => player.role.instanceId === step.actorRoleInstanceId,
        )?.role.roleId
      }),
    ).toEqual([
      ROLE_IDS.consort,
      ROLE_IDS.framer,
      ROLE_IDS.godfather,
      ROLE_IDS.consigliere,
      ROLE_IDS.serialKiller,
      ROLE_IDS.doctor,
      ROLE_IDS.sheriff,
      ROLE_IDS.investigator,
      ROLE_IDS.detective,
    ])
  })

  it('orders duplicate role instances by ordinal with roster order as the stable tie-breaker', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )

    const result = buildNightActionSequence(fixture.game)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a duplicate-role sequence.')

    expect(
      result.value.flatMap((step) => (step.type === 'actor-action' ? [step.actorPlayerId] : [])),
    ).toEqual(['player-2', 'player-4', 'player-1', 'player-3'])
  })

  it('omits Doctor, Godfather, and Serial Killer on a disabled first night', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.consigliere },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.consort },
      ],
      {
        phase: 'night-action-collection',
        nightNumber: 1,
        settings: { allowFirstNightKills: false },
      },
    )

    const result = buildNightActionSequence(fixture.game)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a first-night sequence.')

    expect(result.value[0]).toEqual({
      type: 'mafia-overview',
      mafiaPlayerIds: ['player-1', 'player-4', 'player-6', 'player-9'],
    })
    expect(
      result.value.flatMap((step) => (step.type === 'actor-action' ? [step.actorPlayerId] : [])),
    ).toEqual(['player-9', 'player-6', 'player-4', 'player-5', 'player-7', 'player-8'])
  })

  it.each([
    ['Doctor', ROLE_IDS.doctor],
    ['Godfather', ROLE_IDS.godfather],
    ['Serial Killer', ROLE_IDS.serialKiller],
  ] as const)('omits a living %s without disturbing unaffected role order', (_name, roleId) => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.detective },
        { roleId },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.sheriff },
      ],
      {
        phase: 'night-action-collection',
        nightNumber: 1,
        settings: { allowFirstNightKills: false },
      },
    )

    const result = buildNightActionSequence(fixture.game)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a first-night sequence.')

    expect(
      result.value.flatMap((step) => (step.type === 'actor-action' ? [step.actorPlayerId] : [])),
    ).toEqual(['player-3', 'player-4', 'player-1'])
  })

  it.each([
    ['enabled Night 1', 1, true],
    ['Night 2 with first-night kills disabled', 2, false],
  ] as const)('includes all three roles on %s', (_name, nightNumber, allowFirstNightKills) => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
      {
        phase: 'night-action-collection',
        nightNumber,
        settings: { allowFirstNightKills },
      },
    )

    const result = buildNightActionSequence(fixture.game)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected an active-role sequence.')

    expect(
      result.value.flatMap((step) => (step.type === 'actor-action' ? [step.actorPlayerId] : [])),
    ).toEqual(['player-2', 'player-3', 'player-1'])
  })

  it('excludes dead actors and never orders by display name', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.doctor, name: 'Zulu' },
        { roleId: ROLE_IDS.doctor, name: 'Alpha' },
        { roleId: ROLE_IDS.sheriff, alive: false },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )

    const result = buildNightActionSequence(fixture.game)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a living-actor sequence.')

    expect(
      result.value.flatMap((step) => (step.type === 'actor-action' ? [step.actorPlayerId] : [])),
    ).toEqual(['player-1', 'player-2'])
  })
})
