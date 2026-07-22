import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import type { GameId, PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import {
  createCollectedNightActions,
  type CollectedNightActions,
  type PreviousNightTarget,
} from '../night-actions/night-action.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'
import {
  applySelectedJesterRevenge,
  exhaustJesterRevengeWithoutSurvivor,
} from '../neutral/jester-revenge.ts'
import type { SelectedJesterRevenge } from '../neutral/neutral-outcome-model.ts'
import { transitionPhase } from '../phases/phase-machine.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { determineOrdinaryAttackOutcome } from './attacks.ts'
import { applyResolvedNight, beginNightResolution } from './night-application.ts'
import { resolveNight } from './night-resolution.ts'
import type {
  AttackOutcome,
  NightResolution,
  ProtectionSource,
  ResolutionSources,
  RoleBlockAttemptOutcome,
} from './night-resolution-models.ts'

export type ImportantRoleBlockEvent = Readonly<{
  kind: 'role-block'
  consortPlayerId: PlayerId
  consortRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
  targetRoleInstanceId: RoleInstanceId
  outcome: RoleBlockAttemptOutcome
}>

export type ImportantFrameEvent = Readonly<{
  kind: 'frame'
  framerPlayerId: PlayerId
  framerRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
}>

type ImportantAttackEventBase = Readonly<{
  kind: 'attack'
  attackerPlayerId: PlayerId
  attackerRoleId: RoleId
  attackerRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
}>

export type ImportantAttackEvent = ImportantAttackEventBase &
  (
    | Readonly<{
        outcome: 'protected'
        doctors: ResolutionSources<ProtectionSource>
      }>
    | Readonly<{
        outcome: Exclude<AttackOutcome, 'protected'>
        doctors: readonly []
      }>
  )

export type ImportantNightEvent =
  ImportantRoleBlockEvent | ImportantFrameEvent | ImportantAttackEvent

export type ImportantNightEventCanonicalSource = Readonly<{
  collectedActions: CollectedNightActions
  playerStatuses: readonly Readonly<{
    playerId: PlayerId
    alive: boolean
    publiclyRevealedRoleId: RoleId | null
  }>[]
  doctorPreviousTargets: GameState['doctorPreviousTargets']
  deathRecords: GameState['deathRecords']
  executionerConversions: GameState['executionerConversions']
  pendingJesterRevenges: GameState['pendingJesterRevenges']
  jesterRevengeResolutions: GameState['jesterRevengeResolutions']
}>

export type CompleteImportantNightEvents = Readonly<{
  gameId: GameId
  nightNumber: number
  completeness: 'complete'
  canonicalSource: ImportantNightEventCanonicalSource
  events: readonly ImportantNightEvent[]
}>

export type ImportantNightEvents =
  | CompleteImportantNightEvents
  | Readonly<{
      gameId: GameId
      nightNumber: number
      completeness: 'legacy-unavailable'
      canonicalSource: null
      events: readonly ImportantNightEvent[]
    }>

export type ImportantNightEventsError = Readonly<{
  type: 'INVALID_IMPORTANT_NIGHT_EVENTS'
  reason:
    | 'game-mismatch'
    | 'night-mismatch'
    | 'unknown-player'
    | 'role-mismatch'
    | 'outcome-mismatch'
    | 'duplicate-event'
    | 'invalid-order'
    | 'death-mismatch'
    | 'source-mismatch'
    | 'coverage-mismatch'
}>

const NO_DOCTORS: readonly [] = Object.freeze([])

export function captureImportantNightEventCanonicalSource(
  game: GameState,
  collectedActions: CollectedNightActions,
): ImportantNightEventCanonicalSource {
  return Object.freeze({
    collectedActions,
    playerStatuses: Object.freeze(
      game.players.map((player) =>
        Object.freeze({
          playerId: player.playerId,
          alive: player.alive,
          publiclyRevealedRoleId: player.publiclyRevealedRoleId,
        }),
      ),
    ),
    doctorPreviousTargets: game.doctorPreviousTargets,
    deathRecords: game.deathRecords,
    executionerConversions: game.executionerConversions,
    pendingJesterRevenges: game.pendingJesterRevenges,
    jesterRevengeResolutions: game.jesterRevengeResolutions,
  })
}

export function buildImportantNightEvents(
  resolution: NightResolution,
  canonicalSource: ImportantNightEventCanonicalSource,
): CompleteImportantNightEvents {
  const roleBlocks = resolution.roleBlockAttempts.map((attempt) =>
    Object.freeze({
      kind: 'role-block' as const,
      consortPlayerId: attempt.actorPlayerId,
      consortRoleInstanceId: attempt.actorRoleInstanceId,
      targetPlayerId: attempt.targetPlayerId,
      targetRoleInstanceId: attempt.targetRoleInstanceId,
      outcome: attempt.outcome,
    }),
  )
  const frames = resolution.frames.flatMap((frame) =>
    frame.sources.map((source) =>
      Object.freeze({
        kind: 'frame' as const,
        framerPlayerId: source.framerPlayerId,
        framerRoleInstanceId: source.framerRoleInstanceId,
        targetPlayerId: frame.framedPlayerId,
      }),
    ),
  )
  const attacks = resolution.attackAttempts.map((attack): ImportantAttackEvent => {
    if (attack.outcome !== 'protected') {
      return Object.freeze({
        kind: 'attack',
        attackerPlayerId: attack.attackerPlayerId,
        attackerRoleId: attack.attackerRoleId,
        attackerRoleInstanceId: attack.attackerRoleInstanceId,
        targetPlayerId: attack.targetPlayerId,
        outcome: attack.outcome,
        doctors: NO_DOCTORS,
      })
    }

    const protection = resolution.protections.find(
      (candidate) => candidate.protectedPlayerId === attack.targetPlayerId,
    )
    if (protection === undefined) {
      throw new Error('A canonical protected attack has no Doctor protection evidence.')
    }
    return Object.freeze({
      kind: 'attack',
      attackerPlayerId: attack.attackerPlayerId,
      attackerRoleId: attack.attackerRoleId,
      attackerRoleInstanceId: attack.attackerRoleInstanceId,
      targetPlayerId: attack.targetPlayerId,
      outcome: attack.outcome,
      doctors: protection.sources,
    })
  })

  return Object.freeze({
    gameId: resolution.gameId,
    nightNumber: resolution.nightNumber,
    completeness: 'complete',
    canonicalSource,
    events: Object.freeze([...roleBlocks, ...frames, ...attacks]),
  })
}

export function rebuildImportantNightEventsFromCanonicalSource(
  game: GameState,
  canonicalSource: ImportantNightEventCanonicalSource,
): DomainResult<CompleteImportantNightEvents, ImportantNightEventsError> {
  const candidate: CompleteImportantNightEvents = Object.freeze({
    gameId: game.id,
    nightNumber: game.nightNumber,
    completeness: 'complete',
    canonicalSource,
    events: Object.freeze([]),
  })
  const sourceResult = resolveCanonicalSource(game, candidate)
  if (!sourceResult.ok) {
    return sourceResult
  }
  const evidence = buildImportantNightEvents(sourceResult.value.resolution, canonicalSource)
  const validationResult = validateImportantNightEvents(game, evidence)
  return validationResult.ok ? succeed(evidence) : validationResult
}

export function validateImportantNightEvents(
  game: GameState,
  evidence: ImportantNightEvents,
): DomainResult<ImportantNightEvents, ImportantNightEventsError> {
  if (evidence.gameId !== game.id) {
    return invalidEvidence('game-mismatch')
  }
  if (evidence.nightNumber !== game.nightNumber) {
    return invalidEvidence('night-mismatch')
  }
  if (evidence.completeness === 'legacy-unavailable') {
    return evidence.events.length === 0 ? succeed(evidence) : invalidEvidence('source-mismatch')
  }

  const eventKeys = new Set<string>()
  let lastEventOrder = 0
  const lethalTargetPlayerIds = new Set<PlayerId>()

  for (const event of evidence.events) {
    const eventOrder = event.kind === 'role-block' ? 1 : event.kind === 'frame' ? 2 : 3
    if (eventOrder < lastEventOrder) {
      return invalidEvidence('invalid-order')
    }
    lastEventOrder = eventOrder

    const key = selectEventKey(event)
    if (eventKeys.has(key)) {
      return invalidEvidence('duplicate-event')
    }
    eventKeys.add(key)

    const eventResult = validateEvent(game, event)
    if (!eventResult.ok) {
      return eventResult
    }
    if (event.kind === 'attack' && event.outcome === 'lethal') {
      lethalTargetPlayerIds.add(event.targetPlayerId)
    }
  }

  const recordedNightDeathPlayerIds = new Set(
    game.deathRecords.flatMap((record) =>
      record.cause.kind === 'night-death' && record.cause.nightNumber === evidence.nightNumber
        ? [record.playerId]
        : [],
    ),
  )
  if (
    lethalTargetPlayerIds.size !== recordedNightDeathPlayerIds.size ||
    [...lethalTargetPlayerIds].some((playerId) => !recordedNightDeathPlayerIds.has(playerId))
  ) {
    return invalidEvidence('death-mismatch')
  }

  const sourceResult = resolveCanonicalSource(game, evidence)
  if (!sourceResult.ok) {
    return sourceResult
  }
  const expectedEvents = buildImportantNightEvents(
    sourceResult.value.resolution,
    evidence.canonicalSource,
  ).events
  if (!hasSameEvents(expectedEvents, evidence.events)) {
    return invalidEvidence('coverage-mismatch')
  }

  return succeed(evidence)
}

function resolveCanonicalSource(
  finalGame: GameState,
  evidence: CompleteImportantNightEvents,
): DomainResult<Readonly<{ resolution: NightResolution }>, ImportantNightEventsError> {
  const source = evidence.canonicalSource
  if (
    source.collectedActions.gameId !== evidence.gameId ||
    source.collectedActions.nightNumber !== evidence.nightNumber
  ) {
    return invalidEvidence('source-mismatch')
  }

  const sourceGameResult = restoreSourceGame(finalGame, source)
  if (!sourceGameResult.ok) {
    return sourceGameResult
  }
  const sourceGame = sourceGameResult.value

  const previousTargets: readonly PreviousNightTarget[] = Object.freeze(
    sourceGame.doctorPreviousTargets.flatMap((entry) =>
      entry.nightNumber === sourceGame.nightNumber - 1
        ? [
            Object.freeze({
              actorRoleInstanceId: entry.doctorRoleInstanceId,
              targetPlayerId: entry.targetPlayerId,
            }),
          ]
        : [],
    ),
  )
  const actionsResult = createCollectedNightActions(
    sourceGame,
    source.collectedActions.actions,
    previousTargets,
  )
  if (!actionsResult.ok) {
    return invalidEvidence('source-mismatch')
  }
  const resolutionResult = resolveNight({
    game: sourceGame,
    collectedActions: actionsResult.value,
    previousTargets,
  })
  if (!resolutionResult.ok) {
    return invalidEvidence('source-mismatch')
  }
  const begunResult = beginNightResolution(sourceGame, resolutionResult.value, actionsResult.value)
  if (!begunResult.ok) {
    return invalidEvidence('source-mismatch')
  }
  const appliedResult = applyResolvedNight(
    begunResult.value,
    resolutionResult.value,
    actionsResult.value,
  )
  if (!appliedResult.ok || !matchesFinalGame(appliedResult.value.game, finalGame, source)) {
    return invalidEvidence('source-mismatch')
  }
  return succeed(Object.freeze({ resolution: resolutionResult.value }))
}

function restoreSourceGame(
  finalGame: GameState,
  source: ImportantNightEventCanonicalSource,
): DomainResult<GameState, ImportantNightEventsError> {
  if (source.playerStatuses.length !== finalGame.players.length) {
    return invalidEvidence('source-mismatch')
  }
  const statusesByPlayerId = new Map(
    source.playerStatuses.map((status) => [status.playerId, status]),
  )
  if (statusesByPlayerId.size !== source.playerStatuses.length) {
    return invalidEvidence('source-mismatch')
  }
  const players: Array<GameState['players'][number]> = []
  for (const player of finalGame.players) {
    const status = statusesByPlayerId.get(player.playerId)
    if (status === undefined) {
      return invalidEvidence('source-mismatch')
    }
    players.push(
      Object.freeze({
        ...player,
        alive: status.alive,
        publiclyRevealedRoleId: status.publiclyRevealedRoleId,
      }),
    )
  }
  const gameResult = validateGameState({
    ...finalGame,
    phase: 'night-action-collection',
    players,
    doctorPreviousTargets: source.doctorPreviousTargets,
    deathRecords: source.deathRecords,
    executionerConversions: source.executionerConversions,
    pendingJesterRevenges: source.pendingJesterRevenges,
    jesterRevengeResolutions: source.jesterRevengeResolutions,
  })
  return gameResult.ok ? succeed(gameResult.value) : invalidEvidence('source-mismatch')
}

function matchesFinalGame(
  appliedGame: GameState,
  finalGame: GameState,
  source: ImportantNightEventCanonicalSource,
): boolean {
  if (finalGame.phase === 'dawn-resolution') {
    return hasSameCanonicalContent(appliedGame, finalGame)
  }
  if (finalGame.phase !== 'dawn-announcement') {
    return false
  }

  let reconciledGame = appliedGame
  const newRevengeResolutions = finalGame.jesterRevengeResolutions.slice(
    source.jesterRevengeResolutions.length,
  )
  for (const resolution of newRevengeResolutions) {
    if (resolution.resolvedAtNightNumber !== finalGame.nightNumber) {
      return false
    }
    if (resolution.kind === 'victim-killed') {
      const selection: SelectedJesterRevenge = Object.freeze({
        id: resolution.id,
        kind: 'victim-selected',
        gameId: resolution.gameId,
        obligationId: resolution.obligationId,
        jesterPlayerId: resolution.jesterPlayerId,
        jesterRoleInstanceId: resolution.jesterRoleInstanceId,
        victimPlayerId: resolution.victimPlayerId,
        resolvedAtNightNumber: resolution.resolvedAtNightNumber,
      })
      const result = applySelectedJesterRevenge(reconciledGame, selection)
      if (!result.ok) {
        return false
      }
      reconciledGame = result.value
    } else {
      const result = exhaustJesterRevengeWithoutSurvivor(reconciledGame)
      if (!result.ok) {
        return false
      }
      reconciledGame = result.value
    }
  }

  const phaseResult = transitionPhase(reconciledGame.phase, 'dawn-announcement')
  if (!phaseResult.ok) {
    return false
  }
  const dawnResult = validateGameState({ ...reconciledGame, phase: phaseResult.value })
  return dawnResult.ok && hasSameCanonicalContent(dawnResult.value, finalGame)
}

function hasSameCanonicalContent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => hasSameCanonicalContent(value, right[index]))
    )
  }
  if (!isUnknownRecord(left) || !isUnknownRecord(right)) {
    return false
  }
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && hasSameCanonicalContent(left[key], right[key]),
    )
  )
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasSameEvents(
  expected: readonly ImportantNightEvent[],
  actual: readonly ImportantNightEvent[],
): boolean {
  return (
    expected.length === actual.length &&
    expected.every((event, index) => {
      const candidate = actual[index]
      if (candidate === undefined || event.kind !== candidate.kind) {
        return false
      }
      switch (event.kind) {
        case 'role-block':
          return (
            candidate.kind === 'role-block' &&
            event.consortPlayerId === candidate.consortPlayerId &&
            event.consortRoleInstanceId === candidate.consortRoleInstanceId &&
            event.targetPlayerId === candidate.targetPlayerId &&
            event.targetRoleInstanceId === candidate.targetRoleInstanceId &&
            event.outcome === candidate.outcome
          )
        case 'frame':
          return (
            candidate.kind === 'frame' &&
            event.framerPlayerId === candidate.framerPlayerId &&
            event.framerRoleInstanceId === candidate.framerRoleInstanceId &&
            event.targetPlayerId === candidate.targetPlayerId
          )
        case 'attack':
          return (
            candidate.kind === 'attack' &&
            event.attackerPlayerId === candidate.attackerPlayerId &&
            event.attackerRoleId === candidate.attackerRoleId &&
            event.attackerRoleInstanceId === candidate.attackerRoleInstanceId &&
            event.targetPlayerId === candidate.targetPlayerId &&
            event.outcome === candidate.outcome &&
            event.doctors.length === candidate.doctors.length &&
            event.doctors.every((doctor, doctorIndex) => {
              const candidateDoctor = candidate.doctors[doctorIndex]
              return (
                candidateDoctor !== undefined &&
                doctor.doctorPlayerId === candidateDoctor.doctorPlayerId &&
                doctor.doctorRoleInstanceId === candidateDoctor.doctorRoleInstanceId
              )
            })
          )
      }
    })
  )
}

function validateEvent(
  game: GameState,
  event: ImportantNightEvent,
): DomainResult<ImportantNightEvent, ImportantNightEventsError> {
  switch (event.kind) {
    case 'role-block': {
      const consort = selectPlayer(game, event.consortPlayerId, event.consortRoleInstanceId)
      const target = selectPlayer(game, event.targetPlayerId, event.targetRoleInstanceId)
      if (consort === null || target === null) {
        return invalidEvidence('unknown-player')
      }
      if (selectActiveRoleId(game, consort.playerId) !== ROLE_IDS.consort) {
        return invalidEvidence('role-mismatch')
      }
      const expectedOutcome =
        selectActiveRoleId(game, target.playerId) === ROLE_IDS.consort
          ? 'target-immune'
          : 'blocked-target'
      return event.outcome === expectedOutcome
        ? succeed(event)
        : invalidEvidence('outcome-mismatch')
    }
    case 'frame': {
      const framer = selectPlayer(game, event.framerPlayerId, event.framerRoleInstanceId)
      if (
        framer === null ||
        !game.players.some((player) => player.playerId === event.targetPlayerId)
      ) {
        return invalidEvidence('unknown-player')
      }
      return selectActiveRoleId(game, framer.playerId) === ROLE_IDS.framer
        ? succeed(event)
        : invalidEvidence('role-mismatch')
    }
    case 'attack': {
      const attacker = selectPlayer(game, event.attackerPlayerId, event.attackerRoleInstanceId)
      const target = game.players.find((player) => player.playerId === event.targetPlayerId)
      if (attacker === null || target === undefined) {
        return invalidEvidence('unknown-player')
      }
      const activeAttackerRoleId = selectActiveRoleId(game, attacker.playerId)
      const activeTargetRoleId = selectActiveRoleId(game, target.playerId)
      if (
        activeAttackerRoleId !== event.attackerRoleId ||
        activeTargetRoleId === null ||
        (event.attackerRoleId !== ROLE_IDS.godfather &&
          event.attackerRoleId !== ROLE_IDS.serialKiller)
      ) {
        return invalidEvidence('role-mismatch')
      }

      const doctorIds = new Set<PlayerId>()
      for (const doctorSource of event.doctors) {
        const doctor = selectPlayer(
          game,
          doctorSource.doctorPlayerId,
          doctorSource.doctorRoleInstanceId,
        )
        if (doctor === null || selectActiveRoleId(game, doctor.playerId) !== ROLE_IDS.doctor) {
          return invalidEvidence(doctor === null ? 'unknown-player' : 'role-mismatch')
        }
        if (doctorIds.has(doctor.playerId)) {
          return invalidEvidence('duplicate-event')
        }
        doctorIds.add(doctor.playerId)
      }

      const expectedOutcome = determineOrdinaryAttackOutcome(
        event.attackerRoleId,
        activeTargetRoleId,
        game.settings.godfatherAndSerialCanKillEachOther,
        event.doctors.length > 0,
      )
      return event.outcome === expectedOutcome
        ? succeed(event)
        : invalidEvidence('outcome-mismatch')
    }
  }
}

function selectPlayer(
  game: GameState,
  selectedPlayerId: PlayerId,
  selectedRoleInstanceId: RoleInstanceId,
) {
  return (
    game.players.find(
      (player) =>
        player.playerId === selectedPlayerId && player.role.instanceId === selectedRoleInstanceId,
    ) ?? null
  )
}

function selectEventKey(event: ImportantNightEvent): string {
  switch (event.kind) {
    case 'role-block':
      return `role-block:${event.consortRoleInstanceId}`
    case 'frame':
      return `frame:${event.framerRoleInstanceId}`
    case 'attack':
      return `attack:${event.attackerRoleInstanceId}`
  }
}

function invalidEvidence(
  reason: ImportantNightEventsError['reason'],
): DomainResult<never, ImportantNightEventsError> {
  return fail({ type: 'INVALID_IMPORTANT_NIGHT_EVENTS', reason })
}
