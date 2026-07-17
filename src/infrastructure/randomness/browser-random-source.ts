import type { RandomSource } from '@/domain/randomness/random-source.ts'

type FillRandomValues = (values: Uint32Array<ArrayBuffer>) => void

const UINT32_RANGE = 2 ** 32

export class BrowserRandomSource implements RandomSource {
  readonly #fillRandomValues: FillRandomValues

  constructor(fillRandomValues: FillRandomValues = fillWithBrowserCrypto) {
    this.#fillRandomValues = fillRandomValues
  }

  next(): number {
    const values = new Uint32Array(1)
    this.#fillRandomValues(values)
    const value = values[0]

    if (value === undefined) {
      throw new Error('Web Crypto did not produce a random value.')
    }

    // This preserves RandomSource's [0, 1) contract. Mapping these finite values with
    // floor(random * range) can give some output buckets one extra source value when `range` does
    // not divide 2 ** 32, so browser-backed integer selection is not mathematically unbiased.
    return value / UINT32_RANGE
  }
}

function fillWithBrowserCrypto(values: Uint32Array<ArrayBuffer>): void {
  crypto.getRandomValues(values)
}
