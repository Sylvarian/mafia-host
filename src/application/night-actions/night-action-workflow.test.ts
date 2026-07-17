import { describe, expect, it } from 'vitest'

import { playerId, roleInstanceId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  beginFirstNight,
  continueNightActionCollection,
  createNightActionCollectionWorkflow,
  editNightAction,
  finaliseNightActionCollection,
  previousNightActionCollection,
  selectNightActionTarget,
  type CollectingNightActionsWorkflow,
  type NightActionCollectionWorkflow,
  type ReviewingNightActionsWorkflow,
} from './night-action-workflow.ts'
import { selectNightActionReview } from './night-action-selectors.ts'

function beginFixture(
  fixture: ReturnType<typeof createNightFixture>,
): CollectingNightActionsWorkflow {
  const result = beginFirstNight(createNightActionCollectionWorkflow(fixture.distribution))
  if (!result.ok) throw new Error(`Expected first night to begin: ${result.error.type}`)
  return result.value
}

function continueSuccessfully(
  workflow: NightActionCollectionWorkflow,
): NightActionCollectionWorkflow {
  const result = continueNightActionCollection(workflow)
  if (!result.ok) throw new Error(`Expected continuation: ${result.error.type}`)
  return result.value
}

describe('begin first night', () => {
  it('requires confirmed distribution and the role-distribution phase', () => {
    const distributing = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { distributionStatus: 'distributing' },
    )
    expect(beginFirstNight(createNightActionCollectionWorkflow(distributing.distribution))).toEqual(
      {
        ok: false,
        error: { type: 'DISTRIBUTION_NOT_CONFIRMED' },
      },
    )

    const wrongPhase = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection' },
    )
    expect(
      beginFirstNight(createNightActionCollectionWorkflow(wrongPhase.distribution)),
    ).toMatchObject({
      ok: false,
      error: { type: 'INVALID_STARTING_PHASE', currentPhase: 'night-action-collection' },
    })
  })

  it('increments night exactly once, preserves day and assignments, and rejects a repeat begin', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.citizen },
    ])
    const assignmentSnapshot = JSON.stringify(fixture.game.players)
    const workflow = beginFixture(fixture)

    expect(workflow.game).toMatchObject({
      phase: 'night-action-collection',
      nightNumber: 1,
      dayNumber: 0,
    })
    expect(JSON.stringify(workflow.game.players)).toBe(assignmentSnapshot)
    expect(fixture.game).toMatchObject({ phase: 'role-distribution', nightNumber: 0, dayNumber: 0 })
    expect(beginFirstNight(workflow)).toMatchObject({
      ok: false,
      error: { type: 'INVALID_WORKFLOW_STATE', status: 'collecting' },
    })
    expect(workflow.game.nightNumber).toBe(1)
  })

  it('blocks an unset Executioner target without assigning one or entering briefing', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.citizen },
    ])
    const result = beginFirstNight(createNightActionCollectionWorkflow(fixture.distribution))

    expect(result).toMatchObject({
      ok: false,
      error: { type: 'EXECUTIONER_TARGET_REQUIRED', actorPlayerId: 'player-2' },
    })
    expect(fixture.game.phase).toBe('role-distribution')
    expect(fixture.game.players[1]?.executionerTargetId).toBeNull()
  })

  it('checks every living Executioner for a null target before considering briefing', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.executioner, executionerTargetId: playerId('player-3') },
      { roleId: ROLE_IDS.executioner },
      { roleId: ROLE_IDS.citizen },
    ])

    expect(
      beginFirstNight(createNightActionCollectionWorkflow(fixture.distribution)),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'EXECUTIONER_TARGET_REQUIRED',
        actorPlayerId: 'player-2',
        actorRoleInstanceId: 'role-instance-2',
      },
    })
    expect(fixture.game.players.map((player) => player.executionerTargetId)).toEqual([
      'player-3',
      null,
      null,
    ])
  })

  it('does not let a dead Executioner block night entry', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.executioner, alive: false },
      { roleId: ROLE_IDS.citizen },
    ])
    const result = beginFirstNight(createNightActionCollectionWorkflow(fixture.distribution))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected the dead Executioner to be omitted.')
    expect(result.value.steps).toEqual([{ type: 'night-opening' }, { type: 'review' }])
  })

  it('rejects invalid previous-target identities at entry without changing the original game', () => {
    const fixture = createNightFixture([{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }])

    expect(
      beginFirstNight(createNightActionCollectionWorkflow(fixture.distribution), [
        { actorRoleInstanceId: roleInstanceId('unknown-doctor'), targetPlayerId: null },
      ]),
    ).toMatchObject({
      ok: false,
      error: { type: 'UNKNOWN_PREVIOUS_TARGET_ROLE_INSTANCE' },
    })
    expect(fixture.game).toMatchObject({ phase: 'role-distribution', nightNumber: 0 })
  })

  it('returns a structured active-game error for malformed duplicate ordinals', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.citizen },
    ])
    if (fixture.distribution.status !== 'confirmed') {
      throw new Error('Expected a confirmed fixture distribution.')
    }
    const malformedPlayers = fixture.game.players.map((player) =>
      player.role.roleId === ROLE_IDS.doctor
        ? { ...player, role: { ...player.role, ordinal: 1 } }
        : player,
    )
    const malformedDistribution = {
      ...fixture.distribution,
      game: { ...fixture.game, players: malformedPlayers },
    }

    expect(
      beginFirstNight(createNightActionCollectionWorkflow(malformedDistribution)),
    ).toMatchObject({
      ok: false,
      error: {
        type: 'ACTIVE_GAME_REJECTED',
        error: { type: 'INVALID_GAME_STATE', reason: { type: 'ROLE_ORDINAL_MISMATCH' } },
      },
    })
  })

  it('allows games without an Executioner and rejects an actor with no structurally valid target', () => {
    const valid = createNightFixture([{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.citizen }])
    expect(beginFirstNight(createNightActionCollectionWorkflow(valid.distribution)).ok).toBe(true)

    const impossible = createNightFixture([{ roleId: ROLE_IDS.godfather }])
    expect(
      beginFirstNight(createNightActionCollectionWorkflow(impossible.distribution)),
    ).toMatchObject({
      ok: false,
      error: { type: 'NO_VALID_TARGETS' },
    })
  })
})

describe('night-action collection workflow', () => {
  it('starts at the opening, requires targets, revisits actions, and replaces corrections', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather, name: 'Alex' },
      { roleId: ROLE_IDS.doctor, name: 'Alex' },
      { roleId: ROLE_IDS.citizen, name: 'Casey' },
    ])
    let workflow: NightActionCollectionWorkflow = beginFixture(fixture)

    expect(workflow).toMatchObject({
      status: 'collecting',
      currentStepIndex: 0,
      submittedActions: [],
    })
    expect(previousNightActionCollection(workflow)).toMatchObject({
      ok: false,
      error: { type: 'SEQUENCE_BOUNDARY' },
    })
    workflow = continueSuccessfully(workflow)
    workflow = continueSuccessfully(workflow)
    expect(continueNightActionCollection(workflow)).toMatchObject({
      ok: false,
      error: { type: 'TARGET_REQUIRED' },
    })

    let selection = selectNightActionTarget(workflow, playerId('player-2'))
    if (!selection.ok) throw new Error('Expected Godfather target selection.')
    workflow = selection.value
    expect(workflow.submittedActions).toHaveLength(1)
    workflow = continueSuccessfully(workflow)
    const previous = previousNightActionCollection(workflow)
    if (!previous.ok) throw new Error('Expected previous navigation.')
    workflow = previous.value
    expect(workflow).toMatchObject({ status: 'collecting', currentStepIndex: 2 })

    selection = selectNightActionTarget(workflow, playerId('player-3'))
    if (!selection.ok) throw new Error('Expected corrected Godfather target.')
    workflow = selection.value
    expect(workflow.submittedActions).toHaveLength(1)
    expect(workflow.submittedActions[0]?.targetPlayerId).toBe('player-3')
  })

  it('reviews every action in order, edits one actor, and finalises an immutable intent-only batch', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather, name: 'Alice' },
      { roleId: ROLE_IDS.doctor, name: 'Charlie' },
      { roleId: ROLE_IDS.citizen, name: 'Ben' },
    ])
    const originalSnapshot = JSON.stringify(fixture.game)
    let workflow: NightActionCollectionWorkflow = beginFixture(fixture)
    workflow = continueSuccessfully(continueSuccessfully(workflow))
    const godfatherSelection = selectNightActionTarget(workflow, playerId('player-3'))
    if (!godfatherSelection.ok) throw new Error('Expected Godfather selection.')
    workflow = continueSuccessfully(godfatherSelection.value)
    workflow = continueSuccessfully(workflow)
    const doctorSelection = selectNightActionTarget(workflow, playerId('player-1'))
    if (!doctorSelection.ok) throw new Error('Expected Doctor selection.')
    workflow = continueSuccessfully(doctorSelection.value)

    expect(workflow.status).toBe('reviewing')
    if (workflow.status !== 'reviewing') throw new Error('Expected review state.')
    expect(selectNightActionReview(workflow)).toEqual([
      expect.objectContaining({
        roleDisplayName: 'Godfather',
        actionDescription: 'attack',
        targetPlayerName: 'Ben',
      }),
      expect.objectContaining({
        roleDisplayName: 'Doctor',
        actionDescription: 'protect',
        targetPlayerName: 'Alice',
      }),
    ])

    const reversedReview: ReviewingNightActionsWorkflow = {
      ...workflow,
      submittedActions: [...workflow.submittedActions].reverse(),
    }
    expect(selectNightActionReview(reversedReview).map((row) => row.roleDisplayName)).toEqual([
      'Godfather',
      'Doctor',
    ])

    const godfatherRoleInstanceId = workflow.submittedActions[0]?.actorRoleInstanceId
    if (godfatherRoleInstanceId === undefined) throw new Error('Expected Godfather action.')
    const editResult = editNightAction(workflow, godfatherRoleInstanceId)
    if (!editResult.ok) throw new Error('Expected edit state.')
    const corrected = selectNightActionTarget(editResult.value, playerId('player-2'))
    if (!corrected.ok) throw new Error('Expected corrected target.')
    workflow = continueSuccessfully(corrected.value)
    expect(workflow.status).toBe('reviewing')
    if (workflow.status !== 'reviewing') throw new Error('Expected review after Godfather edit.')
    expect(workflow.submittedActions).toHaveLength(2)
    expect(
      workflow.submittedActions.some(
        (action) => action.actorRoleId === ROLE_IDS.doctor && action.targetPlayerId === 'player-1',
      ),
    ).toBe(true)

    const doctorRoleInstanceId = workflow.submittedActions.find(
      (action) => action.actorRoleId === ROLE_IDS.doctor,
    )?.actorRoleInstanceId
    if (doctorRoleInstanceId === undefined) throw new Error('Expected Doctor action.')
    const doctorEdit = editNightAction(workflow, doctorRoleInstanceId)
    if (!doctorEdit.ok) throw new Error('Expected Doctor edit state.')
    const doctorCorrection = selectNightActionTarget(doctorEdit.value, playerId('player-3'))
    if (!doctorCorrection.ok) throw new Error('Expected Doctor correction.')
    workflow = continueSuccessfully(doctorCorrection.value)
    expect(workflow.status).toBe('reviewing')

    const finalResult = finaliseNightActionCollection(workflow)
    expect(finalResult.ok).toBe(true)
    if (!finalResult.ok) throw new Error('Expected final collection.')
    expect(finalResult.value.game.phase).toBe('night-action-collection')
    expect(finalResult.value.collectedActions.actions).toHaveLength(2)
    expect(Object.isFrozen(finalResult.value.collectedActions)).toBe(true)
    expect(Object.isFrozen(finalResult.value.collectedActions.actions)).toBe(true)
    expect(Object.isFrozen(finalResult.value)).toBe(true)
    expect(JSON.stringify(fixture.game)).toBe(originalSnapshot)
    expect(finalResult.value.collectedActions.actions[0]).not.toHaveProperty('success')
    expect(finalResult.value.collectedActions.actions[0]).not.toHaveProperty('result')
    expect(finalResult.value.collectedActions.actions.map((action) => action.actorRoleId)).toEqual([
      ROLE_IDS.godfather,
      ROLE_IDS.doctor,
    ])

    for (const result of [
      beginFirstNight(finalResult.value),
      selectNightActionTarget(finalResult.value, playerId('player-1')),
      continueNightActionCollection(finalResult.value),
      previousNightActionCollection(finalResult.value),
      editNightAction(finalResult.value, godfatherRoleInstanceId),
      finaliseNightActionCollection(finalResult.value),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { type: 'INVALID_WORKFLOW_STATE', status: 'complete' },
      })
    }
  })

  it('reorders a manually reversed review before final batch creation', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.citizen },
    ])
    let workflow: NightActionCollectionWorkflow = beginFixture(fixture)
    workflow = continueSuccessfully(continueSuccessfully(workflow))
    const godfatherSelection = selectNightActionTarget(workflow, playerId('player-3'))
    if (!godfatherSelection.ok) throw new Error('Expected Godfather selection.')
    workflow = continueSuccessfully(continueSuccessfully(godfatherSelection.value))
    const doctorSelection = selectNightActionTarget(workflow, playerId('player-1'))
    if (!doctorSelection.ok) throw new Error('Expected Doctor selection.')
    workflow = continueSuccessfully(doctorSelection.value)
    if (workflow.status !== 'reviewing') throw new Error('Expected review state.')

    const reversed: ReviewingNightActionsWorkflow = {
      ...workflow,
      submittedActions: [...workflow.submittedActions].reverse(),
    }
    const result = finaliseNightActionCollection(reversed)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected reversed actions to be canonicalised.')
    expect(result.value.collectedActions.actions.map((action) => action.actorRoleId)).toEqual([
      ROLE_IDS.godfather,
      ROLE_IDS.doctor,
    ])
  })

  it('revalidates a target that dies after selection and before finalisation', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.citizen },
    ])
    let workflow: NightActionCollectionWorkflow = beginFixture(fixture)
    workflow = continueSuccessfully(continueSuccessfully(workflow))
    const selection = selectNightActionTarget(workflow, playerId('player-2'))
    if (!selection.ok) throw new Error('Expected target selection.')
    workflow = continueSuccessfully(continueSuccessfully(selection.value))
    if (workflow.status !== 'reviewing') throw new Error('Expected review state.')

    const targetDied: ReviewingNightActionsWorkflow = {
      ...workflow,
      game: {
        ...workflow.game,
        players: workflow.game.players.map((player) =>
          player.playerId === playerId('player-2') ? { ...player, alive: false } : player,
        ),
      },
    }

    expect(finaliseNightActionCollection(targetDied)).toMatchObject({
      ok: false,
      error: { type: 'DEAD_TARGET', targetPlayerId: 'player-2' },
    })
  })

  it('finalises an empty no-action workflow without invalid bounds', () => {
    const fixture = createNightFixture([{ roleId: ROLE_IDS.citizen }, { roleId: ROLE_IDS.mayor }])
    let workflow: NightActionCollectionWorkflow = beginFixture(fixture)
    workflow = continueSuccessfully(workflow)
    expect(workflow.status).toBe('reviewing')

    const result = finaliseNightActionCollection(workflow)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected an empty complete workflow.')
    expect(result.value.collectedActions.actions).toEqual([])
    expect(result.value.game.phase).toBe('night-action-collection')
    expect(Object.isFrozen(result.value)).toBe(true)
  })

  it('rejects finalisation when a required action is missing', () => {
    const fixture = createNightFixture([
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.citizen },
    ])
    let workflow: NightActionCollectionWorkflow = beginFixture(fixture)
    workflow = continueSuccessfully(continueSuccessfully(workflow))
    const selection = selectNightActionTarget(workflow, playerId('player-3'))
    if (!selection.ok) throw new Error('Expected selection.')
    workflow = continueSuccessfully(continueSuccessfully(selection.value))
    const doctorSelection = selectNightActionTarget(workflow, playerId('player-1'))
    if (!doctorSelection.ok) throw new Error('Expected selection.')
    workflow = continueSuccessfully(doctorSelection.value)
    if (workflow.status !== 'reviewing') throw new Error('Expected review state.')

    const incomplete: ReviewingNightActionsWorkflow = {
      ...workflow,
      submittedActions: workflow.submittedActions.slice(0, 1),
    }
    expect(finaliseNightActionCollection(incomplete)).toMatchObject({
      ok: false,
      error: { type: 'INCOMPLETE_ACTION_BATCH', missingRoleInstanceIds: ['role-instance-2'] },
    })
  })
})
