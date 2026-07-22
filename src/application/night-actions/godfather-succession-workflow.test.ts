import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  beginNextNightActionCollection,
  confirmNightActionTarget,
  continueNightActionCollection,
} from './night-action-workflow.ts'
import { selectCurrentNightStepView } from './night-action-selectors.ts'

describe('Godfather succession night workflow', () => {
  it('atomically rebuilds Night 2 so the promoted Framer acts only as Godfather', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.framer, name: 'Promoted player' },
        { roleId: ROLE_IDS.citizen, name: 'Target' },
      ],
      { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
    )
    const begun = beginNextNightActionCollection(fixture.game, fixture.participants, {
      next: () => 0,
    })
    if (!begun.ok) throw new Error(`Expected Night 2: ${begun.error.type}`)

    expect(begun.value.promotion?.playerId).toBe(fixture.game.players[1]?.playerId)
    expect(begun.value.workflow.steps.filter((step) => step.type === 'actor-action')).toHaveLength(
      1,
    )
    const advanced = continueNightActionCollection(begun.value.workflow)
    if (!advanced.ok || advanced.value.status !== 'collecting') {
      throw new Error('Expected promoted actor after Mafia overview.')
    }
    const actorView = selectCurrentNightStepView(advanced.value)
    expect(actorView).toMatchObject({
      type: 'actor-action',
      roleDisplayName: 'Godfather',
      faction: 'mafia',
      factionLabel: 'Mafia',
    })
    const target = advanced.value.game.players[2]
    if (target === undefined) throw new Error('Expected target.')
    const completed = confirmNightActionTarget(advanced.value, target.playerId)
    if (!completed.ok || completed.value.status !== 'complete') {
      throw new Error('Expected one completed promoted action.')
    }
    expect(completed.value.collectedActions.actions).toEqual([
      expect.objectContaining({
        actorPlayerId: fixture.game.players[1]?.playerId,
        actorRoleId: ROLE_IDS.godfather,
        actionKind: 'attack',
      }),
    ])
    expect(JSON.stringify(completed.value.collectedActions)).not.toContain('"frame"')
  })
})
