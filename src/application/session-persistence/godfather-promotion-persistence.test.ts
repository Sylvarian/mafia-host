import { describe, expect, it } from 'vitest'

import { validateGameState } from '@/domain/game/game-invariants.ts'
import { handleGameCommand } from '@/domain/game/game-reducer.ts'
import { applyGodfatherSuccessionForStartedNight } from '@/domain/mafia/godfather-succession.ts'
import {
  beginNextNightActionCollection,
  createNightActionCollectionForStartedNight,
  ROLE_IDS,
} from '../night-actions/index.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  acknowledgeSessionGodfatherPromotion,
  type GodfatherPromotionBriefingAppSession,
} from './active-app-session.ts'
import {
  createPersistedSessionEnvelopeV2,
  createSessionStageSummary,
  toPersistedAppSessionV2,
} from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

const SAVED_AT = '2026-07-19T10:00:00.000Z'

function createPromotionBriefingSession(): GodfatherPromotionBriefingAppSession {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.godfather, alive: false },
      { roleId: ROLE_IDS.framer, name: 'Promoted player' },
      { roleId: ROLE_IDS.citizen, name: 'Public player' },
    ],
    { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
  )
  const begun = beginNextNightActionCollection(fixture.game, fixture.participants, {
    next: () => 0,
  })
  if (!begun.ok || begun.value.promotion === null) {
    throw new Error('Expected Godfather promotion briefing fixture.')
  }
  return {
    stage: 'godfather-promotion-briefing',
    workflow: begun.value.workflow,
  }
}

describe('Godfather promotion persistence', () => {
  it('round-trips an unacknowledged private briefing without replaying randomness', () => {
    const session = createPromotionBriefingSession()
    const envelope = createPersistedSessionEnvelopeV2(session, SAVED_AT)
    const restored = restorePersistedSessionEnvelopeV2(
      JSON.parse(JSON.stringify(envelope)) as unknown,
    )

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error(`Expected restore: ${restored.error.type}`)
    expect(restored.value.session).toEqual(session)
    expect(createSessionStageSummary(restored.value.session)).toMatchObject({
      stage: 'Night actions',
      nightNumber: 2,
    })
    expect(JSON.stringify(createSessionStageSummary(restored.value.session))).not.toMatch(
      /Godfather|promotion|Promoted player|Framer/i,
    )
  })

  it('does not replay the briefing after its acknowledged sequential session is saved', () => {
    const session = createPromotionBriefingSession()
    const acknowledged = acknowledgeSessionGodfatherPromotion(session)
    if (!acknowledged.ok) throw new Error('Expected acknowledgement.')
    const persisted = createPersistedSessionEnvelopeV2(acknowledged.value, SAVED_AT)
    const restored = restorePersistedSessionEnvelopeV2(persisted)

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error('Expected acknowledged restore.')
    expect(restored.value.session.stage).toBe('sequential-night')
    expect(toPersistedAppSessionV2(restored.value.session).stage).toBe('sequential-night')

    if (persisted.session.stage !== 'sequential-night') {
      throw new Error('Expected persisted sequential session.')
    }
    expect(
      restorePersistedSessionEnvelopeV2({
        ...persisted,
        session: {
          ...persisted.session,
          game: { ...persisted.session.game, godfatherPromotions: [] },
        },
      }).ok,
    ).toBe(false)
  })

  it('migrates a Phase 7E save to enforce succession from its next future night', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
    )
    const gameResult = validateGameState({
      ...fixture.game,
      dayOutcomes: [{ kind: 'no-execution', gameId: fixture.game.id, dayNumber: 1 }],
    })
    if (!gameResult.ok) throw new Error(`Expected completed Day 1: ${gameResult.error.type}`)
    const persisted = toPersistedAppSessionV2({
      stage: 'post-day-waiting',
      game: gameResult.value,
      participants: fixture.participants,
    })
    if (persisted.stage !== 'post-day-waiting') {
      throw new Error('Expected persisted post-day session.')
    }
    const phase7EGame = Object.fromEntries(
      Object.entries(persisted.game).filter(
        ([key]) => key !== 'godfatherPromotions' && key !== 'godfatherSuccessionStartNightNumber',
      ),
    )
    const restored = restorePersistedSessionEnvelopeV2({
      schemaVersion: 2,
      savedAt: SAVED_AT,
      session: {
        ...persisted,
        game: { ...phase7EGame, neutralStateVersion: 3 },
      },
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error(`Expected Phase 7E restore: ${restored.error.type}`)
    if (restored.value.session.stage !== 'post-day-waiting') {
      throw new Error('Expected restored post-day session.')
    }
    expect(restored.value.session.game.godfatherSuccessionStartNightNumber).toBe(2)
    expect(restored.value.session.game.godfatherPromotions).toEqual([])
    expect(
      restorePersistedSessionEnvelopeV2(
        createPersistedSessionEnvelopeV2(restored.value.session, SAVED_AT),
      ).ok,
    ).toBe(true)
  })

  it('round-trips multiple ordered historical promotions', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const first = applyGodfatherSuccessionForStartedNight(fixture.game, { next: () => 0 })
    if (!first.ok || first.value.promotion === null) {
      throw new Error('Expected first historical promotion.')
    }
    const firstOwner = first.value.game.players[1]
    if (firstOwner === undefined) throw new Error('Expected first promotion owner.')
    const postDay = validateGameState({
      ...first.value.game,
      phase: 'execution-resolution',
      dayNumber: 2,
      players: first.value.game.players.map((player) =>
        player.playerId === firstOwner.playerId ? { ...player, alive: false } : player,
      ),
      deathRecords: [
        ...first.value.game.deathRecords,
        {
          gameId: first.value.game.id,
          playerId: firstOwner.playerId,
          roleInstanceId: firstOwner.role.instanceId,
          cause: { kind: 'night-death' as const, nightNumber: 2 },
        },
      ],
      dayOutcomes: [
        ...first.value.game.dayOutcomes,
        { kind: 'no-execution' as const, gameId: first.value.game.id, dayNumber: 2 },
      ],
    })
    if (!postDay.ok) throw new Error(`Expected valid history: ${postDay.error.type}`)
    const startedNightThree = handleGameCommand(postDay.value, {
      type: 'ADVANCE_PHASE',
      targetPhase: 'night-action-collection',
    })
    if (!startedNightThree.ok) throw new Error('Expected Night 3 transition.')
    const second = applyGodfatherSuccessionForStartedNight(startedNightThree.value.state, {
      next: () => 0,
    })
    if (!second.ok || second.value.promotion === null) {
      throw new Error('Expected second historical promotion.')
    }
    const workflow = createNightActionCollectionForStartedNight(
      second.value.game,
      fixture.participants,
    )
    if (!workflow.ok) throw new Error(`Expected Night 3 workflow: ${workflow.error.type}`)
    const session: GodfatherPromotionBriefingAppSession = {
      stage: 'godfather-promotion-briefing',
      workflow: workflow.value,
    }
    const restored = restorePersistedSessionEnvelopeV2(
      createPersistedSessionEnvelopeV2(session, SAVED_AT),
    )

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error(`Expected restore: ${restored.error.type}`)
    expect(restored.value.session).toEqual(session)
    if (restored.value.session.stage !== 'godfather-promotion-briefing') {
      throw new Error('Expected restored promotion briefing.')
    }
    expect(restored.value.session.workflow.game.godfatherPromotions).toHaveLength(2)
  })

  it('rejects missing, forged, and display-enriched promotion authority', () => {
    const session = createPromotionBriefingSession()
    const persisted = toPersistedAppSessionV2(session)
    if (persisted.stage !== 'godfather-promotion-briefing') {
      throw new Error('Expected persisted promotion briefing.')
    }

    for (const godfatherPromotions of [
      [],
      [
        {
          ...persisted.game.godfatherPromotions[0],
          playerId: persisted.game.players[2]?.playerId,
        },
      ],
      [
        {
          ...persisted.game.godfatherPromotions[0],
          alignment: 'mafia',
        },
      ],
    ]) {
      const restored = restorePersistedSessionEnvelopeV2({
        schemaVersion: 2,
        savedAt: SAVED_AT,
        session: {
          ...persisted,
          game: { ...persisted.game, godfatherPromotions },
        },
      })
      expect(restored.ok).toBe(false)
    }
  })
})
