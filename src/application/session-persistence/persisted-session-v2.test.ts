import { describe, expect, it } from 'vitest'

import { createExecutionerBriefingWorkflow } from '@/application/executioner-briefing/index.ts'
import {
  confirmMayorRevealDuringDay,
  createDayDiscussionState,
  selectPublicDayDiscussionView,
} from '@/application/day-discussion/index.ts'
import {
  completeDayWithoutExecution,
  executePlayerAndCompleteDay,
} from '@/application/day-outcome/index.ts'
import {
  beginFinalNightResolution,
  prepareDawnAnnouncement,
} from '@/application/night-completion/index.ts'
import {
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  type ActiveNightActionCollectionWorkflow,
} from '@/application/night-actions/index.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import {
  createNightFixture,
  nightFixturePlayerId,
} from '../../../tests/support/night-action-fixtures.ts'
import {
  createActiveAppSession,
  settleSessionAfterDayOutcome,
  type ActiveAppSession,
  type SequentialNightAppSession,
} from './active-app-session.ts'
import { migratePersistedSessionEnvelopeV1 } from './migrate-persisted-session-v1.ts'
import {
  createPersistedSessionEnvelopeV2,
  toPersistedAppSessionV2,
  type PersistedGameV2,
} from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

const SAVED_AT = '2026-07-18T10:00:00.000Z'
const LOWEST_RANDOM_SOURCE = Object.freeze({ next: (): number => 0 })

function startedWorkflow(
  roles: Parameters<typeof createNightFixture>[0],
  nightNumber = 2,
): ActiveNightActionCollectionWorkflow {
  const fixture = createNightFixture(roles, {
    phase: 'night-action-collection',
    nightNumber,
    settings: { allowFirstNightKills: true, doctorCanSelfProtect: true },
    godfatherSuccessionStartNightNumber: nightNumber + 1,
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

function completeDoctorNight(nightNumber = 2) {
  let workflow = continueSuccessfully(
    startedWorkflow(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather }],
      nightNumber,
    ),
  )
  workflow = confirmSuccessfully(workflow, 1)
  workflow = confirmSuccessfully(workflow, 1)
  if (workflow.status !== 'complete') throw new Error('Expected completed workflow.')
  return workflow
}

function createDaySession(revealIndexes: readonly number[] = []): ActiveAppSession {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.mayor, name: 'Hidden Mayor' },
      { roleId: ROLE_IDS.citizen, name: 'Hidden Citizen' },
      { roleId: ROLE_IDS.mayor, name: 'Second Mayor' },
    ],
    {
      phase: 'dawn-announcement',
      nightNumber: 1,
    },
  )
  const stateResult = createDayDiscussionState({
    status: 'dawn',
    game: fixture.game,
    participants: fixture.participants,
    dawnAnnouncement: { outcome: 'no-deaths', nightNumber: 1 },
  })
  if (!stateResult.ok) throw new Error(`Expected day state: ${stateResult.error.type}`)
  let state = stateResult.value
  for (const revealIndex of revealIndexes) {
    const selected = state.game.players[revealIndex]
    if (selected === undefined) throw new Error('Expected selected Mayor.')
    const revealResult = confirmMayorRevealDuringDay(state, selected.playerId)
    if (!revealResult.ok) throw new Error(`Expected Mayor reveal: ${revealResult.error.type}`)
    state = revealResult.value
  }
  return {
    stage: 'day-discussion',
    game: state.game,
    participants: state.participants,
  }
}

function createDayOutcomeSession(
  kind: 'execution' | 'no-execution',
  roles: Parameters<typeof createNightFixture>[0] = [
    { roleId: ROLE_IDS.citizen, name: 'Public player' },
    { roleId: ROLE_IDS.godfather, name: 'Private player' },
  ],
): ActiveAppSession {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
  })
  const state = {
    game: { ...fixture.game, dayNumber: 1 },
    participants: fixture.participants,
  }
  const result =
    kind === 'no-execution'
      ? completeDayWithoutExecution(state)
      : executePlayerAndCompleteDay(
          state,
          state.game.players[0]?.playerId ??
            fixture.participants[0]?.id ??
            nightFixturePlayerId('missing-player'),
        )
  if (!result.ok) throw new Error(`Expected day outcome: ${result.error.type}`)
  return {
    stage: 'day-outcome',
    game: result.value.game,
    participants: result.value.participants,
  }
}

function settleDayOutcome(session: ActiveAppSession): ActiveAppSession {
  const result = settleSessionAfterDayOutcome(session)
  if (!result.ok) throw new Error(`Expected Phase 7D settlement: ${result.error.type}`)
  return result.value
}

function toPriorNeutralGame(
  game: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const phase7CFields = new Set([
    'deathRecords',
    'personalWins',
    'executionerConversions',
    'pendingJesterRevenges',
    'jesterRevengeResolutions',
    'dayOutcome',
    'dayOutcomes',
    'godfatherSuccessionStartNightNumber',
    'godfatherPromotions',
  ])
  return {
    ...Object.fromEntries(Object.entries(game).filter(([key]) => !phase7CFields.has(key))),
    neutralStateVersion: 1,
  }
}

function toPhase7DNeutralGame(game: PersistedGameV2): Readonly<Record<string, unknown>> {
  return {
    ...Object.fromEntries(
      Object.entries(game).filter(
        ([key]) =>
          key !== 'jesterRevengeResolutions' &&
          key !== 'dayOutcomes' &&
          key !== 'godfatherSuccessionStartNightNumber' &&
          key !== 'godfatherPromotions',
      ),
    ),
    neutralStateVersion: 2,
    pendingJesterRevenges: game.pendingJesterRevenges.map((record) => ({
      gameId: record.gameId,
      jesterPlayerId: record.jesterPlayerId,
      jesterRoleInstanceId: record.jesterRoleInstanceId,
      triggeredOnDay: record.triggeredOnDay,
      status: record.status,
    })),
    dayOutcome: game.dayOutcomes[0] ?? null,
  }
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

  it('persists a result only while visible and advances without an acknowledged state', () => {
    let workflow = continueSuccessfully(
      startedWorkflow([
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    workflow = confirmSuccessfully(workflow, 2)
    expect(workflow.status).toBe('awaiting-outcome-acknowledgement')
    workflow = continueSuccessfully(workflow)
    if (workflow.status !== 'collecting') {
      throw new Error('Expected direct advancement to Investigator collection.')
    }
    const session: SequentialNightAppSession = { stage: 'sequential-night', workflow }
    const persisted = toPersistedAppSessionV2(session)

    expect(persisted).toMatchObject({
      stage: 'sequential-night',
      workflowStatus: 'collecting',
      currentOutcome: null,
    })
    expect(JSON.stringify(persisted)).not.toMatch(/outcome-acknowledged|"acknowledged"/)
    expect(roundTrip(session)).toEqual(session)
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

  it('canonicalizes a legacy non-informational result into direct advancement', () => {
    let workflow = continueSuccessfully(
      startedWorkflow([
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    workflow = confirmSuccessfully(workflow, 2)
    if (workflow.status !== 'collecting') {
      throw new Error('Expected direct advancement to Sheriff collection.')
    }
    const envelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2({ stage: 'sequential-night', workflow }, SAVED_AT),
      ),
    ) as {
      session: {
        workflowStatus: string
        currentStepIndex: number
        currentOutcome: unknown
        completedSteps: {
          stepIndex: number
          actorPlayerId: string
          actorRoleId: string
          actorRoleInstanceId: string
          action: { targetPlayerId: string }
          outcome: unknown
          acknowledged?: boolean
        }[]
      }
    }
    const framerStep = envelope.session.completedSteps[0]
    if (framerStep === undefined) throw new Error('Expected persisted Framer action.')
    const legacyOutcome = {
      kind: 'action-recorded',
      actorPlayerId: framerStep.actorPlayerId,
      actorRoleId: framerStep.actorRoleId,
      actorRoleInstanceId: framerStep.actorRoleInstanceId,
      targetPlayerId: framerStep.action.targetPlayerId,
    }
    framerStep.outcome = legacyOutcome
    framerStep.acknowledged = false
    envelope.session.workflowStatus = 'awaiting-outcome-acknowledgement'
    envelope.session.currentStepIndex = framerStep.stepIndex
    envelope.session.currentOutcome = legacyOutcome

    const restored = restorePersistedSessionEnvelopeV2(envelope)
    expect(restored.ok).toBe(true)
    if (!restored.ok || restored.value.session.stage !== 'sequential-night') {
      throw new Error('Expected canonical sequential-night restoration.')
    }
    expect(restored.value.session.workflow.status).toBe('collecting')
    expect(
      restored.value.session.workflow.completedSteps.map((step) => [
        step.actorRoleId,
        step.outcome,
      ]),
    ).toEqual([[ROLE_IDS.framer, null]])
    const currentStep =
      restored.value.session.workflow.steps[restored.value.session.workflow.currentStepIndex]
    expect(currentStep).toMatchObject({ type: 'actor-action' })
    if (currentStep?.type !== 'actor-action') throw new Error('Expected a current actor.')
    expect(
      restored.value.session.workflow.game.players.find(
        (player) => player.playerId === currentStep.actorPlayerId,
      )?.role.roleId,
    ).toBe(ROLE_IDS.sheriff)
    expect(JSON.stringify(toPersistedAppSessionV2(restored.value.session))).not.toMatch(
      /action-recorded|"acknowledged"/,
    )
  })

  it('canonicalizes an acknowledged legacy private result without redisplaying it', () => {
    let workflow = continueSuccessfully(
      startedWorkflow([
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    workflow = confirmSuccessfully(workflow, 2)
    if (workflow.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected visible Sheriff result.')
    }
    const envelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2({ stage: 'sequential-night', workflow }, SAVED_AT),
      ),
    ) as {
      session: {
        workflowStatus: string
        currentStepIndex: number
        currentOutcome: unknown
        completedSteps: { acknowledged?: boolean }[]
      }
    }
    const sheriffStep = envelope.session.completedSteps[0]
    if (sheriffStep === undefined) throw new Error('Expected persisted Sheriff result.')
    sheriffStep.acknowledged = true
    envelope.session.workflowStatus = 'outcome-acknowledged'
    envelope.session.currentOutcome = null

    const restored = restorePersistedSessionEnvelopeV2(envelope)
    expect(restored.ok).toBe(true)
    if (!restored.ok || restored.value.session.stage !== 'sequential-night') {
      throw new Error('Expected canonical sequential-night restoration.')
    }
    expect(restored.value.session.workflow).toMatchObject({
      status: 'collecting',
      currentOutcome: null,
    })
    expect(restored.value.session.workflow.completedSteps).toHaveLength(1)
    const currentStep =
      restored.value.session.workflow.steps[restored.value.session.workflow.currentStepIndex]
    if (currentStep?.type !== 'actor-action') throw new Error('Expected Investigator actor.')
    expect(
      restored.value.session.workflow.game.players.find(
        (player) => player.playerId === currentStep.actorPlayerId,
      )?.role.roleId,
    ).toBe(ROLE_IDS.investigator)
  })

  it('fails closed when legacy acknowledged-state evidence is ambiguous', () => {
    const session = immediateOutcomeSession('sheriff')
    const envelope = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(session, SAVED_AT)),
    ) as {
      session: {
        workflowStatus: string
        currentOutcome: unknown
        completedSteps: { acknowledged?: boolean }[]
      }
    }
    const sheriffStep = envelope.session.completedSteps[0]
    if (sheriffStep === undefined) throw new Error('Expected persisted Sheriff result.')
    sheriffStep.acknowledged = false
    envelope.session.workflowStatus = 'outcome-acknowledged'
    envelope.session.currentOutcome = null

    expect(restorePersistedSessionEnvelopeV2(envelope)).toEqual({
      ok: false,
      error: {
        type: 'PERSISTENCE_COMPATIBILITY_FAILURE',
        reason: 'ambiguous-legacy-night-advancement',
      },
    })
  })

  it('requires persisted evidence for every intermediate legacy blocked step', () => {
    let workflow = continueSuccessfully(
      startedWorkflow([
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    workflow = confirmSuccessfully(workflow, 2)
    if (workflow.status !== 'collecting') throw new Error('Expected second Consort collection.')
    workflow = confirmSuccessfully(workflow, 3)
    if (workflow.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected blocked Doctor outcome.')
    }
    workflow = continueSuccessfully(workflow)
    if (workflow.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected blocked Sheriff outcome.')
    }
    workflow = continueSuccessfully(workflow)
    if (workflow.status !== 'collecting') {
      throw new Error('Expected Investigator collection after both blocked actors.')
    }

    const envelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2({ stage: 'sequential-night', workflow }, SAVED_AT),
      ),
    ) as {
      session: {
        completedSteps: (
          | {
              stepIndex: number
              status: 'action-confirmed'
              actorPlayerId: string
              actorRoleId: string
              actorRoleInstanceId: string
              action: { targetPlayerId: string }
              outcome: unknown
              acknowledged?: boolean
            }
          | {
              stepIndex: number
              status: 'blocked'
              actorPlayerId: string
              actorRoleId: string
              actorRoleInstanceId: string
              outcome: unknown
              acknowledged?: boolean
            }
        )[]
      }
    }
    const steps = envelope.session.completedSteps
    for (const step of steps) {
      step.acknowledged = true
      if (step.status === 'action-confirmed') {
        step.outcome = {
          kind: 'action-recorded',
          actorPlayerId: step.actorPlayerId,
          actorRoleId: step.actorRoleId,
          actorRoleInstanceId: step.actorRoleInstanceId,
          targetPlayerId: step.action.targetPlayerId,
        }
      }
    }

    expect(
      restorePersistedSessionEnvelopeV2(JSON.parse(JSON.stringify(envelope)) as unknown).ok,
    ).toBe(true)

    const missingIntermediate = JSON.parse(JSON.stringify(envelope)) as typeof envelope
    const omittedIntermediate = missingIntermediate.session.completedSteps.splice(2, 1)[0]
    expect(omittedIntermediate).toMatchObject({
      status: 'blocked',
      actorRoleId: ROLE_IDS.doctor,
    })
    expect(restorePersistedSessionEnvelopeV2(missingIntermediate)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_SEQUENTIAL_NIGHT_SESSION',
        reason: 'restore-position-mismatch',
      },
    })

    const missingTrailing = JSON.parse(JSON.stringify(envelope)) as typeof envelope
    const omittedTrailing = missingTrailing.session.completedSteps.splice(3, 1)[0]
    expect(omittedTrailing).toMatchObject({ status: 'blocked', actorRoleId: ROLE_IDS.sheriff })
    expect(restorePersistedSessionEnvelopeV2(missingTrailing)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_SEQUENTIAL_NIGHT_SESSION',
        reason: 'restore-position-mismatch',
      },
    })
  })

  it('rejects a fabricated informational result on a current non-informational action', () => {
    let workflow = continueSuccessfully(
      startedWorkflow([
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    workflow = confirmSuccessfully(workflow, 2)
    if (workflow.status !== 'collecting') throw new Error('Expected Sheriff collection.')
    const envelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2({ stage: 'sequential-night', workflow }, SAVED_AT),
      ),
    ) as {
      session: {
        completedSteps: {
          actorPlayerId: string
          actorRoleId: string
          actorRoleInstanceId: string
          action: { targetPlayerId: string }
          outcome: unknown
        }[]
      }
    }
    const framerStep = envelope.session.completedSteps[0]
    if (framerStep === undefined) throw new Error('Expected persisted Framer action.')
    framerStep.outcome = {
      kind: 'sheriff-result',
      actorPlayerId: framerStep.actorPlayerId,
      actorRoleId: framerStep.actorRoleId,
      actorRoleInstanceId: framerStep.actorRoleInstanceId,
      targetPlayerId: framerStep.action.targetPlayerId,
      status: 'not-suspicious',
    }

    expect(restorePersistedSessionEnvelopeV2(envelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_SEQUENTIAL_NIGHT_SESSION',
        reason: 'invalid-fabricated-non-informational-outcome',
      },
    })
  })

  it('rejects a missing informational result and a normal action fabricated for a blocked actor', () => {
    const informational = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2(immediateOutcomeSession('sheriff'), SAVED_AT),
      ),
    ) as {
      session: {
        currentOutcome: unknown
        completedSteps: { outcome: unknown }[]
      }
    }
    const sheriffStep = informational.session.completedSteps[0]
    if (sheriffStep === undefined) throw new Error('Expected persisted Sheriff result.')
    sheriffStep.outcome = null
    informational.session.currentOutcome = null
    expect(restorePersistedSessionEnvelopeV2(informational)).toMatchObject({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason: 'invalid-step' },
    })

    const blocked = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2(immediateOutcomeSession('blocked'), SAVED_AT),
      ),
    ) as {
      session: {
        workflowStatus: string
        currentOutcome: unknown
        completedSteps: Record<string, unknown>[]
      }
    }
    const blockedStep = blocked.session.completedSteps[1]
    if (blockedStep === undefined) throw new Error('Expected persisted blocked Doctor.')
    blocked.session.completedSteps[1] = {
      stepIndex: blockedStep.stepIndex,
      status: 'action-confirmed',
      actorPlayerId: blockedStep.actorPlayerId,
      actorRoleId: blockedStep.actorRoleId,
      actorRoleInstanceId: blockedStep.actorRoleInstanceId,
      action: {
        actorPlayerId: blockedStep.actorPlayerId,
        actorRoleInstanceId: blockedStep.actorRoleInstanceId,
        actorRoleId: blockedStep.actorRoleId,
        actionKind: 'protect',
        targetPlayerId: 'player-3',
      },
      outcome: null,
    }
    blocked.session.workflowStatus = 'collecting'
    blocked.session.currentOutcome = null
    expect(restorePersistedSessionEnvelopeV2(blocked)).toMatchObject({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason: 'invalid-step' },
    })
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
      error: {
        type: 'INVALID_SEQUENTIAL_NIGHT_SESSION',
        reason: 'restore-position-mismatch',
      },
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
    const complete = completeDoctorNight(1)
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

    const dawnResult = prepareDawnAnnouncement(readyResult.value, LOWEST_RANDOM_SOURCE)
    if (!dawnResult.ok || dawnResult.value.status !== 'dawn') throw new Error('Expected Dawn.')
    const dawnSession: ActiveAppSession = { stage: 'dawn', workflow: dawnResult.value }
    const persistedDawn = toPersistedAppSessionV2(dawnSession)
    expect(roundTrip(dawnSession)).toEqual(dawnSession)
    expect(persistedDawn).not.toHaveProperty('resolution')
    expect(persistedDawn).not.toHaveProperty('currentOutcome')
    expect(JSON.stringify(persistedDawn)).not.toMatch(
      /sheriffResults|investigationResults|detectiveResults|privateResult/,
    )
  })

  it.each([
    ['dayNumber', 1],
    ['nightNumber', 2],
  ] as const)('rejects a first-Dawn save with incompatible %s', (counter, value) => {
    const complete = completeDoctorNight(1)
    const readyResult = beginFinalNightResolution(complete)
    if (!readyResult.ok) throw new Error('Expected final night resolution.')
    const dawnResult = prepareDawnAnnouncement(readyResult.value, LOWEST_RANDOM_SOURCE)
    if (!dawnResult.ok || dawnResult.value.status !== 'dawn') throw new Error('Expected Dawn.')
    const envelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2({ stage: 'dawn', workflow: dawnResult.value }, SAVED_AT),
      ),
    ) as {
      session: { game: { dayNumber: number; nightNumber: number } }
    }
    envelope.session.game[counter] = value

    expect(restorePersistedSessionEnvelopeV2(envelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAWN_SESSION',
        reason: 'invalid-game',
      },
    })
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

    const ready = beginFinalNightResolution(completeDoctorNight(1))
    if (!ready.ok) throw new Error('Expected resolution.')
    const dawn = prepareDawnAnnouncement(ready.value, LOWEST_RANDOM_SOURCE)
    if (!dawn.ok || dawn.value.status !== 'dawn') throw new Error('Expected Dawn.')
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

describe('persisted Phase 7B day discussion V2', () => {
  it('round-trips the exact day session and multiple public Mayor reveals', () => {
    const session = createDaySession([0, 2])
    const restored = roundTrip(session)

    expect(restored).toEqual(session)
    expect(restored).not.toBe(session)
    expect(Object.isFrozen(restored)).toBe(true)
    if (restored.stage !== 'day-discussion') {
      throw new Error('Expected restored day session.')
    }
    const view = selectPublicDayDiscussionView(restored)
    expect(view.dayLabel).toBe('Day 1')
    expect(view.livingPlayers.filter((row) => row.hasThreeVoteReminder)).toHaveLength(2)
  })

  it('persists only the canonical day game and participants', () => {
    const persisted = toPersistedAppSessionV2(createDaySession([0]))
    const serialized = JSON.stringify(persisted)

    expect(persisted).toMatchObject({
      stage: 'day-discussion',
      workflowStatus: 'day-discussion',
      game: { phase: 'day-discussion', nightNumber: 1, dayNumber: 1 },
    })
    expect(persisted).not.toHaveProperty('workflow')
    expect(serialized).not.toMatch(
      /dawnAnnouncement|resolution|completedSteps|currentOutcome|collectedActions|selectedMayor|dialog|focus|voteCount|trial/,
    )
  })

  it('rejects stage/phase and counter mismatches', () => {
    const envelope = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)),
    ) as {
      session: { game: { phase: string; dayNumber: number } }
    }
    envelope.session.game.phase = 'dawn-announcement'
    envelope.session.game.dayNumber = 0
    expect(restorePersistedSessionEnvelopeV2(envelope)).toEqual({
      ok: false,
      error: {
        type: 'STAGE_PHASE_MISMATCH',
        stage: 'day-discussion',
        phase: 'dawn-announcement',
      },
    })

    const counterEnvelope = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)),
    ) as {
      session: { game: { dayNumber: number } }
    }
    counterEnvelope.session.game.dayNumber = 2
    expect(restorePersistedSessionEnvelopeV2(counterEnvelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_DISCUSSION_SESSION',
        reason: 'invalid-game',
      },
    })
  })

  it('rejects a forged later-cycle Executioner briefing save', () => {
    const fixture = createNightFixture(
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
    const workflow = createExecutionerBriefingWorkflow(fixture.game)
    if (!workflow.ok) throw new Error('Expected a valid first-night briefing.')
    const envelope = createPersistedSessionEnvelopeV2(
      {
        stage: 'executioner-briefing',
        game: fixture.game,
        participants: fixture.participants,
        workflow: workflow.value,
      },
      SAVED_AT,
    )
    const forged = JSON.parse(JSON.stringify(envelope)) as {
      session: { game: { nightNumber: number; dayNumber: number } }
    }
    forged.session.game.nightNumber = 3
    forged.session.game.dayNumber = 2

    expect(restorePersistedSessionEnvelopeV2(forged)).toEqual({
      ok: false,
      error: { type: 'INVALID_EXECUTIONER_BRIEFING_SESSION', reason: 'invalid-game' },
    })
  })

  it.each([
    ['completedSteps', []],
    ['currentOutcome', null],
    ['resolution', {}],
    ['dawnAnnouncement', { outcome: 'no-deaths', nightNumber: 1 }],
    ['mayorDialogOpen', true],
    ['selectedMayorPlayerId', 'player-1'],
    ['showHostRoles', true],
    ['hostOnlyRoles', []],
    ['hostRoleView', {}],
    ['hostRoleVisibility', 'shown'],
  ] as const)('rejects stale or private day field %s', (field, value) => {
    const envelope = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)),
    ) as {
      session: Record<string, unknown>
    }
    envelope.session[field] = value

    expect(restorePersistedSessionEnvelopeV2(envelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_DISCUSSION_SESSION',
        reason: 'contains-stale-night-data',
      },
    })
  })

  it('rejects a forged public reveal and the obsolete Mayor authority marker', () => {
    const forgedReveal = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)),
    ) as {
      session: {
        game: {
          players: {
            publiclyRevealedRoleId: string | null
            mayorRevealed: boolean
          }[]
        }
      }
    }
    const firstPlayer = forgedReveal.session.game.players[0]
    if (firstPlayer === undefined) throw new Error('Expected first player.')
    firstPlayer.publiclyRevealedRoleId = ROLE_IDS.citizen
    expect(restorePersistedSessionEnvelopeV2(forgedReveal)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_DISCUSSION_SESSION',
        reason: 'invalid-game',
      },
    })

    const obsoleteMarker = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)),
    ) as {
      session: { game: { players: { mayorRevealed: boolean }[] } }
    }
    const obsoletePlayer = obsoleteMarker.session.game.players[0]
    if (obsoletePlayer === undefined) throw new Error('Expected first player.')
    obsoletePlayer.mayorRevealed = true
    expect(restorePersistedSessionEnvelopeV2(obsoleteMarker)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_DISCUSSION_SESSION',
        reason: 'invalid-game',
      },
    })
  })

  it('restores the former generated false Mayor marker without retaining it', () => {
    const compatibleEnvelope = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)),
    ) as {
      session: {
        game: { players: (Record<string, unknown> & { mayorRevealed?: boolean })[] }
      }
    }
    for (const player of compatibleEnvelope.session.game.players) {
      player.mayorRevealed = false
    }

    const restored = restorePersistedSessionEnvelopeV2(compatibleEnvelope)
    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error('Expected prior V2 compatibility.')
    expect(JSON.stringify(toPersistedAppSessionV2(restored.value.session))).not.toContain(
      'mayorRevealed',
    )
  })
})

describe('persisted Phase 7C final day outcome V2', () => {
  it.each(['execution', 'no-execution'] as const)(
    'round-trips the exact %s result without temporary UI or later-stage authority',
    (kind) => {
      const session = createDayOutcomeSession(kind)
      const persisted = toPersistedAppSessionV2(session)
      const restored = roundTrip(session)

      expect(restored).toEqual(session)
      expect(persisted).toMatchObject({
        stage: 'day-outcome',
        workflowStatus: 'day-outcome',
        game: {
          neutralStateVersion: 4,
          phase: 'execution-resolution',
        },
      })
      expect(JSON.stringify(persisted)).not.toMatch(
        /dialogOpen|selectedExecution|operationPending|eligibleCandidates|summaryProse|winner|nextNight/,
      )
    },
  )

  it('round-trips a permanent Jester win and victim-free pending revenge', () => {
    const session = createDayOutcomeSession('execution', [
      { roleId: ROLE_IDS.jester, name: 'Public player' },
      { roleId: ROLE_IDS.godfather, name: 'Private player' },
      { roleId: ROLE_IDS.citizen, name: 'Town player' },
    ])
    const restored = roundTrip(session)

    expect(restored).toEqual(session)
    if (restored.stage !== 'day-outcome') throw new Error('Expected day outcome.')
    expect(restored.game.personalWins).toHaveLength(1)
    expect(restored.game.pendingJesterRevenges).toHaveLength(1)
    expect(restored.game.pendingJesterRevenges[0]).not.toHaveProperty('victimPlayerId')
  })

  it('rejects partial fields, duplicate wins, and stale private day state', () => {
    const session = createDayOutcomeSession('execution', [
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.citizen },
    ])
    const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
    if (envelope.session.stage !== 'day-outcome') throw new Error('Expected persisted outcome.')
    const partialGame = Object.fromEntries(
      Object.entries(envelope.session.game).filter(([key]) => key !== 'personalWins'),
    )
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: { ...envelope.session, game: partialGame },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_DAY_OUTCOME_SESSION', reason: 'invalid-game' },
    })

    const win = envelope.session.game.personalWins[0]
    if (win === undefined) throw new Error('Expected persisted Jester win.')
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          game: {
            ...envelope.session.game,
            personalWins: [...envelope.session.game.personalWins, win],
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_DAY_OUTCOME_SESSION', reason: 'invalid-game' },
    })
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: { ...envelope.session, selectedExecutionPlayerId: 'player-1' },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_OUTCOME_SESSION',
        reason: 'contains-stale-day-data',
      },
    })
  })

  it('rejects a forged post-day session outside the Phase 7C Day 1 boundary', () => {
    const envelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2(createDayOutcomeSession('no-execution'), SAVED_AT),
      ),
    ) as {
      session: {
        game: {
          nightNumber: number
          dayNumber: number
          dayOutcomes: { dayNumber: number }[]
        }
      }
    }
    envelope.session.game.nightNumber = 2
    envelope.session.game.dayNumber = 2
    const firstOutcome = envelope.session.game.dayOutcomes[0]
    if (firstOutcome === undefined) throw new Error('Expected a completed day outcome.')
    firstOutcome.dayNumber = 2

    expect(restorePersistedSessionEnvelopeV2(envelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_OUTCOME_SESSION',
        reason: 'invalid-game',
      },
    })
  })

  it('rejects a matching hidden-role reveal in day and post-day saves', () => {
    const dayEnvelope = JSON.parse(
      JSON.stringify(createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)),
    ) as {
      session: {
        game: { players: { publiclyRevealedRoleId: string | null }[] }
      }
    }
    const hiddenCitizen = dayEnvelope.session.game.players[1]
    if (hiddenCitizen === undefined) throw new Error('Expected hidden Citizen.')
    hiddenCitizen.publiclyRevealedRoleId = ROLE_IDS.citizen
    expect(restorePersistedSessionEnvelopeV2(dayEnvelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_DISCUSSION_SESSION',
        reason: 'invalid-game',
      },
    })

    const deadMayorFixture = createNightFixture(
      [{ roleId: ROLE_IDS.mayor, alive: false }, { roleId: ROLE_IDS.godfather }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const deadMayorEnvelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2(
          {
            stage: 'day-discussion',
            game: { ...deadMayorFixture.game, dayNumber: 1 },
            participants: deadMayorFixture.participants,
          },
          SAVED_AT,
        ),
      ),
    ) as {
      session: {
        game: { players: { publiclyRevealedRoleId: string | null }[] }
      }
    }
    const deadMayor = deadMayorEnvelope.session.game.players[0]
    if (deadMayor === undefined) throw new Error('Expected dead Mayor.')
    deadMayor.publiclyRevealedRoleId = ROLE_IDS.mayor
    expect(restorePersistedSessionEnvelopeV2(deadMayorEnvelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_DISCUSSION_SESSION',
        reason: 'invalid-game',
      },
    })

    const postDayEnvelope = JSON.parse(
      JSON.stringify(
        createPersistedSessionEnvelopeV2(
          createDayOutcomeSession('execution', [
            { roleId: ROLE_IDS.jester },
            { roleId: ROLE_IDS.godfather },
            { roleId: ROLE_IDS.citizen },
          ]),
          SAVED_AT,
        ),
      ),
    ) as {
      session: {
        game: { players: { publiclyRevealedRoleId: string | null }[] }
      }
    }
    const hiddenJester = postDayEnvelope.session.game.players[0]
    if (hiddenJester === undefined) throw new Error('Expected hidden Jester.')
    hiddenJester.publiclyRevealedRoleId = ROLE_IDS.jester
    expect(restorePersistedSessionEnvelopeV2(postDayEnvelope)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_OUTCOME_SESSION',
        reason: 'invalid-game',
      },
    })
  })

  it('upgrades an all-alive prior-neutral day save but fails closed on unexplained deaths', () => {
    const currentDayEnvelope = createPersistedSessionEnvelopeV2(createDaySession(), SAVED_AT)
    if (currentDayEnvelope.session.stage !== 'day-discussion') {
      throw new Error('Expected persisted day discussion.')
    }
    const priorDayEnvelope = {
      ...currentDayEnvelope,
      session: {
        ...currentDayEnvelope.session,
        game: toPriorNeutralGame(currentDayEnvelope.session.game),
      },
    }
    const compatible = restorePersistedSessionEnvelopeV2(priorDayEnvelope)
    expect(compatible.ok).toBe(true)
    if (!compatible.ok) throw new Error('Expected compatible prior-neutral day save.')
    expect(toPersistedAppSessionV2(compatible.value.session)).toMatchObject({
      stage: 'day-discussion',
      game: {
        neutralStateVersion: 4,
        godfatherPromotions: [],
        deathRecords: [],
        personalWins: [],
        executionerConversions: [],
        pendingJesterRevenges: [],
        jesterRevengeResolutions: [],
        dayOutcomes: [],
      },
    })

    const deadFixture = createNightFixture(
      [{ roleId: ROLE_IDS.citizen, alive: false }, { roleId: ROLE_IDS.godfather }],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const deadSession: ActiveAppSession = {
      stage: 'day-discussion',
      game: { ...deadFixture.game, dayNumber: 1 },
      participants: deadFixture.participants,
    }
    const deadEnvelope = createPersistedSessionEnvelopeV2(deadSession, SAVED_AT)
    if (deadEnvelope.session.stage !== 'day-discussion') {
      throw new Error('Expected dead-player day save.')
    }
    expect(
      restorePersistedSessionEnvelopeV2({
        ...deadEnvelope,
        session: {
          ...deadEnvelope.session,
          game: toPriorNeutralGame(deadEnvelope.session.game),
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'PERSISTENCE_COMPATIBILITY_FAILURE',
        reason: 'legacy-day-death-cause-unavailable',
      },
    })
  })

  it('uses a prior-neutral Dawn announcement as exact night-death conversion evidence', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen, alive: false },
        { roleId: ROLE_IDS.godfather },
      ],
      { phase: 'dawn-announcement', nightNumber: 1 },
    )
    const deadTarget = fixture.game.players[1]
    if (deadTarget === undefined) throw new Error('Expected dead target.')
    const session: ActiveAppSession = {
      stage: 'dawn',
      workflow: {
        status: 'dawn',
        game: fixture.game,
        participants: fixture.participants,
        dawnAnnouncement: {
          outcome: 'deaths',
          nightNumber: 1,
          deaths: [
            {
              playerId: deadTarget.playerId,
              revealedRoleId: deadTarget.publiclyRevealedRoleId,
            },
          ],
        },
      },
    }
    const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
    if (envelope.session.stage !== 'dawn') throw new Error('Expected Dawn save.')

    const result = restorePersistedSessionEnvelopeV2({
      ...envelope,
      session: {
        ...envelope.session,
        game: toPriorNeutralGame(envelope.session.game),
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected Dawn upgrade: ${result.error.type}`)
    if (result.value.session.stage !== 'dawn') throw new Error('Expected restored Dawn.')
    expect(result.value.session.workflow.game.deathRecords).toHaveLength(1)
    expect(result.value.session.workflow.game.executionerConversions).toHaveLength(1)
  })
})

describe('persisted corrected Phase 7D sessions in schema V2', () => {
  it.each([
    {
      name: 'Town',
      roles: [{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.godfather, alive: false }],
      expectedKind: 'town-victory',
    },
    {
      name: 'Mafia',
      roles: [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      expectedKind: 'mafia-victory',
    },
    {
      name: 'Serial Killer',
      roles: [{ roleId: ROLE_IDS.serialKiller }, { roleId: ROLE_IDS.citizen, alive: false }],
      expectedKind: 'serial-killer-victory',
    },
    {
      name: 'no-survivors draw',
      roles: [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.citizen, alive: false },
      ],
      expectedKind: 'draw',
    },
  ] as const)('round-trips $name game over', ({ roles, expectedKind }) => {
    const session = settleDayOutcome(createDayOutcomeSession('no-execution', roles))
    const persisted = toPersistedAppSessionV2(session)
    const restored = roundTrip(session)

    expect(restored).toEqual(session)
    expect(persisted).toMatchObject({
      stage: 'game-over',
      workflowStatus: 'game-over',
      game: { phase: 'game-over', nightNumber: 1, dayNumber: 1 },
      result: { kind: expectedKind, gameId: 'night-fixture-game' },
    })
    expect(JSON.stringify(persisted)).not.toMatch(
      /displayLabel|roleLabel|summaryProse|hostRoleView|showHostRoles|nextNight|revengeResolution/,
    )
  })

  it('round-trips non-terminal waiting without next-night authority', () => {
    const session = settleDayOutcome(
      createDayOutcomeSession('no-execution', [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    expect(session.stage).toBe('post-day-waiting')
    expect(roundTrip(session)).toEqual(session)
    expect(JSON.stringify(toPersistedAppSessionV2(session))).not.toMatch(/result|nextNight/)
  })

  it('round-trips pending-revenge waiting without selecting a victim or evaluating victory', () => {
    const session = settleDayOutcome(
      createDayOutcomeSession('execution', [
        { roleId: ROLE_IDS.jester },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    expect(session.stage).toBe('pending-revenge-waiting')
    const persisted = toPersistedAppSessionV2(session)
    const restored = roundTrip(session)

    expect(restored).toEqual(session)
    if (restored.stage !== 'pending-revenge-waiting') {
      throw new Error('Expected restored pending waiting.')
    }
    expect(restored.game.pendingJesterRevenges).toHaveLength(1)
    expect(restored.game.pendingJesterRevenges[0]).not.toHaveProperty('victimPlayerId')
    expect(restored.game.phase).toBe('execution-resolution')
    expect(persisted).not.toHaveProperty('result')
    expect(JSON.stringify(persisted)).not.toMatch(/victimPlayerId|revengeResolution|nextNight/)
  })

  it('upgrades unambiguous Phase 7D day and terminal sessions from neutral sub-version 2', () => {
    const sessions = [
      createDayOutcomeSession('no-execution', [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ]),
      settleDayOutcome(
        createDayOutcomeSession('no-execution', [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
        ]),
      ),
      settleDayOutcome(
        createDayOutcomeSession('execution', [
          { roleId: ROLE_IDS.jester },
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.citizen },
        ]),
      ),
      settleDayOutcome(
        createDayOutcomeSession('no-execution', [
          { roleId: ROLE_IDS.framer },
          { roleId: ROLE_IDS.consort },
          { roleId: ROLE_IDS.citizen },
          { roleId: ROLE_IDS.citizen },
        ]),
      ),
    ]

    for (const session of sessions) {
      const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
      if (!('game' in envelope.session)) {
        throw new Error('Expected a Phase 7D session with game authority.')
      }
      const legacyEnvelope = {
        ...envelope,
        session: {
          ...envelope.session,
          game: toPhase7DNeutralGame(envelope.session.game),
        },
      }
      const restored = restorePersistedSessionEnvelopeV2(legacyEnvelope)
      expect(restored.ok).toBe(true)
      if (!restored.ok) throw new Error(`Expected Phase 7D upgrade: ${restored.error.type}`)
      expect(restored.value.session).toEqual(session)
    }
  })

  it('rejects partial, forged, unknown, duplicate, reordered, and cross-game terminal results', () => {
    const session = settleDayOutcome(
      createDayOutcomeSession('no-execution', [
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
    if (envelope.session.stage !== 'game-over') throw new Error('Expected game over envelope.')

    const partialResult = Object.fromEntries(
      Object.entries(envelope.session.result).filter(([key]) => key !== 'winnerPlayerIds'),
    )
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: { ...envelope.session, result: partialResult },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_GAME_OVER_SESSION', reason: 'invalid-result' },
    })

    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          result: { kind: 'town-victory', gameId: envelope.session.game.id },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_GAME_OVER_SESSION', reason: 'invalid-result' },
    })

    if (envelope.session.result.kind !== 'mafia-victory') {
      throw new Error('Expected persisted Mafia result.')
    }
    const winner = envelope.session.result.winnerPlayerIds[0]
    const secondWinner = envelope.session.result.winnerPlayerIds[1]
    if (winner === undefined || secondWinner === undefined) {
      throw new Error('Expected duplicate Mafia winners.')
    }
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          result: { ...envelope.session.result, winnerPlayerIds: ['unknown-player'] },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_GAME_OVER_SESSION', reason: 'invalid-result' },
    })
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          result: { ...envelope.session.result, winnerPlayerIds: [winner, winner] },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_GAME_OVER_SESSION', reason: 'invalid-result' },
    })
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          result: { ...envelope.session.result, winnerPlayerIds: [secondWinner, winner] },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_GAME_OVER_SESSION', reason: 'invalid-result' },
    })
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          result: { ...envelope.session.result, gameId: 'other-game' },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_GAME_OVER_SESSION', reason: 'invalid-result' },
    })
  })

  it('rejects waiting/result mismatches and terminal state with pending revenge', () => {
    const waiting = settleDayOutcome(
      createDayOutcomeSession('no-execution', [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    const waitingEnvelope = createPersistedSessionEnvelopeV2(waiting, SAVED_AT)
    expect(
      restorePersistedSessionEnvelopeV2({
        ...waitingEnvelope,
        session: {
          ...waitingEnvelope.session,
          stage: 'pending-revenge-waiting',
          workflowStatus: 'pending-revenge-waiting',
        },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_POST_DAY_WAITING_SESSION',
        reason: 'waiting-stage-result-mismatch',
      },
    })

    const pending = settleDayOutcome(
      createDayOutcomeSession('execution', [
        { roleId: ROLE_IDS.jester },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    const pendingEnvelope = createPersistedSessionEnvelopeV2(pending, SAVED_AT)
    if (pendingEnvelope.session.stage !== 'pending-revenge-waiting') {
      throw new Error('Expected persisted pending-revenge waiting.')
    }
    expect(
      restorePersistedSessionEnvelopeV2({
        ...pendingEnvelope,
        session: {
          ...pendingEnvelope.session,
          stage: 'game-over',
          workflowStatus: 'game-over',
          game: { ...pendingEnvelope.session.game, phase: 'game-over' },
          result: {
            kind: 'mafia-victory',
            gameId: pendingEnvelope.session.game.id,
            winnerPlayerIds: [],
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_GAME_OVER_SESSION', reason: 'invalid-game' },
    })
  })

  it('rejects a forged later-day game over with incomplete history', () => {
    const session = settleDayOutcome(
      createDayOutcomeSession('no-execution', [
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.godfather, alive: false },
      ]),
    )
    const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
    if (
      envelope.session.stage !== 'game-over' ||
      envelope.session.game.dayOutcomes[0] === undefined
    ) {
      throw new Error('Expected persisted Day 1 game over.')
    }
    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          game: {
            ...envelope.session.game,
            nightNumber: 2,
            dayNumber: 2,
            dayOutcomes: [{ ...envelope.session.game.dayOutcomes[0], dayNumber: 2 }],
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'INVALID_GAME_OVER_SESSION',
        reason: 'invalid-game',
      },
    })
  })
})
