import { describe, expect, it } from 'vitest'

import { DeterministicRandomSource } from './deterministic-random-source.ts'

describe('DeterministicRandomSource', () => {
  it('returns its configured sequence in order', () => {
    const randomSource = new DeterministicRandomSource([0.25, 0, 0.999])

    expect(randomSource.next()).toBe(0.25)
    expect(randomSource.next()).toBe(0)
    expect(randomSource.next()).toBe(0.999)
  })

  it('fails loudly when the configured sequence is exhausted', () => {
    const randomSource = new DeterministicRandomSource([0.5])

    expect(randomSource.next()).toBe(0.5)
    expect(() => randomSource.next()).toThrow('The deterministic random sequence is exhausted.')
  })

  it('requires at least one configured value', () => {
    expect(() => new DeterministicRandomSource([])).toThrow(
      'A deterministic random sequence must contain at least one value.',
    )
  })

  it.each([-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects an invalid random-source value: %s',
    (value) => {
      expect(() => new DeterministicRandomSource([value])).toThrow(
        'Random source values must be finite numbers from 0 inclusive to 1 exclusive.',
      )
    },
  )
})
