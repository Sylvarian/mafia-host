import { describe, expect, it, vi } from 'vitest'

import { roleInstanceId } from '@/domain/identifiers.ts'
import type { RandomSource } from '@/domain/randomness/random-source.ts'
import type { RoleInstance } from '@/domain/roles/role-instance.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'

import { shuffleRoleInstances } from './shuffle-role-instances.ts'

describe('role-instance Fisher–Yates shuffle', () => {
  it('handles empty and single-element inputs without consuming randomness', () => {
    const next = vi.fn<RandomSource['next']>(() => {
      throw new Error('Randomness is unnecessary for fewer than two roles.')
    })
    const single = [role('only')]

    expect(shuffleRoleInstances([], { next })).toEqual({ ok: true, value: [] })

    const singleResult = shuffleRoleInstances(single, { next })

    expect(singleResult).toEqual({ ok: true, value: single })
    expect(next).not.toHaveBeenCalled()
    if (!singleResult.ok) {
      throw new Error('Expected the single role to shuffle successfully.')
    }
    expect(singleResult.value).not.toBe(single)
    expect(singleResult.value[0]).not.toBe(single[0])
  })

  it('uses the inclusive reverse ranges, one random call per swap, and leaves input unchanged', () => {
    const input = [role('a'), role('b'), role('c'), role('d')]
    const snapshot = JSON.stringify(input)
    const values = [0, 1 - Number.EPSILON, 0.5]
    const next = vi.fn<RandomSource['next']>(() => {
      const value = values.shift()

      if (value === undefined) {
        throw new Error('The shuffle made too many random calls.')
      }

      return value
    })
    const result = shuffleRoleInstances(input, { next })

    expect(result).toEqual({
      ok: true,
      value: [role('d'), role('b'), role('c'), role('a')],
    })
    expect(next).toHaveBeenCalledTimes(input.length - 1)
    expect(values).toEqual([])
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it.each([1, -Number.EPSILON, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects an invalid random value without mutating the source: %s',
    (value) => {
      const input = [role('a'), role('b')]
      const snapshot = JSON.stringify(input)

      expect(shuffleRoleInstances(input, { next: () => value })).toEqual({
        ok: false,
        error: { type: 'INVALID_RANDOM_VALUE', value },
      })
      expect(JSON.stringify(input)).toBe(snapshot)
    },
  )
})

function role(id: string): RoleInstance {
  return {
    instanceId: roleInstanceId(`role-${id}`),
    roleId: ROLE_IDS.doctor,
    ordinal: null,
  }
}
