import { describe, expect, it } from 'vitest'

import { validateGameState } from '@/domain/game/game-invariants.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { beginSessionNextNight, type SequentialNightAppSession } from './active-app-session.ts'
import {
  createPersistedSessionEnvelopeV2,
  createSessionStageSummary,
  toPersistedAppSessionV2,
} from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

const SAVED_AT = '2026-07-19T10:00:00.000Z'

function createPromotedNightSession(): SequentialNightAppSession {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.godfather, alive: false },
      { roleId: ROLE_IDS.framer, name: 'Promoted player' },
      { roleId: ROLE_IDS.citizen, name: 'Town one' },
      { roleId: ROLE_IDS.citizen, name: 'Town two' },
      { roleId: ROLE_IDS.citizen, name: 'Town three' },
    ],
    { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
  )
  const begun = beginSessionNextNight(
    {
      stage: 'post-day-waiting',
      game: fixture.game,
      participants: fixture.participants,
    },
    { next: () => 0 },
  )
  if (!begun.ok || begun.value.stage !== 'sequential-night') {
    throw new Error('Expected promoted Night 2.')
  }
  return begun.value
}

describe('Godfather promotion persistence', () => {
  it('round-trips the promotion inside the sequential Mafia overview', () => {
    const session = createPromotedNightSession()
    const restored = restorePersistedSessionEnvelopeV2(
      createPersistedSessionEnvelopeV2(session, SAVED_AT),
    )

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error(`Expected restore: ${restored.error.type}`)
    expect(restored.value.session).toEqual(session)
    const summary = createSessionStageSummary(restored.value.session)
    expect(summary).toMatchObject({
      stage: 'Night actions',
      nightNumber: 2,
      currentHostAction: 'Continue the Mafia overview',
    })
    expect(summary.playerDisplayLabels).toContain('Promoted player')
    expect(toPersistedAppSessionV2(restored.value.session).stage).toBe('sequential-night')
  })

  it('migrates the removed promotion-briefing stage directly to the Mafia overview', () => {
    const current = toPersistedAppSessionV2(createPromotedNightSession())
    if (current.stage !== 'sequential-night') {
      throw new Error('Expected sequential persisted session.')
    }
    const restored = restorePersistedSessionEnvelopeV2({
      schemaVersion: 2,
      savedAt: SAVED_AT,
      session: {
        ...current,
        stage: 'godfather-promotion-briefing',
        workflowStatus: 'promotion-briefing',
        currentStepIndex: 0,
        completedSteps: [],
        currentOutcome: null,
      },
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error(`Expected legacy restore: ${restored.error.type}`)
    expect(restored.value.session.stage).toBe('sequential-night')
    expect(restored.value.writeBackEnvelope?.session.stage).toBe('sequential-night')
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
  })

  it('rejects missing, forged, and display-enriched promotion authority', () => {
    const persisted = toPersistedAppSessionV2(createPromotedNightSession())
    if (persisted.stage !== 'sequential-night') {
      throw new Error('Expected persisted sequential session.')
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
