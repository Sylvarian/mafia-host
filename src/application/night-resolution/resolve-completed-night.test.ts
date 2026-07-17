import { describe, expect, it } from 'vitest'

import type { Player } from '@/domain/players/player.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import {
  createResolutionFixture,
  type ResolutionFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { buildNightActionSequence } from '../night-actions/night-sequence.ts'
import type {
  CompleteNightActionsWorkflow,
  NightActionCollectionWorkflow,
} from '../night-actions/night-action-workflow.ts'
import { resolveCompletedNightWorkflow } from './resolve-completed-night.ts'

describe('resolveCompletedNightWorkflow', () => {
  it('revalidates and resolves a completed Phase 4 workflow without changing its game', () => {
    const fixture = createResolutionFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      [2, 2, null],
    )
    const workflow = toCompleteWorkflow(fixture)
    const before = JSON.stringify(workflow)
    const first = resolveCompletedNightWorkflow(workflow)
    const second = resolveCompletedNightWorkflow(workflow)

    expect(first.ok).toBe(true)
    expect(second).toEqual(first)
    expect(JSON.stringify(workflow)).toBe(before)
    expect(workflow.game.phase).toBe('night-action-collection')
    expect(workflow.game.players.every((player) => player.alive)).toBe(true)
  })

  it('revalidates Doctor previous-target context at the application boundary', () => {
    const base = createResolutionFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      [1, null],
      { settings: { doctorCannotRepeatPreviousTarget: true } },
    )
    const doctor = base.game.players[0]
    const target = base.game.players[1]
    if (doctor === undefined || target === undefined) {
      throw new Error('Expected Doctor workflow players.')
    }
    const workflow = toCompleteWorkflow({
      ...base,
      previousTargets: [
        {
          actorRoleInstanceId: doctor.role.instanceId,
          targetPlayerId: target.playerId,
        },
      ],
    })

    expect(resolveCompletedNightWorkflow(workflow)).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_COLLECTED_NIGHT_ACTIONS',
        error: { type: 'DOCTOR_REPEATED_PREVIOUS_TARGET' },
      },
    })
  })

  it.each(['collecting', 'reviewing'] as const)(
    'rejects a runtime %s workflow even when a collected batch is injected',
    (status) => {
      const fixture = createResolutionFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
        [1, null],
      )
      const complete = toCompleteWorkflow(fixture)
      const incomplete: NightActionCollectionWorkflow =
        status === 'collecting'
          ? {
              status,
              game: complete.game,
              participants: complete.participants,
              steps: complete.steps,
              previousTargets: complete.previousTargets,
              currentStepIndex: 0,
              submittedActions: complete.collectedActions.actions,
              returnToReviewAfterActor: false,
            }
          : {
              status,
              game: complete.game,
              participants: complete.participants,
              steps: complete.steps,
              previousTargets: complete.previousTargets,
              submittedActions: complete.collectedActions.actions,
            }

      Object.defineProperty(incomplete, 'collectedActions', {
        value: complete.collectedActions,
        enumerable: true,
      })

      expect(resolveCompletedNightWorkflow(incomplete)).toEqual({
        ok: false,
        error: {
          type: 'NIGHT_ACTION_WORKFLOW_NOT_COMPLETE',
          status,
        },
      })
    },
  )
})

function toCompleteWorkflow(fixture: ResolutionFixture): CompleteNightActionsWorkflow {
  const sequenceResult = buildNightActionSequence(fixture.game)
  if (!sequenceResult.ok) {
    throw new Error('Expected a valid completed-workflow sequence.')
  }

  const participants: readonly Player[] = Object.freeze(
    fixture.game.players.map((player, index) =>
      Object.freeze({
        id: player.playerId,
        name: `Player ${String(index + 1)}`,
        playing: true,
      }),
    ),
  )

  return Object.freeze({
    status: 'complete',
    game: fixture.game,
    participants,
    steps: sequenceResult.value,
    previousTargets: fixture.previousTargets,
    collectedActions: fixture.collectedActions,
  })
}
