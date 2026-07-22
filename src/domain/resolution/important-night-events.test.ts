import { describe, expect, it } from 'vitest'

import {
  createResolutionFixture,
  resolveFixture,
  type ResolutionFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { playerId, roleInstanceId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { applyResolvedNight, beginNightResolution } from './night-application.ts'
import {
  buildImportantNightEvents,
  captureImportantNightEventCanonicalSource,
  validateImportantNightEvents,
} from './important-night-events.ts'

function applyFixture(fixture: ResolutionFixture) {
  const resolution = resolveFixture(fixture)
  const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
  if (!begun.ok) throw new Error(`Could not begin resolution: ${begun.error.type}`)
  const applied = applyResolvedNight(begun.value, resolution, fixture.collectedActions)
  if (!applied.ok) throw new Error(`Could not apply resolution: ${applied.error.type}`)
  return {
    game: applied.value.game,
    resolution,
    canonicalSource: captureImportantNightEventCanonicalSource(
      fixture.game,
      fixture.collectedActions,
    ),
  }
}

describe('important night-event evidence', () => {
  it('records every exact Doctor whose protection prevented an otherwise-lethal attack', () => {
    const applied = applyFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.citizen },
        ],
        [4, 4, 4, 4, null],
      ),
    )

    const evidence = buildImportantNightEvents(applied.resolution, applied.canonicalSource)
    expect(evidence.events).toContainEqual({
      kind: 'attack',
      attackerPlayerId: 'player-1',
      attackerRoleId: ROLE_IDS.godfather,
      attackerRoleInstanceId: 'role-instance-1',
      targetPlayerId: 'player-5',
      outcome: 'protected',
      doctors: [
        { doctorPlayerId: 'player-2', doctorRoleInstanceId: 'role-instance-2' },
        { doctorPlayerId: 'player-3', doctorRoleInstanceId: 'role-instance-3' },
      ],
    })
    expect(validateImportantNightEvents(applied.game, evidence)).toEqual({
      ok: true,
      value: evidence,
    })
  })

  it('does not fabricate Doctor-save evidence for a blocked Doctor', () => {
    const applied = applyFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 2, 3, null, null],
      ),
    )

    const evidence = buildImportantNightEvents(applied.resolution, applied.canonicalSource)
    expect(evidence.events).toContainEqual(
      expect.objectContaining({
        kind: 'role-block',
        consortPlayerId: 'player-2',
        targetPlayerId: 'player-3',
        outcome: 'blocked-target',
      }),
    )
    expect(evidence.events).toContainEqual(
      expect.objectContaining({
        kind: 'attack',
        targetPlayerId: 'player-4',
        outcome: 'lethal',
        doctors: [],
      }),
    )
    expect(evidence.events).not.toContainEqual(expect.objectContaining({ outcome: 'protected' }))
    expect(validateImportantNightEvents(applied.game, evidence).ok).toBe(true)
  })

  it('rejects duplicate and outcome-forged evidence', () => {
    const applied = applyFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.citizen },
        ],
        [1, 2, null],
      ),
    )
    const evidence = buildImportantNightEvents(applied.resolution, applied.canonicalSource)
    const first = evidence.events[0]
    if (first === undefined) throw new Error('Expected attack evidence.')

    expect(
      validateImportantNightEvents(applied.game, {
        ...evidence,
        events: [...evidence.events, first],
      }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'duplicate-event' },
    })
    expect(
      validateImportantNightEvents(applied.game, {
        ...evidence,
        events: evidence.events.map((event, index) =>
          index === 0 && event.kind === 'attack'
            ? { ...event, outcome: 'lethal', doctors: [] }
            : event,
        ),
      }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'outcome-mismatch' },
    })
  })

  it('rejects omitted complete events and a Doctor who protected a different target', () => {
    const applied = applyFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.doctor },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
        ],
        [3, 3, 4, null, null],
      ),
    )
    const evidence = buildImportantNightEvents(applied.resolution, applied.canonicalSource)

    expect(
      validateImportantNightEvents(applied.game, {
        ...evidence,
        events: [],
      }),
    ).toMatchObject({ ok: false, error: { reason: 'coverage-mismatch' } })

    expect(
      validateImportantNightEvents(applied.game, {
        ...evidence,
        events: evidence.events.map((event) =>
          event.kind === 'attack' && event.outcome === 'protected'
            ? {
                ...event,
                doctors: [
                  {
                    doctorPlayerId: playerId('player-3'),
                    doctorRoleInstanceId: roleInstanceId('role-instance-3'),
                  },
                ],
              }
            : event,
        ),
      }),
    ).toMatchObject({ ok: false, error: { reason: 'coverage-mismatch' } })
  })

  it('rejects fabricated role-block and frame targets that differ from confirmed actions', () => {
    const applied = applyFixture(
      createResolutionFixture(
        [
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.citizen },
        ],
        [2, 2, 0, null],
      ),
    )
    const evidence = buildImportantNightEvents(applied.resolution, applied.canonicalSource)

    for (const forgedKind of ['role-block', 'frame'] as const) {
      const forgedEvents = evidence.events.map((event) =>
        event.kind === forgedKind
          ? event.kind === 'role-block'
            ? {
                ...event,
                targetPlayerId: playerId('player-4'),
                targetRoleInstanceId: roleInstanceId('role-instance-4'),
              }
            : { ...event, targetPlayerId: playerId('player-4') }
          : event,
      )
      expect(
        validateImportantNightEvents(applied.game, {
          ...evidence,
          events: forgedEvents,
        }),
      ).toMatchObject({ ok: false, error: { reason: 'coverage-mismatch' } })
    }
  })
})
