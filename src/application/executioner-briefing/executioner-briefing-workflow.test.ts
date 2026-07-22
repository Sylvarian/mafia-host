import { describe, expect, it } from 'vitest'

import { gameId, playerId, roleInstanceId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  acknowledgeExecutionerBriefing,
  createExecutionerBriefingId,
  createExecutionerBriefingWorkflow,
  nextExecutionerBriefing,
  previousExecutionerBriefing,
  selectExecutionerBriefingView,
  validateExecutionerBriefingsReadyForCompletion,
  validateExecutionerBriefingWorkflow,
} from './index.ts'

describe('Executioner briefing workflow', () => {
  it('creates one minimal private briefing without target role or full game authority', () => {
    const fixture = createNightFixture(
      [
        {
          roleId: ROLE_IDS.executioner,
          executionerTargetId: playerId('player-2'),
        },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'executioner-briefing', nightNumber: 1 },
    )

    const result = createExecutionerBriefingWorkflow(fixture.game)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected one Executioner briefing.')
    expect(result.value).toMatchObject({
      status: 'briefing',
      gameId: 'night-fixture-game',
      currentBriefingIndex: 0,
      acknowledgedBriefingIds: [],
    })
    expect(result.value.briefings).toHaveLength(1)
    expect(result.value.briefings[0]).toEqual({
      id: createExecutionerBriefingId(fixture.game.id, roleInstanceId('role-instance-1')),
      executionerPlayerId: 'player-1',
      executionerRoleInstanceId: 'role-instance-1',
      executionerOrdinal: null,
      targetPlayerId: 'player-2',
    })
    expect(result.value.briefings[0]).not.toHaveProperty('targetRoleId')
    expect(result.value.briefings[0]).not.toHaveProperty('targetFaction')
    expect(result.value.briefings[0]).not.toHaveProperty('game')
    expect(result.value.briefings[0]).not.toHaveProperty('assignments')
  })

  it('orders duplicate Executioners by ordinal and preserves a shared target independently', () => {
    const fixture = duplicateExecutionerFixture()
    const result = createExecutionerBriefingWorkflow(fixture.game)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected duplicate Executioner briefings.')
    expect(
      result.value.briefings.map((briefing) => [
        briefing.executionerPlayerId,
        briefing.executionerOrdinal,
        briefing.targetPlayerId,
      ]),
    ).toEqual([
      ['player-1', 1, 'player-3'],
      ['player-2', 2, 'player-3'],
    ])
    expect(new Set(result.value.briefings.map((briefing) => briefing.id)).size).toBe(2)
  })

  it('uses collision-safe deterministic tuple IDs for hostile identifier content', () => {
    const first = createExecutionerBriefingId(
      gameId('game|part"],["hostile'),
      roleInstanceId('role|part'),
    )
    const same = createExecutionerBriefingId(
      gameId('game|part"],["hostile'),
      roleInstanceId('role|part'),
    )
    const ambiguousUnderDelimiterConcatenation = createExecutionerBriefingId(
      gameId('game'),
      roleInstanceId('part"],["hostile|role|part'),
    )

    expect(first).toBe(same)
    expect(first).not.toBe(ambiguousUnderDelimiterConcatenation)
    expect(JSON.parse(first)).toEqual([
      'mafia-host-executioner-briefing',
      1,
      'game|part"],["hostile',
      'role|part',
    ])
  })

  it('bounds navigation and requires the current briefing to be acknowledged before next', () => {
    const fixture = duplicateExecutionerFixture()
    const workflow = requireWorkflow(fixture.game)
    const firstBriefing = workflow.briefings[0]
    if (firstBriefing === undefined) throw new Error('Expected the first briefing.')

    expect(previousExecutionerBriefing(fixture.game, workflow)).toEqual({
      ok: false,
      error: { type: 'EXECUTIONER_BRIEFING_NAVIGATION_BOUNDARY', direction: 'previous' },
    })
    expect(nextExecutionerBriefing(fixture.game, workflow)).toEqual({
      ok: false,
      error: {
        type: 'EXECUTIONER_BRIEFING_NOT_ACKNOWLEDGED',
        briefingId: firstBriefing.id,
      },
    })

    const acknowledged = acknowledgeExecutionerBriefing(fixture.game, workflow, firstBriefing.id)
    if (!acknowledged.ok) throw new Error('Expected acknowledgement to succeed.')
    const next = nextExecutionerBriefing(fixture.game, acknowledged.value)
    expect(next.ok).toBe(true)
    if (!next.ok) throw new Error('Expected next briefing navigation.')
    expect(next.value.currentBriefingIndex).toBe(1)

    const previous = previousExecutionerBriefing(fixture.game, next.value)
    expect(previous.ok).toBe(true)
    if (!previous.ok) throw new Error('Expected previous briefing navigation.')
    expect(previous.value.currentBriefingIndex).toBe(0)
    expect(previous.value.acknowledgedBriefingIds).toEqual([firstBriefing.id])
  })

  it('rejects duplicate, unknown, and non-current acknowledgements without inflating progress', () => {
    const fixture = duplicateExecutionerFixture()
    const workflow = requireWorkflow(fixture.game)
    const first = workflow.briefings[0]
    const second = workflow.briefings[1]
    if (first === undefined || second === undefined) throw new Error('Expected two briefings.')
    const acknowledged = acknowledgeExecutionerBriefing(fixture.game, workflow, first.id)
    if (!acknowledged.ok) throw new Error('Expected acknowledgement.')

    expect(acknowledgeExecutionerBriefing(fixture.game, acknowledged.value, first.id)).toEqual({
      ok: false,
      error: {
        type: 'DUPLICATE_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT',
        briefingId: first.id,
      },
    })
    expect(acknowledgeExecutionerBriefing(fixture.game, workflow, second.id)).toEqual({
      ok: false,
      error: {
        type: 'EXECUTIONER_BRIEFING_NOT_CURRENT',
        briefingId: second.id,
        currentBriefingId: first.id,
      },
    })
    const unknownId = createExecutionerBriefingId(
      fixture.game.id,
      roleInstanceId('unknown-role-instance'),
    )
    expect(acknowledgeExecutionerBriefing(fixture.game, workflow, unknownId)).toEqual({
      ok: false,
      error: {
        type: 'UNKNOWN_EXECUTIONER_BRIEFING_ID',
        briefingId: unknownId,
      },
    })
    expect(acknowledged.value.acknowledgedBriefingIds).toHaveLength(1)
  })

  it('derives completion readiness from acknowledgements and rejects legacy status flags', () => {
    const fixture = duplicateExecutionerFixture()
    const workflow = requireWorkflow(fixture.game)
    const first = workflow.briefings[0]
    const second = workflow.briefings[1]
    if (first === undefined || second === undefined) throw new Error('Expected two briefings.')

    expect(validateExecutionerBriefingsReadyForCompletion(fixture.game, workflow)).toEqual({
      ok: false,
      error: { type: 'INCOMPLETE_EXECUTIONER_BRIEFINGS' },
    })
    expect(
      validateExecutionerBriefingWorkflow(
        fixture.game,
        { ...workflow, status: 'ready' },
        'complete',
      ),
    ).toEqual({
      ok: false,
      error: { type: 'INVALID_EXECUTIONER_BRIEFING_WORKFLOW', operation: 'complete' },
    })

    const firstAcknowledged = acknowledgeExecutionerBriefing(fixture.game, workflow, first.id)
    if (!firstAcknowledged.ok) throw new Error('Expected the first acknowledgement.')
    const next = nextExecutionerBriefing(fixture.game, firstAcknowledged.value)
    if (!next.ok) throw new Error('Expected the second briefing.')
    const ready = acknowledgeExecutionerBriefing(fixture.game, next.value, second.id)
    if (!ready.ok) throw new Error('Expected the final acknowledgement to succeed.')
    expect(ready.value.status).toBe('briefing')

    expect(validateExecutionerBriefingsReadyForCompletion(fixture.game, ready.value)).toEqual({
      ok: true,
      value: true,
    })
    expect(ready.value.acknowledgedBriefingIds).toHaveLength(ready.value.briefings.length)
    expect(fixture.game.executionerBriefingStatus).toBe('pending')
  })

  it('rejects malformed canonical records, acknowledgements, and indexes', () => {
    const fixture = duplicateExecutionerFixture()
    const workflow = requireWorkflow(fixture.game)
    const first = workflow.briefings[0]
    const second = workflow.briefings[1]
    if (first === undefined || second === undefined) throw new Error('Expected two briefings.')

    expect(
      validateExecutionerBriefingWorkflow(
        fixture.game,
        {
          ...workflow,
          briefings: [{ ...first, targetRoleId: ROLE_IDS.citizen }, second],
        },
        'acknowledge',
      ),
    ).toEqual({
      ok: false,
      error: { type: 'INVALID_EXECUTIONER_BRIEFING_RECORD', briefingId: first.id },
    })
    expect(
      validateExecutionerBriefingWorkflow(
        fixture.game,
        { ...workflow, acknowledgedBriefingIds: [first.id, first.id] },
        'acknowledge',
      ),
    ).toEqual({
      ok: false,
      error: {
        type: 'DUPLICATE_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT',
        briefingId: first.id,
      },
    })
    expect(
      validateExecutionerBriefingWorkflow(
        fixture.game,
        { ...workflow, currentBriefingIndex: 2 },
        'next',
      ),
    ).toEqual({
      ok: false,
      error: {
        type: 'EXECUTIONER_BRIEFING_INDEX_OUT_OF_RANGE',
        currentBriefingIndex: 2,
        briefingCount: 2,
      },
    })
  })

  it('derives duplicate-name labels without persisting names or target roles', () => {
    const fixture = duplicateExecutionerFixture()
    const workflow = requireWorkflow(fixture.game)
    const view = selectExecutionerBriefingView(fixture.game, fixture.participants, workflow)

    expect(view.currentBriefing).toMatchObject({
      executionerDisplayLabel: 'Alex (Player 1)',
      executionerRoleDisplayName: 'Executioner 1',
      targetDisplayLabel: 'Alex (Player 3)',
    })
    expect(view.currentBriefing).not.toHaveProperty('executionerPlayerId')
    expect(view.currentBriefing).not.toHaveProperty('targetPlayerId')
    expect(JSON.stringify(workflow)).not.toContain('"Alex"')
    expect(JSON.stringify(workflow)).not.toContain('citizen')
  })

  it('supports frozen inputs and returns deeply frozen workflow values', () => {
    const fixture = duplicateExecutionerFixture()
    deepFreeze(fixture.game)

    const result = createExecutionerBriefingWorkflow(fixture.game)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected frozen game input support.')
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.briefings)).toBe(true)
    expect(Object.isFrozen(result.value.briefings[0])).toBe(true)
    expect(Object.isFrozen(result.value.acknowledgedBriefingIds)).toBe(true)
  })

  it('does not create an empty workflow and rejects the wrong phase explicitly', () => {
    const noExecutioner = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection', nightNumber: 1 },
    )
    expect(
      createExecutionerBriefingWorkflow({
        ...noExecutioner.game,
        phase: 'executioner-briefing',
        executionerBriefingStatus: 'pending',
      }),
    ).toEqual({ ok: false, error: { type: 'NO_EXECUTIONERS_FOR_BRIEFING' } })

    const fixture = duplicateExecutionerFixture()
    expect(
      createExecutionerBriefingWorkflow({
        ...fixture.game,
        phase: 'night-action-collection',
        executionerBriefingStatus: 'completed',
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'EXECUTIONER_BRIEFING_PHASE_MISMATCH',
        currentPhase: 'night-action-collection',
      },
    })
  })
})

function duplicateExecutionerFixture() {
  return createNightFixture(
    [
      {
        roleId: ROLE_IDS.executioner,
        name: 'Alex',
        executionerTargetId: playerId('player-3'),
      },
      {
        roleId: ROLE_IDS.executioner,
        name: 'Alex',
        executionerTargetId: playerId('player-3'),
      },
      { roleId: ROLE_IDS.citizen, name: 'Alex' },
      { roleId: ROLE_IDS.godfather, name: 'Casey' },
    ],
    { phase: 'executioner-briefing', nightNumber: 1 },
  )
}

function requireWorkflow(game: ReturnType<typeof duplicateExecutionerFixture>['game']) {
  const result = createExecutionerBriefingWorkflow(game)
  if (!result.ok) {
    throw new Error(`Expected briefing workflow: ${JSON.stringify(result.error)}`)
  }
  return result.value
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  for (const child of Object.values(value)) deepFreeze(child)
  Object.freeze(value)
}
