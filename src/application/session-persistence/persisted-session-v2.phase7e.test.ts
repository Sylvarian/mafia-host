import { describe, expect, it } from 'vitest'

import { executePlayerDuringDay } from '@/domain/day/day-outcome.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import { selectJesterRevengeVictim } from '@/domain/neutral/jester-revenge.ts'
import { buildCurrentDawnAnnouncement } from '@/domain/resolution/dawn-announcement.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { createNightActionCollectionForStartedNight } from '../night-actions/index.ts'
import { resolveSessionJesterRevenge, type ActiveAppSession } from './active-app-session.ts'
import {
  createPersistedSessionEnvelopeV2,
  createSessionStageSummary,
} from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

const SAVED_AT = '2026-07-19T06:00:00.000Z'

function revengeSession(): Extract<ActiveAppSession, Readonly<{ stage: 'revenge-resolution' }>> {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.godfather },
    ],
    { phase: 'day-discussion', nightNumber: 1 },
  )
  const jester = fixture.game.players[0]
  if (jester === undefined) throw new Error('Expected a Jester.')
  const execution = executePlayerDuringDay(fixture.game, jester.playerId)
  if (!execution.ok) throw new Error('Expected Jester execution.')
  const dawn = validateGameState({
    ...execution.value,
    phase: 'dawn-resolution',
    nightNumber: 2,
  })
  if (!dawn.ok) throw new Error('Expected Dawn resolution.')
  const selected = selectJesterRevengeVictim(dawn.value, { next: () => 0.34 })
  if (!selected.ok || selected.value === null) throw new Error('Expected selected revenge.')
  return {
    stage: 'revenge-resolution',
    workflow: {
      status: 'revenge-resolution',
      game: dawn.value,
      participants: fixture.participants,
      selectedRevenge: selected.value,
    },
  }
}

describe('Phase 7E persistence', () => {
  it('round-trips a selected mid-revenge boundary without rerolling or public recovery leakage', () => {
    const session = revengeSession()
    const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
    const restored = restorePersistedSessionEnvelopeV2(
      JSON.parse(JSON.stringify(envelope)) as unknown,
    )

    expect(restored.ok).toBe(true)
    if (!restored.ok || restored.value.session.stage !== 'revenge-resolution') {
      throw new Error('Expected restored revenge resolution.')
    }
    expect(restored.value.session).toEqual(session)
    expect(restored.value.session.workflow.selectedRevenge).toEqual(
      session.workflow.selectedRevenge,
    )
    const summary = createSessionStageSummary(restored.value.session)
    expect(summary).toEqual({
      stage: 'Dawn resolution',
      playerCount: 4,
      nightNumber: 2,
      dayNumber: 1,
      resultLabel: null,
    })
    expect(JSON.stringify(summary)).not.toMatch(
      /revenge|jester|victim|executioner|role-instance|player-/i,
    )

    const originalResolution = resolveSessionJesterRevenge(session)
    const restoredResolution = resolveSessionJesterRevenge(restored.value.session)
    expect(restoredResolution).toEqual(originalResolution)
    expect(originalResolution.ok).toBe(true)
    if (!originalResolution.ok) throw new Error('Expected post-revenge completion.')
    expect(originalResolution.value.stage).toBe('dawn')
    const completedEnvelope = createPersistedSessionEnvelopeV2(originalResolution.value, SAVED_AT)
    expect(restorePersistedSessionEnvelopeV2(completedEnvelope)).toMatchObject({
      ok: true,
      value: { session: originalResolution.value },
    })
  })

  it('rejects a forged persisted victim while retaining the saved selected-victim contract', () => {
    const envelope = createPersistedSessionEnvelopeV2(revengeSession(), SAVED_AT)
    if (envelope.session.stage !== 'revenge-resolution') {
      throw new Error('Expected revenge persistence.')
    }
    const forged = {
      ...envelope,
      session: {
        ...envelope.session,
        selectedRevenge: {
          ...envelope.session.selectedRevenge,
          victimPlayerId: envelope.session.selectedRevenge.jesterPlayerId,
        },
      },
    }

    expect(restorePersistedSessionEnvelopeV2(forged)).toEqual({
      ok: false,
      error: {
        type: 'INVALID_REVENGE_RESOLUTION_SESSION',
        reason: 'invalid-selection',
      },
    })
  })

  it('rejects a public Dawn save that retains an unresolved due revenge', () => {
    const envelope = createPersistedSessionEnvelopeV2(revengeSession(), SAVED_AT)
    if (envelope.session.stage !== 'revenge-resolution') {
      throw new Error('Expected revenge persistence.')
    }
    const forged = {
      ...envelope,
      session: {
        stage: 'dawn',
        workflowStatus: 'dawn',
        game: {
          ...envelope.session.game,
          phase: 'dawn-announcement',
        },
        participants: envelope.session.participants,
        dawnAnnouncement: {
          outcome: 'no-deaths',
          nightNumber: 2,
        },
      },
    }

    expect(restorePersistedSessionEnvelopeV2(forged)).toEqual({
      ok: false,
      error: { type: 'INVALID_DAWN_SESSION', reason: 'invalid-game' },
    })
  })

  it('rejects a current-version public Dawn save whose faction result is already terminal', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'dawn-announcement', nightNumber: 2 },
    )
    const session: ActiveAppSession = {
      stage: 'dawn',
      workflow: {
        status: 'dawn',
        game: fixture.game,
        participants: fixture.participants,
        dawnAnnouncement: buildCurrentDawnAnnouncement(fixture.game),
      },
    }

    expect(
      restorePersistedSessionEnvelopeV2(createPersistedSessionEnvelopeV2(session, SAVED_AT)),
    ).toEqual({
      ok: false,
      error: { type: 'INVALID_DAWN_SESSION', reason: 'invalid-game' },
    })
  })

  it('rejects a forged current-night ordinary death before Dawn resolution', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 3 },
    )
    const workflow = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
    if (!workflow.ok) throw new Error('Expected Night 3 collection.')
    const envelope = createPersistedSessionEnvelopeV2(
      { stage: 'sequential-night', workflow: workflow.value },
      SAVED_AT,
    )
    if (envelope.session.stage !== 'sequential-night') {
      throw new Error('Expected persisted Night 3 collection.')
    }
    const victim = envelope.session.game.players[3]
    if (victim === undefined) throw new Error('Expected a forged victim.')
    const forged = {
      ...envelope,
      session: {
        ...envelope.session,
        game: {
          ...envelope.session.game,
          players: envelope.session.game.players.map((player) =>
            player.playerId === victim.playerId ? { ...player, alive: false } : player,
          ),
          deathRecords: [
            ...envelope.session.game.deathRecords,
            {
              gameId: envelope.session.game.id,
              playerId: victim.playerId,
              roleInstanceId: victim.role.instanceId,
              cause: { kind: 'night-death', nightNumber: 3 },
            },
          ],
        },
      },
    }

    expect(restorePersistedSessionEnvelopeV2(forged)).toEqual({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason: 'invalid-game' },
    })
  })

  it('rejects a forged current-night revenge resolution before Dawn resolution', () => {
    const due = revengeSession()
    const preDawn = validateGameState({
      ...due.workflow.game,
      phase: 'night-action-collection',
    })
    if (!preDawn.ok) throw new Error('Expected a pre-Dawn revenge obligation.')
    const workflow = createNightActionCollectionForStartedNight(
      preDawn.value,
      due.workflow.participants,
    )
    if (!workflow.ok) throw new Error('Expected Night 2 collection.')
    const envelope = createPersistedSessionEnvelopeV2(
      { stage: 'sequential-night', workflow: workflow.value },
      SAVED_AT,
    )
    if (envelope.session.stage !== 'sequential-night') {
      throw new Error('Expected persisted Night 2 collection.')
    }
    const selection = due.workflow.selectedRevenge
    const victim = envelope.session.game.players.find(
      (player) => player.playerId === selection.victimPlayerId,
    )
    if (victim === undefined) throw new Error('Expected selected revenge victim.')
    const forged = {
      ...envelope,
      session: {
        ...envelope.session,
        game: {
          ...envelope.session.game,
          players: envelope.session.game.players.map((player) =>
            player.playerId === victim.playerId ? { ...player, alive: false } : player,
          ),
          pendingJesterRevenges: [],
          jesterRevengeResolutions: [{ ...selection, kind: 'victim-killed' }],
          deathRecords: [
            ...envelope.session.game.deathRecords,
            {
              gameId: envelope.session.game.id,
              playerId: victim.playerId,
              roleInstanceId: victim.role.instanceId,
              cause: {
                kind: 'jester-revenge',
                nightNumber: 2,
                jesterPlayerId: selection.jesterPlayerId,
                jesterRoleInstanceId: selection.jesterRoleInstanceId,
                obligationId: selection.obligationId,
                resolutionId: selection.id,
              },
            },
          ],
        },
      },
    }

    expect(restorePersistedSessionEnvelopeV2(forged)).toEqual({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason: 'invalid-game' },
    })
  })

  it('rejects forged current-night Doctor history before Dawn resolution', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 3 },
    )
    const workflow = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
    if (!workflow.ok) throw new Error('Expected Night 3 collection.')
    const envelope = createPersistedSessionEnvelopeV2(
      { stage: 'sequential-night', workflow: workflow.value },
      SAVED_AT,
    )
    if (envelope.session.stage !== 'sequential-night') {
      throw new Error('Expected persisted Night 3 collection.')
    }
    const doctor = envelope.session.game.players[1]
    const target = envelope.session.game.players[2]
    if (doctor === undefined || target === undefined) {
      throw new Error('Expected Doctor history identities.')
    }
    const forged = {
      ...envelope,
      session: {
        ...envelope.session,
        game: {
          ...envelope.session.game,
          doctorPreviousTargets: [
            {
              doctorRoleInstanceId: doctor.role.instanceId,
              targetPlayerId: target.playerId,
              nightNumber: 3,
            },
          ],
        },
      },
    }

    expect(restorePersistedSessionEnvelopeV2(forged)).toEqual({
      ok: false,
      error: { type: 'INVALID_SEQUENTIAL_NIGHT_SESSION', reason: 'invalid-game' },
    })
  })

  it('round-trips Night 3 with canonical multi-day history and no stale workflow results', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 3 },
    )
    const workflow = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
    if (!workflow.ok) throw new Error(`Expected Night 3: ${workflow.error.type}`)
    const session: ActiveAppSession = { stage: 'sequential-night', workflow: workflow.value }
    const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
    const restored = restorePersistedSessionEnvelopeV2(envelope)

    expect(restored.ok).toBe(true)
    if (!restored.ok || restored.value.session.stage !== 'sequential-night') {
      throw new Error('Expected restored Night 3.')
    }
    expect(restored.value.session.workflow.game).toMatchObject({
      nightNumber: 3,
      dayNumber: 2,
      dayOutcomes: [
        { dayNumber: 1, kind: 'no-execution' },
        { dayNumber: 2, kind: 'no-execution' },
      ],
    })
    expect(restored.value.session.workflow.completedSteps).toEqual([])
    expect(restored.value.session.workflow.currentOutcome).toBeNull()
    expect(restored.value.session).toEqual(session)
  })
})
