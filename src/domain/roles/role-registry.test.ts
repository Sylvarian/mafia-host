import { describe, expect, it } from 'vitest'

import { ROLE_IDS, ROLE_REGISTRY } from './role-registry.ts'

describe('role registry', () => {
  it('defines every named role once in stable faction order', () => {
    expect(ROLE_REGISTRY.map(({ id, name, faction }) => ({ id, name, faction }))).toEqual([
      { id: 'godfather', name: 'Godfather', faction: 'mafia' },
      { id: 'framer', name: 'Framer', faction: 'mafia' },
      { id: 'consort', name: 'Consort', faction: 'mafia' },
      { id: 'consigliere', name: 'Consigliere', faction: 'mafia' },
      { id: 'sheriff', name: 'Sheriff', faction: 'town' },
      { id: 'detective', name: 'Detective', faction: 'town' },
      { id: 'investigator', name: 'Investigator', faction: 'town' },
      { id: 'doctor', name: 'Doctor', faction: 'town' },
      { id: 'mayor', name: 'Mayor', faction: 'town' },
      { id: 'citizen', name: 'Citizen', faction: 'town' },
      { id: 'jester', name: 'Jester', faction: 'neutral' },
      { id: 'executioner', name: 'Executioner', faction: 'neutral' },
      { id: 'serial-killer', name: 'Serial Killer', faction: 'neutral' },
    ])
  })

  it('provides setup metadata without claiming gameplay implementation', () => {
    expect(new Set(ROLE_REGISTRY.map((role) => role.id)).size).toBe(ROLE_REGISTRY.length)
    expect(Object.isFrozen(ROLE_IDS)).toBe(true)
    expect(Object.isFrozen(ROLE_REGISTRY)).toBe(true)

    for (const role of ROLE_REGISTRY) {
      expect(role.description.length).toBeGreaterThan(0)
      expect(role.gameplayImplementationStatus).toBe('setup-only')
      expect(Object.isFrozen(role)).toBe(true)
    }
  })
})
