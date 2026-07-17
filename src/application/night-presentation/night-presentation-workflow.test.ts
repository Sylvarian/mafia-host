import { describe, expect, it } from 'vitest'

import { gameId, playerId } from '@/domain/identifiers.ts'
import { createSubmittedNightAction } from '@/domain/night-actions/night-action.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { selectDoctorPreviousTargetsForNight } from '../night-actions/night-action-workflow.ts'
import {
  createCompleteNightWorkflow,
  createResolutionFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import {
  acknowledgePrivateNightResult,
  beginNightResultPresentation,
  nextPrivateNightResult,
  prepareDawnAnnouncement,
  previousPrivateNightResult,
  type NightPresentationWorkflow,
} from './night-presentation-workflow.ts'
import type { PrivateNightResultId } from './private-night-results.ts'
import {
  selectDawnAnnouncementView,
  selectNightPresentationView,
} from './night-presentation-selectors.ts'

function expectPrivateResults(
  workflow: NightPresentationWorkflow,
): asserts workflow is Extract<NightPresentationWorkflow, Readonly<{ status: 'private-results' }>> {
  expect(workflow.status).toBe('private-results')
  if (workflow.status !== 'private-results') {
    throw new Error('Expected private-results workflow.')
  }
}

describe('night presentation workflow', () => {
  it('resolves a complete night once, enters night-resolution, and preserves alive state', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }],
      [2, 0, null],
    )
    const complete = createCompleteNightWorkflow(fixture)
    const original = JSON.stringify(complete)
    const result = beginNightResultPresentation(complete)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected presentation workflow.')
    expectPrivateResults(result.value)
    expect(result.value.game.phase).toBe('night-resolution')
    expect(result.value.game.players.every((player) => player.alive)).toBe(true)
    expect(result.value.results).toHaveLength(1)
    expect(result.value.resolution.provisionalDeaths).toHaveLength(1)
    expect(result.value.currentResultIndex).toBe(0)
    expect(result.value.acknowledgedResultIds).toEqual([])
    expect(JSON.stringify(complete)).toBe(original)
  })

  it('rejects incomplete, wrong-game, wrong-night, and wrong-phase starts', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const complete = createCompleteNightWorkflow(fixture)

    expect(
      beginNightResultPresentation({
        status: 'reviewing',
        game: complete.game,
        participants: complete.participants,
        steps: complete.steps,
        submittedActions: complete.collectedActions.actions,
        previousTargets: complete.previousTargets,
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'NIGHT_ACTION_WORKFLOW_NOT_COMPLETE' },
    })
    expect(
      beginNightResultPresentation({
        ...complete,
        collectedActions: {
          ...complete.collectedActions,
          gameId: gameId('other-game'),
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'NIGHT_RESOLUTION_GAME_ID_MISMATCH' },
    })
    expect(
      beginNightResultPresentation({
        ...complete,
        collectedActions: {
          ...complete.collectedActions,
          nightNumber: complete.game.nightNumber + 1,
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'NIGHT_RESOLUTION_NIGHT_NUMBER_MISMATCH' },
    })
    expect(
      beginNightResultPresentation({
        ...complete,
        game: { ...complete.game, phase: 'dawn-announcement' },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_NIGHT_RESOLUTION_PHASE',
        currentPhase: 'dawn-announcement',
      },
    })
  })

  it('supports bounded previous/next navigation and stores acknowledgements once', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 3, 3, null],
    )
    const begun = beginNightResultPresentation(createCompleteNightWorkflow(fixture))
    if (!begun.ok) throw new Error('Expected presentation workflow.')
    expectPrivateResults(begun.value)
    const original = begun.value
    const firstResult = original.results[0]
    if (firstResult === undefined) throw new Error('Expected first result.')

    expect(previousPrivateNightResult(original)).toMatchObject({
      ok: false,
      error: {
        type: 'PRIVATE_RESULT_NAVIGATION_BOUNDARY',
        direction: 'previous',
      },
    })
    expect(nextPrivateNightResult(original)).toMatchObject({
      ok: false,
      error: { type: 'PRIVATE_RESULT_NOT_ACKNOWLEDGED' },
    })
    expect(nextPrivateNightResult({ ...original, currentResultIndex: 99 })).toEqual({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-current-index',
      },
    })
    expect(prepareDawnAnnouncement(original)).toEqual({
      ok: false,
      error: { type: 'PRIVATE_RESULTS_INCOMPLETE' },
    })
    expect(
      acknowledgePrivateNightResult(original, 'unknown-result' as PrivateNightResultId),
    ).toMatchObject({
      ok: false,
      error: { type: 'UNKNOWN_PRIVATE_RESULT_ACKNOWLEDGEMENT' },
    })
    expect(
      nextPrivateNightResult({
        ...original,
        acknowledgedResultIds: ['unknown-result' as PrivateNightResultId],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      },
    })
    expect(
      nextPrivateNightResult({
        ...original,
        acknowledgedResultIds: [firstResult.id, firstResult.id],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      },
    })

    const firstAcknowledged = acknowledgePrivateNightResult(original, firstResult.id)
    if (!firstAcknowledged.ok) throw new Error('Expected acknowledgement.')
    expectPrivateResults(firstAcknowledged.value)
    expect(firstAcknowledged.value.currentResultIndex).toBe(1)
    expect(firstAcknowledged.value.acknowledgedResultIds).toEqual([firstResult.id])
    expect(original.acknowledgedResultIds).toEqual([])
    expect(original.currentResultIndex).toBe(0)

    const revisited = previousPrivateNightResult(firstAcknowledged.value)
    if (!revisited.ok) throw new Error('Expected previous navigation.')
    expectPrivateResults(revisited.value)
    expect(revisited.value.currentResultIndex).toBe(0)
    expect(revisited.value.acknowledgedResultIds).toEqual([firstResult.id])
    expect(acknowledgePrivateNightResult(revisited.value, firstResult.id)).toMatchObject({
      ok: false,
      error: { type: 'DUPLICATE_PRIVATE_RESULT_ACKNOWLEDGEMENT' },
    })

    const next = nextPrivateNightResult(revisited.value)
    if (!next.ok) throw new Error('Expected next navigation.')
    expectPrivateResults(next.value)
    expect(next.value.currentResultIndex).toBe(1)
  })

  it('moves an empty queue directly to ready-for-dawn and applies exactly once', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      [1, null],
      { settings: { revealRoleOnDeath: true } },
    )
    const begun = beginNightResultPresentation(createCompleteNightWorkflow(fixture))

    expect(begun.ok).toBe(true)
    if (!begun.ok) throw new Error('Expected ready-for-Dawn workflow.')
    expect(begun.value.status).toBe('ready-for-dawn')
    const applied = prepareDawnAnnouncement(begun.value)
    expect(applied.ok).toBe(true)
    if (!applied.ok) throw new Error('Expected Dawn application.')
    expect(applied.value.status).toBe('dawn')
    expect(applied.value.game.phase).toBe('dawn-announcement')
    expect(applied.value.game.players[1]).toMatchObject({
      alive: false,
      publiclyRevealedRoleId: ROLE_IDS.citizen,
    })
    expect(applied.value).not.toHaveProperty('resolution')
    expect(applied.value).not.toHaveProperty('collectedActions')
    expect(prepareDawnAnnouncement(applied.value)).toEqual({
      ok: false,
      error: { type: 'RESOLUTION_ALREADY_APPLIED' },
    })
    expect(previousPrivateNightResult(applied.value)).toEqual({
      ok: false,
      error: { type: 'RESOLUTION_ALREADY_APPLIED' },
    })
  })

  it('acknowledges every result before applying deaths and rejects a changed resolution', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 0, 3, null],
    )
    const begun = beginNightResultPresentation(createCompleteNightWorkflow(fixture))
    if (!begun.ok) throw new Error('Expected presentation workflow.')
    let current: NightPresentationWorkflow = begun.value

    while (current.status === 'private-results') {
      const result = current.results[current.currentResultIndex]
      if (result === undefined) throw new Error('Expected current result.')
      const acknowledged = acknowledgePrivateNightResult(current, result.id)
      if (!acknowledged.ok) throw new Error('Expected acknowledgement.')
      current = acknowledged.value
    }

    expect(current.status).toBe('ready-for-dawn')
    if (current.status !== 'ready-for-dawn') {
      throw new Error('Expected ready-for-Dawn workflow.')
    }
    expect(current.game.players.every((player) => player.alive)).toBe(true)
    const changed: NightPresentationWorkflow = {
      ...current,
      resolution: {
        ...current.resolution,
        sheriffResults: [],
      },
    }
    expect(prepareDawnAnnouncement(changed)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'workflow-source-mismatch',
      },
    })

    const applied = prepareDawnAnnouncement(current)
    if (!applied.ok) throw new Error('Expected Dawn application.')
    if (applied.value.status !== 'dawn') {
      throw new Error('Expected completed Dawn workflow.')
    }
    expect(applied.value.game.players[3]?.alive).toBe(false)
    expect(applied.value.game.phase).toBe('dawn-announcement')
    expect(applied.value.game.id).toBe(fixture.game.id)
    expect(applied.value.game.nightNumber).toBe(fixture.game.nightNumber)
    expect(applied.value.game.phase).not.toBe('day-discussion')
    expect(applied.value.game).not.toHaveProperty('factionWinner')
    expect(applied.value.game.players.every((player) => player.personalWin === null)).toBe(true)
    expect(applied.value.dawnAnnouncement).not.toHaveProperty('privateResults')
    expect(JSON.stringify(applied.value.dawnAnnouncement)).not.toContain('attack')
    expect(JSON.stringify(applied.value.dawnAnnouncement)).not.toContain('block')
    expect(JSON.stringify(applied.value.dawnAnnouncement)).not.toContain('frame')
    expect(JSON.stringify(applied.value.dawnAnnouncement)).not.toContain('protect')
    const publicView = selectNightPresentationView(applied.value)
    expect(publicView).toMatchObject({ status: 'dawn' })
    expect(publicView).not.toHaveProperty('game')
    expect(publicView).not.toHaveProperty('results')
    expect(JSON.stringify(publicView)).not.toContain('role-instance')
    expect(JSON.stringify(publicView)).not.toContain('citizen')
    expect(JSON.stringify(publicView)).not.toContain('actualRoleId')
  })

  it('rejects forged ready states, missing results, and malformed acknowledgement evidence', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const begun = beginNightResultPresentation(createCompleteNightWorkflow(fixture))
    if (!begun.ok) throw new Error('Expected private result presentation.')
    expectPrivateResults(begun.value)
    const onlyResult = begun.value.results[0]
    if (onlyResult === undefined) throw new Error('Expected one private result.')
    const acknowledged = acknowledgePrivateNightResult(begun.value, onlyResult.id)
    if (!acknowledged.ok || acknowledged.value.status !== 'ready-for-dawn') {
      throw new Error('Expected ready-for-Dawn state.')
    }
    const ready = acknowledged.value
    const original = JSON.stringify(ready)

    expect(prepareDawnAnnouncement({ ...ready, acknowledgedResultIds: [] })).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      },
    })
    expect(
      prepareDawnAnnouncement({
        ...ready,
        acknowledgedResultIds: [onlyResult.id, onlyResult.id],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      },
    })
    expect(
      prepareDawnAnnouncement({
        ...ready,
        acknowledgedResultIds: ['unknown-result' as PrivateNightResultId],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'invalid-acknowledgements',
      },
    })
    expect(prepareDawnAnnouncement({ ...ready, results: [] })).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'workflow-source-mismatch',
      },
    })
    expect(
      prepareDawnAnnouncement({
        ...ready,
        results: [{ ...onlyResult, actualRoleId: ROLE_IDS.citizen } as never],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'workflow-source-mismatch',
      },
    })
    expect(
      prepareDawnAnnouncement({
        ...ready,
        game: { ...ready.game, id: gameId('different-game') },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'resolution-game-mismatch',
      },
    })
    expect(JSON.stringify(ready)).toBe(original)
    expect(ready.game.players.every((player) => player.alive)).toBe(true)
  })

  it('supports frozen completed inputs and distinguishes duplicate player names', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }],
      [1, null],
    )
    const complete = createCompleteNightWorkflow(fixture, ['Alex', 'Alex'])
    Object.freeze(complete.game.players)
    Object.freeze(complete.game.roleDefinitions)
    Object.freeze(complete.game.settings)
    Object.freeze(complete.game)

    const result = beginNightResultPresentation(complete)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected frozen workflow support.')
    expectPrivateResults(result.value)
    expect(result.value.results[0]).toMatchObject({
      actorPlayerName: 'Alex',
      showActorStableId: true,
      targetPlayerName: 'Alex',
      showTargetStableId: true,
    })
  })

  it('keeps duplicate Dawn names identifiable and displays revealed role ordinals', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      [2, 3, null, null],
      { settings: { revealRoleOnDeath: true } },
    )
    const begun = beginNightResultPresentation(
      createCompleteNightWorkflow(fixture, ['Gina', 'Sam', 'Alex', 'Alex']),
    )
    if (!begun.ok || begun.value.status !== 'ready-for-dawn') {
      throw new Error('Expected ready-for-Dawn duplicate fixture.')
    }
    const applied = prepareDawnAnnouncement(begun.value)
    if (!applied.ok || applied.value.status !== 'dawn') {
      throw new Error('Expected duplicate-name Dawn.')
    }

    expect(selectDawnAnnouncementView(applied.value)).toEqual({
      outcome: 'deaths',
      nightNumber: fixture.game.nightNumber,
      deaths: [
        {
          playerId: playerId('player-3'),
          playerName: 'Alex',
          showStableId: true,
          revealedRoleDisplayName: 'Citizen 1',
        },
        {
          playerId: playerId('player-4'),
          playerName: 'Alex',
          showStableId: true,
          revealedRoleDisplayName: 'Citizen 2',
        },
      ],
    })
  })

  it('uses applied GameState Doctor history as the sole night-two repeat-target authority', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      [1, null],
      {
        nightNumber: 1,
        settings: {
          doctorCanSelfProtect: true,
          doctorCannotRepeatPreviousTarget: true,
        },
      },
    )
    const begun = beginNightResultPresentation(createCompleteNightWorkflow(fixture))
    if (!begun.ok || begun.value.status !== 'ready-for-dawn') {
      throw new Error('Expected no-result night to be ready for Dawn.')
    }
    const applied = prepareDawnAnnouncement(begun.value)
    if (!applied.ok || applied.value.status !== 'dawn') {
      throw new Error('Expected applied first-night Dawn.')
    }
    const doctor = applied.value.game.players[0]
    const target = applied.value.game.players[1]
    if (doctor === undefined || target === undefined) {
      throw new Error('Expected Doctor and target.')
    }
    const nightTwoGame = {
      ...applied.value.game,
      phase: 'night-action-collection' as const,
      nightNumber: 2,
    }
    const previousTarget = selectDoctorPreviousTargetsForNight(nightTwoGame)[0]
    expect(previousTarget).toEqual({
      actorRoleInstanceId: doctor.role.instanceId,
      targetPlayerId: target.playerId,
    })
    const repeatedAction = {
      actorPlayerId: doctor.playerId,
      actorRoleInstanceId: doctor.role.instanceId,
      actorRoleId: doctor.role.roleId,
      actionKind: 'protect' as const,
      targetPlayerId: target.playerId,
    }

    expect(
      createSubmittedNightAction(
        nightTwoGame,
        repeatedAction,
        previousTarget?.targetPlayerId ?? null,
      ),
    ).toEqual({
      ok: false,
      error: {
        type: 'DOCTOR_REPEATED_PREVIOUS_TARGET',
        actorRoleInstanceId: doctor.role.instanceId,
        targetPlayerId: target.playerId,
      },
    })
    expect(
      createSubmittedNightAction(
        {
          ...nightTwoGame,
          settings: {
            ...nightTwoGame.settings,
            doctorCannotRepeatPreviousTarget: false,
          },
        },
        repeatedAction,
        previousTarget?.targetPlayerId ?? null,
      ).ok,
    ).toBe(true)
  })
})
