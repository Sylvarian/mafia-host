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
  PendingJesterRevenge,
  PersonalWinRecord,
} from '../neutral/neutral-outcome-model.ts'
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
        | 'unsupported-revenge-death'
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
      index?: number
      roleInstanceId?: RoleInstanceId
    }>
  | Readonly<{
      type: 'INVALID_DAY_OUTCOME'
      reason:
        | 'invalid-record'
        | 'game-mismatch'
        | 'invalid-day'
        | 'unknown-player'
        | 'missing-execution-death'
        | 'execution-player-mismatch'
        | 'no-execution-with-execution-death'
        | 'phase-mismatch'
    }>

export type ValidatedOutcomeState = Readonly<{
  deathRecords: readonly DeathRecord[]
  personalWins: readonly PersonalWinRecord[]
  executionerConversions: readonly ExecutionerToJesterConversion[]
  pendingJesterRevenges: readonly PendingJesterRevenge[]
  dayOutcome: DayOutcome | null
}>

export function copyAndValidateOutcomeState(
  candidate: Readonly<{
    deathRecords: unknown
    personalWins: unknown
    executionerConversions: unknown
    pendingJesterRevenges: unknown
    dayOutcome: unknown
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
  const deathResult = copyDeathRecords(candidate.deathRecords, context)
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

  const dayOutcomeResult = copyDayOutcome(candidate.dayOutcome, context, deathResult.value)
  if (!dayOutcomeResult.ok) {
    return dayOutcomeResult
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
  )
  if (!revengeResult.ok) {
    return revengeResult
  }

  return succeed(
    Object.freeze({
      deathRecords: deathResult.value,
      personalWins: personalWinResult.value,
      executionerConversions: conversionResult.value,
      pendingJesterRevenges: revengeResult.value,
      dayOutcome: dayOutcomeResult.value,
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

function copyDeathRecords(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
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
    seenPlayers.add(record.playerId)
    records.push(record)
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
    candidate.nightNumber <= context.nightNumber
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
  if (candidate.kind === 'jester-revenge') {
    return fail('unsupported-revenge-death')
  }
  return fail('invalid-cause')
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

function copyDayOutcome(
  candidate: unknown,
  context: Parameters<typeof copyAndValidateOutcomeState>[1],
  deaths: readonly DeathRecord[],
): DomainResult<DayOutcome | null, OutcomeStateInvariantError> {
  if (candidate === null) {
    if (context.phase === 'execution-resolution') {
      return invalidDayOutcome('phase-mismatch')
    }
    return succeed(null)
  }
  if (!isUnknownRecord(candidate) || !isNonblankString(candidate.gameId)) {
    return invalidDayOutcome('invalid-record')
  }
  let outcome: DayOutcome
  if (
    candidate.kind === 'player-executed' &&
    hasExactKeys(candidate, ['kind', 'gameId', 'dayNumber', 'playerId']) &&
    isPositiveInteger(candidate.dayNumber) &&
    isNonblankString(candidate.playerId)
  ) {
    outcome = Object.freeze({
      kind: 'player-executed',
      gameId: gameId(candidate.gameId),
      dayNumber: candidate.dayNumber,
      playerId: playerId(candidate.playerId),
    })
  } else if (
    candidate.kind === 'no-execution' &&
    hasExactKeys(candidate, ['kind', 'gameId', 'dayNumber']) &&
    isPositiveInteger(candidate.dayNumber)
  ) {
    outcome = Object.freeze({
      kind: 'no-execution',
      gameId: gameId(candidate.gameId),
      dayNumber: candidate.dayNumber,
    })
  } else {
    return invalidDayOutcome('invalid-record')
  }
  if (outcome.gameId !== context.gameId) {
    return invalidDayOutcome('game-mismatch')
  }
  if (outcome.dayNumber !== context.dayNumber) {
    return invalidDayOutcome('invalid-day')
  }
  if (context.phase !== 'execution-resolution' && context.phase !== 'game-over') {
    return invalidDayOutcome('phase-mismatch')
  }
  const executionDeaths = deaths.filter(
    (death) => death.cause.kind === 'day-execution' && death.cause.dayNumber === outcome.dayNumber,
  )
  if (outcome.kind === 'no-execution') {
    return executionDeaths.length === 0
      ? succeed(outcome)
      : invalidDayOutcome('no-execution-with-execution-death')
  }
  if (!context.players.some((player) => player.playerId === outcome.playerId)) {
    return invalidDayOutcome('unknown-player')
  }
  if (executionDeaths.length === 0) {
    return invalidDayOutcome('missing-execution-death')
  }
  return executionDeaths.length === 1 && executionDeaths[0]?.playerId === outcome.playerId
    ? succeed(outcome)
    : invalidDayOutcome('execution-player-mismatch')
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
        'gameId',
        'jesterPlayerId',
        'jesterRoleInstanceId',
        'triggeredOnDay',
        'status',
      ]) ||
      !isNonblankString(value.gameId) ||
      !isNonblankString(value.jesterPlayerId) ||
      !isNonblankString(value.jesterRoleInstanceId) ||
      !isPositiveInteger(value.triggeredOnDay) ||
      value.status !== 'pending'
    ) {
      return invalidRevenges('invalid-record', index)
    }
    const record: PendingJesterRevenge = Object.freeze({
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
      )
    ) {
      return invalidRevenges('missing-required-revenge', undefined, win.roleInstanceId)
    }
  }
  const ordered = orderPendingJesterRevenges(records, context.players)
  if (!sameSequence(ordered, records, revengeKey)) {
    return invalidRevenges('order-mismatch')
  }
  return succeed(Object.freeze(records))
}

function requiresCompleteDeathAuthority(phase: GamePhase): boolean {
  return (
    phase === 'dawn-announcement' ||
    phase === 'day-discussion' ||
    phase === 'trial' ||
    phase === 'trial-voting' ||
    phase === 'execution-resolution' ||
    phase === 'game-over'
  )
}

function deathTiming(cause: DeathCause): number {
  switch (cause.kind) {
    case 'night-death':
      return cause.nightNumber * 3
    case 'jester-revenge':
      return cause.nightNumber * 3 + 1
    case 'day-execution':
      return cause.dayNumber * 3 + 2
  }
}

function deathRecordKey(record: DeathRecord): string {
  const cause =
    record.cause.kind === 'day-execution'
      ? `${record.cause.kind}:${String(record.cause.dayNumber)}`
      : `${record.cause.kind}:${String(record.cause.nightNumber)}`
  return `${record.gameId}:${record.playerId}:${record.roleInstanceId}:${cause}`
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
  return `${record.jesterRoleInstanceId}:${String(record.triggeredOnDay)}`
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

function invalidDayOutcome(
  reason: Extract<OutcomeStateInvariantError, { type: 'INVALID_DAY_OUTCOME' }>['reason'],
): DomainResult<never, OutcomeStateInvariantError> {
  return fail({ type: 'INVALID_DAY_OUTCOME', reason })
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
