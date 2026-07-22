import { describe, expect, it } from 'vitest'

import {
  createCompleteNightWorkflow,
  createResolutionFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { beginFinalNightResolution, finalizeNightAtDawn } from './night-completion-workflow.ts'
import { selectNightCompletionView } from './night-completion-selectors.ts'

function completeDawn(
  roles: Parameters<typeof createResolutionFixture>[0],
  targets: Parameters<typeof createResolutionFixture>[1],
  names: readonly string[],
  options: Parameters<typeof createResolutionFixture>[2] = {},
) {
  const fixture = createResolutionFixture(roles, targets, options)
  const ready = beginFinalNightResolution(createCompleteNightWorkflow(fixture, names))
  if (!ready.ok) throw new Error(`Could not prepare Dawn: ${ready.error.type}`)
  const finalized = finalizeNightAtDawn(ready.value, { next: () => 0 })
  if (!finalized.ok || finalized.value.status !== 'dawn') {
    throw new Error('Expected non-terminal Dawn.')
  }
  const view = selectNightCompletionView(finalized.value)
  if (view.status !== 'dawn') throw new Error('Expected Dawn view.')
  return view
}

describe('exact host Dawn selectors', () => {
  it('identifies duplicate-safe Doctors, the protected player, and the attacker', () => {
    const view = completeDawn(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.citizen },
      ],
      [4, 4, 4, 4, null],
      ['Alex', 'Doctor', 'Doctor', 'Sheriff', 'Alex'],
    )

    expect(view.importantEvents).toHaveLength(1)
    const event = view.importantEvents[0]
    if (event?.kind !== 'doctor-save') throw new Error('Expected Doctor-save event.')
    expect(event.attacker).toMatchObject({
      playerDisplayLabel: 'Alex (Player 1)',
      activeRoleDisplayName: 'Godfather',
    })
    expect(event.target).toMatchObject({
      playerDisplayLabel: 'Alex (Player 5)',
      activeRoleDisplayName: 'Citizen',
    })
    expect(event.doctors).toMatchObject([
      {
        playerDisplayLabel: 'Doctor (Player 2)',
        activeRoleDisplayName: 'Doctor 1',
      },
      {
        playerDisplayLabel: 'Doctor (Player 3)',
        activeRoleDisplayName: 'Doctor 2',
      },
    ])
  })

  it('keeps the direction of a one-way immunity attack', () => {
    const view = completeDawn(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      [1, 3, 4, null, null],
      ['George', 'Alex', 'Doctor', 'Target', 'Patient'],
    )

    const immunity = view.importantEvents.find((event) => event.kind === 'attack-immunity')
    if (immunity?.kind !== 'attack-immunity') throw new Error('Expected one-way immunity.')
    expect(immunity.attacker).toMatchObject({
      playerDisplayLabel: 'George',
      activeRoleDisplayName: 'Godfather',
    })
    expect(immunity.target).toMatchObject({
      playerDisplayLabel: 'Alex',
      activeRoleDisplayName: 'Serial Killer',
    })
    expect(view.importantEvents.some((event) => event.kind === 'mutual-attack-immunity')).toBe(
      false,
    )
  })

  it('combines two reciprocal immunity attacks exactly once', () => {
    const view = completeDawn(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      [1, 0, 3, null, null],
      ['George', 'Alex', 'Doctor', 'Patient', 'Town'],
    )

    expect(view.importantEvents).toHaveLength(1)
    const mutual = view.importantEvents[0]
    if (mutual?.kind !== 'mutual-attack-immunity') {
      throw new Error('Expected mutual immunity.')
    }
    expect(mutual.firstAttacker.playerDisplayLabel).toBe('George')
    expect(mutual.secondAttacker.playerDisplayLabel).toBe('Alex')
  })

  it('changes only the announcement role when reveal-on-death is enabled', () => {
    const roles = [
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.sheriff },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.citizen },
    ]
    const targets = [1, 0, 4, null, null]
    const names = ['George', 'Sarah', 'Doctor', 'Town', 'Patient']
    const hidden = completeDawn(roles, targets, names, {
      settings: { revealRoleOnDeath: false },
    })
    const revealed = completeDawn(roles, targets, names, {
      settings: { revealRoleOnDeath: true },
    })

    expect(hidden.announcement).toMatchObject({
      deaths: [{ playerDisplayLabel: 'Sarah', revealedRoleDisplayName: null }],
    })
    expect(revealed.announcement).toMatchObject({
      deaths: [{ playerDisplayLabel: 'Sarah', revealedRoleDisplayName: 'Sheriff' }],
    })
    expect(hidden.hostResults.deaths[0]).toMatchObject({
      playerDisplayLabel: 'Sarah',
      activeRoleDisplayName: 'Sheriff',
      cause: {
        kind: 'ordinary-night-attack',
        attackers: [{ playerDisplayLabel: 'George', activeRoleDisplayName: 'Godfather' }],
      },
    })
    expect(revealed.hostResults).toEqual(hidden.hostResults)
  })
})
