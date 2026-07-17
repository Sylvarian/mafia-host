// @vitest-environment node

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const dependencyCruiserCli = resolve(
  repositoryRoot,
  'node_modules/dependency-cruiser/bin/dependency-cruise.mjs',
)
const allowedFixture = resolve(repositoryRoot, 'tests/architecture/fixtures/allowed/src')
const forbiddenFixture = resolve(repositoryRoot, 'tests/architecture/fixtures/forbidden/src')
const architectureCheckTimeout = 20_000

function runDependencyCruiser(
  outputType: 'err' | 'json',
  source: string,
): SpawnSyncReturns<string> {
  return spawnSync(
    process.execPath,
    [
      dependencyCruiserCli,
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      outputType,
      '--',
      source,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
}

describe('architecture boundaries', () => {
  it(
    'rejects upward layer imports and imports between feature slices',
    () => {
      const result = runDependencyCruiser('err', forbiddenFixture)
      const output = `${result.stdout}${result.stderr}`

      expect(result.status).not.toBe(0)
      expect(output).toContain('domain-only-depends-on-domain')
      expect(output).toContain('feature-slices-are-isolated')
      expect(output).toContain('infrastructure-does-not-depend-upward')
      expect(output).toContain('infrastructure-only-imports-application-contracts')
      expect(output).toContain('features-do-not-compose-infrastructure')
      expect(output).toContain('alias-forbidden.ts')
      expect(output).toContain('src/App.tsx')
    },
    architectureCheckTimeout,
  )

  it(
    'allows public feature APIs and infrastructure adapters that use application contracts',
    () => {
      const result = runDependencyCruiser('err', allowedFixture)

      expect(result.status).toBe(0)
      expect(`${result.stdout}${result.stderr}`).not.toContain('error')
    },
    architectureCheckTimeout,
  )

  it(
    'keeps architecture fixtures out of production analysis',
    () => {
      const result = runDependencyCruiser('json', 'src')
      const output = `${result.stdout}${result.stderr}`

      expect(result.status).toBe(0)
      expect(output).not.toContain('tests/architecture/fixtures')
    },
    architectureCheckTimeout,
  )
})
