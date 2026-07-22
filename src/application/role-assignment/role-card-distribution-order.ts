import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { RandomSource } from '@/domain/randomness/random-source.ts'

import type { RoleAssignmentError, RoleDistributionError } from './role-assignment-errors.ts'

export function createRoleCardDistributionOrder(
  participantIds: readonly PlayerId[],
  randomSource: RandomSource,
): DomainResult<readonly PlayerId[], RoleAssignmentError> {
  const shuffled = [...participantIds]

  for (let currentIndex = shuffled.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomValue = randomSource.next()
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      return fail({ type: 'INVALID_RANDOM_VALUE', value: randomValue })
    }

    const swapIndex = Math.floor(randomValue * (currentIndex + 1))
    const currentPlayerId = shuffled[currentIndex]
    const swapPlayerId = shuffled[swapIndex]
    if (currentPlayerId === undefined || swapPlayerId === undefined) {
      throw new Error('Fisher–Yates selected an index outside the participant array.')
    }
    shuffled[currentIndex] = swapPlayerId
    shuffled[swapIndex] = currentPlayerId
  }

  return succeed(Object.freeze(shuffled))
}

export function validateRoleCardDistributionOrder(
  order: readonly PlayerId[],
  participantIds: readonly PlayerId[],
): DomainResult<readonly PlayerId[], RoleDistributionError> {
  if (order.length !== participantIds.length) {
    return fail({ type: 'INVALID_ROLE_CARD_DISTRIBUTION_ORDER', reason: 'participant-coverage' })
  }

  const participantSet = new Set(participantIds)
  const seen = new Set<PlayerId>()
  for (const playerId of order) {
    if (!participantSet.has(playerId)) {
      return fail({ type: 'INVALID_ROLE_CARD_DISTRIBUTION_ORDER', reason: 'unknown-player' })
    }
    if (seen.has(playerId)) {
      return fail({ type: 'INVALID_ROLE_CARD_DISTRIBUTION_ORDER', reason: 'duplicate-player' })
    }
    seen.add(playerId)
  }

  return succeed(Object.freeze([...order]))
}
