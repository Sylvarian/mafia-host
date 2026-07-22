import { describe, expect, it } from 'vitest'

import {
  createResolutionFixture,
  resolveFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { executePlayerDuringDay } from '../../domain/day/day-outcome.ts'
import { validateGameState } from '../../domain/game/game-invariants.ts'
import { createCollectedNightActions } from '../../domain/night-actions/night-action.ts'
import { ROLE_IDS } from '../../domain/roles/role-registry.ts'
import { captureImportantNightEventCanonicalSource } from '../../domain/resolution/important-night-events.ts'
import { beginNightResolution } from '../../domain/resolution/night-application.ts'
import { resolveNight } from '../../domain/resolution/night-resolution.ts'
import {
  continueJesterRevengeResolution,
  finalizeNightAtDawn,
} from '../night-completion/night-completion-workflow.ts'
import {
  createPersistedSessionEnvelopeV2,
  restorePersistedSessionEnvelopeV2,
  type ActiveAppSession,
} from './index.ts'

const SAVED_AT = '2026-07-23T00:00:00.000Z'

function createProtectedDawnEnvelope() {
  const fixture = createResolutionFixture(
    [
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.sheriff },
      { roleId: ROLE_IDS.citizen },
    ],
    [4, 4, 3, 0, null],
  )
  const resolution = resolveFixture(fixture)
  const participants = Object.freeze(
    fixture.game.players.map((player, index) =>
      Object.freeze({
        id: player.playerId,
        name: `Player ${String(index + 1)}`,
        playing: true,
      }),
    ),
  )
  const begun = beginNightResolution(fixture.game, resolution, fixture.collectedActions)
  if (!begun.ok) throw new Error(`Expected ready-for-Dawn game: ${begun.error.type}`)
  const finalized = finalizeNightAtDawn(
    {
      status: 'ready-for-dawn',
      importantNightEventSource: captureImportantNightEventCanonicalSource(
        fixture.game,
        fixture.collectedActions,
      ),
      game: begun.value,
      participants,
      resolution,
      collectedActions: fixture.collectedActions,
    },
    { next: () => 0 },
  )
  if (!finalized.ok || finalized.value.status !== 'dawn') {
    throw new Error('Expected non-terminal Dawn workflow.')
  }
  const session: ActiveAppSession = { stage: 'dawn', workflow: finalized.value }
  return createPersistedSessionEnvelopeV2(session, SAVED_AT)
}

describe('important night-event persistence authority', () => {
  it('round-trips complete evidence with its canonical confirmed-action source', () => {
    const envelope = createProtectedDawnEnvelope()
    if (envelope.session.stage !== 'dawn') throw new Error('Expected persisted Dawn.')

    expect(envelope.session.importantNightEvents.completeness).toBe('complete')
    expect(envelope.session.importantNightEvents.canonicalSource).not.toBeNull()
    expect(envelope.session.importantNightEvents).not.toHaveProperty('events')
    expect(restorePersistedSessionEnvelopeV2(envelope)).toMatchObject({
      ok: true,
      value: { session: { stage: 'dawn' } },
    })
  })

  it('rejects an omitted confirmed action and a coordinated Doctor-target substitution', () => {
    const envelope = createProtectedDawnEnvelope()
    if (envelope.session.stage !== 'dawn') throw new Error('Expected persisted Dawn.')
    const evidence = envelope.session.importantNightEvents
    const source = evidence.canonicalSource
    if (source === null) throw new Error('Expected complete canonical source.')

    const omitted = {
      ...envelope,
      session: {
        ...envelope.session,
        importantNightEvents: {
          ...evidence,
          canonicalSource: {
            ...source,
            collectedActions: source.collectedActions.filter(
              (action) => action.actorRoleInstanceId !== 'role-instance-2',
            ),
          },
        },
      },
    }
    expect(restorePersistedSessionEnvelopeV2(omitted)).toMatchObject({
      ok: false,
      error: { reason: 'invalid-important-night-events' },
    })

    const substitutedDoctorTargets = {
      ...envelope,
      session: {
        ...envelope.session,
        importantNightEvents: {
          ...evidence,
          canonicalSource: {
            ...source,
            collectedActions: source.collectedActions.map((action) =>
              action.actorRoleInstanceId === 'role-instance-2'
                ? { ...action, targetPlayerId: 'player-4' }
                : action.actorRoleInstanceId === 'role-instance-3'
                  ? { ...action, targetPlayerId: 'player-5' }
                  : action,
            ),
          },
        },
      },
    }
    expect(restorePersistedSessionEnvelopeV2(substitutedDoctorTargets)).toMatchObject({
      ok: false,
      error: { reason: 'invalid-important-night-events' },
    })
  })

  it('reconciles a recorded current-night Jester revenge against the same final game', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.jester },
        { roleId: ROLE_IDS.executioner },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const [jester, protectedCitizen, doctor, godfather] = [
      fixture.game.players[0],
      fixture.game.players[2],
      fixture.game.players[4],
      fixture.game.players[5],
    ]
    if (
      jester === undefined ||
      protectedCitizen === undefined ||
      doctor === undefined ||
      godfather === undefined
    ) {
      throw new Error('Expected the complete Jester-revenge fixture.')
    }
    const execution = executePlayerDuringDay(fixture.game, jester.playerId)
    if (!execution.ok) throw new Error('Expected the Jester execution.')
    const sourceGame = validateGameState({
      ...execution.value,
      phase: 'night-action-collection',
      nightNumber: 2,
    })
    if (!sourceGame.ok) throw new Error('Expected the post-execution night source game.')
    const collectedActions = createCollectedNightActions(
      sourceGame.value,
      [
        {
          actorPlayerId: godfather.playerId,
          actorRoleInstanceId: godfather.role.instanceId,
          actorRoleId: ROLE_IDS.godfather,
          actionKind: 'attack',
          targetPlayerId: protectedCitizen.playerId,
        },
        {
          actorPlayerId: doctor.playerId,
          actorRoleInstanceId: doctor.role.instanceId,
          actorRoleId: ROLE_IDS.doctor,
          actionKind: 'protect',
          targetPlayerId: protectedCitizen.playerId,
        },
      ],
      [],
    )
    if (!collectedActions.ok) throw new Error('Expected complete Night 2 actions.')
    const resolution = resolveNight({
      game: sourceGame.value,
      collectedActions: collectedActions.value,
      previousTargets: [],
    })
    if (!resolution.ok) throw new Error('Expected Night 2 resolution.')
    const begun = beginNightResolution(sourceGame.value, resolution.value, collectedActions.value)
    if (!begun.ok) throw new Error('Expected ready-for-Dawn state.')
    const selected = finalizeNightAtDawn(
      {
        status: 'ready-for-dawn',
        importantNightEventSource: captureImportantNightEventCanonicalSource(
          sourceGame.value,
          collectedActions.value,
        ),
        game: begun.value,
        participants: fixture.participants,
        resolution: resolution.value,
        collectedActions: collectedActions.value,
      },
      { next: () => 0.34 },
    )
    if (!selected.ok || selected.value.status !== 'revenge-resolution') {
      throw new Error('Expected a selected Jester revenge.')
    }
    const dawn = continueJesterRevengeResolution(selected.value)
    if (!dawn.ok || dawn.value.status !== 'dawn') {
      throw new Error('Expected Dawn after Jester revenge.')
    }

    const envelope = createPersistedSessionEnvelopeV2(
      { stage: 'dawn', workflow: dawn.value },
      SAVED_AT,
    )
    expect(restorePersistedSessionEnvelopeV2(envelope)).toMatchObject({
      ok: true,
      value: {
        session: {
          stage: 'dawn',
          workflow: {
            game: {
              jesterRevengeResolutions: [
                expect.objectContaining({ kind: 'victim-killed', resolvedAtNightNumber: 2 }),
              ],
            },
          },
        },
      },
    })
  })
})
