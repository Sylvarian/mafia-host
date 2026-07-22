import { describe, expect, it } from 'vitest'

import { selectActiveRoleId } from '@/domain/neutral/executioner-conversion.ts'
import { ROLE_IDS, type RoleRegistryEntry } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  type ActiveNightActionCollectionWorkflow,
  type CollectingNightActionsWorkflow,
} from '../night-actions/index.ts'
import { createPersistedSessionEnvelopeV2 } from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

describe('Mafia-first wake-order recovery', () => {
  it('moves an untouched later actor back to Consigliere without inventing an action', () => {
    let workflow: ActiveNightActionCollectionWorkflow = oldOrderWorkflow()
    workflow = continueSuccessfully(workflow)
    workflow = confirmSuccessfully(workflow, citizenTarget(workflow))

    expect(currentRoleId(workflow)).toBe(ROLE_IDS.serialKiller)
    const restored = restore(workflow)

    expect(restored.ok).toBe(true)
    if (!restored.ok || restored.value.session.stage !== 'sequential-night') {
      throw new Error('Expected restored sequential night.')
    }
    expect(currentRoleId(restored.value.session.workflow)).toBe(ROLE_IDS.consigliere)
    expect(restored.value.session.workflow.completedSteps).toHaveLength(1)
  })

  it('fails closed when a later actor already acted before an unacted Consigliere', () => {
    let workflow: ActiveNightActionCollectionWorkflow = oldOrderWorkflow()
    workflow = continueSuccessfully(workflow)
    workflow = confirmSuccessfully(workflow, citizenTarget(workflow))
    workflow = confirmSuccessfully(workflow, citizenTarget(workflow))

    expect(currentRoleId(workflow)).toBe(ROLE_IDS.consigliere)
    expect(restore(workflow)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_SEQUENTIAL_NIGHT_SESSION',
        reason: 'restore-position-mismatch',
      },
    })
  })

  it('migrates exact acknowledged progress without duplicating actions or private results', () => {
    let workflow: ActiveNightActionCollectionWorkflow = oldOrderWorkflow()
    const target = citizenTarget(workflow)
    workflow = continueSuccessfully(workflow)
    workflow = confirmSuccessfully(workflow, target)
    workflow = confirmSuccessfully(workflow, target)
    workflow = confirmSuccessfully(workflow, target)
    if (workflow.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected Consigliere result.')
    }
    workflow = continueSuccessfully(workflow)

    expect(currentRoleId(workflow)).toBe(ROLE_IDS.detective)
    const restored = restore(workflow)

    expect(restored.ok).toBe(true)
    if (!restored.ok || restored.value.session.stage !== 'sequential-night') {
      throw new Error('Expected restored sequential night.')
    }
    expect(currentRoleId(restored.value.session.workflow)).toBe(ROLE_IDS.detective)
    expect(
      restored.value.session.workflow.completedSteps.map((record) => record.actorRoleId),
    ).toEqual([ROLE_IDS.godfather, ROLE_IDS.consigliere, ROLE_IDS.serialKiller])
    expect(
      new Set(
        restored.value.session.workflow.completedSteps.map((record) => record.actorRoleInstanceId),
      ).size,
    ).toBe(3)
    expect(restored.value.writeBackEnvelope).toBeDefined()
  })

  it('fails closed when the moved Consigliere result was not yet acknowledged', () => {
    let workflow: ActiveNightActionCollectionWorkflow = oldOrderWorkflow()
    const target = citizenTarget(workflow)
    workflow = continueSuccessfully(workflow)
    workflow = confirmSuccessfully(workflow, target)
    workflow = confirmSuccessfully(workflow, target)
    workflow = confirmSuccessfully(workflow, target)
    if (workflow.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected unacknowledged Consigliere result.')
    }

    expect(restore(workflow)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_SEQUENTIAL_NIGHT_SESSION',
        reason: 'restore-position-mismatch',
      },
    })
  })
})

function oldOrderWorkflow(): CollectingNightActionsWorkflow {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.consigliere },
      { roleId: ROLE_IDS.serialKiller },
      { roleId: ROLE_IDS.detective },
      { roleId: ROLE_IDS.citizen },
    ],
    {
      phase: 'night-action-collection',
      nightNumber: 2,
      settings: { allowFirstNightKills: true },
    },
  )
  const started = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
  if (!started.ok) {
    throw new Error('Expected collecting night.')
  }
  const ranks = new Map<RoleRegistryEntry['id'], number>([
    [ROLE_IDS.godfather, 30],
    [ROLE_IDS.serialKiller, 40],
    [ROLE_IDS.consigliere, 80],
    [ROLE_IDS.detective, 90],
  ])
  const steps = [...started.value.steps].sort((left, right) => {
    if (left.type === 'mafia-overview') return -1
    if (right.type === 'mafia-overview') return 1
    const leftPlayer = fixture.game.players.find(
      (player) => player.role.instanceId === left.actorRoleInstanceId,
    )
    const rightPlayer = fixture.game.players.find(
      (player) => player.role.instanceId === right.actorRoleInstanceId,
    )
    if (leftPlayer === undefined || rightPlayer === undefined) {
      throw new Error('Expected old-order actors.')
    }
    return (ranks.get(leftPlayer.role.roleId) ?? 100) - (ranks.get(rightPlayer.role.roleId) ?? 100)
  })
  return { ...started.value, steps }
}

function citizenTarget(workflow: ActiveNightActionCollectionWorkflow) {
  const player = workflow.game.players.find(
    (candidate) => candidate.role.roleId === ROLE_IDS.citizen,
  )
  if (player === undefined) throw new Error('Expected Citizen target.')
  return player.playerId
}

function confirmSuccessfully(
  workflow: ActiveNightActionCollectionWorkflow,
  targetPlayerId: ReturnType<typeof citizenTarget>,
): ActiveNightActionCollectionWorkflow {
  const result = confirmNightActionTarget(workflow, targetPlayerId)
  if (!result.ok) throw new Error(`Could not confirm action: ${result.error.type}`)
  return result.value
}

function continueSuccessfully(
  workflow: ActiveNightActionCollectionWorkflow,
): ActiveNightActionCollectionWorkflow {
  const result = continueNightActionCollection(workflow)
  if (!result.ok) throw new Error(`Could not continue night: ${result.error.type}`)
  return result.value
}

function currentRoleId(workflow: ActiveNightActionCollectionWorkflow) {
  if (workflow.status === 'complete') return null
  const step = workflow.steps[workflow.currentStepIndex]
  if (step?.type !== 'actor-action') return null
  return selectActiveRoleId(workflow.game, step.actorPlayerId)
}

function restore(workflow: ActiveNightActionCollectionWorkflow) {
  if (workflow.status === 'complete') throw new Error('Expected incomplete workflow.')
  return restorePersistedSessionEnvelopeV2(
    createPersistedSessionEnvelopeV2(
      { stage: 'sequential-night', workflow },
      '2026-07-22T10:00:00.000Z',
    ),
  )
}
