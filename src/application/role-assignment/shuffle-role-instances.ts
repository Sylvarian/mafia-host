import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { RandomSource } from '@/domain/randomness/random-source.ts'
import type { RoleInstance } from '@/domain/roles/role-instance.ts'

import type { RoleAssignmentError } from './role-assignment-errors.ts'

export function shuffleRoleInstances(
  roleInstances: readonly RoleInstance[],
  randomSource: RandomSource,
): DomainResult<readonly RoleInstance[], RoleAssignmentError> {
  const shuffled = roleInstances.map((roleInstance) => ({ ...roleInstance }))

  for (let currentIndex = shuffled.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomValue = randomSource.next()

    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      return fail({ type: 'INVALID_RANDOM_VALUE', value: randomValue })
    }

    const swapIndex = Math.floor(randomValue * (currentIndex + 1))
    const currentRole = shuffled[currentIndex]
    const swapRole = shuffled[swapIndex]

    if (currentRole === undefined || swapRole === undefined) {
      throw new Error('Fisher–Yates selected an index outside the role-instance array.')
    }

    shuffled[currentIndex] = swapRole
    shuffled[swapIndex] = currentRole
  }

  return succeed(shuffled)
}
