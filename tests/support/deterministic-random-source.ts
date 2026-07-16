import type { RandomSource } from '../../src/domain/randomness/random-source.ts'

export class DeterministicRandomSource implements RandomSource {
  readonly #values: readonly number[]
  #nextIndex = 0

  constructor(values: readonly number[]) {
    if (values.length === 0) {
      throw new RangeError('A deterministic random sequence must contain at least one value.')
    }

    for (const value of values) {
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError(
          'Random source values must be finite numbers from 0 inclusive to 1 exclusive.',
        )
      }
    }

    this.#values = [...values]
  }

  next(): number {
    const value = this.#values[this.#nextIndex]

    if (value === undefined) {
      throw new RangeError('The deterministic random sequence is exhausted.')
    }

    this.#nextIndex += 1
    return value
  }
}
