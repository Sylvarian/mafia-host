// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const randomnessRestrictedRoots = [
  join(process.cwd(), 'src/domain'),
  join(process.cwd(), 'src/application'),
] as const
const forbiddenRandomnessAccess = /\bMath\s*(?:\.\s*random\b|\[\s*(['"])random\1\s*\])/u
const architectureCheckTimeout = 20_000

function listProductionTypeScriptFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...listProductionTypeScriptFiles(entryPath))
    } else if (/\.tsx?$/u.test(entry.name) && !/\.(?:test|spec)\.tsx?$/u.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

describe('domain randomness boundary', () => {
  it('prevents production domain and application modules from calling global randomness', () => {
    const files = randomnessRestrictedRoots.flatMap((root) => listProductionTypeScriptFiles(root))

    for (const file of files) {
      const source = readFileSync(file, 'utf8')

      expect(source, relative(process.cwd(), file)).not.toMatch(forbiddenRandomnessAccess)
    }
  })

  it(
    'rejects direct, extracted, computed, aliased, and indirect global randomness access',
    async () => {
      const eslint = new ESLint({ cwd: process.cwd() })
      const fixturePath = resolve(randomnessRestrictedRoots[0], 'randomness/random-source.ts')
      const source = `
        export const direct = Math.random()
        const extractedRandom = Math.random
        export const extracted = extractedRandom()
        export const computed = Math['random']()
        const mathAlias = Math
        export const aliased = mathAlias.random()
        export const indirect = globalThis.Math.random()
      `
      const [result] = await eslint.lintText(source, { filePath: fixturePath })

      expect(result?.errorCount).toBeGreaterThanOrEqual(5)
    },
    architectureCheckTimeout,
  )

  it(
    'allows deterministic numeric operations on injected values',
    async () => {
      const eslint = new ESLint({ cwd: process.cwd() })
      const fixturePath = resolve(randomnessRestrictedRoots[0], 'randomness/random-source.ts')
      const [result] = await eslint.lintText(
        'export const index = (value: number): number => Math.floor(value * 10)',
        { filePath: fixturePath },
      )

      expect(result?.errorCount).toBe(0)
    },
    architectureCheckTimeout,
  )

  it(
    'rejects global randomness from application assignment code',
    async () => {
      const eslint = new ESLint({ cwd: process.cwd() })
      const fixturePath = resolve(randomnessRestrictedRoots[1], 'role-assignment/assign-roles.ts')
      const [result] = await eslint.lintText('export const value = Math.random()', {
        filePath: fixturePath,
      })

      expect(result?.errorCount).toBeGreaterThan(0)
    },
    architectureCheckTimeout,
  )
})
