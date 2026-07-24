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
  it('keeps revealed Mayors in their alignment column but disables them for every Doctor', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.doctor, name: 'Doctor' },
        { roleId: ROLE_IDS.doctor, name: 'Doctor' },
        { roleId: ROLE_IDS.mayor, name: 'Alex' },
        { roleId: ROLE_IDS.mayor, name: 'Alex' },
      ],
      {
        phase: 'night-action-collection',
        nightNumber: 2,
        settings: {
          allowFirstNightKills: true,
          doctorCannotProtectRevealedMayor: true,
        },
      },
    )
    const hiddenMayor = fixture.game.players[2]
    const revealedMayor = fixture.game.players[3]
    if (hiddenMayor === undefined || revealedMayor === undefined) {
      throw new Error('Expected both Mayor copies.')
    }
    const game = {
      ...fixture.game,
      players: fixture.game.players.map((player) =>
        player.playerId === revealedMayor.playerId
          ? { ...player, publiclyRevealedRoleId: ROLE_IDS.mayor }
          : player,
      ),
    }
    const created = createNightActionCollectionForStartedNight(game, fixture.participants)
    if (!created.ok) throw new Error(`Expected Doctor collection: ${created.error.type}`)
    const doctorTurn = continueNightActionCollection(created.value)
    if (!doctorTurn.ok || doctorTurn.value.status !== 'collecting') {
      throw new Error('Expected first Doctor turn.')
    }

    const firstView = selectCurrentNightStepView(doctorTurn.value)
    if (firstView.type !== 'actor-action') throw new Error('Expected first Doctor turn.')
    expect(firstView.targetGroups.map((group) => group.alignment)).toEqual([
      'mafia',
      'town',
      'neutral',
    ])
    expect(
      firstView.targetOptions.find((target) => target.playerId === hiddenMayor.playerId),
    ).toMatchObject({
      playerDisplayLabel: 'Alex (Player 3)',
      activeRoleDisplayName: 'Mayor 1',
      enabled: true,
      disabledReason: null,
    })
    expect(
      firstView.targetOptions.find((target) => target.playerId === revealedMayor.playerId),
    ).toMatchObject({
      playerDisplayLabel: 'Alex (Player 4)',
      activeRoleDisplayName: 'Mayor 2',
      enabled: false,
      disabledReason: { type: 'DOCTOR_CANNOT_PROTECT_REVEALED_MAYOR' },
    })

    const advanced = confirmNightActionTarget(doctorTurn.value, hiddenMayor.playerId)
    if (!advanced.ok || advanced.value.status !== 'collecting') {
      throw new Error('Expected the second Doctor turn.')
    }
    const secondView = selectCurrentNightStepView(advanced.value)
    if (secondView.type !== 'actor-action') throw new Error('Expected second Doctor view.')
    expect(
      secondView.targetOptions.find((target) => target.playerId === revealedMayor.playerId),
    ).toMatchObject({
      enabled: false,
      disabledReason: { type: 'DOCTOR_CANNOT_PROTECT_REVEALED_MAYOR' },
    })

    const unrestricted = createNightActionCollectionForStartedNight(
      {
        ...game,
        settings: { ...game.settings, doctorCannotProtectRevealedMayor: false },
      },
      fixture.participants,
    )
    if (!unrestricted.ok) throw new Error('Expected unrestricted Doctor collection.')
    const unrestrictedTurn = continueNightActionCollection(unrestricted.value)
    if (!unrestrictedTurn.ok || unrestrictedTurn.value.status !== 'collecting') {
      throw new Error('Expected unrestricted Doctor turn.')
    }
    const unrestrictedView = selectCurrentNightStepView(unrestrictedTurn.value)
    if (unrestrictedView.type !== 'actor-action') throw new Error('Expected Doctor turn.')
    expect(
      unrestrictedView.targetOptions.find((target) => target.playerId === revealedMayor.playerId),
    ).toMatchObject({ enabled: true, disabledReason: null })
  })

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
