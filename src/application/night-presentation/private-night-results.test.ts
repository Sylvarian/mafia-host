import { describe, expect, it } from 'vitest'

import { playerId, roleInstanceId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import {
  createCompleteNightWorkflow,
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { buildPrivateNightResults, createPrivateNightResultId } from './private-night-results.ts'

describe('private night-result construction', () => {
  it('builds stable player-facing results in physical order independent of source arrays', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.consigliere },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.citizen },
      ],
      [6, 6, 0, 0, 6, 0, null],
    )
    const resolution = resolveFixture(fixture)
    const complete = createCompleteNightWorkflow(fixture, [
      'Alex',
      'Blair',
      'Casey',
      'Casey',
      'Devon',
      'Emery',
      'Finley',
    ])
    const result = buildPrivateNightResults(
      { ...fixture.game, phase: 'night-resolution' },
      complete.participants,
      resolution,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected private result queue.')
    expect(result.value.map((entry) => [entry.kind, entry.roleDisplayName])).toEqual([
      ['investigation', 'Consigliere'],
      ['sheriff', 'Sheriff 1'],
      ['sheriff', 'Sheriff 2'],
      ['investigation', 'Investigator'],
      ['detective', 'Detective'],
    ])
    expect(result.value[1]).toMatchObject({
      actorPlayerName: 'Casey',
      showActorStableId: true,
      targetPlayerName: 'Alex',
      status: 'suspicious',
    })
    expect(result.value[0]).toMatchObject({
      kind: 'investigation',
      investigationRole: 'consigliere',
      groupLabel: 'Group D',
      groupRoleDisplayNames: ['Consigliere', 'Serial Killer', 'Jester', 'Citizen'],
    })
    expect(result.value[4]).toMatchObject({
      kind: 'detective',
      status: 'visited-player',
      visitedPlayerName: 'Finley',
    })
    expect(new Set(result.value.map((entry) => entry.id)).size).toBe(result.value.length)
    expect(result.value[1]?.id).not.toBe(result.value[2]?.id)

    for (const entry of result.value) {
      expect(entry).not.toHaveProperty('actualRoleId')
      expect(entry).not.toHaveProperty('faction')
      expect(entry).not.toHaveProperty('framed')
      expect(entry).not.toHaveProperty('attack')
      expect(entry.actorRoleInstanceId).toBeTruthy()
    }

    const reorderedResolution = {
      ...resolution,
      sheriffResults: [...resolution.sheriffResults].reverse(),
      investigationResults: [...resolution.investigationResults].reverse(),
      detectiveResults: [...resolution.detectiveResults].reverse(),
    }
    const reordered = buildPrivateNightResults(
      { ...fixture.game, phase: 'night-resolution' },
      complete.participants,
      reorderedResolution,
    )
    expect(reordered).toEqual(result)
  })

  it('creates no fake result for a blocked investigative actor', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }],
      [1, 2, null],
    )
    const resolution = resolveFixture(fixture)
    const complete = createCompleteNightWorkflow(fixture)

    expect(resolution.sheriffResults).toEqual([])
    expect(
      buildPrivateNightResults(
        { ...fixture.game, phase: 'night-resolution' },
        complete.participants,
        resolution,
      ),
    ).toEqual({ ok: true, value: [] })
  })

  it('represents Detective visited-nobody without an explanation', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.detective }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const resolution = resolveFixture(fixture)
    const complete = createCompleteNightWorkflow(fixture, ['Drew', 'Taylor'])
    const result = buildPrivateNightResults(
      { ...fixture.game, phase: 'night-resolution' },
      complete.participants,
      resolution,
    )

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          kind: 'detective',
          status: 'visited-nobody',
          targetPlayerName: 'Taylor',
        },
      ],
    })
    if (result.ok) {
      expect(result.value[0]).not.toHaveProperty('reason')
      expect(Object.isFrozen(result.value)).toBe(true)
    }
  })

  it('uses unambiguous deterministic identity tuples when IDs contain delimiters', () => {
    const first = createPrivateNightResultId(
      'sheriff',
      2,
      playerId('actor:one'),
      roleInstanceId('instance'),
    )
    const second = createPrivateNightResultId(
      'sheriff',
      2,
      playerId('actor'),
      roleInstanceId('one:instance'),
    )

    expect(first).not.toBe(second)
    expect(
      createPrivateNightResultId('sheriff', 2, playerId('actor:one'), roleInstanceId('instance')),
    ).toBe(first)
    expect(
      createPrivateNightResultId(
        'investigator',
        2,
        playerId('actor:one'),
        roleInstanceId('instance'),
      ),
    ).not.toBe(first)
  })

  it('strips malicious hidden fields and restores canonical investigation-card content', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 3, 3, null],
    )
    const resolution = resolveFixture(fixture)
    const complete = createCompleteNightWorkflow(fixture)
    const maliciousResolution = {
      ...resolution,
      sheriffResults: resolution.sheriffResults.map((result) => ({
        ...result,
        actualRoleId: ROLE_IDS.citizen,
        wasFramed: true,
        wasBlocked: true,
        attackerPlayerId: playerId('hidden-attacker'),
        protectedBy: playerId('hidden-doctor'),
      })),
      investigationResults: resolution.investigationResults.map((result) => ({
        ...result,
        actualRoleId: ROLE_IDS.citizen,
        wasFramed: true,
        group: {
          ...result.group,
          label: 'Actual role: Citizen',
          roleDisplayNames: ['Actual role: Citizen'] as never,
        },
      })),
      detectiveResults: resolution.detectiveResults.map((result) => ({
        ...result,
        actualRoleId: ROLE_IDS.citizen,
        wasBlocked: true,
        attackerPlayerId: playerId('hidden-attacker'),
      })),
    }
    const result = buildPrivateNightResults(
      { ...fixture.game, phase: 'night-resolution' },
      complete.participants,
      maliciousResolution,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected canonical private results.')
    for (const entry of result.value) {
      expect(entry).not.toHaveProperty('actualRoleId')
      expect(entry).not.toHaveProperty('wasFramed')
      expect(entry).not.toHaveProperty('wasBlocked')
      expect(entry).not.toHaveProperty('attackerPlayerId')
      expect(entry).not.toHaveProperty('protectedBy')
    }
    expect(result.value.find((entry) => entry.kind === 'investigation')).toMatchObject({
      groupLabel: 'Group D',
      groupRoleDisplayNames: ['Consigliere', 'Serial Killer', 'Jester', 'Citizen'],
    })
  })

  it('rejects malformed runtime result arrays and discriminants without throwing', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const resolution = resolveFixture(fixture)
    const complete = createCompleteNightWorkflow(fixture)

    expect(
      buildPrivateNightResults(
        { ...fixture.game, phase: 'night-resolution' },
        complete.participants,
        { ...resolution, sheriffResults: null as never },
      ),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-resolution-shape',
      },
    })
    expect(
      buildPrivateNightResults(
        { ...fixture.game, phase: 'night-resolution' },
        complete.participants,
        {
          ...resolution,
          sheriffResults: resolution.sheriffResults.map((result) => ({
            ...result,
            status: 'actual-role' as never,
          })),
        },
      ),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-result',
      },
    })
  })
})
