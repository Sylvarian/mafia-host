import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { DeathRecord } from '../game/death-record.ts'
import { validateGameState } from '../game/game-invariants.ts'
import {
  orderDeathRecords,
  orderJesterRevengeResolutions,
} from '../game/outcome-state-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId } from '../identifiers.ts'
import type { RandomSource } from '../randomness/random-source.ts'
import type {
  JesterRevengeResolution,
  PendingJesterRevenge,
  SelectedJesterRevenge,
} from './neutral-outcome-model.ts'
import { addConversionsForProvenNonExecutionDeaths } from './executioner-conversion.ts'
import { createJesterRevengeResolutionId } from './jester-revenge-identity.ts'

export type SelectJesterRevengeError =
  | Readonly<{ type: 'INVALID_JESTER_REVENGE_PHASE'; currentPhase: GameState['phase'] }>
  | Readonly<{ type: 'JESTER_REVENGE_GAME_REJECTED' }>
  | Readonly<{ type: 'NO_PENDING_JESTER_REVENGE' }>
  | Readonly<{ type: 'MULTIPLE_PENDING_JESTER_REVENGES_UNRESOLVED_RULE' }>
  | Readonly<{
      type: 'PENDING_JESTER_REVENGE_NOT_DUE'
      triggeredOnDay: number
      nightNumber: number
    }>
  | Readonly<{ type: 'INVALID_JESTER_REVENGE_RANDOM_OUTPUT'; value: number }>

export type ApplyJesterRevengeError =
  | Readonly<{ type: 'INVALID_JESTER_REVENGE_PHASE'; currentPhase: GameState['phase'] }>
  | Readonly<{ type: 'JESTER_REVENGE_GAME_REJECTED' }>
  | Readonly<{ type: 'NO_PENDING_JESTER_REVENGE' }>
  | Readonly<{ type: 'MULTIPLE_PENDING_JESTER_REVENGES_UNRESOLVED_RULE' }>
  | Readonly<{ type: 'INVALID_JESTER_REVENGE_SELECTION' }>
  | Readonly<{ type: 'INVALID_JESTER_REVENGE_VICTIM'; victimPlayerId: PlayerId }>
  | Readonly<{ type: 'JESTER_REVENGE_SURVIVOR_STILL_EXISTS' }>
  | Readonly<{ type: 'JESTER_REVENGE_APPLICATION_REJECTED' }>

export {
  createJesterRevengeResolutionId,
  createPendingJesterRevengeId,
} from './jester-revenge-identity.ts'

export function selectJesterRevengeVictim(
  game: GameState,
  randomSource: RandomSource,
): DomainResult<SelectedJesterRevenge | null, SelectJesterRevengeError> {
  if (game.phase !== 'dawn-resolution') {
    return fail({ type: 'INVALID_JESTER_REVENGE_PHASE', currentPhase: game.phase })
  }
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'JESTER_REVENGE_GAME_REJECTED' })
  }
  const validatedGame = gameResult.value
  const obligation = validatedGame.pendingJesterRevenges[0]
  if (obligation === undefined) {
    return fail({ type: 'NO_PENDING_JESTER_REVENGE' })
  }
  if (validatedGame.pendingJesterRevenges.length > 1) {
    return fail({ type: 'MULTIPLE_PENDING_JESTER_REVENGES_UNRESOLVED_RULE' })
  }
  if (obligation.triggeredOnDay + 1 !== validatedGame.nightNumber) {
    return fail({
      type: 'PENDING_JESTER_REVENGE_NOT_DUE',
      triggeredOnDay: obligation.triggeredOnDay,
      nightNumber: validatedGame.nightNumber,
    })
  }

  const survivors = selectEligibleJesterRevengeVictims(validatedGame, obligation)
  if (survivors.length === 0) {
    return succeed(null)
  }
  const randomValue = randomSource.next()
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    return fail({ type: 'INVALID_JESTER_REVENGE_RANDOM_OUTPUT', value: randomValue })
  }
  const victimPlayerId = survivors[Math.floor(randomValue * survivors.length)]
  if (victimPlayerId === undefined) {
    return fail({ type: 'INVALID_JESTER_REVENGE_RANDOM_OUTPUT', value: randomValue })
  }
  return succeed(
    Object.freeze({
      id: createJesterRevengeResolutionId(obligation.id),
      kind: 'victim-selected',
      gameId: validatedGame.id,
      obligationId: obligation.id,
      jesterPlayerId: obligation.jesterPlayerId,
      jesterRoleInstanceId: obligation.jesterRoleInstanceId,
      victimPlayerId,
      resolvedAtNightNumber: validatedGame.nightNumber,
    }),
  )
}

export function applySelectedJesterRevenge(
  game: GameState,
  selection: SelectedJesterRevenge,
): DomainResult<GameState, ApplyJesterRevengeError> {
  const baseResult = validateRevengeApplicationBase(game)
  if (!baseResult.ok) {
    return baseResult
  }
  const obligation = baseResult.value.pendingJesterRevenges[0]
  if (
    obligation === undefined ||
    selection.id !== createJesterRevengeResolutionId(obligation.id) ||
    selection.gameId !== baseResult.value.id ||
    selection.obligationId !== obligation.id ||
    selection.jesterPlayerId !== obligation.jesterPlayerId ||
    selection.jesterRoleInstanceId !== obligation.jesterRoleInstanceId ||
    selection.resolvedAtNightNumber !== baseResult.value.nightNumber
  ) {
    return fail({ type: 'INVALID_JESTER_REVENGE_SELECTION' })
  }
  const victim = baseResult.value.players.find(
    (player) => player.playerId === selection.victimPlayerId,
  )
  if (victim === undefined || !victim.alive) {
    return fail({
      type: 'INVALID_JESTER_REVENGE_VICTIM',
      victimPlayerId: selection.victimPlayerId,
    })
  }

  const resolution: JesterRevengeResolution = Object.freeze({
    ...selection,
    kind: 'victim-killed',
  })
  const deathRecord: DeathRecord = Object.freeze({
    gameId: baseResult.value.id,
    playerId: victim.playerId,
    roleInstanceId: victim.role.instanceId,
    cause: Object.freeze({
      kind: 'jester-revenge',
      nightNumber: baseResult.value.nightNumber,
      jesterPlayerId: obligation.jesterPlayerId,
      jesterRoleInstanceId: obligation.jesterRoleInstanceId,
      obligationId: obligation.id,
      resolutionId: resolution.id,
    }),
  })
  const executionerConversions = addConversionsForProvenNonExecutionDeaths(baseResult.value, [
    deathRecord,
  ])
  const result = validateGameState({
    ...baseResult.value,
    players: baseResult.value.players.map((player) =>
      player.playerId === victim.playerId
        ? {
            ...player,
            alive: false,
            publiclyRevealedRoleId: baseResult.value.settings.revealRoleOnDeath
              ? player.role.roleId
              : player.publiclyRevealedRoleId,
          }
        : player,
    ),
    deathRecords: orderDeathRecords(
      [...baseResult.value.deathRecords, deathRecord],
      baseResult.value.players,
    ),
    executionerConversions,
    pendingJesterRevenges: [],
    jesterRevengeResolutions: orderJesterRevengeResolutions(
      [...baseResult.value.jesterRevengeResolutions, resolution],
      baseResult.value.players,
    ),
  })
  return result.ok
    ? succeed(deepFreeze(result.value))
    : fail({ type: 'JESTER_REVENGE_APPLICATION_REJECTED' })
}

export function exhaustJesterRevengeWithoutSurvivor(
  game: GameState,
): DomainResult<GameState, ApplyJesterRevengeError> {
  const baseResult = validateRevengeApplicationBase(game)
  if (!baseResult.ok) {
    return baseResult
  }
  const obligation = baseResult.value.pendingJesterRevenges[0]
  if (obligation === undefined) {
    return fail({ type: 'NO_PENDING_JESTER_REVENGE' })
  }
  if (baseResult.value.players.some((player) => player.alive)) {
    return fail({ type: 'JESTER_REVENGE_SURVIVOR_STILL_EXISTS' })
  }
  const resolution: JesterRevengeResolution = Object.freeze({
    id: createJesterRevengeResolutionId(obligation.id),
    kind: 'no-survivor',
    gameId: baseResult.value.id,
    obligationId: obligation.id,
    jesterPlayerId: obligation.jesterPlayerId,
    jesterRoleInstanceId: obligation.jesterRoleInstanceId,
    resolvedAtNightNumber: baseResult.value.nightNumber,
  })
  const result = validateGameState({
    ...baseResult.value,
    pendingJesterRevenges: [],
    jesterRevengeResolutions: orderJesterRevengeResolutions(
      [...baseResult.value.jesterRevengeResolutions, resolution],
      baseResult.value.players,
    ),
  })
  return result.ok
    ? succeed(deepFreeze(result.value))
    : fail({ type: 'JESTER_REVENGE_APPLICATION_REJECTED' })
}

export function selectEligibleJesterRevengeVictims(
  game: GameState,
  obligation: PendingJesterRevenge,
): readonly PlayerId[] {
  if (
    game.phase !== 'dawn-resolution' ||
    obligation.gameId !== game.id ||
    obligation.triggeredOnDay + 1 !== game.nightNumber ||
    !game.players.some(
      (player) =>
        player.playerId === obligation.jesterPlayerId &&
        player.role.instanceId === obligation.jesterRoleInstanceId,
    )
  ) {
    return Object.freeze([])
  }
  return Object.freeze(
    game.players.flatMap((player): readonly PlayerId[] => (player.alive ? [player.playerId] : [])),
  )
}

function validateRevengeApplicationBase(
  game: GameState,
): DomainResult<GameState, ApplyJesterRevengeError> {
  if (game.phase !== 'dawn-resolution') {
    return fail({ type: 'INVALID_JESTER_REVENGE_PHASE', currentPhase: game.phase })
  }
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'JESTER_REVENGE_GAME_REJECTED' })
  }
  if (gameResult.value.pendingJesterRevenges.length === 0) {
    return fail({ type: 'NO_PENDING_JESTER_REVENGE' })
  }
  if (gameResult.value.pendingJesterRevenges.length > 1) {
    return fail({ type: 'MULTIPLE_PENDING_JESTER_REVENGES_UNRESOLVED_RULE' })
  }
  return succeed(gameResult.value)
}

function deepFreeze<Value>(value: Value): Value {
  freezeRecursively(value)
  return value
}

function freezeRecursively(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return
  }
  for (const child of Object.values(value)) {
    freezeRecursively(child)
  }
  Object.freeze(value)
}
