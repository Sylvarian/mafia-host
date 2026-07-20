import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  createPersistedSessionEnvelopeV2,
  toPersistedAppSessionV2,
} from './persisted-session-v2.ts'
import { restorePersistedSessionEnvelopeV2 } from './restore-persisted-session-v2.ts'

describe('Phase 7F.1 role-delivery persistence compatibility', () => {
  it('writes pending bulk status with no per-player delivery records', () => {
    const session = distributingSession()
    const persisted = toPersistedAppSessionV2(session)

    expect(persisted).toMatchObject({
      stage: 'role-distribution',
      workflowStatus: 'distributing',
      roleCardsDeliveryStatus: 'pending',
    })
    expect(persisted).not.toHaveProperty('deliveredPlayerIds')
    expect(JSON.stringify(persisted)).not.toContain('deliveredPlayerIds')
  })

  it('canonicalizes a legacy all-delivered list to the completed boundary', () => {
    const current = createPersistedSessionEnvelopeV2(
      distributingSession(),
      '2026-07-19T10:00:00.000Z',
    )
    if (current.session.stage !== 'role-distribution') {
      throw new Error('Expected persisted distribution.')
    }
    const legacy = {
      ...current,
      session: {
        stage: 'role-distribution',
        workflowStatus: 'distributing',
        setup: current.session.setup,
        game: current.session.game,
        deliveredPlayerIds: current.session.game.players.map((player) => player.playerId),
      },
    }
    const restored = restorePersistedSessionEnvelopeV2(legacy)
    expect(restored.ok).toBe(true)
    if (!restored.ok || restored.value.session.stage !== 'role-distribution') {
      throw new Error('Expected restored distribution.')
    }
    expect(restored.value.session.workflow.status).toBe('confirmed')
    expect(toPersistedAppSessionV2(restored.value.session)).toMatchObject({
      workflowStatus: 'confirmed',
      roleCardsDeliveryStatus: 'complete',
    })
  })

  it.each([{ deliveredPlayerIds: [] }, { deliveredPlayerIds: ['player-1'] }])(
    'canonicalizes a legacy zero/partial list to pending without retaining records',
    ({ deliveredPlayerIds }) => {
      const current = createPersistedSessionEnvelopeV2(
        distributingSession(),
        '2026-07-19T10:00:00.000Z',
      )
      if (current.session.stage !== 'role-distribution') {
        throw new Error('Expected persisted distribution.')
      }
      const legacy = {
        ...current,
        session: {
          stage: 'role-distribution',
          workflowStatus: 'distributing',
          setup: current.session.setup,
          game: current.session.game,
          deliveredPlayerIds,
        },
      }
      const restored = restorePersistedSessionEnvelopeV2(legacy)
      expect(restored.ok).toBe(true)
      if (!restored.ok || restored.value.session.stage !== 'role-distribution') {
        throw new Error('Expected restored distribution.')
      }
      expect(restored.value.session.workflow.status).toBe('distributing')
      expect(JSON.stringify(toPersistedAppSessionV2(restored.value.session))).not.toContain(
        'deliveredPlayerIds',
      )
    },
  )

  it.each([
    { deliveredPlayerIds: ['player-1', 'player-1'] },
    { deliveredPlayerIds: ['unknown-player'] },
  ])('rejects duplicate or unknown legacy delivery records', ({ deliveredPlayerIds }) => {
    const current = createPersistedSessionEnvelopeV2(
      distributingSession(),
      '2026-07-19T10:00:00.000Z',
    )
    if (current.session.stage !== 'role-distribution') {
      throw new Error('Expected persisted distribution.')
    }
    const restored = restorePersistedSessionEnvelopeV2({
      ...current,
      session: {
        stage: 'role-distribution',
        workflowStatus: 'distributing',
        setup: current.session.setup,
        game: current.session.game,
        deliveredPlayerIds,
      },
    })
    expect(restored).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_SESSION',
        reason: 'legacy-duplicate-or-unknown-delivery-record',
      },
    })
  })

  it('rejects mixed old/new delivery authority', () => {
    const current = createPersistedSessionEnvelopeV2(
      distributingSession(),
      '2026-07-19T10:00:00.000Z',
    )
    if (current.session.stage !== 'role-distribution') {
      throw new Error('Expected persisted distribution.')
    }
    expect(
      restorePersistedSessionEnvelopeV2({
        ...current,
        session: {
          ...current.session,
          deliveredPlayerIds: [],
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        type: 'INVALID_ROLE_DISTRIBUTION_SESSION',
        reason: 'invalid-shape',
      },
    })
  })
})

function distributingSession() {
  const fixture = createNightFixture(
    [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
    { distributionStatus: 'distributing' },
  )
  if (fixture.distribution.status !== 'distributing') {
    throw new Error('Expected distributing fixture.')
  }
  return {
    stage: 'role-distribution' as const,
    workflow: fixture.distribution,
  }
}
