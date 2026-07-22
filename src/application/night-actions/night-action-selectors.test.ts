import { describe, expect, it } from 'vitest'

import {
  createNightFixture,
  nightFixturePlayerId,
} from '../../../tests/support/night-action-fixtures.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import {
  beginNextNightActionCollection,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
} from './night-action-workflow.ts'
import {
  selectCurrentNightStepView,
  selectImmediateNightOutcomeView,
} from './night-action-selectors.ts'

describe('exact host night-action selectors', () => {
  it('shows a promoted Godfather with current and original roles in the Mafia overview', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.framer, name: 'Peter' },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
    )
    const begun = beginNextNightActionCollection(fixture.game, fixture.participants, {
      next: () => 0,
    })
    if (!begun.ok) {
      throw new Error('Expected promoted Night 2 overview.')
    }

    expect(selectCurrentNightStepView(begun.value.workflow)).toMatchObject({
      type: 'mafia-overview',
      promotion: {
        promotedPlayerDisplayLabel: 'Peter',
        currentRoleDisplayName: 'Godfather',
        originallyAssignedRoleDisplayName: 'Framer',
      },
      mafiaMembers: [
        {
          playerDisplayLabel: 'Peter',
          roleDisplayName: 'Godfather',
          originallyAssignedRoleDisplayName: 'Framer',
        },
      ],
    })
  })

  it('shows a converted Executioner target as current Jester with the original role', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
        {
          roleId: ROLE_IDS.executioner,
          name: 'Converted target',
          executionerTargetId: nightFixturePlayerId('player-3'),
        },
        { roleId: ROLE_IDS.citizen, name: 'Dead target', alive: false },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const created = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
    if (!created.ok) {
      throw new Error('Expected Sheriff collection.')
    }
    const sheriffTurn = continueNightActionCollection(created.value)
    if (!sheriffTurn.ok || sheriffTurn.value.status !== 'collecting') {
      throw new Error('Expected Sheriff turn.')
    }
    const target = fixture.game.players[1]
    if (target === undefined) throw new Error('Expected converted target.')
    const confirmed = confirmNightActionTarget(sheriffTurn.value, target.playerId)
    if (!confirmed.ok || confirmed.value.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected Sheriff result.')
    }

    expect(selectImmediateNightOutcomeView(confirmed.value)).toMatchObject({
      kind: 'sheriff-result',
      status: 'not-suspicious',
      targetDisplayLabel: 'Converted target',
      targetRoleDisplayName: 'Jester',
      targetOriginallyAssignedRoleDisplayName: 'Executioner',
      targetAlignmentDisplayName: 'Neutral',
      reason: 'role-does-not-appear-suspicious',
    })
  })

  it('reports an exact framed-tonight reason for a suspicious Town target', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.framer, name: 'Framer' },
        { roleId: ROLE_IDS.sheriff, name: 'Sheriff' },
        { roleId: ROLE_IDS.citizen, name: 'Target' },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const created = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
    if (!created.ok) throw new Error('Expected Night 2 collection.')
    const framerTurn = continueNightActionCollection(created.value)
    if (!framerTurn.ok || framerTurn.value.status !== 'collecting') {
      throw new Error('Expected Framer turn.')
    }
    const target = fixture.game.players[2]
    if (target === undefined) throw new Error('Expected framed target.')
    const framed = confirmNightActionTarget(framerTurn.value, target.playerId)
    if (!framed.ok || framed.value.status !== 'collecting') {
      throw new Error('Expected Sheriff turn.')
    }
    const investigated = confirmNightActionTarget(framed.value, target.playerId)
    if (!investigated.ok || investigated.value.status !== 'awaiting-outcome-acknowledgement') {
      throw new Error('Expected framed Sheriff result.')
    }

    expect(selectImmediateNightOutcomeView(investigated.value)).toMatchObject({
      kind: 'sheriff-result',
      status: 'suspicious',
      targetDisplayLabel: 'Target',
      targetRoleDisplayName: 'Citizen',
      targetAlignmentDisplayName: 'Town',
      reason: 'framed-tonight',
    })
  })
})
