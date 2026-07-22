import { describe, expect, it } from 'vitest'

import { completeDayWithoutExecution } from '../day-outcome/index.ts'
import { buildCurrentDawnAnnouncement } from '@/domain/resolution/dawn-announcement.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  beginSessionNextNight,
  settleSessionAfterDayOutcome,
  type DayOutcomeAppSession,
  type DawnAppSession,
  type GameOverAppSession,
  type PostDayWaitingAppSession,
} from './active-app-session.ts'
import { createPersistedSessionEnvelopeV2, type PersistedGameV2 } from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

const SAVED_AT = '2026-07-20T04:00:00.000Z'

function finalTwoSession(mutualKillingEnabled: boolean): GameOverAppSession {
  const fixture = createNightFixture(
    [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
    {
      phase: 'day-discussion',
      nightNumber: 1,
      settings: { godfatherAndSerialCanKillEachOther: mutualKillingEnabled },
    },
  )
  const completed = completeDayWithoutExecution({
    game: { ...fixture.game, dayNumber: 1 },
    participants: fixture.participants,
  })
  if (!completed.ok) throw new Error(`Could not complete day: ${completed.error.type}`)
  const daySession: DayOutcomeAppSession = {
    stage: 'day-outcome',
    game: completed.value.game,
    participants: completed.value.participants,
  }
  const settled = settleSessionAfterDayOutcome(daySession)
  if (!settled.ok || settled.value.stage !== 'game-over') {
    throw new Error('Expected final-two game over.')
  }
  return settled.value
}

function twoGodfatherSession(): GameOverAppSession {
  const fixture = createNightFixture(
    [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.godfather }],
    {
      phase: 'day-discussion',
      nightNumber: 1,
      settings: { godfatherAndSerialCanKillEachOther: true },
    },
  )
  const completed = completeDayWithoutExecution({
    game: { ...fixture.game, dayNumber: 1 },
    participants: fixture.participants,
  })
  if (!completed.ok) throw new Error(`Could not complete day: ${completed.error.type}`)
  const settled = settleSessionAfterDayOutcome({
    stage: 'day-outcome',
    game: completed.value.game,
    participants: completed.value.participants,
  })
  if (!settled.ok || settled.value.stage !== 'game-over') {
    throw new Error('Expected Mafia game over.')
  }
  return settled.value
}

function promotedFinalTwoSession(mutualKillingEnabled: boolean): GameOverAppSession {
  const fixture = createNightFixture(
    [{ roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.serialKiller }],
    {
      phase: 'execution-resolution',
      nightNumber: 1,
      dayNumber: 1,
      settings: { godfatherAndSerialCanKillEachOther: mutualKillingEnabled },
    },
  )
  const begun = beginSessionNextNight(
    {
      stage: 'post-day-waiting',
      game: fixture.game,
      participants: fixture.participants,
    },
    { next: () => 0 },
  )
  if (!begun.ok || begun.value.stage !== 'game-over') {
    throw new Error('Expected promoted final-two game over.')
  }
  return begun.value
}

function toPhase7EGame(game: PersistedGameV2): Readonly<Record<string, unknown>> {
  return {
    ...Object.fromEntries(
      Object.entries(game).filter(
        ([key]) => key !== 'godfatherSuccessionStartNightNumber' && key !== 'godfatherPromotions',
      ),
    ),
    neutralStateVersion: 3,
  }
}

function toPhase7DGame(game: PersistedGameV2): Readonly<Record<string, unknown>> {
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

function toPreRuleGame(
  game: PersistedGameV2,
  version: 2 | 3 | 4,
): Readonly<Record<string, unknown>> {
  return version === 2 ? toPhase7DGame(game) : version === 3 ? toPhase7EGame(game) : game
}

describe('opposing killing-role draw persistence', () => {
  it.each([
    { boundary: 'post-day', version: 2, setting: false, deathCount: 0 },
    { boundary: 'post-day', version: 2, setting: true, deathCount: 2 },
    { boundary: 'post-day', version: 3, setting: false, deathCount: 0 },
    { boundary: 'post-day', version: 3, setting: true, deathCount: 2 },
    { boundary: 'post-day', version: 4, setting: false, deathCount: 0 },
    { boundary: 'post-day', version: 4, setting: true, deathCount: 2 },
    { boundary: 'post-dawn', version: 2, setting: false, deathCount: 0 },
    { boundary: 'post-dawn', version: 2, setting: true, deathCount: 2 },
    { boundary: 'post-dawn', version: 3, setting: false, deathCount: 0 },
    { boundary: 'post-dawn', version: 3, setting: true, deathCount: 2 },
    { boundary: 'post-dawn', version: 4, setting: false, deathCount: 0 },
    { boundary: 'post-dawn', version: 4, setting: true, deathCount: 2 },
  ] as const)(
    'upgrades a pre-rule v$version $boundary final two to its deterministic draw (mutual killing: $setting)',
    ({ boundary, version, setting, deathCount }) => {
      const fixture = createNightFixture(
        [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
        {
          phase: boundary === 'post-day' ? 'day-discussion' : 'dawn-announcement',
          nightNumber: 1,
          dayNumber: boundary === 'post-day' ? 1 : 0,
          settings: { godfatherAndSerialCanKillEachOther: setting },
        },
      )
      let session: PostDayWaitingAppSession | DawnAppSession
      if (boundary === 'post-day') {
        const completed = completeDayWithoutExecution({
          game: fixture.game,
          participants: fixture.participants,
        })
        if (!completed.ok) throw new Error(`Could not complete day: ${completed.error.type}`)
        session = {
          stage: 'post-day-waiting',
          game: completed.value.game,
          participants: completed.value.participants,
        }
      } else {
        session = {
          stage: 'dawn',
          workflow: {
            status: 'dawn',
            game: fixture.game,
            participants: fixture.participants,
            dawnAnnouncement: buildCurrentDawnAnnouncement(fixture.game),
            importantNightEvents: {
              gameId: fixture.game.id,
              nightNumber: fixture.game.nightNumber,
              completeness: 'legacy-unavailable',
              canonicalSource: null,
              events: [],
            },
          },
        }
      }
      const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
      if (envelope.session.stage !== 'post-day-waiting' && envelope.session.stage !== 'dawn') {
        throw new Error(`Expected persisted ${boundary} session.`)
      }
      const restored = restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          game: toPreRuleGame(envelope.session.game, version),
        },
      })

      expect(restored.ok).toBe(true)
      if (!restored.ok || restored.value.session.stage !== 'game-over') {
        throw new Error('Expected pre-rule final two to migrate to game over.')
      }
      expect(restored.value.session).toMatchObject({
        stage: 'game-over',
        game: {
          phase: 'game-over',
        },
        result: {
          kind: 'draw',
          reason: setting ? 'opposing-killers-mutual-elimination' : 'opposing-killers-stalemate',
        },
      })
      expect(restored.value.session.game.deathRecords).toHaveLength(deathCount)
      const upgradedEnvelope = createPersistedSessionEnvelopeV2(restored.value.session, SAVED_AT)
      if (upgradedEnvelope.session.stage !== 'game-over') {
        throw new Error('Expected upgraded game-over persistence.')
      }
      expect(upgradedEnvelope.session.game.neutralStateVersion).toBe(4)
      expect(restored.value.writeBackEnvelope).toEqual(upgradedEnvelope)
    },
  )

  it.each([
    {
      name: 'stalemate',
      setting: false,
      reason: 'opposing-killers-stalemate',
      deathCount: 0,
    },
    {
      name: 'mutual elimination',
      setting: true,
      reason: 'opposing-killers-mutual-elimination',
      deathCount: 2,
    },
  ] as const)(
    'round-trips the exact $name reason and evidence without reapplying the outcome',
    ({ setting, reason, deathCount }) => {
      const session = finalTwoSession(setting)
      const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
      const restored = restorePersistedSessionEnvelopeV2(
        JSON.parse(JSON.stringify(envelope)) as unknown,
      )

      expect(envelope.schemaVersion).toBe(2)
      expect(envelope.session).toMatchObject({
        stage: 'game-over',
        game: {
          neutralStateVersion: 4,
        },
        result: { kind: 'draw', reason },
      })
      expect(restored.ok).toBe(true)
      if (!restored.ok || restored.value.session.stage !== 'game-over') {
        throw new Error('Expected restored game over.')
      }
      expect(restored.value.session).toEqual(session)
      expect(restored.value.session.game.deathRecords).toHaveLength(deathCount)
      expect(restored.value.session.result).toEqual(session.result)
    },
  )

  it.each([false, true])(
    'round-trips an immediate post-promotion final two without creating night-action authority (mutual killing: %s)',
    (setting) => {
      const session = promotedFinalTwoSession(setting)
      const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
      const restored = restorePersistedSessionEnvelopeV2(envelope)

      expect(restored.ok).toBe(true)
      if (!restored.ok || restored.value.session.stage !== 'game-over') {
        throw new Error('Expected restored promoted final-two game over.')
      }
      expect(restored.value.session).toEqual(session)
      expect(restored.value.session.game.godfatherPromotions).toHaveLength(1)
      expect(restored.value.session.game.nightNumber).toBe(2)
      expect(restored.value.session.game.dayNumber).toBe(1)
      expect(restored.value.session.game.players[0]?.role.roleId).toBe(ROLE_IDS.framer)
    },
  )

  it.each([
    {
      name: 'mutual reason on stalemate evidence',
      setting: false,
      reason: 'opposing-killers-mutual-elimination',
    },
    {
      name: 'stalemate reason on mutual evidence',
      setting: true,
      reason: 'opposing-killers-stalemate',
    },
    {
      name: 'generic no-survivor reason on mutual evidence',
      setting: true,
      reason: 'no-survivors',
    },
  ] as const)('rejects $name', ({ setting, reason }) => {
    const envelope = createPersistedSessionEnvelopeV2(finalTwoSession(setting), SAVED_AT)
    if (envelope.session.stage !== 'game-over') throw new Error('Expected game over.')

    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          result: {
            kind: 'draw',
            gameId: envelope.session.game.id,
            reason,
          },
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_OVER_SESSION',
        reason: 'final-two-showdown-incompatible',
      },
    })
  })

  it.each(['mafia-victory', 'serial-killer-victory'] as const)(
    'rejects a forged %s result for a qualifying stalemate',
    (kind) => {
      const envelope = createPersistedSessionEnvelopeV2(finalTwoSession(false), SAVED_AT)
      if (envelope.session.stage !== 'game-over') throw new Error('Expected game over.')
      const result =
        kind === 'mafia-victory'
          ? {
              kind,
              gameId: envelope.session.game.id,
              winnerPlayerIds: [envelope.session.game.players[0]?.playerId ?? 'missing'],
            }
          : {
              kind,
              gameId: envelope.session.game.id,
              winnerPlayerIds: [envelope.session.game.players[1]?.playerId ?? 'missing'],
            }

      expect(
        restorePersistedSessionEnvelopeV2({
          ...envelope,
          session: { ...envelope.session, result },
        }),
      ).toEqual({
        ok: false,
        error: {
          type: 'INVALID_GAME_OVER_SESSION',
          reason: 'final-two-showdown-incompatible',
        },
      })
    },
  )

  it('rejects partial and malformed linked showdown evidence with the structured restore error', () => {
    const envelope = createPersistedSessionEnvelopeV2(finalTwoSession(true), SAVED_AT)
    if (envelope.session.stage !== 'game-over' || envelope.session.game.deathRecords.length !== 2) {
      throw new Error('Expected mutual-elimination evidence.')
    }
    const firstDeath = envelope.session.game.deathRecords[0]
    const secondDeath = envelope.session.game.deathRecords[1]
    if (
      firstDeath === undefined ||
      secondDeath === undefined ||
      secondDeath.cause.kind !== 'final-killing-role-showdown'
    ) {
      throw new Error('Expected linked showdown deaths.')
    }

    for (const deathRecords of [
      [firstDeath],
      [
        firstDeath,
        {
          ...secondDeath,
          cause: {
            ...secondDeath.cause,
            opponentPlayerId: secondDeath.playerId,
          },
        },
      ],
    ]) {
      expect(
        restorePersistedSessionEnvelopeV2({
          ...envelope,
          session: {
            ...envelope.session,
            game: { ...envelope.session.game, deathRecords },
          },
        }),
      ).toEqual({
        ok: false,
        error: {
          type: 'INVALID_GAME_OVER_SESSION',
          reason: 'final-two-showdown-incompatible',
        },
      })
    }
  })

  it('rejects forged same-faction showdown evidence', () => {
    const envelope = createPersistedSessionEnvelopeV2(twoGodfatherSession(), SAVED_AT)
    if (envelope.session.stage !== 'game-over') throw new Error('Expected Mafia game over.')
    const first = envelope.session.game.players[0]
    const second = envelope.session.game.players[1]
    if (first === undefined || second === undefined) throw new Error('Expected two Godfathers.')
    const boundary = { kind: 'post-day' as const, dayNumber: 1 }
    const deathRecords = [
      {
        gameId: envelope.session.game.id,
        playerId: first.playerId,
        roleInstanceId: first.role.instanceId,
        cause: {
          kind: 'final-killing-role-showdown' as const,
          boundary,
          opponentPlayerId: second.playerId,
        },
      },
      {
        gameId: envelope.session.game.id,
        playerId: second.playerId,
        roleInstanceId: second.role.instanceId,
        cause: {
          kind: 'final-killing-role-showdown' as const,
          boundary,
          opponentPlayerId: first.playerId,
        },
      },
    ]

    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          ...envelope.session,
          game: {
            ...envelope.session.game,
            players: envelope.session.game.players.map((player) => ({
              ...player,
              alive: false,
            })),
            deathRecords,
          },
          result: {
            kind: 'draw',
            gameId: envelope.session.game.id,
            reason: 'opposing-killers-mutual-elimination',
          },
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_OVER_SESSION',
        reason: 'final-two-showdown-incompatible',
      },
    })
  })

  it('rejects a final-two draw stored while more than two players remain alive', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'day-discussion', nightNumber: 1 },
    )
    const completed = completeDayWithoutExecution({
      game: { ...fixture.game, dayNumber: 1 },
      participants: fixture.participants,
    })
    if (!completed.ok) throw new Error(`Could not complete day: ${completed.error.type}`)
    const settled = settleSessionAfterDayOutcome({
      stage: 'day-outcome',
      game: completed.value.game,
      participants: completed.value.participants,
    })
    if (!settled.ok || settled.value.stage !== 'post-day-waiting') {
      throw new Error('Expected a non-terminal three-player state.')
    }
    const envelope = createPersistedSessionEnvelopeV2(settled.value, SAVED_AT)
    if (envelope.session.stage !== 'post-day-waiting') {
      throw new Error('Expected persisted post-day waiting.')
    }

    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          stage: 'game-over',
          workflowStatus: 'game-over',
          game: { ...envelope.session.game, phase: 'game-over' },
          participants: envelope.session.participants,
          result: {
            kind: 'draw',
            gameId: envelope.session.game.id,
            reason: 'opposing-killers-stalemate',
          },
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_GAME_OVER_SESSION',
        reason: 'final-two-showdown-incompatible',
      },
    })
  })

  it('rejects pre-applied showdown evidence in a non-terminal persisted stage', () => {
    const envelope = createPersistedSessionEnvelopeV2(finalTwoSession(true), SAVED_AT)
    if (envelope.session.stage !== 'game-over') throw new Error('Expected game over.')

    expect(
      restorePersistedSessionEnvelopeV2({
        ...envelope,
        session: {
          stage: 'day-outcome',
          workflowStatus: 'day-outcome',
          game: {
            ...envelope.session.game,
            phase: 'execution-resolution',
          },
          participants: envelope.session.participants,
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_DAY_OUTCOME_SESSION',
        reason: 'invalid-game',
      },
    })
  })
})
