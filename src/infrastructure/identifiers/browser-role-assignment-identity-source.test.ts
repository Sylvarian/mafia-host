import { describe, expect, it } from 'vitest'

import { BrowserRoleAssignmentIdentitySource } from './browser-role-assignment-identity-source.ts'

describe('BrowserRoleAssignmentIdentitySource', () => {
  it('uses one browser-created session token with independent monotonic identity sequences', () => {
    const source = new BrowserRoleAssignmentIdentitySource({
      randomUUID: () => 'browser-session-token',
    })

    expect(source.nextGameId()).toBe('game-browser-session-token-1')
    expect(source.nextRoleInstanceId()).toBe('role-instance-browser-session-token-1')
    expect(source.nextRoleInstanceId()).toBe('role-instance-browser-session-token-2')
    expect(source.nextGameId()).toBe('game-browser-session-token-2')
  })

  it('fails explicitly when browser UUID support is unavailable or malformed', () => {
    expect(() => new BrowserRoleAssignmentIdentitySource({})).toThrow(
      'Web Crypto randomUUID() is required',
    )
    expect(() => new BrowserRoleAssignmentIdentitySource({ randomUUID: () => '   ' })).toThrow(
      'Web Crypto randomUUID() returned an empty browser-session identity.',
    )
  })

  it('uses a fresh browser-session prefix after refresh so future identities cannot reuse restored values', () => {
    const beforeRefresh = new BrowserRoleAssignmentIdentitySource({
      randomUUID: () => 'before-refresh',
    })
    const restoredIdentityValues = new Set([
      beforeRefresh.nextGameId(),
      beforeRefresh.nextRoleInstanceId(),
      beforeRefresh.nextRoleInstanceId(),
    ])
    const afterRefresh = new BrowserRoleAssignmentIdentitySource({
      randomUUID: () => 'after-refresh',
    })
    const generatedAfterRefresh = [
      afterRefresh.nextGameId(),
      afterRefresh.nextRoleInstanceId(),
      afterRefresh.nextRoleInstanceId(),
    ]

    expect(generatedAfterRefresh.every((value) => !restoredIdentityValues.has(value))).toBe(true)
    expect(new Set(generatedAfterRefresh).size).toBe(generatedAfterRefresh.length)
  })
})
