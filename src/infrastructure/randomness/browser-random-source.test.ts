import { describe, expect, it } from 'vitest'

import { BrowserRandomSource } from './browser-random-source.ts'

describe('BrowserRandomSource', () => {
  it('maps the full unsigned 32-bit Web Crypto range into the RandomSource contract', () => {
    const values = [0, 1, 2 ** 31, 4_294_967_295]
    const randomSource = new BrowserRandomSource((target) => {
      const value = values.shift()

      if (value === undefined) {
        throw new Error('The test Web Crypto sequence is exhausted.')
      }

      target[0] = value
    })
    const resultCount = values.length

    const results = Array.from({ length: resultCount }, () => randomSource.next())

    expect(results).toEqual([0, 1 / 2 ** 32, 0.5, 4_294_967_295 / 2 ** 32])
    expect(results.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})
