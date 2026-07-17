import { describe, expect, it } from 'vitest'

import { gameId, playerId, roleId, roleInstanceId } from '../identifiers.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  createCollectedNightActions,
  createSubmittedNightAction,
  validateCollectedNightActions,
  validatePreviousNightTargets,
  type CollectedNightActions,
  type SubmittedNightAction,
} from './night-action.ts'

function actionFor(
  fixture: ReturnType<typeof createNightFixture>,
  actorIndex: number,
  targetIndex: number,
  actionKind: SubmittedNightAction['actionKind'],
): SubmittedNightAction {
  const actor = fixture.game.players[actorIndex]
  const target = fixture.game.players[targetIndex]
  if (actor === undefined || target === undefined) {
    throw new Error('Invalid fixture action index.')
  }
  return {
    actorPlayerId: actor.playerId,
    actorRoleInstanceId: actor.role.instanceId,
    actorRoleId: actor.role.roleId,
    actionKind,
    targetPlayerId: target.playerId,
  }
}

describe('night-action structural validation', () => {
  it('accepts a known living actor and target while retaining role and role-instance identity', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection', nightNumber: 1 },
    )
    const action = actionFor(fixture, 0, 1, 'attack')
    const result = createSubmittedNightAction(fixture.game, action, null)

    expect(result).toEqual({ ok: true, value: action })
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true)
  })

  it('rejects unknown or dead actors and unknown, dead, or self targets', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen, alive: false },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection' },
    )
    const valid = actionFor(fixture, 0, 2, 'attack')

    expect(
      createSubmittedNightAction(
        fixture.game,
        { ...valid, actorPlayerId: playerId('missing') },
        null,
      ),
    ).toMatchObject({ ok: false, error: { type: 'UNKNOWN_ACTOR' } })
    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 1, 2, 'attack'), null),
    ).toMatchObject({ ok: false, error: { type: 'DEAD_ACTOR' } })
    expect(
      createSubmittedNightAction(
        fixture.game,
        { ...valid, targetPlayerId: playerId('missing') },
        null,
      ),
    ).toMatchObject({ ok: false, error: { type: 'UNKNOWN_TARGET' } })
    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 0, 1, 'attack'), null),
    ).toMatchObject({ ok: false, error: { type: 'DEAD_TARGET' } })
    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 0, 0, 'attack'), null),
    ).toMatchObject({ ok: false, error: { type: 'INVALID_SELF_TARGET' } })
  })

  it('rejects unknown, mismatched, no-action, and wrong-kind role submissions', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.doctor }],
      { phase: 'night-action-collection' },
    )
    const godfatherAction = actionFor(fixture, 0, 2, 'attack')

    expect(
      createSubmittedNightAction(
        fixture.game,
        { ...godfatherAction, actorRoleInstanceId: roleInstanceId('missing') },
        null,
      ),
    ).toMatchObject({ ok: false, error: { type: 'UNKNOWN_ROLE_INSTANCE' } })
    expect(
      createSubmittedNightAction(
        fixture.game,
        {
          ...godfatherAction,
          actorRoleInstanceId:
            fixture.game.players[2]?.role.instanceId ?? roleInstanceId('missing'),
        },
        null,
      ),
    ).toMatchObject({ ok: false, error: { type: 'ROLE_INSTANCE_DOES_NOT_BELONG_TO_ACTOR' } })
    expect(
      createSubmittedNightAction(
        fixture.game,
        { ...godfatherAction, actorRoleId: roleId('doctor') },
        null,
      ),
    ).toMatchObject({ ok: false, error: { type: 'ACTOR_ROLE_MISMATCH' } })
    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 1, 2, 'attack'), null),
    ).toMatchObject({ ok: false, error: { type: 'ROLE_HAS_NO_NIGHT_ACTION' } })
    expect(
      createSubmittedNightAction(fixture.game, { ...godfatherAction, actionKind: 'protect' }, null),
    ).toMatchObject({ ok: false, error: { type: 'WRONG_ACTION_KIND' } })
  })

  it('centralises Doctor self-target and per-instance previous-target settings', () => {
    const enabled = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.doctor }],
      {
        phase: 'night-action-collection',
        settings: { doctorCanSelfProtect: true, doctorCannotRepeatPreviousTarget: true },
      },
    )
    const doctorOneSelf = actionFor(enabled, 1, 1, 'protect')
    const doctorOneToGodfather = actionFor(enabled, 1, 0, 'protect')
    const doctorTwoToGodfather = actionFor(enabled, 2, 0, 'protect')
    const doctorTwoToDoctorOne = actionFor(enabled, 2, 1, 'protect')

    expect(createSubmittedNightAction(enabled.game, doctorOneSelf, null).ok).toBe(true)
    expect(
      createSubmittedNightAction(enabled.game, doctorOneSelf, doctorOneSelf.targetPlayerId),
    ).toMatchObject({ ok: false, error: { type: 'DOCTOR_REPEATED_PREVIOUS_TARGET' } })
    expect(
      createSubmittedNightAction(
        enabled.game,
        doctorOneToGodfather,
        doctorOneToGodfather.targetPlayerId,
      ),
    ).toMatchObject({ ok: false, error: { type: 'DOCTOR_REPEATED_PREVIOUS_TARGET' } })
    expect(
      createSubmittedNightAction(enabled.game, doctorTwoToGodfather, doctorOneSelf.targetPlayerId)
        .ok,
    ).toBe(true)
    expect(
      createSubmittedNightAction(
        enabled.game,
        doctorTwoToDoctorOne,
        enabled.game.players[0]?.playerId ?? null,
      ).ok,
    ).toBe(true)

    const disabled = {
      ...enabled.game,
      settings: {
        ...enabled.game.settings,
        doctorCanSelfProtect: false,
        doctorCannotRepeatPreviousTarget: false,
      },
    }
    expect(
      createSubmittedNightAction(disabled, doctorOneSelf, doctorOneSelf.targetPlayerId),
    ).toMatchObject({ ok: false, error: { type: 'INVALID_SELF_TARGET' } })
    expect(
      createSubmittedNightAction(
        disabled,
        doctorTwoToDoctorOne,
        doctorTwoToDoctorOne.targetPlayerId,
      ).ok,
    ).toBe(true)
  })

  it('collects mutual attack intent without resolving the configured lethal effect', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.serialKiller }],
      {
        phase: 'night-action-collection',
        nightNumber: 2,
        settings: { allowFirstNightKills: false, godfatherAndSerialCanKillEachOther: false },
      },
    )

    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 0, 1, 'attack'), null).ok,
    ).toBe(true)
    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 1, 0, 'attack'), null).ok,
    ).toBe(true)
  })

  it('accepts every eligible Consort target, including another Consort', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen, alive: false },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )

    for (const targetIndex of [1, 2, 3, 4]) {
      expect(
        createSubmittedNightAction(
          fixture.game,
          actionFor(fixture, 0, targetIndex, 'role-block'),
          null,
        ).ok,
      ).toBe(true)
    }

    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 0, 0, 'role-block'), null),
    ).toMatchObject({ ok: false, error: { type: 'INVALID_SELF_TARGET' } })
    expect(
      createSubmittedNightAction(fixture.game, actionFor(fixture, 0, 5, 'role-block'), null),
    ).toMatchObject({ ok: false, error: { type: 'DEAD_TARGET' } })
    expect(
      createSubmittedNightAction(
        fixture.game,
        { ...actionFor(fixture, 0, 1, 'role-block'), targetPlayerId: playerId('unknown') },
        null,
      ),
    ).toMatchObject({ ok: false, error: { type: 'UNKNOWN_TARGET' } })
  })

  it('collects mutual and shared Consort targets as intent without calculating a block effect', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection', nightNumber: 1 },
    )
    const mutual = createCollectedNightActions(fixture.game, [
      actionFor(fixture, 0, 1, 'role-block'),
      actionFor(fixture, 1, 0, 'role-block'),
    ])
    const sharedTarget = createCollectedNightActions(fixture.game, [
      actionFor(fixture, 0, 2, 'role-block'),
      actionFor(fixture, 1, 2, 'role-block'),
    ])

    expect(mutual.ok).toBe(true)
    expect(sharedTarget.ok).toBe(true)
    if (!mutual.ok) throw new Error('Expected mutual Consort actions to be collected.')
    expect(mutual.value.actions.every((action) => !('effect' in action))).toBe(true)
    expect(mutual.value.actions.every((action) => !('blocked' in action))).toBe(true)
  })

  it('canonicalises manually constructed submissions to intent fields only', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection' },
    )
    const maliciousAction = {
      ...actionFor(fixture, 0, 1, 'attack'),
      result: 'fabricated-result',
      success: true,
      effect: 'fabricated-effect',
    }
    const result = createSubmittedNightAction(fixture.game, maliciousAction, null)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a structurally valid action.')
    expect(result.value).not.toHaveProperty('result')
    expect(result.value).not.toHaveProperty('success')
    expect(result.value).not.toHaveProperty('effect')
    expect(Object.keys(result.value).sort()).toEqual(
      [
        'actorPlayerId',
        'actorRoleInstanceId',
        'actorRoleId',
        'actionKind',
        'targetPlayerId',
      ].sort(),
    )
  })

  it('validates a complete batch, rejects duplicates and omissions, and freezes the result', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      {
        phase: 'night-action-collection',
        nightNumber: 1,
        settings: { allowFirstNightKills: true },
      },
    )
    const actions = [actionFor(fixture, 0, 1, 'attack'), actionFor(fixture, 1, 0, 'protect')]
    const result = createCollectedNightActions(fixture.game, actions)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a complete action batch.')
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.actions)).toBe(true)
    expect(result.value.actions.every(Object.isFrozen)).toBe(true)
    const firstAction = actions[0]
    const secondAction = actions[1]
    if (firstAction === undefined || secondAction === undefined) {
      throw new Error('Expected both fixture actions.')
    }
    expect(
      createCollectedNightActions(fixture.game, [firstAction, firstAction, secondAction]),
    ).toMatchObject({ ok: false, error: { type: 'DUPLICATE_ACTOR_ACTION' } })
    expect(createCollectedNightActions(fixture.game, [firstAction])).toMatchObject({
      ok: false,
      error: { type: 'MISSING_REQUIRED_ACTION' },
    })
    expect(
      validateCollectedNightActions({ ...fixture.game, id: gameId('other') }, result.value),
    ).toMatchObject({ ok: false, error: { type: 'ACTION_BATCH_GAME_MISMATCH', reason: 'game-id' } })
    expect(
      validateCollectedNightActions({ ...fixture.game, nightNumber: 2 }, result.value),
    ).toMatchObject({
      ok: false,
      error: { type: 'ACTION_BATCH_GAME_MISMATCH', reason: 'night-number' },
    })

    const callerOwnedBatch: CollectedNightActions = {
      ...result.value,
      actions: [...result.value.actions],
    }
    const revalidated = validateCollectedNightActions(fixture.game, callerOwnedBatch)
    expect(revalidated.ok).toBe(true)
    if (!revalidated.ok) throw new Error('Expected the batch to be revalidated.')
    expect(revalidated.value).not.toBe(callerOwnedBatch)
    expect(Object.isFrozen(revalidated.value)).toBe(true)
    expect(Object.isFrozen(revalidated.value.actions)).toBe(true)
    expect(revalidated.value.actions.every(Object.isFrozen)).toBe(true)
  })

  it('rejects unexpected no-action submissions in a manually constructed batch', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.doctor }],
      { phase: 'night-action-collection' },
    )

    expect(
      createCollectedNightActions(fixture.game, [
        actionFor(fixture, 0, 1, 'attack'),
        actionFor(fixture, 1, 0, 'attack'),
        actionFor(fixture, 2, 0, 'protect'),
      ]),
    ).toMatchObject({ ok: false, error: { type: 'ROLE_HAS_NO_NIGHT_ACTION' } })
  })

  it('excludes first-night killing roles from batch requirements and rejects fabricated actions', () => {
    const roles = [
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.serialKiller },
      { roleId: ROLE_IDS.citizen },
    ]
    const disabledFirstNight = createNightFixture(roles, {
      phase: 'night-action-collection',
      nightNumber: 1,
    })

    expect(createCollectedNightActions(disabledFirstNight.game, [])).toEqual({
      ok: true,
      value: {
        gameId: disabledFirstNight.game.id,
        nightNumber: 1,
        actions: [],
      },
    })
    expect(
      createCollectedNightActions(disabledFirstNight.game, [
        actionFor(disabledFirstNight, 0, 1, 'attack'),
      ]),
    ).toMatchObject({
      ok: false,
      error: { type: 'UNEXPECTED_ACTION', actorRoleInstanceId: 'role-instance-1' },
    })
    expect(
      createCollectedNightActions(disabledFirstNight.game, [
        actionFor(disabledFirstNight, 1, 0, 'attack'),
      ]),
    ).toMatchObject({
      ok: false,
      error: { type: 'UNEXPECTED_ACTION', actorRoleInstanceId: 'role-instance-2' },
    })

    for (const fixture of [
      createNightFixture(roles, {
        phase: 'night-action-collection',
        nightNumber: 1,
        settings: { allowFirstNightKills: true },
      }),
      createNightFixture(roles, {
        phase: 'night-action-collection',
        nightNumber: 2,
        settings: { allowFirstNightKills: false },
      }),
    ]) {
      const actions = [actionFor(fixture, 0, 1, 'attack'), actionFor(fixture, 1, 0, 'attack')]

      expect(createCollectedNightActions(fixture.game, actions).ok).toBe(true)
      expect(createCollectedNightActions(fixture.game, actions.slice(0, 1))).toMatchObject({
        ok: false,
        error: { type: 'MISSING_REQUIRED_ACTION', actorRoleInstanceId: 'role-instance-2' },
      })
    }
  })

  it('validates Doctor history identities without rejecting a known target that is now dead', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen, alive: false },
      ],
      {
        phase: 'night-action-collection',
        settings: { doctorCannotRepeatPreviousTarget: true },
      },
    )
    const doctorRoleInstanceId =
      fixture.game.players[1]?.role.instanceId ?? roleInstanceId('missing-doctor')
    const godfatherRoleInstanceId =
      fixture.game.players[0]?.role.instanceId ?? roleInstanceId('missing-godfather')

    expect(
      validatePreviousNightTargets(fixture.game, [
        { actorRoleInstanceId: roleInstanceId('unknown-role-instance'), targetPlayerId: null },
      ]),
    ).toMatchObject({ ok: false, error: { type: 'UNKNOWN_PREVIOUS_TARGET_ROLE_INSTANCE' } })
    expect(
      validatePreviousNightTargets(fixture.game, [
        { actorRoleInstanceId: doctorRoleInstanceId, targetPlayerId: playerId('unknown-target') },
      ]),
    ).toMatchObject({ ok: false, error: { type: 'UNKNOWN_PREVIOUS_TARGET' } })
    expect(
      validatePreviousNightTargets(fixture.game, [
        { actorRoleInstanceId: godfatherRoleInstanceId, targetPlayerId: null },
      ]),
    ).toMatchObject({ ok: false, error: { type: 'PREVIOUS_TARGET_ROLE_NOT_DOCTOR' } })

    const deadPreviousTargetId =
      fixture.game.players[3]?.playerId ?? playerId('missing-dead-target')
    const validHistory = validatePreviousNightTargets(fixture.game, [
      { actorRoleInstanceId: doctorRoleInstanceId, targetPlayerId: deadPreviousTargetId },
    ])
    expect(validHistory.ok).toBe(true)
    if (!validHistory.ok) throw new Error('Expected known dead history to remain valid.')
    expect(Object.isFrozen(validHistory.value)).toBe(true)
    expect(validHistory.value.every(Object.isFrozen)).toBe(true)

    expect(
      createCollectedNightActions(
        fixture.game,
        [actionFor(fixture, 0, 2, 'attack'), actionFor(fixture, 1, 2, 'protect')],
        validHistory.value,
      ).ok,
    ).toBe(true)
  })
})
