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
      expect(Object.isFrozen(role.nightAction)).toBe(true)
    }
  })

  it('defines exhaustive immutable night collection metadata without resolution callbacks', () => {
    const metadataByRole = Object.fromEntries(
      ROLE_REGISTRY.map((role) => [role.id, role.nightAction]),
    )

    expect(metadataByRole).toMatchObject({
      godfather: {
        hasNightAction: true,
        actionKind: 'attack',
        collectionGroup: 'mafia',
        collectionOrder: 10,
      },
      framer: {
        hasNightAction: true,
        actionKind: 'frame',
        collectionGroup: 'mafia',
        collectionOrder: 20,
      },
      consort: {
        hasNightAction: true,
        actionKind: 'role-block',
        collectionGroup: 'mafia',
        collectionOrder: 30,
      },
      consigliere: {
        hasNightAction: true,
        actionKind: 'investigate',
        collectionGroup: 'mafia',
        collectionOrder: 40,
      },
      'serial-killer': {
        hasNightAction: true,
        actionKind: 'attack',
        collectionGroup: 'individual',
        collectionOrder: 50,
      },
      doctor: {
        hasNightAction: true,
        actionKind: 'protect',
        collectionGroup: 'individual',
        collectionOrder: 60,
      },
      sheriff: {
        hasNightAction: true,
        actionKind: 'investigate',
        collectionGroup: 'individual',
        collectionOrder: 70,
      },
      investigator: {
        hasNightAction: true,
        actionKind: 'investigate',
        collectionGroup: 'individual',
        collectionOrder: 80,
      },
      detective: {
        hasNightAction: true,
        actionKind: 'track',
        collectionGroup: 'individual',
        collectionOrder: 90,
      },
      mayor: { hasNightAction: false },
      citizen: { hasNightAction: false },
      jester: { hasNightAction: false },
      executioner: { hasNightAction: false },
    })

    const actingRoles = ROLE_REGISTRY.filter(
      (
        role,
      ): role is typeof role & { nightAction: { hasNightAction: true; collectionOrder: number } } =>
        role.nightAction.hasNightAction,
    )
    expect(new Set(actingRoles.map((role) => role.nightAction.collectionOrder)).size).toBe(
      actingRoles.length,
    )
    for (const role of ROLE_REGISTRY) {
      expect('resolve' in role.nightAction).toBe(false)
      expect('callback' in role.nightAction).toBe(false)
    }
  })
})
