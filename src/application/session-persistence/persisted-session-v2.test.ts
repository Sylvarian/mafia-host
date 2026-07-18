import { describe, expect, it } from 'vitest'

import { createExecutionerBriefingWorkflow } from '@/application/executioner-briefing/index.ts'
import {
  beginFinalNightResolution,
  prepareDawnAnnouncement,
} from '@/application/night-completion/index.ts'
import {
  acknowledgeImmediateNightOutcome,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  type ActiveNightActionCollectionWorkflow,
} from '@/application/night-actions/index.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  createActiveAppSession,
  type ActiveAppSession,
  type SequentialNightAppSession,
} from './active-app-session.ts'
import { migratePersistedSessionEnvelopeV1 } from './migrate-persisted-session-v1.ts'
import {
  createPersistedSessionEnvelopeV2,
  toPersistedAppSessionV2,
} from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

const SAVED_AT = '2026-07-18T10:00:00.000Z'

function startedWorkflow(
  roles: Parameters<typeof createNightFixture>[0],
): ActiveNightActionCollectionWorkflow {
  const fixture = createNightFixture(roles, {
    phase: 'night-action-collection',
    nightNumber: 2,
    settings: { allowFirstNightKills: true, doctorCanSelfProtect: true },
  })
  const result = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
  if (!result.ok) throw new Error(`Could not start workflow: ${result.error.type}`)
  return result.value
}

function continueSuccessfully(
  workflow: ActiveNightActionCollectionWorkflow,
): ActiveNightActionCollectionWorkflow {
  const result = continueNightActionCollection(workflow)
  if (!result.ok) throw new Error(`Could not continue: ${result.error.type}`)
  return result.value
}

function confirmSuccessfully(
  workflow: ActiveNightActionCollectionWorkflow,
  targetIndex: number,
): ActiveNightActionCollectionWorkflow {
  if (workflow.status !== 'collecting') throw new Error('Expected collecting workflow.')
  const target = workflow.game.players[targetIndex]
  if (target === undefined) throw new Error('Expected target.')
  const result = confirmNightActionTarget(workflow, target.playerId)
  if (!result.ok) throw new Error(`Could not confirm: ${result.error.type}`)
  return result.value
}

function acknowledgeSuccessfully(
  workflow: ActiveNightActionCollectionWorkflow,
): ActiveNightActionCollectionWorkflow {
  const result = acknowledgeImmediateNightOutcome(workflow)
  if (!result.ok) throw new Error(`Could not acknowledge: ${result.error.type}`)
  return result.value
}

function immediateOutcomeSession(
  kind: 'blocked' | 'sheriff' | 'investigator' | 'detective',
): SequentialNightAppSession {
  if (kind === 'blocked') {
    let workflow = continueSuccessfully(
      startedWorkflow([
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    workflow = confirmSuccessfully(workflow, 1)
    workflow = acknowledgeSuccessfully(workflow)
    workflow = continueSuccessfully(workflow)
    if (workflow.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected a blocked outcome.')
    }
    return { stage: 'sequential-night', workflow }
  }

  const roleId =
    kind === 'sheriff'
      ? ROLE_IDS.sheriff
      : kind === 'investigator'
        ? ROLE_IDS.investigator
        : ROLE_IDS.detective
  let workflow = continueSuccessfully(
    startedWorkflow([
      { roleId, name: 'Private actor' },
      { roleId: ROLE_IDS.citizen, name: 'Private target' },
    ]),
  )
  workflow = confirmSuccessfully(workflow, 1)
  if (workflow.status !== 'awaiting-outcome-acknowledgement') {
    throw new Error('Expected an immediate result.')
  }
  return { stage: 'sequential-night', workflow }
}

function roundTrip(session: ActiveAppSession): ActiveAppSession {
  const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
  const result = restorePersistedSessionEnvelopeV2(JSON.parse(JSON.stringify(envelope)) as unknown)
  if (!result.ok) throw new Error(`Could not restore: ${JSON.stringify(result.error)}`)
  return result.value.session
}

function completeDoctorNight() {
  let workflow = continueSuccessfully(
    startedWorkflow([{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }]),
  )
  workflow = confirmSuccessfully(workflow, 1)
  workflow = acknowledgeSuccessfully(workflow)
  workflow = continueSuccessfully(workflow)
  if (workflow.status !== 'complete') throw new Error('Expected completed workflow.')
  return workflow
}

describe('persisted sequential session V2', () => {
  it.each(['blocked', 'sheriff', 'investigator', 'detective'] as const)(
    'restores the exact current %s outcome without recomputation or private prose',
    (kind) => {
      const session = immediateOutcomeSession(kind)
      const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
      const persistedText = JSON.stringify(envelope)
      const persistedOutcome =
        envelope.session.stage === 'sequential-night'
          ? JSON.stringify(envelope.session.currentOutcome)
          : ''
      const restored = roundTrip(session)

      expect(restored).toEqual(session)
      expect(restored).not.toBe(session)
      expect(persistedOutcome).not.toContain('Private actor')
      expect(persistedOutcome).not.toContain('Private target')
      expect(persistedOutcome).not.toContain('Citizen')
      expect(persistedOutcome).not.toContain('Group D')
      expect(persistedText).not.toContain('light red')
      expect(Object.isFrozen(restored)).toBe(true)
    },
  )

  it('persists acknowledgement explicitly and removes the current private outcome', () => {
    const session = immediateOutcomeSession('sheriff')
    const acknowledgement = acknowledgeImmediateNightOutcome(session.workflow)
    if (!acknowledgement.ok || acknowledgement.value.status === 'complete') {
      throw new Error('Expected acknowledged Sheriff outcome.')
    }
    const acknowledgedSession: SequentialNightAppSession = {
      stage: 'sequential-night',
      workflow: acknowledgement.value,
    }
    const persisted = toPersistedAppSessionV2(acknowledgedSession)

    expect(persisted).toMatchObject({
      stage: 'sequential-night',
      workflowStatus: 'outcome-acknowledged',
      currentOutcome: null,
      completedSteps: [{ acknowledged: true }],
    })
    expect(roundTrip(acknowledgedSession)).toEqual(acknowledgedSession)
  })

  it('round-trips collecting positions after the Mafia overview and after a sealed actor', () => {
    let workflow = continueSuccessfully(
      startedWorkflow([
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    if (workflow.status !== 'collecting') {
      throw new Error('Expected Sheriff collection after the Mafia overview.')
    }
    expect(roundTrip({ stage: 'sequential-night', workflow })).toEqual({
      stage: 'sequential-night',
      workflow,
    })

    workflow = confirmSuccessfully(workflow, 2)
    workflow = acknowledgeSuccessfully(workflow)
    workflow = continueSuccessfully(workflow)
    if (workflow.status !== 'collecting') {
      throw new Error('Expected Investigator collection after the sealed Sheriff.')
    }
    expect(roundTrip({ stage: 'sequential-night', workflow })).toEqual({
      stage: 'sequential-night',
      workflow,
    })
  })

  it('does not persist temporary target, focus, dialog, or operation-guard state', () => {
    const workflow = continueSuccessfully(
      startedWorkflow([{ roleId: ROLE_IDS.sheriff }, { roleId: ROLE_IDS.citizen }]),
    )
    const persisted = JSON.stringify(
      createPersistedSessionEnvelopeV2(
        { stage: 'sequential-night', workflow } as SequentialNightAppSession,
        SAVED_AT,
      ),
    )

    expect(persisted).not.toMatch(
      /selectedTarget|unconfirmedTarget|focus|dialog|operationPending|guard/,
    )
  })

  it('rejects forged immediate results, out-of-order data, and runtime extra fields', () => {
    const session = immediateOutcomeSession('sheriff')
    const envelope = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(session, SAVED_AT)),
    ) as {
      session: {
        currentOutcome: { status: string }
        completedSteps: { outcome: { status: string }; stepIndex: number }[]
        hiddenPrivateQueue?: unknown[]
      }
    }

    const forgedStep = envelope.session.completedSteps[0]
    if (forgedStep === undefined) throw new Error('Expected a persisted Sheriff step.')
    envelope.session.currentOutcome.status = 'suspicious'
    forgedStep.outcome.status = 'suspicious'
    expect(restorePersistedSessionEnvelopeV2(envelope)).toMatchObject({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION' },
    })

    const outOfOrder = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(session, SAVED_AT)),
    ) as {
      session: { completedSteps: { stepIndex: number }[] }
    }
    const reorderedStep = outOfOrder.session.completedSteps[0]
    if (reorderedStep === undefined) throw new Error('Expected a persisted step.')
    reorderedStep.stepIndex += 1
    expect(restorePersistedSessionEnvelopeV2(outOfOrder)).toMatchObject({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason: 'invalid-order' },
    })

    const extraField = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(session, SAVED_AT)),
    ) as {
      session: { hiddenPrivateQueue?: unknown[] }
    }
    extraField.session.hiddenPrivateQueue = []
    expect(restorePersistedSessionEnvelopeV2(extraField)).toMatchObject({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason: 'invalid-shape' },
    })
  })

  it('round-trips the final resolution boundary and public-only Dawn', () => {
    const complete = completeDoctorNight()
    const readyResult = beginFinalNightResolution(complete)
    if (!readyResult.ok) throw new Error('Expected final night resolution.')
    const readySession: ActiveAppSession = {
      stage: 'night-resolution',
      workflow: readyResult.value,
    }
    const restoredReady = roundTrip(readySession)
    expect(restoredReady).toEqual(readySession)
    if (restoredReady.stage !== 'night-resolution') {
      throw new Error('Expected night-resolution stage.')
    }
    expect(restoredReady.workflow.game.players.every((player) => player.alive)).toBe(true)

    const dawnResult = prepareDawnAnnouncement(readyResult.value)
    if (!dawnResult.ok) throw new Error('Expected Dawn.')
    const dawnSession: ActiveAppSession = { stage: 'dawn', workflow: dawnResult.value }
    const persistedDawn = toPersistedAppSessionV2(dawnSession)
    expect(roundTrip(dawnSession)).toEqual(dawnSession)
    expect(persistedDawn).not.toHaveProperty('resolution')
    expect(persistedDawn).not.toHaveProperty('currentOutcome')
    expect(JSON.stringify(persistedDawn)).not.toMatch(
      /sheriffResults|investigationResults|detectiveResults|privateResult/,
    )
  })
})

describe('narrow V1 migration', () => {
  it('migrates safe setup, distribution, briefing, and Dawn stages to V2', () => {
    const setup = createActiveAppSession()
    const distributionFixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { distributionStatus: 'distributing' },
    )
    if (distributionFixture.distribution.status !== 'distributing') {
      throw new Error('Expected distribution.')
    }
    const distribution: ActiveAppSession = {
      stage: 'role-distribution',
      workflow: distributionFixture.distribution,
    }

    const briefingFixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather },
      ],
      {
        phase: 'executioner-briefing',
        nightNumber: 1,
        executionerBriefingStatus: 'pending',
      },
    )
    const briefingWorkflow = createExecutionerBriefingWorkflow(briefingFixture.game)
    if (!briefingWorkflow.ok) throw new Error('Expected briefing.')
    const briefing: ActiveAppSession = {
      stage: 'executioner-briefing',
      game: briefingFixture.game,
      participants: briefingFixture.participants,
      workflow: briefingWorkflow.value,
    }

    const ready = beginFinalNightResolution(completeDoctorNight())
    if (!ready.ok) throw new Error('Expected resolution.')
    const dawn = prepareDawnAnnouncement(ready.value)
    if (!dawn.ok) throw new Error('Expected Dawn.')
    const dawnSession: ActiveAppSession = { stage: 'dawn', workflow: dawn.value }

    for (const safeSession of [setup, distribution, briefing, dawnSession]) {
      const v2 = createPersistedSessionEnvelopeV2(safeSession, SAVED_AT)
      const v1 = {
        schemaVersion: 1,
        savedAt: v2.savedAt,
        session: v2.session,
      }
      const migrated = migratePersistedSessionEnvelopeV1(v1)
      expect(migrated.ok).toBe(true)
      if (!migrated.ok) throw new Error('Expected safe migration.')
      expect(migrated.value.schemaVersion).toBe(2)
      expect(restorePersistedSessionEnvelopeV2(migrated.value).ok).toBe(true)
    }
  })

  it('rejects old in-progress action and private-result stages without deleting them', () => {
    expect(
      migratePersistedSessionEnvelopeV1({
        schemaVersion: 1,
        savedAt: SAVED_AT,
        session: { stage: 'night-action' },
      }),
    ).toEqual({
      ok: false,
      error: { type: 'LEGACY_IN_PROGRESS_NIGHT_INCOMPATIBLE' },
    })
    expect(
      migratePersistedSessionEnvelopeV1({
        schemaVersion: 1,
        savedAt: SAVED_AT,
        session: { stage: 'night-presentation' },
      }),
    ).toEqual({
      ok: false,
      error: { type: 'STALE_OLD_PRIVATE_RESULT_WORKFLOW' },
    })
  })
})
