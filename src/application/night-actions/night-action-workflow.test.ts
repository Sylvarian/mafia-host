import { describe, expect, it } from 'vitest'

import type { PlayerId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { resolveNight } from '@/domain/resolution/night-resolution.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  beginFirstNight,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionWorkflow,
  type ActiveNightActionCollectionWorkflow,
  type CollectingNightActionsWorkflow,
} from './night-action-workflow.ts'

function start(
  roles: Parameters<typeof createNightFixture>[0],
  options: Parameters<typeof createNightFixture>[1] = {
    settings: { allowFirstNightKills: true },
  },
): CollectingNightActionsWorkflow {
  const fixture = createNightFixture(roles, options)
  const begun = beginFirstNight(createNightActionCollectionWorkflow(fixture.distribution))
  if (!begun.ok) throw new Error(`Could not begin fixture: ${begun.error.type}`)
  return begun.value
}

function continueSuccessfully(
  workflow: ActiveNightActionCollectionWorkflow,
): ActiveNightActionCollectionWorkflow {
  const result = continueNightActionCollection(workflow)
  if (!result.ok) throw new Error(`Could not continue: ${result.error.type}`)
  return result.value
}

function continuePrivateOutcomeIfPresent(
  workflow: ActiveNightActionCollectionWorkflow,
): ActiveNightActionCollectionWorkflow {
  return workflow.status === 'awaiting-outcome-acknowledgement'
    ? continueSuccessfully(workflow)
    : workflow
}

function confirmSuccessfully(
  workflow: CollectingNightActionsWorkflow,
  targetPlayerId: PlayerId,
): ActiveNightActionCollectionWorkflow {
  const result = confirmNightActionTarget(workflow, targetPlayerId)
  if (!result.ok) throw new Error(`Could not confirm: ${result.error.type}`)
  return result.value
}

function advancePastOverview(
  workflow: CollectingNightActionsWorkflow,
): CollectingNightActionsWorkflow {
  const next = continueSuccessfully(workflow)
  if (next.status !== 'collecting') throw new Error('Expected an actor after overview.')
  return next
}

function getPlayerId(workflow: ActiveNightActionCollectionWorkflow, playerIndex: number): PlayerId {
  const player = workflow.game.players[playerIndex]
  if (player === undefined) throw new Error(`Expected player ${String(playerIndex + 1)}.`)
  return player.playerId
}

describe('sequential night workflow', () => {
  it.each([
    ['Consort', ROLE_IDS.consort],
    ['Framer', ROLE_IDS.framer],
    ['Godfather', ROLE_IDS.godfather],
    ['Serial Killer', ROLE_IDS.serialKiller],
    ['Doctor', ROLE_IDS.doctor],
  ] as const)('commits and seals a %s action while advancing directly', (_name, roleId) => {
    const initial = advancePastOverview(
      start([{ roleId }, { roleId: ROLE_IDS.citizen }], {
        settings: { doctorCanSelfProtect: true, allowFirstNightKills: true },
      }),
    )

    expect(initial.completedSteps).toEqual([])
    const confirmed = confirmSuccessfully(initial, getPlayerId(initial, 1))
    expect(confirmed.status).toBe('complete')
    expect(confirmed.completedSteps).toHaveLength(1)
    expect(confirmed.completedSteps[0]).toMatchObject({
      status: 'action-confirmed',
      outcome: null,
      action: { targetPlayerId: 'player-2' },
    })
    if (confirmed.status !== 'complete') throw new Error('Expected completion.')
    expect(confirmed.collectedActions.actions).toHaveLength(1)
    expect(confirmNightActionTarget(confirmed, getPlayerId(initial, 0))).toMatchObject({
      ok: false,
      error: { type: 'INVALID_WORKFLOW_STATE' },
    })
  })

  it.each([
    ['Framer', ROLE_IDS.framer],
    ['Godfather', ROLE_IDS.godfather],
    ['Serial Killer', ROLE_IDS.serialKiller],
    ['Doctor', ROLE_IDS.doctor],
    ['Sheriff', ROLE_IDS.sheriff],
    ['Investigator', ROLE_IDS.investigator],
    ['Consigliere', ROLE_IDS.consigliere],
    ['Detective', ROLE_IDS.detective],
  ] as const)(
    'shows an explicit blocked outcome and creates no %s action or visit',
    (_roleName, blockedRoleId) => {
      let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
        start(
          [{ roleId: ROLE_IDS.consort }, { roleId: blockedRoleId }, { roleId: ROLE_IDS.citizen }],
          {
            settings: {
              allowFirstNightKills: true,
              doctorCanSelfProtect: true,
            },
          },
        ),
      )
      workflow = confirmSuccessfully(workflow, getPlayerId(workflow, 1))

      expect(workflow.status).toBe('awaiting-outcome-acknowledgement')
      if (workflow.status !== 'awaiting-outcome-acknowledgement') {
        throw new Error('Expected blocked outcome.')
      }
      expect(workflow.currentOutcome).toMatchObject({
        kind: 'blocked',
        actorRoleId: blockedRoleId,
      })
      expect(workflow.completedSteps.at(-1)).toMatchObject({
        status: 'blocked',
        outcome: { kind: 'blocked' },
      })
      expect(
        workflow.completedSteps.filter((record) => record.status === 'action-confirmed'),
      ).toHaveLength(1)

      workflow = continueSuccessfully(workflow)
      expect(workflow.status).toBe('complete')
      if (workflow.status !== 'complete') throw new Error('Expected completed blocked night.')
      expect(workflow.collectedActions.actions.map((action) => action.actorRoleId)).toEqual([
        ROLE_IDS.consort,
      ])

      const resolution = resolveNight({
        game: workflow.game,
        collectedActions: workflow.collectedActions,
        previousTargets: workflow.previousTargets,
      })
      expect(resolution.ok).toBe(true)
      if (!resolution.ok) throw new Error('Expected final resolution.')
      expect(
        resolution.value.finalVisits.some((visit) => visit.actorRoleId === blockedRoleId),
      ).toBe(false)
    },
  )

  it('keeps Consorts immune, including mutual Consort targeting', () => {
    let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
      start([
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    workflow = confirmSuccessfully(workflow, getPlayerId(workflow, 1))
    expect(workflow.status).toBe('collecting')
    if (workflow.status !== 'collecting') throw new Error('Expected second Consort to act.')
    workflow = confirmSuccessfully(workflow, getPlayerId(workflow, 0))
    expect(workflow.status).toBe('complete')
    if (workflow.status !== 'complete') throw new Error('Expected completed mutual blocks.')

    expect(workflow.collectedActions.actions).toHaveLength(2)
    const resolution = resolveNight({
      game: workflow.game,
      collectedActions: workflow.collectedActions,
      previousTargets: workflow.previousTargets,
    })
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('Expected Consort resolution.')
    expect(resolution.value.blockedActors).toEqual([])
    expect(resolution.value.finalVisits).toHaveLength(2)
  })

  it('uses confirmed Framer state for immediate Sheriff and investigation results', () => {
    let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
      start([
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
        { roleId: ROLE_IDS.consigliere },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    const targetId = getPlayerId(workflow, 4)

    workflow = confirmSuccessfully(workflow, targetId)
    expect(workflow.status).toBe('collecting')
    expect(workflow.completedSteps.at(-1)).toMatchObject({
      actorRoleId: ROLE_IDS.framer,
      outcome: null,
    })

    const expectedOutcomes = [
      { roleId: ROLE_IDS.sheriff, kind: 'sheriff-result' },
      { roleId: ROLE_IDS.investigator, kind: 'investigation-result' },
      { roleId: ROLE_IDS.consigliere, kind: 'investigation-result' },
    ] as const

    for (const expected of expectedOutcomes) {
      if (workflow.status !== 'collecting') throw new Error('Expected actor collection.')
      const outcomeWorkflow = confirmSuccessfully(workflow, targetId)
      expect(outcomeWorkflow.currentOutcome).toMatchObject({
        kind: expected.kind,
        actorRoleId: expected.roleId,
        ...(expected.kind === 'sheriff-result' ? { status: 'suspicious' } : {}),
        ...(expected.kind === 'investigation-result' ? { group: { id: 'group-a' } } : {}),
      })
      workflow = continueSuccessfully(outcomeWorkflow)
    }

    expect(workflow.status).toBe('complete')
    if (workflow.status !== 'complete') throw new Error('Expected completed investigative night.')
    const resolution = resolveNight({
      game: workflow.game,
      collectedActions: workflow.collectedActions,
      previousTargets: workflow.previousTargets,
    })
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('Expected final investigative resolution.')
    expect(resolution.value.sheriffResults[0]?.status).toBe('suspicious')
    expect(resolution.value.investigationResults.map((result) => result.group.id)).toEqual([
      'group-a',
      'group-a',
    ])
  })

  it.each([
    ['Investigator', ROLE_IDS.investigator, ROLE_IDS.godfather, 'group-a'],
    ['Investigator', ROLE_IDS.investigator, ROLE_IDS.framer, 'group-b'],
    ['Investigator', ROLE_IDS.investigator, ROLE_IDS.consort, 'group-c'],
    ['Investigator', ROLE_IDS.investigator, ROLE_IDS.citizen, 'group-d'],
    ['Consigliere', ROLE_IDS.consigliere, ROLE_IDS.godfather, 'group-a'],
    ['Consigliere', ROLE_IDS.consigliere, ROLE_IDS.framer, 'group-b'],
    ['Consigliere', ROLE_IDS.consigliere, ROLE_IDS.consort, 'group-c'],
    ['Consigliere', ROLE_IDS.consigliere, ROLE_IDS.citizen, 'group-d'],
  ] as const)(
    'shows immediate %s %s for an unframed canonical target',
    (_roleName, investigatorRoleId, targetRoleId, expectedGroupId) => {
      let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
        start([
          { roleId: investigatorRoleId },
          { roleId: targetRoleId },
          {
            roleId:
              investigatorRoleId === ROLE_IDS.investigator && targetRoleId === ROLE_IDS.citizen
                ? ROLE_IDS.godfather
                : ROLE_IDS.citizen,
          },
        ]),
      )
      while (workflow.status === 'collecting') {
        const currentStep = workflow.steps[workflow.currentStepIndex]
        if (currentStep?.type !== 'actor-action') {
          throw new Error('Expected an actor action.')
        }
        const currentActor = workflow.game.players.find(
          (player) => player.playerId === currentStep.actorPlayerId,
        )
        if (currentActor?.role.roleId === investigatorRoleId) {
          break
        }
        const targetIndex = currentStep.actorPlayerId === getPlayerId(workflow, 1) ? 2 : 1
        workflow = confirmSuccessfully(workflow, getPlayerId(workflow, targetIndex))
        workflow = continuePrivateOutcomeIfPresent(workflow)
      }
      if (workflow.status !== 'collecting') {
        throw new Error('Expected investigative actor collection.')
      }
      const outcome = confirmSuccessfully(workflow, getPlayerId(workflow, 1))

      expect(outcome.currentOutcome).toMatchObject({
        kind: 'investigation-result',
        group: { id: expectedGroupId },
      })
    },
  )

  it.each([
    [true, 'suspicious'],
    [false, 'not-suspicious'],
  ] as const)(
    'applies the Godfather Sheriff setting immediately when set to %s',
    (godfatherAppearsSuspiciousToSheriff, expectedStatus) => {
      let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
        start(
          [
            { roleId: ROLE_IDS.godfather },
            { roleId: ROLE_IDS.sheriff },
            { roleId: ROLE_IDS.citizen },
          ],
          {
            settings: {
              allowFirstNightKills: true,
              godfatherAppearsSuspiciousToSheriff,
            },
          },
        ),
      )
      workflow = confirmSuccessfully(workflow, getPlayerId(workflow, 2))
      if (workflow.status !== 'collecting') throw new Error('Expected Sheriff collection.')

      const sheriffOutcome = confirmSuccessfully(workflow, getPlayerId(workflow, 0))
      expect(sheriffOutcome.currentOutcome).toMatchObject({
        kind: 'sheriff-result',
        status: expectedStatus,
      })
    },
  )

  it.each([
    ROLE_IDS.consort,
    ROLE_IDS.framer,
    ROLE_IDS.godfather,
    ROLE_IDS.serialKiller,
    ROLE_IDS.doctor,
    ROLE_IDS.sheriff,
    ROLE_IDS.investigator,
    ROLE_IDS.consigliere,
  ] as const)('lets a Detective immediately track a confirmed %s visit', (trackedRoleId) => {
    let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
      start(
        [{ roleId: trackedRoleId }, { roleId: ROLE_IDS.detective }, { roleId: ROLE_IDS.citizen }],
        {
          settings: {
            allowFirstNightKills: true,
            doctorCanSelfProtect: true,
          },
        },
      ),
    )
    workflow = confirmSuccessfully(workflow, getPlayerId(workflow, 2))
    workflow = continuePrivateOutcomeIfPresent(workflow)
    if (workflow.status !== 'collecting') throw new Error('Expected Detective actor.')

    const detectiveOutcome = confirmSuccessfully(workflow, getPlayerId(workflow, 0))
    expect(detectiveOutcome.currentOutcome).toMatchObject({
      kind: 'detective-result',
      result: { status: 'visited-player', visitedPlayerId: 'player-3' },
    })
  })

  it('excludes all Detective actions from tracking, including two Detectives targeting each other', () => {
    let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
      start([
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.detective },
        { roleId: ROLE_IDS.citizen },
      ]),
    )
    const first = confirmSuccessfully(workflow, getPlayerId(workflow, 1))
    expect(first.currentOutcome).toMatchObject({
      kind: 'detective-result',
      result: { status: 'visited-nobody' },
    })
    workflow = continueSuccessfully(first)
    if (workflow.status !== 'collecting') throw new Error('Expected second Detective.')
    const second = confirmSuccessfully(workflow, getPlayerId(workflow, 0))
    expect(second.currentOutcome).toMatchObject({
      kind: 'detective-result',
      result: { status: 'visited-nobody' },
    })

    workflow = continueSuccessfully(second)
    if (workflow.status !== 'complete') throw new Error('Expected completed Detective night.')
    const resolution = resolveNight({
      game: workflow.game,
      collectedActions: workflow.collectedActions,
      previousTargets: workflow.previousTargets,
    })
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('Expected final Detective resolution.')
    expect(resolution.value.finalVisits).toEqual([])
    expect(resolution.value.detectiveResults.map((result) => result.status)).toEqual([
      'visited-nobody',
      'visited-nobody',
    ])
  })

  it('does not create first-night killer steps, actions, visits, or outcomes', () => {
    let workflow: ActiveNightActionCollectionWorkflow = advancePastOverview(
      start(
        [
          { roleId: ROLE_IDS.godfather },
          { roleId: ROLE_IDS.serialKiller },
          { roleId: ROLE_IDS.sheriff },
          { roleId: ROLE_IDS.citizen },
        ],
        { settings: { allowFirstNightKills: false } },
      ),
    )
    expect(workflow.steps).toHaveLength(2)
    expect(workflow.game.players[2]?.role.roleId).toBe(ROLE_IDS.sheriff)
    const sheriff = confirmSuccessfully(workflow, getPlayerId(workflow, 3))
    workflow = continueSuccessfully(sheriff)
    if (workflow.status !== 'complete') throw new Error('Expected first-night completion.')

    expect(workflow.collectedActions.actions.map((action) => action.actorRoleId)).toEqual([
      ROLE_IDS.sheriff,
    ])
    const resolution = resolveNight({
      game: workflow.game,
      collectedActions: workflow.collectedActions,
      previousTargets: workflow.previousTargets,
    })
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) throw new Error('Expected first-night resolution.')
    expect(resolution.value.finalVisits.map((visit) => visit.actorRoleId)).toEqual([
      ROLE_IDS.sheriff,
    ])
  })

  it('completes from the Mafia overview when every Night 1 actor is skipped', () => {
    const workflow = start(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
      { settings: { allowFirstNightKills: false } },
    )

    expect(workflow.steps).toHaveLength(1)
    expect(workflow.steps[0]).toMatchObject({ type: 'mafia-overview' })
    const completed = continueSuccessfully(workflow)
    expect(completed.status).toBe('complete')
    if (completed.status !== 'complete') throw new Error('Expected empty Night 1 completion.')
    expect(completed.collectedActions.actions).toEqual([])
  })
})
