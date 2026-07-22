import { describe, expect, it } from 'vitest'

import { playerId } from '@/domain/identifiers.ts'
import type { RandomSource } from '@/domain/randomness/random-source.ts'
import { DeterministicRandomSource } from '../../../tests/support/deterministic-random-source.ts'
import {
  createRoleCardDistributionOrder,
  validateRoleCardDistributionOrder,
} from './role-card-distribution-order.ts'

const p1 = playerId('p1')
const p2 = playerId('p2')
const p3 = playerId('p3')
const p4 = playerId('p4')
const participants = [p1, p2, p3, p4]

describe('physical role-card distribution order', () => {
  it('uses injected Fisher–Yates randomness and includes each participant exactly once', () => {
    const result = createRoleCardDistributionOrder(
      participants,
      new DeterministicRandomSource([0, 0.5, 0.25]),
    )

    expect(result).toEqual({
      ok: true,
      value: [playerId('p3'), playerId('p4'), playerId('p2'), playerId('p1')],
    })
    expect(participants).toEqual([playerId('p1'), playerId('p2'), playerId('p3'), playerId('p4')])
  })

  it('rejects invalid random output without returning a partial order', () => {
    const randomSource: RandomSource = { next: () => 1 }
    expect(createRoleCardDistributionOrder(participants, randomSource)).toEqual({
      ok: false,
      error: { type: 'INVALID_RANDOM_VALUE', value: 1 },
    })
  })

  it.each([
    {
      order: [p1, p1, p3, p4],
      reason: 'duplicate-player',
    },
    {
      order: [p1, p2, p3],
      reason: 'participant-coverage',
    },
    {
      order: [p1, p2, p3, playerId('unknown')],
      reason: 'unknown-player',
    },
  ] as const)('rejects $reason orders', ({ order, reason }) => {
    expect(validateRoleCardDistributionOrder(order, participants)).toEqual({
      ok: false,
      error: { type: 'INVALID_ROLE_CARD_DISTRIBUTION_ORDER', reason },
    })
  })
})
