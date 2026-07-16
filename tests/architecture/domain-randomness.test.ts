// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const domainRoot = join(process.cwd(), 'src/domain')
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
  it('prevents production domain modules from calling global randomness', () => {
    for (const file of listProductionTypeScriptFiles(domainRoot)) {
      const source = readFileSync(file, 'utf8')

      expect(source, relative(process.cwd(), file)).not.toMatch(forbiddenRandomnessAccess)
    }
  })

  it(
    'rejects direct, extracted, computed, aliased, and indirect global randomness access',
    async () => {
      const eslint = new ESLint({ cwd: process.cwd() })
      const fixturePath = resolve(domainRoot, 'randomness/random-source.ts')
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
      const fixturePath = resolve(domainRoot, 'randomness/random-source.ts')
      const [result] = await eslint.lintText(
        'export const index = (value: number): number => Math.floor(value * 10)',
        { filePath: fixturePath },
      )

      expect(result?.errorCount).toBe(0)
    },
    architectureCheckTimeout,
  )
})
