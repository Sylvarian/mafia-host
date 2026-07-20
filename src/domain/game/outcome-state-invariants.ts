import type { DayOutcome } from '../day/day-outcome-model.ts'
import type { ExecutionerTarget } from '../executioner/executioner-target-model.ts'
import { fail, succeed, type DomainResult } from './domain-result.ts'
import {
  gameId,
  playerId,
  roleInstanceId,
  type GameId,
  type PlayerId,
  type RoleInstanceId,
} from '../identifiers.ts'
import type {
  ExecutionerToJesterConversion,
  JesterRevengeResolution,
  PendingJesterRevenge,
  PendingJesterRevengeId,
  PersonalWinRecord,
} from '../neutral/neutral-outcome-model.ts'
import {
  createJesterRevengeResolutionId,
  createPendingJesterRevengeId,
} from '../neutral/jester-revenge-identity.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import type { GamePlayer } from '../players/game-player.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { DeathCause, DeathRecord } from './death-record.ts'

export type OutcomeStateInvariantError =
  | Readonly<{
      type: 'INVALID_DEATH_RECORDS'
      reason:
        | 'not-an-array'
        | 'invalid-record'
        | 'unknown-player'
        | 'role-instance-mismatch'
        | 'game-mismatch'
        | 'player-still-alive'
        | 'public-reveal-mismatch'
        | 'invalid-cause'
        | 'duplicate-player'
        | 'order-mismatch'
        | 'missing-dead-player'
        | 'revenge-resolution-mismatch'
        | 'partial-final-showdown'
        | 'invalid-final-showdown-evidence'
      index?: number
      playerId?: PlayerId
    }>
  | Readonly<{
      type: 'INVALID_EXECUTIONER_CONVERSIONS'
      reason:
        | 'not-an-array'
        | 'invalid-record'
        | 'game-mismatch'
        | 'unknown-player'
        | 'role-instance-mismatch'
        | 'non-executioner'
        | 'missing-target-relationship'
        | 'target-not-dead'
        | 'target-executed'
        | 'duplicate-role-instance'
        | 'order-mismatch'
        | 'missing-required-conversion'
      index?: number
      roleInstanceId?: RoleInstanceId
    }>
  | Readonly<{
      type: 'INVALID_PERSONAL_WINS'
      reason:
        | 'not-an-array'
        | 'invalid-record'
        | 'game-mismatch'
        | 'unknown-player'
        | 'role-instance-mismatch'
        | 'invalid-day'
        | 'invalid-role'
        | 'missing-execution'
        | 'invalid-target-relationship'
        | 'converted-executioner'
        | 'duplicate-record'
        | 'order-mismatch'
        | 'missing-required-win'
      index?: number
      roleInstanceId?: RoleInstanceId
    }>
  | Readonly<{
      type: 'INVALID_PENDING_JESTER_REVENGES'
      reason:
        | 'not-an-array'
        | 'invalid-record'
        | 'game-mismatch'
        | 'unknown-player'
        | 'role-instance-mismatch'
        | 'invalid-day'
        | 'missing-jester-win'
        | 'duplicate-record'
        | 'order-mismatch'
        | 'missing-required-revenge'
        | 'not-due'
        | 'overdue'
      index?: number
      roleInstanceId?: RoleInstanceId
    }>
  | Readonly<{
      type: 'INVALID_JESTER_REVENGE_RESOLUTIONS'
      reason:
        | 'not-an-array'
        | 'invalid-record'
        | 'game-mismatch'
        | 'unknown-obligation'
        | 'owner-mismatch'
        | 'invalid-night'
        | 'unknown-victim'
        | 'victim-death-mismatch'
        | 'duplicate-obligation'
        | 'duplicate-resolution'
        | 'order-mismatch'
      index?: number
      obligationId?: PendingJesterRevengeId
    }>
  | Readonly<{
      type: 'INVALID_DAY_OUTCOMES'
      reason:
        | 'not-an-array'
        | 'invalid-record'
        | 'game-mismatch'
        | 'invalid-day'
        | 'unknown-player'
        | 'missing-execution-death'
        | 'execution-player-mismatch'
        | 'no-execution-with-execution-death'
        | 'phase-mismatch'
        | 'duplicate-day'
        | 'order-mismatch'
        | 'missing-day'
    }>

export type ValidatedOutcomeState = Readonly<{
  deathRecords: readonly DeathRecord[]
  personalWins: readonly PersonalWinRecord[]
  executionerConversions: readonly ExecutionerToJesterConversion[]
  pendingJesterRevenges: readonly PendingJesterRevenge[]
  jesterRevengeResolutions: readonly JesterRevengeResolution[]
  dayOutcomes: readonly DayOutcome[]
}>

export function copyAndValidateOutcomeState(
  candidate: Readonly<{
    deathRecords: unknown
    personalWins: unknown
    executionerConversions: unknown
    pendingJesterRevenges: unknown
    jesterRevengeResolutions: unknown
    dayOutcomes: unknown
  }>,
  context: Readonly<{
    gameId: GameId
    phase: GamePhase
    players: readonly GamePlayer[]
    executionerTargets: readonly ExecutionerTarget[]
    nightNumber: number
    dayNumber: number
    revealRoleOnDeath: boolean
  }>,
): DomainResult<ValidatedOutcomeState, OutcomeStateInvariantError> {
  const dayOutcomeResult = copyDayOutcomes(candidate.dayOutcomes, context)
  if (!dayOutcomeResult.ok) {
    return dayOutcomeResult
  }

  const resolutionResult = copyRevengeResolutionShapes(candidate.jesterRevengeResolutions, context)
  if (!resolutionResult.ok) {
    return resolutionResult
  }

  const deathResult = copyDeathRecords(candidate.deathRecords, context, resolutionResult.value)
  if (!deathResult.ok) {
    return deathResult
  }

  const conversionResult = copyConversions(
    candidate.executionerConversions,
    context,
    deathResult.value,
  )
  if (!conversionResult.ok) {
    return conversionResult
  }

  const dayEvidenceResult = validateDayOutcomeEvidence(
    dayOutcomeResult.value,
    context,
    deathResult.value,
  )
  if (!dayEvidenceResult.ok) {
    return dayEvidenceResult
  }

  const personalWinResult = copyPersonalWins(
    candidate.personalWins,
    context,
    deathResult.value,
    conversionResult.value,
  )
  if (!personalWinResult.ok) {
    return personalWinResult
  }

  const revengeResult = copyPendingRevenges(
    candidate.pendingJesterRevenges,
    context,
    deathResult.value,
    conversionResult.value,
    personalWinResult.value,
    resolutionResult.value,
  )
  if (!revengeResult.ok) {
    return revengeResult
  }

  const validatedResolutionsResult = validateRevengeResolutionEvidence(
    resolutionResult.value,
    context,
    deathResult.value,
    personalWinResult.value,
    revengeResult.value,
  )
  if (!validatedResolutionsResult.ok) {
    return validatedResolutionsResult
  }

  return succeed(
    Object.freeze({
      deathRecords: deathResult.value,
      personalWins: personalWinResult.value,
      executionerConversions: conversionResult.value,
      pendingJesterRevenges: revengeResult.value,
      jesterRevengeResolutions: validatedResolutionsResult.value,
      dayOutcomes: dayEvidenceResult.value,
    }),
  )
}

export function orderDeathRecords(
  records: readonly DeathRecord[],
  players: readonly GamePlayer[],
): readonly DeathRecord[] {
  const rosterOrder = playerOrder(players)
  return Object.freeze(
    [...records].sort((left, right) => {
      const timingDifference = deathTiming(left.cause) - deathTiming(right.cause)
      return timingDifference !== 0
        ? timingDifference
        : orderOf(rosterOrder, left.playerId) - orderOf(rosterOrder, right.playerId)
    }),
  )
}

export function orderExecutionerConversions(
  records: readonly ExecutionerToJesterConversion[],
  players: readonly GamePlayer[],
  deaths: readonly DeathRecord[],
): readonly ExecutionerToJesterConversion[] {
  const rosterOrder = playerOrder(players)
  const deathByPlayer = new Map(deaths.map((death) => [death.playerId, death]))
  return Object.freeze(
    [...records].sort((left, right) => {
      const leftDeath = deathByPlayer.get(left.targetPlayerId)
      const rightDeath = deathByPlayer.get(right.targetPlayerId)
      const timingDifference =
        (leftDeath === undefined ? Number.MAX_SAFE_INTEGER : deathTiming(leftDeath.cause)) -
        (rightDeath === undefined ? Number.MAX_SAFE_INTEGER : deathTiming(rightDeath.cause))
      if (timingDifference !== 0) {
        return timingDifference
      }
      const ordinalDifference =
        playerOrdinal(players, left.playerId) - playerOrdinal(players, right.playerId)
      return ordinalDifference !== 0
        ? ordinalDifference
        : orderOf(rosterOrder, left.playerId) - orderOf(rosterOrder, right.playerId)
    }),
  )
}

export function orderPersonalWins(
  records: readonly PersonalWinRecord[],
  players: readonly GamePlayer[],
): readonly PersonalWinRecord[] {
  const rosterOrder = playerOrder(players)
  return Object.freeze(
    [...records].sort((left, right) => {
      const dayDifference = left.dayNumber - right.dayNumber
      if (dayDifference !== 0) {
        return dayDifference
      }
      const ordinalDifference =
        playerOrdinal(players, left.playerId) - playerOrdinal(players, right.playerId)
      return ordinalDifference !== 0
        ? ordinalDifference
        : orderOf(rosterOrder, left.playerId) - orderOf(rosterOrder, right.playerId)
    }),
  )
}

export function orderPendingJesterRevenges(
  records: readonly PendingJesterRevenge[],
  players: readonly GamePlayer[],
): readonly PendingJesterRevenge[] {
  const rosterOrder = playerOrder(players)
  return Object.freeze(
    [...records].sort((left, right) => {
      const dayDifference = left.triggeredOnDay - right.triggeredOnDay
      if (dayDifference !== 0) {
        return dayDifference
      }
      const ordinalDifference =
        playerOrdinal(players, left.jesterPlayerId) - playerOrdinal(players, right.jesterPlayerId)
      return ordinalDifference !== 0
        ? ordinalDifference
        : orderOf(rosterOrder, left.jesterPlayerId) - orderOf(rosterOrder, right.jesterPlayerId)
    }),
  )
}

export function orderJesterRevengeResolutions(
  records: readonly JesterRevengeResolution[],
  players: readonly GamePlayer[],
): readonly JesterRevengeResolution[] {
  const rosterOrder = playerOrder(players)
  return Object.freeze(
    [...records].sort((left, right) => {
      const nightDifference = left.resolvedAtNightNumber - right.resolvedAtNightNumber
      if (nightDifference !== 0) {
        return nightDifference
      }
      const ordinalDifference =
        playerOrdinal(players, left.jesterPlayerId) - playerOrdinal(players, right.jesterPlayerId)
      return ordinalDifference !== 0
        ? ordinalDifference
        : orderOf(rosterOrder, left.jesterPlayerId) - orderOf(rosterOrder, right.jesterPlayerId)
    }),
  )
}

export function orderDayOutcomes(records: readonly DayOutcome[]): readonly DayOutcome[] {
  return Object.freeze([...records].sort((left, right) => left.dayNumber - right.dayNumber))
}

function copyRevengeResolutionShapes(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
): DomainResult<readonly JesterRevengeResolution[], OutcomeStateInvariantError> {
  if (!Array.isArray(candidate)) {
    return invalidRevengeResolutions('not-an-array')
  }
  const resolutions: JesterRevengeResolution[] = []
  const seenIds = new Set<string>()
  const seenObligations = new Set<string>()
  for (const [index, value] of candidate.entries()) {
    if (
      !isUnknownRecord(value) ||
      !isNonblankString(value.id) ||
      !isNonblankString(value.gameId) ||
      !isNonblankString(value.obligationId) ||
      !isNonblankString(value.jesterPlayerId) ||
      !isNonblankString(value.jesterRoleInstanceId) ||
      !isPositiveInteger(value.resolvedAtNightNumber)
    ) {
      return invalidRevengeResolutions('invalid-record', index)
    }
    let resolution: JesterRevengeResolution
    if (
      value.kind === 'victim-killed' &&
      hasExactKeys(value, [
        'id',
        'kind',
        'gameId',
        'obligationId',
        'jesterPlayerId',
        'jesterRoleInstanceId',
        'victimPlayerId',
        'resolvedAtNightNumber',
      ]) &&
      isNonblankString(value.victimPlayerId)
    ) {
      resolution = Object.freeze({
        id: value.id,
        kind: 'victim-killed',
        gameId: gameId(value.gameId),
        obligationId: value.obligationId,
        jesterPlayerId: playerId(value.jesterPlayerId),
        jesterRoleInstanceId: roleInstanceId(value.jesterRoleInstanceId),
        victimPlayerId: playerId(value.victimPlayerId),
        resolvedAtNightNumber: value.resolvedAtNightNumber,
      })
    } else if (
      value.kind === 'no-survivor' &&
      hasExactKeys(value, [
        'id',
        'kind',
        'gameId',
        'obligationId',
        'jesterPlayerId',
        'jesterRoleInstanceId',
        'resolvedAtNightNumber',
      ])
    ) {
      resolution = Object.freeze({
        id: value.id,
        kind: 'no-survivor',
        gameId: gameId(value.gameId),
        obligationId: value.obligationId,
        jesterPlayerId: playerId(value.jesterPlayerId),
        jesterRoleInstanceId: roleInstanceId(value.jesterRoleInstanceId),
        resolvedAtNightNumber: value.resolvedAtNightNumber,
      })
    } else {
      return invalidRevengeResolutions('invalid-record', index)
    }
    if (resolution.gameId !== context.gameId) {
      return invalidRevengeResolutions('game-mismatch', index, resolution.obligationId)
    }
    if (
      resolution.resolvedAtNightNumber >
      latestAppliedNightNumber(context.phase, context.nightNumber)
    ) {
      return invalidRevengeResolutions('invalid-night', index, resolution.obligationId)
    }
    if (
      !context.players.some(
        (player) =>
          player.playerId === resolution.jesterPlayerId &&
          player.role.instanceId === resolution.jesterRoleInstanceId,
      )
    ) {
      return invalidRevengeResolutions('owner-mismatch', index, resolution.obligationId)
    }
    if (
      resolution.kind === 'victim-killed' &&
      !context.players.some((player) => player.playerId === resolution.victimPlayerId)
    ) {
      return invalidRevengeResolutions('unknown-victim', index, resolution.obligationId)
    }
    if (seenIds.has(resolution.id)) {
      return invalidRevengeResolutions('duplicate-resolution', index, resolution.obligationId)
    }
    if (seenObligations.has(resolution.obligationId)) {
      return invalidRevengeResolutions('duplicate-obligation', index, resolution.obligationId)
    }
    seenIds.add(resolution.id)
    seenObligations.add(resolution.obligationId)
    resolutions.push(resolution)
  }
  const ordered = orderJesterRevengeResolutions(resolutions, context.players)
  return sameSequence(ordered, resolutions, revengeResolutionKey)
    ? succeed(Object.freeze(resolutions))
    : invalidRevengeResolutions('order-mismatch')
}

function copyDeathRecords(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
  revengeResolutions: readonly JesterRevengeResolution[],
): DomainResult<readonly DeathRecord[], OutcomeStateInvariantError> {
  if (!Array.isArray(candidate)) {
    return invalidDeaths('not-an-array')
  }

  const records: DeathRecord[] = []
  const seenPlayers = new Set<PlayerId>()
  for (const [index, value] of candidate.entries()) {
    if (
      !isUnknownRecord(value) ||
      !hasExactKeys(value, ['gameId', 'playerId', 'roleInstanceId', 'cause']) ||
      !isNonblankString(value.gameId) ||
      !isNonblankString(value.playerId) ||
      !isNonblankString(value.roleInstanceId)
    ) {
      return invalidDeaths('invalid-record', index)
    }
    const causeResult = copyDeathCause(value.cause, context)
    if (!causeResult.ok) {
      return invalidDeaths(causeResult.error, index)
    }
    const record: DeathRecord = Object.freeze({
      gameId: gameId(value.gameId),
      playerId: playerId(value.playerId),
      roleInstanceId: roleInstanceId(value.roleInstanceId),
      cause: causeResult.value,
    })
    if (record.gameId !== context.gameId) {
      return invalidDeaths('game-mismatch', index, record.playerId)
    }
    const player = context.players.find((entry) => entry.playerId === record.playerId)
    if (player === undefined) {
      return invalidDeaths('unknown-player', index, record.playerId)
    }
    if (player.role.instanceId !== record.roleInstanceId) {
      return invalidDeaths('role-instance-mismatch', index, record.playerId)
    }
    if (player.alive) {
      return invalidDeaths('player-still-alive', index, record.playerId)
    }
    if (context.revealRoleOnDeath && player.publiclyRevealedRoleId !== player.role.roleId) {
      return invalidDeaths('public-reveal-mismatch', index, record.playerId)
    }
    if (seenPlayers.has(record.playerId)) {
      return invalidDeaths('duplicate-player', index, record.playerId)
    }
    const cause = record.cause
    if (cause.kind === 'jester-revenge') {
      const matchingResolution = revengeResolutions.find(
        (resolution) =>
          resolution.kind === 'victim-killed' &&
          resolution.id === cause.resolutionId &&
          resolution.obligationId === cause.obligationId &&
          resolution.jesterPlayerId === cause.jesterPlayerId &&
          resolution.jesterRoleInstanceId === cause.jesterRoleInstanceId &&
          resolution.victimPlayerId === record.playerId &&
          resolution.resolvedAtNightNumber === cause.nightNumber,
      )
      if (matchingResolution === undefined) {
        return invalidDeaths('revenge-resolution-mismatch', index, record.playerId)
      }
    }
    seenPlayers.add(record.playerId)
    records.push(record)
  }

  const showdownResult = validateFinalShowdownEvidence(records, context)
  if (!showdownResult.ok) {
    return showdownResult
  }

  const unauthorizedReveal = context.players.find((player) => {
    if (player.publiclyRevealedRoleId === null) {
      return false
    }
    const authorizedByDeath =
      context.revealRoleOnDeath && !player.alive && seenPlayers.has(player.playerId)
    const death = records.find((record) => record.playerId === player.playerId)
    const authorizedMayorReveal =
      player.role.roleId === ROLE_IDS.mayor &&
      context.dayNumber >= 1 &&
      (player.alive ||
        death?.cause.kind === 'day-execution' ||
        death?.cause.kind === 'jester-revenge' ||
        death?.cause.kind === 'final-killing-role-showdown' ||
        (death?.cause.kind === 'night-death' && death.cause.nightNumber > 1))
    return !authorizedByDeath && !authorizedMayorReveal
  })
  if (unauthorizedReveal !== undefined) {
    return invalidDeaths('public-reveal-mismatch', undefined, unauthorizedReveal.playerId)
  }

  if (requiresCompleteDeathAuthority(context.phase)) {
    const missing = context.players.find(
      (player) => !player.alive && !seenPlayers.has(player.playerId),
    )
    if (missing !== undefined) {
      return invalidDeaths('missing-dead-player', undefined, missing.playerId)
    }
  }

  const ordered = orderDeathRecords(records, context.players)
  if (!sameSequence(ordered, records, deathRecordKey)) {
    return invalidDeaths('order-mismatch')
  }
  return succeed(Object.freeze(records))
}

function copyDeathCause(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
): DomainResult<
  DeathCause,
  Extract<OutcomeStateInvariantError, { type: 'INVALID_DEATH_RECORDS' }>['reason']
> {
  if (!isUnknownRecord(candidate)) {
    return fail('invalid-cause')
  }
  if (
    candidate.kind === 'night-death' &&
    hasExactKeys(candidate, ['kind', 'nightNumber']) &&
    isPositiveInteger(candidate.nightNumber) &&
    candidate.nightNumber <= latestAppliedNightNumber(context.phase, context.nightNumber)
  ) {
    return succeed(Object.freeze({ kind: 'night-death', nightNumber: candidate.nightNumber }))
  }
  if (
    candidate.kind === 'day-execution' &&
    hasExactKeys(candidate, ['kind', 'dayNumber']) &&
    isPositiveInteger(candidate.dayNumber) &&
    candidate.dayNumber <= context.dayNumber
  ) {
    return succeed(Object.freeze({ kind: 'day-execution', dayNumber: candidate.dayNumber }))
  }
  if (
    candidate.kind === 'jester-revenge' &&
    hasExactKeys(candidate, [
      'kind',
      'nightNumber',
      'jesterPlayerId',
      'jesterRoleInstanceId',
      'obligationId',
      'resolutionId',
    ]) &&
    isPositiveInteger(candidate.nightNumber) &&
    candidate.nightNumber <= latestAppliedNightNumber(context.phase, context.nightNumber) &&
    isNonblankString(candidate.jesterPlayerId) &&
    isNonblankString(candidate.jesterRoleInstanceId) &&
    isNonblankString(candidate.obligationId) &&
    isNonblankString(candidate.resolutionId)
  ) {
    return succeed(
      Object.freeze({
        kind: 'jester-revenge',
        nightNumber: candidate.nightNumber,
        jesterPlayerId: playerId(candidate.jesterPlayerId),
        jesterRoleInstanceId: roleInstanceId(candidate.jesterRoleInstanceId),
        obligationId: candidate.obligationId,
        resolutionId: candidate.resolutionId,
      }),
    )
  }
  if (
    candidate.kind === 'final-killing-role-showdown' &&
    hasExactKeys(candidate, ['kind', 'boundary', 'opponentPlayerId']) &&
    isNonblankString(candidate.opponentPlayerId)
  ) {
    const boundary = copyFinalShowdownBoundary(candidate.boundary, context)
    return boundary === null
      ? fail('invalid-cause')
      : succeed(
          Object.freeze({
            kind: 'final-killing-role-showdown',
            boundary,
            opponentPlayerId: playerId(candidate.opponentPlayerId),
          }),
        )
  }
  return fail('invalid-cause')
}

function copyFinalShowdownBoundary(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
): Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'] | null {
  if (!isUnknownRecord(candidate)) {
    return null
  }
  if (
    candidate.kind === 'post-day' &&
    hasExactKeys(candidate, ['kind', 'dayNumber']) &&
    isPositiveInteger(candidate.dayNumber) &&
    candidate.dayNumber === context.dayNumber &&
    (context.phase === 'execution-resolution' ||
      (context.phase === 'game-over' && context.nightNumber === context.dayNumber))
  ) {
    return Object.freeze({ kind: 'post-day', dayNumber: candidate.dayNumber })
  }
  if (
    candidate.kind === 'post-dawn' &&
    hasExactKeys(candidate, ['kind', 'nightNumber']) &&
    isPositiveInteger(candidate.nightNumber) &&
    candidate.nightNumber === context.nightNumber &&
    (context.phase === 'dawn-resolution' ||
      (context.phase === 'game-over' && context.nightNumber === context.dayNumber + 1))
  ) {
    return Object.freeze({ kind: 'post-dawn', nightNumber: candidate.nightNumber })
  }
  return null
}

function validateFinalShowdownEvidence(
  deaths: readonly DeathRecord[],
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
): DomainResult<true, OutcomeStateInvariantError> {
  const showdownDeaths = deaths.filter(
    (
      death,
    ): death is DeathRecord & {
      cause: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>
    } => death.cause.kind === 'final-killing-role-showdown',
  )
  if (showdownDeaths.length === 0) {
    return succeed(true)
  }
  if (showdownDeaths.length !== 2) {
    return invalidDeaths('partial-final-showdown')
  }
  const first = showdownDeaths[0]
  const second = showdownDeaths[1]
  if (
    first === undefined ||
    second === undefined ||
    first.cause.opponentPlayerId !== second.playerId ||
    second.cause.opponentPlayerId !== first.playerId ||
    !sameFinalShowdownBoundary(first.cause.boundary, second.cause.boundary) ||
    context.players.some((player) => player.alive)
  ) {
    return invalidDeaths('invalid-final-showdown-evidence')
  }
  return succeed(true)
}

function sameFinalShowdownBoundary(
  left: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'],
  right: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'],
): boolean {
  return left.kind === 'post-day'
    ? right.kind === 'post-day' && left.dayNumber === right.dayNumber
    : right.kind === 'post-dawn' && left.nightNumber === right.nightNumber
}

function copyConversions(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
  deaths: readonly DeathRecord[],
): DomainResult<readonly ExecutionerToJesterConversion[], OutcomeStateInvariantError> {
  if (!Array.isArray(candidate)) {
    return invalidConversions('not-an-array')
  }
  const records: ExecutionerToJesterConversion[] = []
  const seen = new Set<RoleInstanceId>()
  for (const [index, value] of candidate.entries()) {
    if (
      !isUnknownRecord(value) ||
      !hasExactKeys(value, ['kind', 'gameId', 'playerId', 'roleInstanceId', 'targetPlayerId']) ||
      value.kind !== 'executioner-to-jester' ||
      !isNonblankString(value.gameId) ||
      !isNonblankString(value.playerId) ||
      !isNonblankString(value.roleInstanceId) ||
      !isNonblankString(value.targetPlayerId)
    ) {
      return invalidConversions('invalid-record', index)
    }
    const record: ExecutionerToJesterConversion = Object.freeze({
      kind: 'executioner-to-jester',
      gameId: gameId(value.gameId),
      playerId: playerId(value.playerId),
      roleInstanceId: roleInstanceId(value.roleInstanceId),
      targetPlayerId: playerId(value.targetPlayerId),
    })
    if (record.gameId !== context.gameId) {
      return invalidConversions('game-mismatch', index, record.roleInstanceId)
    }
    const owner = context.players.find((player) => player.playerId === record.playerId)
    if (owner === undefined) {
      return invalidConversions('unknown-player', index, record.roleInstanceId)
    }
    if (owner.role.instanceId !== record.roleInstanceId) {
      return invalidConversions('role-instance-mismatch', index, record.roleInstanceId)
    }
    if (owner.role.roleId !== ROLE_IDS.executioner) {
      return invalidConversions('non-executioner', index, record.roleInstanceId)
    }
    const relationship = context.executionerTargets.find(
      (target) =>
        target.executionerPlayerId === record.playerId &&
        target.executionerRoleInstanceId === record.roleInstanceId &&
        target.targetPlayerId === record.targetPlayerId,
    )
    if (relationship === undefined) {
      return invalidConversions('missing-target-relationship', index, record.roleInstanceId)
    }
    const targetDeath = deaths.find((death) => death.playerId === record.targetPlayerId)
    if (targetDeath === undefined) {
      return invalidConversions('target-not-dead', index, record.roleInstanceId)
    }
    if (targetDeath.cause.kind === 'day-execution') {
      return invalidConversions('target-executed', index, record.roleInstanceId)
    }
    if (seen.has(record.roleInstanceId)) {
      return invalidConversions('duplicate-role-instance', index, record.roleInstanceId)
    }
    seen.add(record.roleInstanceId)
    records.push(record)
  }

  for (const relationship of context.executionerTargets) {
    const death = deaths.find((entry) => entry.playerId === relationship.targetPlayerId)
    if (
      death !== undefined &&
      death.cause.kind !== 'day-execution' &&
      !seen.has(relationship.executionerRoleInstanceId)
    ) {
      return invalidConversions(
        'missing-required-conversion',
        undefined,
        relationship.executionerRoleInstanceId,
      )
    }
  }

  const ordered = orderExecutionerConversions(records, context.players, deaths)
  if (!sameSequence(ordered, records, conversionKey)) {
    return invalidConversions('order-mismatch')
  }
  return succeed(Object.freeze(records))
}

function copyDayOutcomes(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
): DomainResult<readonly DayOutcome[], OutcomeStateInvariantError> {
  if (!Array.isArray(candidate)) {
    return invalidDayOutcomes('not-an-array')
  }

  const outcomes: DayOutcome[] = []
  const seenDays = new Set<number>()
  for (const value of candidate) {
    if (!isUnknownRecord(value) || !isNonblankString(value.gameId)) {
      return invalidDayOutcomes('invalid-record')
    }
    let outcome: DayOutcome
    if (
      value.kind === 'player-executed' &&
      hasExactKeys(value, ['kind', 'gameId', 'dayNumber', 'playerId']) &&
      isPositiveInteger(value.dayNumber) &&
      isNonblankString(value.playerId)
    ) {
      outcome = Object.freeze({
        kind: 'player-executed',
        gameId: gameId(value.gameId),
        dayNumber: value.dayNumber,
        playerId: playerId(value.playerId),
      })
    } else if (
      value.kind === 'no-execution' &&
      hasExactKeys(value, ['kind', 'gameId', 'dayNumber']) &&
      isPositiveInteger(value.dayNumber)
    ) {
      outcome = Object.freeze({
        kind: 'no-execution',
        gameId: gameId(value.gameId),
        dayNumber: value.dayNumber,
      })
    } else {
      return invalidDayOutcomes('invalid-record')
    }
    if (outcome.gameId !== context.gameId) {
      return invalidDayOutcomes('game-mismatch')
    }
    if (outcome.dayNumber > context.dayNumber) {
      return invalidDayOutcomes('invalid-day')
    }
    if (seenDays.has(outcome.dayNumber)) {
      return invalidDayOutcomes('duplicate-day')
    }
    seenDays.add(outcome.dayNumber)
    outcomes.push(outcome)
  }

  const ordered = orderDayOutcomes(outcomes)
  if (!sameSequence(ordered, outcomes, dayOutcomeKey)) {
    return invalidDayOutcomes('order-mismatch')
  }
  const expectedCompletedDays = completedDayOutcomeCount(context.phase, context.dayNumber)
  if (outcomes.length !== expectedCompletedDays) {
    return invalidDayOutcomes('phase-mismatch')
  }
  for (let dayNumber = 1; dayNumber <= expectedCompletedDays; dayNumber += 1) {
    if (!seenDays.has(dayNumber)) {
      return invalidDayOutcomes('missing-day')
    }
  }
  return succeed(Object.freeze(outcomes))
}

function validateDayOutcomeEvidence(
  outcomes: readonly DayOutcome[],
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
  deaths: readonly DeathRecord[],
): DomainResult<readonly DayOutcome[], OutcomeStateInvariantError> {
  for (const outcome of outcomes) {
    const executionDeaths = deaths.filter(
      (death) =>
        death.cause.kind === 'day-execution' && death.cause.dayNumber === outcome.dayNumber,
    )
    if (outcome.kind === 'no-execution') {
      if (executionDeaths.length > 0) {
        return invalidDayOutcomes('no-execution-with-execution-death')
      }
      continue
    }
    if (!context.players.some((player) => player.playerId === outcome.playerId)) {
      return invalidDayOutcomes('unknown-player')
    }
    if (executionDeaths.length === 0) {
      return invalidDayOutcomes('missing-execution-death')
    }
    if (executionDeaths.length !== 1 || executionDeaths[0]?.playerId !== outcome.playerId) {
      return invalidDayOutcomes('execution-player-mismatch')
    }
  }
  const unexplainedExecution = deaths.find((death) => {
    const cause = death.cause
    return (
      cause.kind === 'day-execution' &&
      !outcomes.some(
        (outcome) =>
          outcome.kind === 'player-executed' &&
          outcome.dayNumber === cause.dayNumber &&
          outcome.playerId === death.playerId,
      )
    )
  })
  return unexplainedExecution === undefined
    ? succeed(outcomes)
    : invalidDayOutcomes('execution-player-mismatch')
}

function copyPersonalWins(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
  deaths: readonly DeathRecord[],
  conversions: readonly ExecutionerToJesterConversion[],
): DomainResult<readonly PersonalWinRecord[], OutcomeStateInvariantError> {
  if (!Array.isArray(candidate)) {
    return invalidPersonalWins('not-an-array')
  }
  const records: PersonalWinRecord[] = []
  const seen = new Set<string>()
  for (const [index, value] of candidate.entries()) {
    if (
      !isUnknownRecord(value) ||
      !isNonblankString(value.gameId) ||
      !isNonblankString(value.playerId) ||
      !isNonblankString(value.roleInstanceId) ||
      !isPositiveInteger(value.dayNumber)
    ) {
      return invalidPersonalWins('invalid-record', index)
    }
    let record: PersonalWinRecord
    if (
      value.kind === 'jester-executed' &&
      hasExactKeys(value, ['kind', 'gameId', 'playerId', 'roleInstanceId', 'dayNumber'])
    ) {
      record = Object.freeze({
        kind: 'jester-executed',
        gameId: gameId(value.gameId),
        playerId: playerId(value.playerId),
        roleInstanceId: roleInstanceId(value.roleInstanceId),
        dayNumber: value.dayNumber,
      })
    } else if (
      value.kind === 'executioner-target-executed' &&
      hasExactKeys(value, [
        'kind',
        'gameId',
        'playerId',
        'roleInstanceId',
        'targetPlayerId',
        'dayNumber',
      ]) &&
      isNonblankString(value.targetPlayerId)
    ) {
      record = Object.freeze({
        kind: 'executioner-target-executed',
        gameId: gameId(value.gameId),
        playerId: playerId(value.playerId),
        roleInstanceId: roleInstanceId(value.roleInstanceId),
        targetPlayerId: playerId(value.targetPlayerId),
        dayNumber: value.dayNumber,
      })
    } else {
      return invalidPersonalWins('invalid-record', index)
    }
    if (record.gameId !== context.gameId) {
      return invalidPersonalWins('game-mismatch', index, record.roleInstanceId)
    }
    if (record.dayNumber > context.dayNumber) {
      return invalidPersonalWins('invalid-day', index, record.roleInstanceId)
    }
    const owner = context.players.find((player) => player.playerId === record.playerId)
    if (owner === undefined) {
      return invalidPersonalWins('unknown-player', index, record.roleInstanceId)
    }
    if (owner.role.instanceId !== record.roleInstanceId) {
      return invalidPersonalWins('role-instance-mismatch', index, record.roleInstanceId)
    }
    const execution = deaths.find(
      (death) =>
        death.playerId ===
          (record.kind === 'jester-executed' ? record.playerId : record.targetPlayerId) &&
        death.cause.kind === 'day-execution' &&
        death.cause.dayNumber === record.dayNumber,
    )
    if (execution === undefined) {
      return invalidPersonalWins('missing-execution', index, record.roleInstanceId)
    }
    if (record.kind === 'jester-executed') {
      if (
        owner.role.roleId !== ROLE_IDS.jester &&
        !conversions.some((conversion) => conversion.roleInstanceId === record.roleInstanceId)
      ) {
        return invalidPersonalWins('invalid-role', index, record.roleInstanceId)
      }
    } else {
      if (owner.role.roleId !== ROLE_IDS.executioner) {
        return invalidPersonalWins('invalid-role', index, record.roleInstanceId)
      }
      if (conversions.some((conversion) => conversion.roleInstanceId === record.roleInstanceId)) {
        return invalidPersonalWins('converted-executioner', index, record.roleInstanceId)
      }
      if (
        !context.executionerTargets.some(
          (target) =>
            target.executionerPlayerId === record.playerId &&
            target.executionerRoleInstanceId === record.roleInstanceId &&
            target.targetPlayerId === record.targetPlayerId,
        )
      ) {
        return invalidPersonalWins('invalid-target-relationship', index, record.roleInstanceId)
      }
    }
    const key = `${record.kind}:${record.roleInstanceId}`
    if (seen.has(key)) {
      return invalidPersonalWins('duplicate-record', index, record.roleInstanceId)
    }
    seen.add(key)
    records.push(record)
  }

  for (const death of deaths) {
    if (death.cause.kind !== 'day-execution') {
      continue
    }
    const executionDayNumber = death.cause.dayNumber
    const executed = context.players.find((player) => player.playerId === death.playerId)
    if (executed === undefined) {
      continue
    }
    const convertedJester = conversions.some(
      (conversion) => conversion.roleInstanceId === executed.role.instanceId,
    )
    if (
      (executed.role.roleId === ROLE_IDS.jester || convertedJester) &&
      !records.some(
        (record) =>
          record.kind === 'jester-executed' &&
          record.roleInstanceId === executed.role.instanceId &&
          record.dayNumber === executionDayNumber,
      )
    ) {
      return invalidPersonalWins('missing-required-win', undefined, executed.role.instanceId)
    }
    for (const target of context.executionerTargets.filter(
      (relationship) => relationship.targetPlayerId === executed.playerId,
    )) {
      if (
        !conversions.some(
          (conversion) => conversion.roleInstanceId === target.executionerRoleInstanceId,
        ) &&
        !records.some(
          (record) =>
            record.kind === 'executioner-target-executed' &&
            record.roleInstanceId === target.executionerRoleInstanceId &&
            record.dayNumber === executionDayNumber,
        )
      ) {
        return invalidPersonalWins(
          'missing-required-win',
          undefined,
          target.executionerRoleInstanceId,
        )
      }
    }
  }

  const ordered = orderPersonalWins(records, context.players)
  if (!sameSequence(ordered, records, personalWinKey)) {
    return invalidPersonalWins('order-mismatch')
  }
  return succeed(Object.freeze(records))
}

function copyPendingRevenges(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
  deaths: readonly DeathRecord[],
  conversions: readonly ExecutionerToJesterConversion[],
  personalWins: readonly PersonalWinRecord[],
  resolutions: readonly JesterRevengeResolution[],
): DomainResult<readonly PendingJesterRevenge[], OutcomeStateInvariantError> {
  if (!Array.isArray(candidate)) {
    return invalidRevenges('not-an-array')
  }
  const records: PendingJesterRevenge[] = []
  const seen = new Set<RoleInstanceId>()
  for (const [index, value] of candidate.entries()) {
    if (
      !isUnknownRecord(value) ||
      !hasExactKeys(value, [
        'id',
        'gameId',
        'jesterPlayerId',
        'jesterRoleInstanceId',
        'triggeredOnDay',
        'status',
      ]) ||
      !isNonblankString(value.id) ||
      !isNonblankString(value.gameId) ||
      !isNonblankString(value.jesterPlayerId) ||
      !isNonblankString(value.jesterRoleInstanceId) ||
      !isPositiveInteger(value.triggeredOnDay) ||
      value.status !== 'pending'
    ) {
      return invalidRevenges('invalid-record', index)
    }
    const record: PendingJesterRevenge = Object.freeze({
      id: value.id,
      gameId: gameId(value.gameId),
      jesterPlayerId: playerId(value.jesterPlayerId),
      jesterRoleInstanceId: roleInstanceId(value.jesterRoleInstanceId),
      triggeredOnDay: value.triggeredOnDay,
      status: 'pending',
    })
    if (record.gameId !== context.gameId) {
      return invalidRevenges('game-mismatch', index, record.jesterRoleInstanceId)
    }
    if (record.triggeredOnDay > context.dayNumber) {
      return invalidRevenges('invalid-day', index, record.jesterRoleInstanceId)
    }
    if (
      record.id !== createPendingJesterRevengeId(record.jesterRoleInstanceId, record.triggeredOnDay)
    ) {
      return invalidRevenges('invalid-record', index, record.jesterRoleInstanceId)
    }
    if (context.nightNumber === context.dayNumber && record.triggeredOnDay !== context.dayNumber) {
      return invalidRevenges('overdue', index, record.jesterRoleInstanceId)
    }
    if (
      context.nightNumber === context.dayNumber + 1 &&
      record.triggeredOnDay + 1 !== context.nightNumber
    ) {
      return invalidRevenges(
        record.triggeredOnDay + 1 < context.nightNumber ? 'overdue' : 'not-due',
        index,
        record.jesterRoleInstanceId,
      )
    }
    const owner = context.players.find((player) => player.playerId === record.jesterPlayerId)
    if (owner === undefined) {
      return invalidRevenges('unknown-player', index, record.jesterRoleInstanceId)
    }
    if (owner.role.instanceId !== record.jesterRoleInstanceId) {
      return invalidRevenges('role-instance-mismatch', index, record.jesterRoleInstanceId)
    }
    const matchingWin = personalWins.some(
      (win) =>
        win.kind === 'jester-executed' &&
        win.playerId === record.jesterPlayerId &&
        win.roleInstanceId === record.jesterRoleInstanceId &&
        win.dayNumber === record.triggeredOnDay,
    )
    const matchingDeath = deaths.some(
      (death) =>
        death.playerId === record.jesterPlayerId &&
        death.cause.kind === 'day-execution' &&
        death.cause.dayNumber === record.triggeredOnDay,
    )
    const validRole =
      owner.role.roleId === ROLE_IDS.jester ||
      conversions.some((conversion) => conversion.roleInstanceId === record.jesterRoleInstanceId)
    if (!matchingWin || !matchingDeath || !validRole) {
      return invalidRevenges('missing-jester-win', index, record.jesterRoleInstanceId)
    }
    if (seen.has(record.jesterRoleInstanceId)) {
      return invalidRevenges('duplicate-record', index, record.jesterRoleInstanceId)
    }
    seen.add(record.jesterRoleInstanceId)
    records.push(record)
  }
  for (const win of personalWins) {
    if (
      win.kind === 'jester-executed' &&
      !records.some(
        (record) =>
          record.jesterRoleInstanceId === win.roleInstanceId &&
          record.triggeredOnDay === win.dayNumber,
      ) &&
      !resolutions.some(
        (resolution) =>
          resolution.jesterRoleInstanceId === win.roleInstanceId &&
          resolution.obligationId ===
            createPendingJesterRevengeId(win.roleInstanceId, win.dayNumber),
      )
    ) {
      return invalidRevenges('missing-required-revenge', undefined, win.roleInstanceId)
    }
  }
  if (
    records.length > 0 &&
    (context.phase === 'dawn-announcement' || context.phase === 'game-over')
  ) {
    return invalidRevenges('overdue')
  }
  const ordered = orderPendingJesterRevenges(records, context.players)
  if (!sameSequence(ordered, records, revengeKey)) {
    return invalidRevenges('order-mismatch')
  }
  return succeed(Object.freeze(records))
}

function validateRevengeResolutionEvidence(
  resolutions: readonly JesterRevengeResolution[],
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
  deaths: readonly DeathRecord[],
  personalWins: readonly PersonalWinRecord[],
  pending: readonly PendingJesterRevenge[],
): DomainResult<readonly JesterRevengeResolution[], OutcomeStateInvariantError> {
  for (const [index, resolution] of resolutions.entries()) {
    const win = personalWins.find(
      (record) =>
        record.kind === 'jester-executed' &&
        record.playerId === resolution.jesterPlayerId &&
        record.roleInstanceId === resolution.jesterRoleInstanceId &&
        record.dayNumber + 1 === resolution.resolvedAtNightNumber,
    )
    if (win === undefined) {
      return invalidRevengeResolutions('unknown-obligation', index, resolution.obligationId)
    }
    const expectedObligationId = createPendingJesterRevengeId(
      resolution.jesterRoleInstanceId,
      win.dayNumber,
    )
    if (
      resolution.obligationId !== expectedObligationId ||
      resolution.id !== createJesterRevengeResolutionId(expectedObligationId)
    ) {
      return invalidRevengeResolutions('unknown-obligation', index, resolution.obligationId)
    }
    if (pending.some((obligation) => obligation.id === resolution.obligationId)) {
      return invalidRevengeResolutions('duplicate-obligation', index, resolution.obligationId)
    }
    if (resolution.kind === 'victim-killed') {
      const death = deaths.find(
        (record) =>
          record.playerId === resolution.victimPlayerId &&
          record.cause.kind === 'jester-revenge' &&
          record.cause.resolutionId === resolution.id &&
          record.cause.obligationId === resolution.obligationId &&
          record.cause.nightNumber === resolution.resolvedAtNightNumber,
      )
      if (death === undefined) {
        return invalidRevengeResolutions('victim-death-mismatch', index, resolution.obligationId)
      }
    } else {
      const earlierOrSameDeathCount = deaths.filter((death) =>
        deathOccursNoLaterThanNight(death.cause, resolution.resolvedAtNightNumber),
      ).length
      if (earlierOrSameDeathCount !== context.players.length) {
        return invalidRevengeResolutions('victim-death-mismatch', index, resolution.obligationId)
      }
    }
  }
  return succeed(resolutions)
}

function requiresCompleteDeathAuthority(phase: GamePhase): boolean {
  return (
    phase === 'dawn-resolution' ||
    phase === 'dawn-announcement' ||
    phase === 'day-discussion' ||
    phase === 'trial' ||
    phase === 'trial-voting' ||
    phase === 'execution-resolution' ||
    phase === 'game-over'
  )
}

function latestAppliedNightNumber(phase: GamePhase, currentNightNumber: number): number {
  switch (phase) {
    case 'executioner-briefing':
    case 'night-action-collection':
    case 'night-resolution':
      return Math.max(0, currentNightNumber - 1)
    case 'roster':
    case 'setup':
    case 'role-distribution':
    case 'dawn-resolution':
    case 'dawn-announcement':
    case 'day-discussion':
    case 'trial':
    case 'trial-voting':
    case 'execution-resolution':
    case 'game-over':
      return currentNightNumber
  }
}

function completedDayOutcomeCount(phase: GamePhase, dayNumber: number): number {
  switch (phase) {
    case 'roster':
    case 'setup':
    case 'role-distribution':
    case 'executioner-briefing':
      return 0
    case 'day-discussion':
    case 'trial':
    case 'trial-voting':
      return Math.max(0, dayNumber - 1)
    case 'night-action-collection':
    case 'night-resolution':
    case 'dawn-resolution':
    case 'dawn-announcement':
    case 'execution-resolution':
    case 'game-over':
      return dayNumber
  }
}

function deathTiming(cause: DeathCause): number {
  switch (cause.kind) {
    case 'night-death':
      return cause.nightNumber * 3
    case 'jester-revenge':
      return cause.nightNumber * 3 + 1
    case 'day-execution':
      return cause.dayNumber * 3 + 2
    case 'final-killing-role-showdown':
      return cause.boundary.kind === 'post-day'
        ? cause.boundary.dayNumber * 3 + 3
        : cause.boundary.nightNumber * 3 + 2
  }
}

function deathRecordKey(record: DeathRecord): string {
  const cause = deathCauseKey(record.cause)
  return `${record.gameId}:${record.playerId}:${record.roleInstanceId}:${cause}`
}

function deathCauseKey(cause: DeathCause): string {
  switch (cause.kind) {
    case 'night-death':
    case 'jester-revenge':
      return `${cause.kind}:${String(cause.nightNumber)}`
    case 'day-execution':
      return `${cause.kind}:${String(cause.dayNumber)}`
    case 'final-killing-role-showdown':
      return cause.boundary.kind === 'post-day'
        ? `${cause.kind}:post-day:${String(cause.boundary.dayNumber)}:${cause.opponentPlayerId}`
        : `${cause.kind}:post-dawn:${String(cause.boundary.nightNumber)}:${cause.opponentPlayerId}`
  }
}

function deathOccursNoLaterThanNight(cause: DeathCause, nightNumber: number): boolean {
  switch (cause.kind) {
    case 'night-death':
    case 'jester-revenge':
      return cause.nightNumber <= nightNumber
    case 'day-execution':
      return cause.dayNumber < nightNumber
    case 'final-killing-role-showdown':
      return cause.boundary.kind === 'post-day'
        ? cause.boundary.dayNumber < nightNumber
        : cause.boundary.nightNumber <= nightNumber
  }
}

function conversionKey(record: ExecutionerToJesterConversion): string {
  return `${record.gameId}:${record.playerId}:${record.roleInstanceId}:${record.targetPlayerId}`
}

function personalWinKey(record: PersonalWinRecord): string {
  return record.kind === 'jester-executed'
    ? `${record.kind}:${record.roleInstanceId}:${String(record.dayNumber)}`
    : `${record.kind}:${record.roleInstanceId}:${record.targetPlayerId}:${String(record.dayNumber)}`
}

function revengeKey(record: PendingJesterRevenge): string {
  return record.id
}

function revengeResolutionKey(record: JesterRevengeResolution): string {
  return record.id
}

function dayOutcomeKey(record: DayOutcome): string {
  return record.kind === 'player-executed'
    ? `${String(record.dayNumber)}:${record.playerId}`
    : `${String(record.dayNumber)}:none`
}

function playerOrder(players: readonly GamePlayer[]): ReadonlyMap<PlayerId, number> {
  return new Map(players.map((player, index) => [player.playerId, index]))
}

function playerOrdinal(players: readonly GamePlayer[], selectedPlayerId: PlayerId): number {
  return (
    players.find((player) => player.playerId === selectedPlayerId)?.role.ordinal ??
    Number.MAX_SAFE_INTEGER
  )
}

function orderOf(order: ReadonlyMap<PlayerId, number>, selectedPlayerId: PlayerId): number {
  return order.get(selectedPlayerId) ?? Number.MAX_SAFE_INTEGER
}

function sameSequence<Value>(
  left: readonly Value[],
  right: readonly Value[],
  key: (value: Value) => string,
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => {
      const rightValue = right[index]
      return rightValue !== undefined && key(value) === key(rightValue)
    })
  )
}

function invalidDeaths(
  reason: Extract<OutcomeStateInvariantError, { type: 'INVALID_DEATH_RECORDS' }>['reason'],
  index?: number,
  selectedPlayerId?: PlayerId,
): DomainResult<never, OutcomeStateInvariantError> {
  return fail({
    type: 'INVALID_DEATH_RECORDS',
    reason,
    ...(index === undefined ? {} : { index }),
    ...(selectedPlayerId === undefined ? {} : { playerId: selectedPlayerId }),
  })
}

function invalidConversions(
  reason: Extract<
    OutcomeStateInvariantError,
    { type: 'INVALID_EXECUTIONER_CONVERSIONS' }
  >['reason'],
  index?: number,
  selectedRoleInstanceId?: RoleInstanceId,
): DomainResult<never, OutcomeStateInvariantError> {
  return fail({
    type: 'INVALID_EXECUTIONER_CONVERSIONS',
    reason,
    ...(index === undefined ? {} : { index }),
    ...(selectedRoleInstanceId === undefined ? {} : { roleInstanceId: selectedRoleInstanceId }),
  })
}

function invalidPersonalWins(
  reason: Extract<OutcomeStateInvariantError, { type: 'INVALID_PERSONAL_WINS' }>['reason'],
  index?: number,
  selectedRoleInstanceId?: RoleInstanceId,
): DomainResult<never, OutcomeStateInvariantError> {
  return fail({
    type: 'INVALID_PERSONAL_WINS',
    reason,
    ...(index === undefined ? {} : { index }),
    ...(selectedRoleInstanceId === undefined ? {} : { roleInstanceId: selectedRoleInstanceId }),
  })
}

function invalidRevenges(
  reason: Extract<
    OutcomeStateInvariantError,
    { type: 'INVALID_PENDING_JESTER_REVENGES' }
  >['reason'],
  index?: number,
  selectedRoleInstanceId?: RoleInstanceId,
): DomainResult<never, OutcomeStateInvariantError> {
  return fail({
    type: 'INVALID_PENDING_JESTER_REVENGES',
    reason,
    ...(index === undefined ? {} : { index }),
    ...(selectedRoleInstanceId === undefined ? {} : { roleInstanceId: selectedRoleInstanceId }),
  })
}

function invalidRevengeResolutions(
  reason: Extract<
    OutcomeStateInvariantError,
    { type: 'INVALID_JESTER_REVENGE_RESOLUTIONS' }
  >['reason'],
  index?: number,
  obligationId?: PendingJesterRevengeId,
): DomainResult<never, OutcomeStateInvariantError> {
  return fail({
    type: 'INVALID_JESTER_REVENGE_RESOLUTIONS',
    reason,
    ...(index === undefined ? {} : { index }),
    ...(obligationId === undefined ? {} : { obligationId }),
  })
}

function invalidDayOutcomes(
  reason: Extract<OutcomeStateInvariantError, { type: 'INVALID_DAY_OUTCOMES' }>['reason'],
): DomainResult<never, OutcomeStateInvariantError> {
  return fail({ type: 'INVALID_DAY_OUTCOMES', reason })
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(
  candidate: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(candidate)
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(candidate, key))
  )
}

function isNonblankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}
