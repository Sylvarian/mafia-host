import { describe, expect, it } from 'vitest'

import type { DomainResult } from '@/domain/game/domain-result.ts'
import {
  playerId,
  roleInstanceId,
  type PlayerId,
  type RoleInstanceId,
} from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  createCompleteNightWorkflow,
  createResolutionFixture,
} from '../../../tests/support/night-resolution-fixtures.ts'
import { SequentialRoleAssignmentIdentitySource } from '../../../tests/support/sequential-role-assignment-identity-source.ts'
import type { RoleAssignmentDependencies } from '../role-assignment/index.ts'
import {
  acknowledgeSessionPrivateResult,
  assignSessionRoles,
  beginSessionFirstNight,
  confirmSessionNightTarget,
  confirmSessionRoleDistribution,
  continueSessionNight,
  createActiveAppSession,
  createPersistedSessionEnvelopeV1,
  finaliseSessionNightActions,
  nextSessionPrivateResult,
  previousSessionNight,
  prepareSessionDawn,
  previousSessionPrivateResult,
  reassignSessionRoles,
  resolveSessionNight,
  restorePersistedSessionEnvelopeV1,
  setSessionCardDelivered,
  toPersistedAppSessionV1,
  updateSetupSession,
  type ActiveAppSession,
  type NightPresentationAppSession,
} from './index.ts'

const SAVED_AT = '2026-07-17T10:00:00.000Z'

describe('persisted session envelope V1', () => {
  it('round-trips empty and populated editing setup through owned, deeply frozen values', () => {
    const emptySession = createActiveAppSession()
    const emptyRestored = roundTrip(emptySession)
    expect(emptyRestored.session).toEqual(emptySession)
    expect(Object.isFrozen(emptyRestored.session)).toBe(true)

    let session: ActiveAppSession = emptySession
    session = update(session, { type: 'ADD_PLAYER', name: 'Alex' })
    session = update(session, { type: 'ADD_PLAYER', name: 'Alex' })
    session = update(session, {
      type: 'TOGGLE_PLAYER_PARTICIPATION',
      playerId: getSetupPlayerId(session, 1),
    })
    session = update(session, { type: 'SET_ROLE_COUNT', roleId: ROLE_IDS.godfather, count: 1 })
    session = update(session, {
      type: 'SET_GAME_SETTING',
      setting: 'godfatherAndSerialCanKillEachOther',
      value: true,
    })
    session = update(session, {
      type: 'SET_GAME_SETTING',
      setting: 'godfatherAppearsSuspiciousToSheriff',
      value: false,
    })
    session = update(session, {
      type: 'SET_GAME_SETTING',
      setting: 'doctorCanSelfProtect',
      value: true,
    })
    session = update(session, {
      type: 'SET_GAME_SETTING',
      setting: 'doctorCannotRepeatPreviousTarget',
      value: true,
    })
    session = update(session, {
      type: 'SET_GAME_SETTING',
      setting: 'revealRoleOnDeath',
      value: true,
    })
    session = update(session, {
      type: 'SET_GAME_SETTING',
      setting: 'allowFirstNightKills',
      value: true,
    })

    const envelope = createPersistedSessionEnvelopeV1(session, SAVED_AT)
    const parsed = JSON.parse(JSON.stringify(envelope)) as unknown
    const restoredResult = restorePersistedSessionEnvelopeV1(parsed)
    const restored = take(restoredResult)

    expect(restored.session).toEqual(session)
    expect(restored.session).not.toBe(session)
    expect(restored.savedAt).toBe(SAVED_AT)
    expectDeeplyFrozen(restored)

    if (restored.session.stage !== 'setup') {
      throw new Error('Expected restored setup.')
    }
    const nextSession = update(restored.session, { type: 'ADD_PLAYER', name: 'Casey' })
    if (nextSession.stage !== 'setup') {
      throw new Error('Expected updated setup.')
    }
    expect(nextSession.workflow.draft.roster.at(-1)?.id).toBe('player-3')

    const withRemovedPlayer = update(nextSession, {
      type: 'REMOVE_PLAYER',
      playerId: getSetupPlayerId(nextSession, 1),
    })
    const restoredAfterRemoval = roundTrip(withRemovedPlayer).session
    const addedAfterRemoval = update(restoredAfterRemoval, {
      type: 'ADD_PLAYER',
      name: 'Dana',
    })
    if (addedAfterRemoval.stage !== 'setup') {
      throw new Error('Expected setup after restored removal.')
    }
    expect(addedAfterRemoval.workflow.draft.roster.at(-1)?.id).toBe('player-4')
    expect(new Set(addedAfterRemoval.workflow.draft.roster.map((player) => player.id)).size).toBe(
      addedAfterRemoval.workflow.draft.roster.length,
    )
  })

  it('restores prepared setup and partial or confirmed distribution without a second game', () => {
    const prepared = buildPreparedSession()
    const preparedRestored = roundTrip(prepared).session
    expect(preparedRestored.stage).toBe('setup')
    if (preparedRestored.stage !== 'setup') {
      throw new Error('Expected prepared setup.')
    }
    expect(preparedRestored.workflow.status).toBe('ready')

    let distribution = take(assignSessionRoles(prepared, createDependencies()))
    if (distribution.workflow.status !== 'distributing') {
      throw new Error('Expected distributing workflow.')
    }
    distribution = take(
      setSessionCardDelivered(
        distribution,
        distribution.workflow.game.players[0]?.playerId ?? missing('first player'),
        true,
      ),
    )
    const partialRestored = roundTrip(distribution).session
    expect(partialRestored.stage).toBe('role-distribution')
    if (
      partialRestored.stage !== 'role-distribution' ||
      partialRestored.workflow.status !== 'distributing'
    ) {
      throw new Error('Expected partial distribution.')
    }
    expect(partialRestored.workflow.deliveredPlayerIds).toHaveLength(1)
    expect(partialRestored.workflow.game.players).toHaveLength(4)

    for (const player of distribution.workflow.game.players.slice(1)) {
      distribution = take(setSessionCardDelivered(distribution, player.playerId, true))
    }
    const forgedConfirmationEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(distribution, SAVED_AT),
    )
    getMutableSession(forgedConfirmationEnvelope).workflowStatus = 'confirmed'
    expectFailure(forgedConfirmationEnvelope, 'INVALID_ROLE_DISTRIBUTION_SESSION')

    const confirmed = take(confirmSessionRoleDistribution(distribution))
    const confirmedRestored = roundTrip(confirmed).session
    expect(confirmedRestored.stage).toBe('role-distribution')
    if (confirmedRestored.stage !== 'role-distribution') {
      throw new Error('Expected confirmed distribution.')
    }
    expect(confirmedRestored.workflow.status).toBe('confirmed')
    expect(confirmedRestored.workflow.game.id).toBe(confirmed.workflow.game.id)
    expect(toPersistedAppSessionV1(confirmed)).not.toHaveProperty('deliveredPlayerIds')
  })

  it('restores duplicate role ordinals and names, then reassigns with collision-safe identities', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.doctor, name: 'Alex' },
        { roleId: ROLE_IDS.doctor, name: 'Alex' },
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.citizen },
      ],
      { distributionStatus: 'distributing' },
    )
    if (fixture.distribution.status !== 'distributing') {
      throw new Error('Expected fixture distribution in progress.')
    }
    const restored = roundTrip({
      stage: 'role-distribution',
      workflow: fixture.distribution,
    }).session
    if (restored.stage !== 'role-distribution' || restored.workflow.status !== 'distributing') {
      throw new Error('Expected restored duplicate-role distribution.')
    }

    expect(
      restored.workflow.game.players
        .filter((player) => player.role.roleId === ROLE_IDS.doctor)
        .map((player) => player.role.ordinal),
    ).toEqual([1, 2])
    expect(restored.workflow.setup.participatingPlayers.map((player) => player.name)).toEqual([
      'Alex',
      'Alex',
      'Player 3',
      'Player 4',
    ])

    const previousGameId = restored.workflow.game.id
    const previousRoleInstanceIds = new Set(
      restored.workflow.game.players.map((player) => player.role.instanceId),
    )
    const identitySource = new SequentialRoleAssignmentIdentitySource()
    for (let index = 0; index < restored.workflow.game.players.length; index += 1) {
      identitySource.nextRoleInstanceId()
    }
    const reassigned = take(
      reassignSessionRoles(restored, {
        randomSource: { next: () => 0 },
        identitySource,
      }),
    )
    if (reassigned.workflow.status !== 'distributing') {
      throw new Error('Expected reassigned distribution in progress.')
    }

    expect(reassigned.workflow.game.id).not.toBe(previousGameId)
    expect(
      reassigned.workflow.game.players.every(
        (player) => !previousRoleInstanceIds.has(player.role.instanceId),
      ),
    ).toBe(true)
    expect(reassigned.workflow.deliveredPlayerIds).toEqual([])
  })

  it('restores opening, partial, corrected, review, and complete night-action states', () => {
    const opening = buildNightSession()
    const openingRestored = roundTrip(opening).session
    expect(openingRestored.stage).toBe('night-action')
    if (openingRestored.stage !== 'night-action') {
      throw new Error('Expected night action session.')
    }
    expect(openingRestored.workflow.status).toBe('collecting')
    if (openingRestored.workflow.status !== 'collecting') {
      throw new Error('Expected opening collection.')
    }
    expect(openingRestored.workflow.currentStepIndex).toBe(0)

    let partial = take(continueSessionNight(opening))
    partial = take(continueSessionNight(partial))
    if (partial.workflow.status !== 'collecting') {
      throw new Error('Expected actor collection.')
    }
    const actorStep = partial.workflow.steps[partial.workflow.currentStepIndex]
    if (actorStep?.type !== 'actor-action') {
      throw new Error('Expected first actor.')
    }
    const targetIds = partial.workflow.game.players
      .filter((player) => player.playerId !== actorStep.actorPlayerId)
      .map((player) => player.playerId)
    partial = take(
      confirmSessionNightTarget(partial, targetIds[0] ?? missing('first night target')),
    )
    partial = take(previousSessionNight(partial))
    const corrected = take(
      confirmSessionNightTarget(partial, targetIds[1] ?? missing('replacement night target')),
    )
    const partialRestored = roundTrip(corrected).session
    if (
      partialRestored.stage !== 'night-action' ||
      partialRestored.workflow.status !== 'collecting'
    ) {
      throw new Error('Expected restored partial collection.')
    }
    expect(partialRestored.workflow.submittedActions[0]?.targetPlayerId).toBe(targetIds[1])
    expect(partialRestored.workflow.previousTargets).toEqual(
      partialRestored.workflow.game.doctorPreviousTargets,
    )

    const reviewing = collectToReview(corrected)
    const reviewingRestored = roundTrip(reviewing).session
    expect(reviewingRestored.stage).toBe('night-action')
    if (reviewingRestored.stage !== 'night-action') {
      throw new Error('Expected restored review.')
    }
    expect(reviewingRestored.workflow.status).toBe('reviewing')

    const complete = take(finaliseSessionNightActions(reviewing))
    const completeRestored = roundTrip(complete).session
    if (completeRestored.stage !== 'night-action') {
      throw new Error('Expected restored complete night.')
    }
    expect(completeRestored.workflow.status).toBe('complete')
    expect(Object.isFrozen(completeRestored.workflow)).toBe(true)
  })

  it('derives Doctor repeat context from the restored game instead of duplicate persisted state', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.doctor }, { roleId: ROLE_IDS.citizen }],
      {
        settings: {
          doctorCanSelfProtect: true,
          doctorCannotRepeatPreviousTarget: true,
        },
        doctorPreviousTargets: [
          {
            doctorRoleInstanceId: fixtureRoleInstanceId(1),
            targetPlayerId: fixturePlayerId(2),
            nightNumber: 0,
          },
        ],
      },
    )
    if (fixture.distribution.status !== 'confirmed') {
      throw new Error('Expected confirmed Doctor distribution.')
    }
    const begun = take(
      beginSessionFirstNight({
        stage: 'role-distribution',
        workflow: fixture.distribution,
      }),
    )
    expect(toPersistedAppSessionV1(begun)).not.toHaveProperty('previousTargets')

    const restored = roundTrip(begun).session
    if (restored.stage !== 'night-action') {
      throw new Error('Expected restored Doctor night.')
    }
    expect(restored.workflow.previousTargets).toEqual([
      {
        actorRoleInstanceId: fixtureRoleInstanceId(1),
        targetPlayerId: fixturePlayerId(2),
      },
    ])

    const atDoctor = take(continueSessionNight(restored))
    const repeated = confirmSessionNightTarget(atDoctor, fixturePlayerId(2))
    expect(repeated).toMatchObject({
      ok: false,
      error: {
        type: 'DOCTOR_REPEATED_PREVIOUS_TARGET',
        actorRoleInstanceId: fixtureRoleInstanceId(1),
        targetPlayerId: fixturePlayerId(2),
      },
    })
  })

  it('round-trips both authoritative Consort-on-Consort actions canonically', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
      ],
      { settings: { allowFirstNightKills: false } },
    )
    if (fixture.distribution.status !== 'confirmed') {
      throw new Error('Expected confirmed Consort distribution.')
    }
    let session = take(
      beginSessionFirstNight({
        stage: 'role-distribution',
        workflow: fixture.distribution,
      }),
    )

    while (session.workflow.status === 'collecting') {
      const step = session.workflow.steps[session.workflow.currentStepIndex]
      if (step === undefined) {
        throw new Error('Expected Consort sequence step.')
      }
      if (step.type === 'actor-action') {
        const otherConsort = session.workflow.game.players.find(
          (player) =>
            player.role.roleId === ROLE_IDS.consort &&
            player.role.instanceId !== step.actorRoleInstanceId,
        )
        session = take(
          confirmSessionNightTarget(
            session,
            otherConsort?.playerId ?? missing('other Consort target'),
          ),
        )
        continue
      }
      session = take(continueSessionNight(session))
    }

    const restored = roundTrip(session).session
    if (restored.stage !== 'night-action' || restored.workflow.status !== 'reviewing') {
      throw new Error('Expected restored Consort review.')
    }
    expect(restored.workflow.submittedActions).toHaveLength(2)
    for (const action of restored.workflow.submittedActions) {
      const target = restored.workflow.game.players.find(
        (player) => player.playerId === action.targetPlayerId,
      )
      expect(target?.role.roleId).toBe(ROLE_IDS.consort)
    }
  })

  it('rebuilds private results, acknowledgement evidence, previous navigation, and ready state', () => {
    const complete = take(finaliseSessionNightActions(collectToReview(buildNightSession())))
    const presentation = take(resolveSessionNight(complete))
    expect(presentation.workflow.status).toBe('private-results')
    if (presentation.workflow.status !== 'private-results') {
      throw new Error('Expected private results.')
    }

    const firstId = presentation.workflow.results[0]?.id ?? missing('first result')
    const afterFirst = take(acknowledgeSessionPrivateResult(presentation, firstId))
    const previous = take(previousSessionPrivateResult(afterFirst))
    const restoredPrevious = roundTrip(previous).session
    if (
      restoredPrevious.stage !== 'night-presentation' ||
      restoredPrevious.workflow.status !== 'private-results'
    ) {
      throw new Error('Expected restored private presentation.')
    }
    expect(restoredPrevious.workflow.currentResultIndex).toBe(0)
    expect(restoredPrevious.workflow.acknowledgedResultIds).toEqual([firstId])
    expect(restoredPrevious.workflow.results[0]?.id).toBe(firstId)

    const forward = take(nextSessionPrivateResult(previous))
    if (forward.workflow.status !== 'private-results') {
      throw new Error('Expected second private result.')
    }
    const secondId = forward.workflow.results[1]?.id ?? missing('second result')
    const ready = take(acknowledgeSessionPrivateResult(forward, secondId))
    expect(ready.workflow.status).toBe('ready-for-dawn')
    const restoredReady = roundTrip(ready).session
    if (restoredReady.stage !== 'night-presentation') {
      throw new Error('Expected ready presentation.')
    }
    expect(restoredReady.workflow.status).toBe('ready-for-dawn')
  })

  it('restores duplicate-role private results with stable distinct identities', () => {
    const fixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.citizen },
      ],
      [3, 3, 3, null],
    )
    const presentation = take(
      resolveSessionNight({
        stage: 'night-action',
        workflow: createCompleteNightWorkflow(fixture),
      }),
    )
    if (presentation.workflow.status !== 'private-results') {
      throw new Error('Expected duplicate Sheriff results.')
    }
    const resultIds = presentation.workflow.results.map((result) => result.id)
    expect(resultIds).toHaveLength(2)
    expect(new Set(resultIds).size).toBe(2)

    const firstId = resultIds[0] ?? missing('first duplicate-role result')
    const acknowledged = take(acknowledgeSessionPrivateResult(presentation, firstId))
    const restored = roundTrip(acknowledged).session
    if (restored.stage !== 'night-presentation' || restored.workflow.status !== 'private-results') {
      throw new Error('Expected restored duplicate-role results.')
    }
    expect(restored.workflow.results.map((result) => result.id)).toEqual(resultIds)
    expect(restored.workflow.acknowledgedResultIds).toEqual([firstId])
  })

  it('persists Dawn without private action, resolution, result, or acknowledgement material', () => {
    const ready = buildReadyForDawn()
    const dawn = take(prepareSessionDawn(ready))
    const persisted = toPersistedAppSessionV1(dawn)
    const text = JSON.stringify(persisted)

    expect(persisted.stage).toBe('dawn')
    expect(text).not.toContain('collectedActions')
    expect(text).not.toContain('resolution')
    expect(text).not.toContain('acknowledgedResultIds')
    expect(text).not.toContain('attackAttempts')
    expect(text).not.toContain('actualRoleId')

    const restored = roundTrip(dawn).session
    expect(restored.stage).toBe('dawn')
    if (restored.stage !== 'dawn') {
      throw new Error('Expected Dawn.')
    }
    expect(restored.workflow.dawnAnnouncement).toEqual(dawn.workflow.dawnAnnouncement)
    expect(restored.workflow.game.phase).toBe('dawn-announcement')
  })

  it('rebuilds caller-reordered action and resolution arrays into canonical order', () => {
    const presentation = take(resolveSessionNight(buildCompleteNight()))
    const canonicalEnvelope = createPersistedSessionEnvelopeV1(presentation, SAVED_AT)
    const reorderedEnvelope = mutableEnvelope(canonicalEnvelope)
    const reorderedSession = getMutableSession(reorderedEnvelope)
    if (
      !Array.isArray(reorderedSession.collectedActions) ||
      !isUnknownRecord(reorderedSession.resolution) ||
      !Array.isArray(reorderedSession.resolution.finalVisits)
    ) {
      throw new Error('Expected persisted presentation arrays.')
    }
    reorderedSession.collectedActions.reverse()
    reorderedSession.resolution.finalVisits.reverse()

    const restored = take(restorePersistedSessionEnvelopeV1(reorderedEnvelope))
    expect(toPersistedAppSessionV1(restored.session)).toEqual(canonicalEnvelope.session)
  })

  it('round-trips first-night skipped killers and a no-death Dawn', () => {
    const opening = buildNightSession(false)
    expect(
      opening.workflow.steps.some(
        (step) =>
          step.type === 'actor-action' &&
          opening.workflow.game.players.find(
            (player) => player.role.instanceId === step.actorRoleInstanceId,
          )?.role.roleId === ROLE_IDS.godfather,
      ),
    ).toBe(false)

    const complete = take(finaliseSessionNightActions(collectToReview(opening)))
    const presentation = take(resolveSessionNight(complete))
    let ready = presentation
    while (ready.workflow.status === 'private-results') {
      const result = ready.workflow.results[ready.workflow.currentResultIndex]
      ready = take(
        acknowledgeSessionPrivateResult(
          ready,
          result?.id ?? missing('skipped-killer private result'),
        ),
      )
    }
    const dawn = take(prepareSessionDawn(ready))
    expect(dawn.workflow.dawnAnnouncement.outcome).toBe('no-deaths')
    const restored = roundTrip(dawn).session
    if (restored.stage !== 'dawn') {
      throw new Error('Expected restored quiet Dawn.')
    }
    expect(restored.workflow.dawnAnnouncement.outcome).toBe('no-deaths')
  })

  it('round-trips a hidden-role multiple-death Dawn and retained Doctor history', () => {
    const deathsFixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
        { roleId: ROLE_IDS.citizen },
      ],
      [2, 3, null, null],
      { settings: { revealRoleOnDeath: false } },
    )
    const deathsPresentation = take(
      resolveSessionNight({
        stage: 'night-action',
        workflow: createCompleteNightWorkflow(deathsFixture, ['Mia', 'Sam', 'Alex', 'Alex']),
      }),
    )
    const deathsDawn = take(prepareSessionDawn(deathsPresentation))
    if (deathsDawn.workflow.dawnAnnouncement.outcome !== 'deaths') {
      throw new Error('Expected multiple-death Dawn.')
    }
    expect(deathsDawn.workflow.dawnAnnouncement.deaths).toHaveLength(2)
    expect(
      deathsDawn.workflow.dawnAnnouncement.deaths.every((death) => death.revealedRoleId === null),
    ).toBe(true)

    const restoredDeaths = roundTrip(deathsDawn).session
    if (
      restoredDeaths.stage !== 'dawn' ||
      restoredDeaths.workflow.dawnAnnouncement.outcome !== 'deaths'
    ) {
      throw new Error('Expected restored multiple-death Dawn.')
    }
    expect(restoredDeaths.workflow.dawnAnnouncement.deaths).toHaveLength(2)
    expect(JSON.stringify(toPersistedAppSessionV1(restoredDeaths))).not.toContain('actualRoleId')

    const forgedRevealEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(deathsDawn, SAVED_AT),
    )
    const forgedRevealSession = getMutableSession(forgedRevealEnvelope)
    if (
      !isUnknownRecord(forgedRevealSession.game) ||
      !isUnknownArray(forgedRevealSession.game.players) ||
      !isUnknownRecord(forgedRevealSession.dawnAnnouncement) ||
      !isUnknownArray(forgedRevealSession.dawnAnnouncement.deaths)
    ) {
      throw new Error('Expected hidden-role Dawn records.')
    }
    const forgedDeath = forgedRevealSession.dawnAnnouncement.deaths[0]
    if (!isUnknownRecord(forgedDeath) || typeof forgedDeath.playerId !== 'string') {
      throw new Error('Expected hidden-role Dawn death.')
    }
    const forgedDeadPlayer = forgedRevealSession.game.players.find(
      (player) => isUnknownRecord(player) && player.playerId === forgedDeath.playerId,
    )
    if (
      !isUnknownRecord(forgedDeadPlayer) ||
      !isUnknownRecord(forgedDeadPlayer.role) ||
      typeof forgedDeadPlayer.role.roleId !== 'string'
    ) {
      throw new Error('Expected hidden-role Dawn game player.')
    }
    forgedDeadPlayer.publiclyRevealedRoleId = forgedDeadPlayer.role.roleId
    forgedDeath.revealedRoleId = forgedDeadPlayer.role.roleId
    expectFailure(forgedRevealEnvelope, 'INVALID_DAWN_SESSION')

    const omittedDeathEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(deathsDawn, SAVED_AT),
    )
    const omittedDeathSession = getMutableSession(omittedDeathEnvelope)
    if (
      !isUnknownRecord(omittedDeathSession.dawnAnnouncement) ||
      !Array.isArray(omittedDeathSession.dawnAnnouncement.deaths)
    ) {
      throw new Error('Expected persisted multiple-death announcement.')
    }
    omittedDeathSession.dawnAnnouncement.deaths.pop()
    expectFailure(omittedDeathEnvelope, 'INVALID_DAWN_SESSION')

    const falseQuietEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(deathsDawn, SAVED_AT),
    )
    getMutableSession(falseQuietEnvelope).dawnAnnouncement = {
      outcome: 'no-deaths',
      nightNumber: deathsDawn.workflow.game.nightNumber,
    }
    expectFailure(falseQuietEnvelope, 'INVALID_DAWN_SESSION')

    const doctorFixture = createResolutionFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.doctor },
        { roleId: ROLE_IDS.citizen },
      ],
      [2, 2, 3, null],
    )
    const doctorDawn = take(
      prepareSessionDawn(
        take(
          resolveSessionNight({
            stage: 'night-action',
            workflow: createCompleteNightWorkflow(doctorFixture),
          }),
        ),
      ),
    )
    const restoredDoctor = roundTrip(doctorDawn).session
    if (restoredDoctor.stage !== 'dawn') {
      throw new Error('Expected restored Doctor-history Dawn.')
    }
    expect(restoredDoctor.workflow.game.doctorPreviousTargets).toEqual([
      {
        doctorRoleInstanceId: fixtureRoleInstanceId(3),
        targetPlayerId: fixturePlayerId(4),
        nightNumber: 2,
      },
    ])
  })

  it('rejects envelope and version failures without interpreting them as V1', () => {
    const validTimestampResult = restorePersistedSessionEnvelopeV1(
      createPersistedSessionEnvelopeV1(createActiveAppSession(), '2026-07-18T01:02:03.000Z'),
    )
    expect(validTimestampResult.ok).toBe(true)

    const cases: readonly Readonly<{
      candidate: unknown
      errorType: string
    }>[] = [
      { candidate: {}, errorType: 'INVALID_ENVELOPE' },
      { candidate: { schemaVersion: '1' }, errorType: 'INVALID_ENVELOPE' },
      {
        candidate: { schemaVersion: 2, savedAt: SAVED_AT, session: {} },
        errorType: 'UNSUPPORTED_SCHEMA_VERSION',
      },
      { candidate: { schemaVersion: 1, session: {} }, errorType: 'INVALID_ENVELOPE' },
      {
        candidate: { schemaVersion: 1, savedAt: 'not-a-time', session: {} },
        errorType: 'INVALID_TIMESTAMP',
      },
      {
        candidate: { schemaVersion: 1, savedAt: '2026-02-30T00:00:00.000Z', session: {} },
        errorType: 'INVALID_TIMESTAMP',
      },
      {
        candidate: { schemaVersion: 1, savedAt: '2026-07-18', session: {} },
        errorType: 'INVALID_TIMESTAMP',
      },
      { candidate: { schemaVersion: 1, savedAt: SAVED_AT }, errorType: 'INVALID_ENVELOPE' },
      {
        candidate: { schemaVersion: 1, savedAt: SAVED_AT, session: { stage: 'future' } },
        errorType: 'UNKNOWN_PERSISTED_STAGE',
      },
    ]

    for (const testCase of cases) {
      const result = restorePersistedSessionEnvelopeV1(testCase.candidate)
      expect(result.ok).toBe(false)
      if (result.ok) {
        throw new Error('Expected invalid envelope.')
      }
      expect(result.error.type).toBe(testCase.errorType)
    }
  })

  it('strips runtime extra fields and does not return the parsed object', () => {
    const envelope = createPersistedSessionEnvelopeV1(buildPreparedSession(), SAVED_AT)
    const parsed = JSON.parse(JSON.stringify(envelope)) as unknown
    if (
      !isUnknownRecord(parsed) ||
      !isUnknownRecord(parsed.session) ||
      !isUnknownRecord(parsed.session.draft)
    ) {
      throw new Error('Expected parsed setup envelope.')
    }
    parsed.extraEnvelopeField = 'ignored'
    parsed.session.hiddenRoleDescription = 'forged'
    parsed.session.draft.temporaryDialog = true

    const restored = take(restorePersistedSessionEnvelopeV1(parsed))
    expect(restored).not.toBe(parsed)
    const canonicalText = JSON.stringify(
      createPersistedSessionEnvelopeV1(restored.session, restored.savedAt),
    )
    expect(canonicalText).not.toContain('extraEnvelopeField')
    expect(canonicalText).not.toContain('hiddenRoleDescription')
    expect(canonicalText).not.toContain('temporaryDialog')
  })

  it('rejects forged acknowledgements, cross-game resolution records, and private Dawn extras', () => {
    const privateEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(take(resolveSessionNight(buildCompleteNight())), SAVED_AT),
    )
    const privateSession = getMutableSession(privateEnvelope)
    privateSession.acknowledgedResultIds = ['forged-result']
    expectFailure(privateEnvelope, 'INVALID_NIGHT_PRESENTATION_SESSION')

    const crossGameEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(take(resolveSessionNight(buildCompleteNight())), SAVED_AT),
    )
    const crossGameSession = getMutableSession(crossGameEnvelope)
    if (!isUnknownRecord(crossGameSession.resolution)) {
      throw new Error('Expected resolution.')
    }
    crossGameSession.resolution.gameId = 'another-game'
    expectFailure(crossGameEnvelope, 'INVALID_NIGHT_PRESENTATION_SESSION')

    const dawnEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(take(prepareSessionDawn(buildReadyForDawn())), SAVED_AT),
    )
    getMutableSession(dawnEnvelope).attackAttempts = []
    expectFailure(dawnEnvelope, 'INVALID_DAWN_SESSION')
  })

  it('rejects stage/phase mismatches, unknown delivery evidence, and multiple game authorities', () => {
    const nightEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(buildNightSession(), SAVED_AT),
    )
    const nightSession = getMutableSession(nightEnvelope)
    if (!isUnknownRecord(nightSession.game)) {
      throw new Error('Expected persisted night game.')
    }
    nightSession.game.phase = 'dawn-announcement'
    expectFailure(nightEnvelope, 'STAGE_PHASE_MISMATCH')

    const distribution = take(assignSessionRoles(buildPreparedSession(), createDependencies()))
    if (distribution.workflow.status !== 'distributing') {
      throw new Error('Expected distribution.')
    }
    const distributionEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(distribution, SAVED_AT),
    )
    getMutableSession(distributionEnvelope).deliveredPlayerIds = ['unknown-player']
    expectFailure(distributionEnvelope, 'INVALID_ROLE_DISTRIBUTION_SESSION')

    const setupEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(createActiveAppSession(), SAVED_AT),
    )
    getMutableSession(setupEnvelope).otherGame = { id: 'forged-game' }
    expectFailure(setupEnvelope, 'MULTIPLE_AUTHORITATIVE_GAMES')

    const unknownRoleEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(createActiveAppSession(), SAVED_AT),
    )
    const unknownRoleSession = getMutableSession(unknownRoleEnvelope)
    if (
      !isUnknownRecord(unknownRoleSession.draft) ||
      !Array.isArray(unknownRoleSession.draft.roleCounts)
    ) {
      throw new Error('Expected setup role counts.')
    }
    unknownRoleSession.draft.roleCounts.push({ roleId: 'forged-role', count: 0 })
    expectFailure(unknownRoleEnvelope, 'INVALID_SETUP_SESSION')

    const duplicateRoleEnvelope = mutableEnvelope(
      createPersistedSessionEnvelopeV1(createActiveAppSession(), SAVED_AT),
    )
    const duplicateRoleSession = getMutableSession(duplicateRoleEnvelope)
    if (
      !isUnknownRecord(duplicateRoleSession.draft) ||
      !Array.isArray(duplicateRoleSession.draft.roleCounts)
    ) {
      throw new Error('Expected duplicate-role candidate.')
    }
    duplicateRoleSession.draft.roleCounts.push(duplicateRoleSession.draft.roleCounts[0])
    expectFailure(duplicateRoleEnvelope, 'INVALID_SETUP_SESSION')
  })

  it('rejects hostile runtime primitives and blank active-game identities', () => {
    function createDistributionEnvelope(): Readonly<Record<string, unknown>> {
      return mutableEnvelope(
        createPersistedSessionEnvelopeV1(
          take(assignSessionRoles(buildPreparedSession(), createDependencies())),
          SAVED_AT,
        ),
      )
    }

    function getFirstPersistedGamePlayer(
      envelope: Readonly<Record<string, unknown>>,
    ): Record<string, unknown> {
      const session = getMutableSession(envelope)
      if (!isUnknownRecord(session.game) || !isUnknownArray(session.game.players)) {
        throw new Error('Expected persisted distribution game players.')
      }
      const player = session.game.players[0]
      if (!isUnknownRecord(player)) {
        throw new Error('Expected first persisted game player.')
      }
      return player
    }

    const stringBooleanEnvelope = createDistributionEnvelope()
    getFirstPersistedGamePlayer(stringBooleanEnvelope).alive = 'true'
    expectFailure(stringBooleanEnvelope, 'INVALID_ROLE_DISTRIBUTION_SESSION')

    const blankRoleInstanceEnvelope = createDistributionEnvelope()
    const blankRoleInstancePlayer = getFirstPersistedGamePlayer(blankRoleInstanceEnvelope)
    if (!isUnknownRecord(blankRoleInstancePlayer.role)) {
      throw new Error('Expected persisted role instance.')
    }
    blankRoleInstancePlayer.role.instanceId = '   '
    expectFailure(blankRoleInstanceEnvelope, 'INVALID_ROLE_DISTRIBUTION_SESSION')

    const nullArrayEnvelope = createDistributionEnvelope()
    getMutableSession(nullArrayEnvelope).deliveredPlayerIds = null
    expectFailure(nullArrayEnvelope, 'INVALID_ROLE_DISTRIBUTION_SESSION')

    const stringSettingEnvelope = createDistributionEnvelope()
    const stringSettingSession = getMutableSession(stringSettingEnvelope)
    if (
      !isUnknownRecord(stringSettingSession.game) ||
      !isUnknownRecord(stringSettingSession.game.settings)
    ) {
      throw new Error('Expected persisted game settings.')
    }
    stringSettingSession.game.settings.allowFirstNightKills = 'false'
    expectFailure(stringSettingEnvelope, 'INVALID_ROLE_DISTRIBUTION_SESSION')
  })

  it('rejects a collecting night that skipped an earlier required action', () => {
    const reviewing = collectToReview(buildNightSession())
    if (reviewing.workflow.status !== 'reviewing') {
      throw new Error('Expected review fixture.')
    }
    const actorStepIndexes = reviewing.workflow.steps.flatMap((step, index) =>
      step.type === 'actor-action' ? [index] : [],
    )
    const secondActorStepIndex = actorStepIndexes[1] ?? missing('second actor step')
    const envelope = mutableEnvelope(createPersistedSessionEnvelopeV1(reviewing, SAVED_AT))
    const session = getMutableSession(envelope)
    if (!Array.isArray(session.submittedActions)) {
      throw new Error('Expected persisted submitted actions.')
    }
    session.workflowStatus = 'collecting'
    session.currentStepIndex = secondActorStepIndex
    session.returnToReviewAfterActor = false
    session.submittedActions.shift()
    session.submittedActions.splice(1)

    expectFailure(envelope, 'INVALID_NIGHT_ACTION_SESSION')
  })
})

function buildPreparedSession(allowFirstNightKills = true): ActiveAppSession {
  let session: ActiveAppSession = createActiveAppSession()
  for (const name of ['Alice', 'Bob', 'Casey', 'Dana']) {
    session = update(session, { type: 'ADD_PLAYER', name })
  }
  session = update(session, { type: 'SET_ROLE_COUNT', roleId: ROLE_IDS.godfather, count: 1 })
  session = update(session, { type: 'SET_ROLE_COUNT', roleId: ROLE_IDS.sheriff, count: 1 })
  session = update(session, {
    type: 'SET_ROLE_COUNT',
    roleId: ROLE_IDS.investigator,
    count: 1,
  })
  session = update(session, { type: 'SET_ROLE_COUNT', roleId: ROLE_IDS.citizen, count: 1 })
  session = update(session, {
    type: 'SET_GAME_SETTING',
    setting: 'allowFirstNightKills',
    value: allowFirstNightKills,
  })
  session = update(session, {
    type: 'SET_GAME_SETTING',
    setting: 'revealRoleOnDeath',
    value: true,
  })
  return update(session, { type: 'PREPARE_GAME' })
}

function buildNightSession(
  allowFirstNightKills = true,
): Extract<ActiveAppSession, Readonly<{ stage: 'night-action' }>> {
  let distribution = take(
    assignSessionRoles(buildPreparedSession(allowFirstNightKills), createDependencies()),
  )
  if (distribution.workflow.status !== 'distributing') {
    throw new Error('Expected distribution.')
  }
  for (const player of distribution.workflow.game.players) {
    distribution = take(setSessionCardDelivered(distribution, player.playerId, true))
  }
  const confirmed = take(confirmSessionRoleDistribution(distribution))
  return take(beginSessionFirstNight(confirmed))
}

function collectToReview(
  initial: Extract<ActiveAppSession, Readonly<{ stage: 'night-action' }>>,
): Extract<ActiveAppSession, Readonly<{ stage: 'night-action' }>> {
  let session = initial
  while (session.workflow.status === 'collecting') {
    const step = session.workflow.steps[session.workflow.currentStepIndex]
    if (step === undefined) {
      throw new Error('Missing night step.')
    }
    if (step.type === 'actor-action') {
      const existingAction = session.workflow.submittedActions.find(
        (action) => action.actorRoleInstanceId === step.actorRoleInstanceId,
      )
      if (existingAction === undefined) {
        const target = session.workflow.game.players.find(
          (player) => player.alive && player.playerId !== step.actorPlayerId,
        )
        session = take(
          confirmSessionNightTarget(
            session,
            target?.playerId ?? missing('valid collection target'),
          ),
        )
        continue
      }
    }
    session = take(continueSessionNight(session))
  }
  if (session.workflow.status !== 'reviewing') {
    throw new Error('Expected action review.')
  }
  return session
}

function buildCompleteNight() {
  return take(finaliseSessionNightActions(collectToReview(buildNightSession())))
}

function buildReadyForDawn(): NightPresentationAppSession {
  let presentation = take(resolveSessionNight(buildCompleteNight()))
  while (presentation.workflow.status === 'private-results') {
    const result = presentation.workflow.results[presentation.workflow.currentResultIndex]
    presentation = take(
      acknowledgeSessionPrivateResult(
        presentation,
        result?.id ?? missing('private result to acknowledge'),
      ),
    )
  }
  return presentation
}

function update(
  session: ActiveAppSession,
  command: Parameters<typeof updateSetupSession>[1],
): ActiveAppSession {
  return take(updateSetupSession(session, command))
}

function roundTrip(session: ActiveAppSession) {
  const envelope = createPersistedSessionEnvelopeV1(session, SAVED_AT)
  return take(restorePersistedSessionEnvelopeV1(JSON.parse(JSON.stringify(envelope)) as unknown))
}

function take<Value, ErrorValue>(result: DomainResult<Value, ErrorValue>): Value {
  if (!result.ok) {
    throw new Error(`Expected success, received ${JSON.stringify(result.error)}`)
  }
  return result.value
}

function getSetupPlayerId(session: ActiveAppSession, index: number) {
  if (session.stage !== 'setup') {
    throw new Error('Expected setup.')
  }
  return session.workflow.draft.roster[index]?.id ?? missing('setup player')
}

function fixturePlayerId(value: number): PlayerId {
  return playerId(`player-${String(value)}`)
}

function fixtureRoleInstanceId(value: number): RoleInstanceId {
  return roleInstanceId(`role-instance-${String(value)}`)
}

function createDependencies(): RoleAssignmentDependencies {
  return {
    randomSource: { next: () => 0 },
    identitySource: new SequentialRoleAssignmentIdentitySource(),
  }
}

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    return
  }
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) {
    expectDeeplyFrozen(child)
  }
}

function mutableEnvelope(envelope: unknown): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(JSON.stringify(envelope)) as unknown
  if (!isUnknownRecord(parsed)) {
    throw new Error('Expected mutable envelope.')
  }
  return parsed
}

function getMutableSession(envelope: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!isUnknownRecord(envelope.session)) {
    throw new Error('Expected mutable session.')
  }
  return envelope.session
}

function expectFailure(candidate: unknown, errorType: string): void {
  const result = restorePersistedSessionEnvelopeV1(candidate)
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('Expected restoration failure.')
  }
  expect(result.error.type).toBe(errorType)
}

function missing(label: string): never {
  throw new Error(`Missing ${label}.`)
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}
