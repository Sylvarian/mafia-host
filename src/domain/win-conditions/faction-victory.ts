import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameInvariantError } from '../game/game-errors.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import { playerId, type PlayerId } from '../identifiers.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import { transitionPhase } from '../phases/phase-machine.ts'
import type { GamePlayer } from '../players/game-player.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import type { FactionResult, TerminalFactionResult } from './faction-result.ts'
import {
  applyFinalTwoKillingRoleMutualElimination,
  applyPostPromotionFinalTwoKillingRoleMutualElimination,
  deriveStoredFinalTwoKillingRoleOutcome,
  evaluateFinalTwoKillingRoleOutcome,
  evaluatePostPromotionFinalTwoKillingRoleOutcome,
  type FinalTwoKillingRoleOutcomeError,
  type StoredFinalTwoKillingRoleDrawError,
} from './final-two-killing-role-outcome.ts'

export type FactionVictoryPredicate = 'town-victory' | 'mafia-victory' | 'serial-killer-victory'

export type FactionVictoryEvaluationError =
  | Readonly<{
      type: 'VICTORY_EVALUATION_GAME_REJECTED'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'VICTORY_EVALUATION_WRONG_PHASE'
      currentPhase: GamePhase
    }>
  | Readonly<{
      type: 'VICTORY_EVALUATION_COUNTER_MISMATCH'
      nightNumber: number
      dayNumber: number
    }>
  | Readonly<{ type: 'VICTORY_EVALUATION_MISSING_DAY_OUTCOME' }>
  | Readonly<{
      type: 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY'
    }>
  | Readonly<{
      type: 'CONTRADICTORY_VICTORY_PREDICATES'
      predicates: readonly FactionVictoryPredicate[]
    }>
  | Readonly<{
      type: 'VICTORY_EVALUATION_UNKNOWN_ACTIVE_ROLE'
      playerId: PlayerId
      roleId: ReturnType<typeof selectActiveRoleId>
    }>
  | FinalTwoKillingRoleOutcomeError

type FactionResultShapeError =
  | Readonly<{ type: 'INVALID_STORED_FACTION_RESULT' }>
  | Readonly<{ type: 'INVALID_TOWN_RESULT' }>
  | Readonly<{ type: 'INVALID_MAFIA_RESULT' }>
  | Readonly<{ type: 'INVALID_SERIAL_KILLER_RESULT' }>
  | Readonly<{ type: 'INVALID_DRAW' }>
  | Readonly<{ type: 'UNKNOWN_WINNER_PLAYER'; playerId: PlayerId }>
  | Readonly<{ type: 'DUPLICATE_WINNER_PLAYER'; playerId: PlayerId }>
  | Readonly<{
      type: 'FACTION_RESULT_GAME_MISMATCH'
    }>
  | Readonly<{ type: 'FACTION_RESULT_CONFLICTS_WITH_FINAL_TWO_DRAW' }>

export type FinalizeFactionVictoryError =
  | FactionVictoryEvaluationError
  | FactionResultShapeError
  | Readonly<{ type: 'NON_TERMINAL_FACTION_RESULT' }>
  | Readonly<{
      type: 'FACTION_GAME_FINALIZATION_REJECTED'
      error: GameInvariantError
    }>

export type StoredFactionResultError =
  | FactionResultShapeError
  | Readonly<{ type: 'GAME_OVER_RESULT_MISMATCH' }>
  | StoredFinalTwoKillingRoleDrawError
  | FactionVictoryEvaluationError

export type EvaluatedFactionVictory =
  | Readonly<{
      status: 'non-terminal'
      game: GameState
      result: Extract<FactionResult, Readonly<{ kind: 'none' }>>
    }>
  | Readonly<{
      status: 'game-over'
      game: GameState
      result: TerminalFactionResult
    }>

type ValidatedFactionVictoryEvaluation = Readonly<{
  game: GameState
  result: FactionResult
}>

type LivingFactionState = Readonly<{
  livingPlayers: readonly GamePlayer[]
  livingTown: readonly GamePlayer[]
  livingMafia: readonly GamePlayer[]
  livingSerialKillers: readonly GamePlayer[]
  livingJesters: readonly GamePlayer[]
}>

export function validateFactionVictoryEvaluationGate(
  game: GameState,
): DomainResult<GameState, FactionVictoryEvaluationError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'VICTORY_EVALUATION_GAME_REJECTED', error: gameResult.error })
  }
  if (
    gameResult.value.phase !== 'execution-resolution' &&
    gameResult.value.phase !== 'dawn-resolution'
  ) {
    return fail({
      type: 'VICTORY_EVALUATION_WRONG_PHASE',
      currentPhase: gameResult.value.phase,
    })
  }
  const atCompletedDay = gameResult.value.phase === 'execution-resolution'
  if (
    gameResult.value.nightNumber < 1 ||
    (atCompletedDay
      ? gameResult.value.nightNumber !== gameResult.value.dayNumber
      : gameResult.value.nightNumber !== gameResult.value.dayNumber + 1)
  ) {
    return fail({
      type: 'VICTORY_EVALUATION_COUNTER_MISMATCH',
      nightNumber: gameResult.value.nightNumber,
      dayNumber: gameResult.value.dayNumber,
    })
  }
  if (
    atCompletedDay &&
    !gameResult.value.dayOutcomes.some(
      (outcome) => outcome.dayNumber === gameResult.value.dayNumber,
    )
  ) {
    return fail({ type: 'VICTORY_EVALUATION_MISSING_DAY_OUTCOME' })
  }
  if (gameResult.value.pendingJesterRevenges.length > 0) {
    return fail({ type: 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY' })
  }
  return succeed(gameResult.value)
}

export function evaluateFactionVictory(
  game: GameState,
): DomainResult<FactionResult, FactionVictoryEvaluationError> {
  const evaluationResult = evaluateValidatedFactionVictory(game)
  return evaluationResult.ok ? succeed(evaluationResult.value.result) : evaluationResult
}

export function evaluateAndFinalizeFactionVictory(
  game: GameState,
): DomainResult<EvaluatedFactionVictory, FinalizeFactionVictoryError> {
  const evaluationResult = evaluateValidatedFactionVictory(game)
  if (!evaluationResult.ok) {
    return evaluationResult
  }
  if (evaluationResult.value.result.kind === 'none') {
    return succeed(
      Object.freeze({
        status: 'non-terminal',
        game: evaluationResult.value.game,
        result: evaluationResult.value.result,
      }),
    )
  }
  const finalGameResult = transitionEvaluatedFactionGame(evaluationResult.value.game)
  return finalGameResult.ok
    ? succeed(
        Object.freeze({
          status: 'game-over',
          game: finalGameResult.value,
          result: evaluationResult.value.result,
        }),
      )
    : finalGameResult
}

export function evaluateAndFinalizePostPromotionFinalTwoKillingRoleOutcome(
  game: GameState,
): DomainResult<EvaluatedFactionVictory, FinalizeFactionVictoryError> {
  const outcomeResult = evaluatePostPromotionFinalTwoKillingRoleOutcome(game)
  if (!outcomeResult.ok) {
    return outcomeResult
  }
  if (outcomeResult.value.kind === 'not-applicable') {
    return succeed(
      Object.freeze({
        status: 'non-terminal',
        game,
        result: Object.freeze({ kind: 'none', gameId: game.id }),
      }),
    )
  }
  const evaluatedGameResult =
    outcomeResult.value.kind === 'mutual-elimination'
      ? applyPostPromotionFinalTwoKillingRoleMutualElimination(game)
      : succeed(game)
  if (!evaluatedGameResult.ok) {
    return evaluatedGameResult
  }
  const result: TerminalFactionResult = Object.freeze({
    kind: 'draw',
    gameId: evaluatedGameResult.value.id,
    reason:
      outcomeResult.value.kind === 'mutual-elimination'
        ? 'opposing-killers-mutual-elimination'
        : 'opposing-killers-stalemate',
  })
  const finalGameResult =
    outcomeResult.value.kind === 'mutual-elimination'
      ? succeed(evaluatedGameResult.value)
      : transitionEvaluatedFactionGame(evaluatedGameResult.value)
  return finalGameResult.ok
    ? succeed(
        Object.freeze({
          status: 'game-over',
          game: finalGameResult.value,
          result,
        }),
      )
    : finalGameResult
}

export function finalizeFactionVictory(
  game: GameState,
  candidate: unknown,
): DomainResult<GameState, FinalizeFactionVictoryError> {
  const evaluationResult = evaluateValidatedFactionVictory(game)
  if (!evaluationResult.ok) {
    return evaluationResult
  }
  if (evaluationResult.value.result.kind === 'none') {
    return fail({ type: 'NON_TERMINAL_FACTION_RESULT' })
  }
  const result = copyStoredResult(candidate, evaluationResult.value.game)
  if (!result.ok) {
    return result
  }
  if (!sameFactionResult(result.value, evaluationResult.value.result)) {
    if (isOpposingKillerDraw(evaluationResult.value.result)) {
      return fail({ type: 'FACTION_RESULT_CONFLICTS_WITH_FINAL_TWO_DRAW' })
    }
    return invalidResult(result.value.kind)
  }
  return transitionEvaluatedFactionGame(evaluationResult.value.game)
}

function transitionEvaluatedFactionGame(
  game: GameState,
): DomainResult<
  GameState,
  Extract<FinalizeFactionVictoryError, Readonly<{ type: 'FACTION_GAME_FINALIZATION_REJECTED' }>>
> {
  const phaseResult = transitionPhase(game.phase, 'game-over')
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected a validated faction-victory transition.')
  }
  const finalGameResult = validateGameState({ ...game, phase: phaseResult.value })
  return finalGameResult.ok
    ? succeed(deepFreeze(finalGameResult.value))
    : fail({ type: 'FACTION_GAME_FINALIZATION_REJECTED', error: finalGameResult.error })
}

function evaluateValidatedFactionVictory(
  game: GameState,
): DomainResult<ValidatedFactionVictoryEvaluation, FactionVictoryEvaluationError> {
  const gateResult = validateFactionVictoryEvaluationGate(game)
  if (!gateResult.ok) {
    return gateResult
  }
  const finalTwoResult = evaluateFinalTwoKillingRoleOutcome(gateResult.value)
  if (!finalTwoResult.ok) {
    return finalTwoResult
  }
  if (finalTwoResult.value.kind === 'stalemate') {
    return succeed(
      Object.freeze({
        game: gateResult.value,
        result: Object.freeze({
          kind: 'draw',
          gameId: gateResult.value.id,
          reason: 'opposing-killers-stalemate',
        }),
      }),
    )
  }
  if (finalTwoResult.value.kind === 'mutual-elimination') {
    const applicationResult = applyFinalTwoKillingRoleMutualElimination(gateResult.value)
    return applicationResult.ok
      ? succeed(
          Object.freeze({
            game: applicationResult.value,
            result: Object.freeze({
              kind: 'draw',
              gameId: applicationResult.value.id,
              reason: 'opposing-killers-mutual-elimination',
            }),
          }),
        )
      : applicationResult
  }
  const result = deriveOrdinaryFactionResult(gateResult.value)
  return result.ok
    ? succeed(Object.freeze({ game: gateResult.value, result: result.value }))
    : result
}

export function validateStoredTerminalFactionResult(
  game: GameState,
  candidate: unknown,
): DomainResult<TerminalFactionResult, StoredFactionResultError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'VICTORY_EVALUATION_GAME_REJECTED', error: gameResult.error })
  }
  if (gameResult.value.phase !== 'game-over') {
    return fail({ type: 'GAME_OVER_RESULT_MISMATCH' })
  }
  if (gameResult.value.pendingJesterRevenges.length > 0) {
    return fail({ type: 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY' })
  }
  const copiedResult = copyStoredResult(candidate, gameResult.value)
  if (!copiedResult.ok) {
    return copiedResult
  }
  const finalTwoResult = deriveStoredFinalTwoKillingRoleOutcome(gameResult.value)
  if (!finalTwoResult.ok) {
    return finalTwoResult
  }
  const canonicalResult =
    finalTwoResult.value.kind === 'stalemate'
      ? succeed<FactionResult>(
          Object.freeze({
            kind: 'draw',
            gameId: gameResult.value.id,
            reason: 'opposing-killers-stalemate',
          }),
        )
      : finalTwoResult.value.kind === 'mutual-elimination'
        ? succeed<FactionResult>(
            Object.freeze({
              kind: 'draw',
              gameId: gameResult.value.id,
              reason: 'opposing-killers-mutual-elimination',
            }),
          )
        : deriveOrdinaryFactionResult(gameResult.value)
  if (!canonicalResult.ok) {
    return canonicalResult
  }
  if (canonicalResult.value.kind === 'none') {
    return fail({ type: 'GAME_OVER_RESULT_MISMATCH' })
  }
  return sameFactionResult(copiedResult.value, canonicalResult.value)
    ? succeed(copiedResult.value)
    : isOpposingKillerDraw(canonicalResult.value)
      ? fail({ type: 'FACTION_RESULT_CONFLICTS_WITH_FINAL_TWO_DRAW' })
      : invalidResult(copiedResult.value.kind)
}

function deriveOrdinaryFactionResult(
  game: GameState,
): DomainResult<FactionResult, FactionVictoryEvaluationError> {
  const stateResult = selectLivingFactionState(game)
  if (!stateResult.ok) {
    return stateResult
  }
  const state = stateResult.value
  if (state.livingPlayers.length === 0) {
    return succeed(
      Object.freeze({ kind: 'draw', gameId: game.id, reason: 'no-survivors' as const }),
    )
  }

  const townVictory =
    state.livingTown.length > 0 &&
    state.livingMafia.length === 0 &&
    state.livingSerialKillers.length === 0
  const mafiaVictory =
    state.livingMafia.length > 0 &&
    state.livingSerialKillers.length === 0 &&
    state.livingMafia.length >= state.livingTown.length &&
    state.livingJesters.length === 0
  const serialKillerVictory =
    state.livingPlayers.length === 1 && state.livingSerialKillers.length === 1
  const predicates = Object.freeze([
    ...(townVictory ? (['town-victory'] as const) : []),
    ...(mafiaVictory ? (['mafia-victory'] as const) : []),
    ...(serialKillerVictory ? (['serial-killer-victory'] as const) : []),
  ])
  if (predicates.length > 1) {
    return fail({ type: 'CONTRADICTORY_VICTORY_PREDICATES', predicates })
  }
  if (townVictory) {
    return succeed(Object.freeze({ kind: 'town-victory', gameId: game.id }))
  }
  if (mafiaVictory) {
    return succeed(
      Object.freeze({
        kind: 'mafia-victory',
        gameId: game.id,
        winnerPlayerIds: Object.freeze(state.livingMafia.map((player) => player.playerId)),
      }),
    )
  }
  if (serialKillerVictory) {
    return succeed(
      Object.freeze({
        kind: 'serial-killer-victory',
        gameId: game.id,
        winnerPlayerIds: Object.freeze(state.livingSerialKillers.map((player) => player.playerId)),
      }),
    )
  }
  return succeed(Object.freeze({ kind: 'none', gameId: game.id }))
}

function selectLivingFactionState(
  game: GameState,
): DomainResult<
  LivingFactionState,
  Extract<
    FactionVictoryEvaluationError,
    Readonly<{ type: 'VICTORY_EVALUATION_UNKNOWN_ACTIVE_ROLE' }>
  >
> {
  const livingPlayers = game.players.filter((player) => player.alive)
  const livingTown: GamePlayer[] = []
  const livingMafia: GamePlayer[] = []
  const livingSerialKillers: GamePlayer[] = []
  const livingJesters: GamePlayer[] = []

  for (const player of livingPlayers) {
    const activeRoleId = selectActiveRoleId(game, player.playerId)
    const role = activeRoleId === null ? undefined : findRoleDefinition(activeRoleId)
    if (role === undefined) {
      return fail({
        type: 'VICTORY_EVALUATION_UNKNOWN_ACTIVE_ROLE',
        playerId: player.playerId,
        roleId: activeRoleId,
      })
    }
    if (role.faction === 'town') {
      livingTown.push(player)
    }
    if (role.faction === 'mafia') {
      livingMafia.push(player)
    }
    if (activeRoleId === ROLE_IDS.serialKiller) {
      livingSerialKillers.push(player)
    }
    if (activeRoleId === ROLE_IDS.jester) {
      livingJesters.push(player)
    }
  }

  return succeed(
    Object.freeze({
      livingPlayers: Object.freeze(livingPlayers),
      livingTown: Object.freeze(livingTown),
      livingMafia: Object.freeze(livingMafia),
      livingSerialKillers: Object.freeze(livingSerialKillers),
      livingJesters: Object.freeze(livingJesters),
    }),
  )
}

function copyStoredResult(
  candidate: unknown,
  game: GameState,
): DomainResult<TerminalFactionResult, FactionResultShapeError> {
  if (!isUnknownRecord(candidate) || typeof candidate.kind !== 'string') {
    return fail({ type: 'INVALID_STORED_FACTION_RESULT' })
  }
  if (typeof candidate.gameId !== 'string' || candidate.gameId !== game.id) {
    return fail({ type: 'FACTION_RESULT_GAME_MISMATCH' })
  }
  switch (candidate.kind) {
    case 'town-victory':
      return hasExactKeys(candidate, ['kind', 'gameId'])
        ? succeed(Object.freeze({ kind: 'town-victory', gameId: game.id }))
        : fail({ type: 'INVALID_TOWN_RESULT' })
    case 'mafia-victory': {
      const winners = copyWinnerIds(candidate, game)
      return winners.ok
        ? succeed(
            Object.freeze({
              kind: 'mafia-victory',
              gameId: game.id,
              winnerPlayerIds: winners.value,
            }),
          )
        : winners
    }
    case 'serial-killer-victory': {
      const winners = copyWinnerIds(candidate, game)
      return winners.ok
        ? succeed(
            Object.freeze({
              kind: 'serial-killer-victory',
              gameId: game.id,
              winnerPlayerIds: winners.value,
            }),
          )
        : winners
    }
    case 'draw':
      return hasExactKeys(candidate, ['kind', 'gameId', 'reason']) &&
        (candidate.reason === 'no-survivors' ||
          candidate.reason === 'opposing-killers-stalemate' ||
          candidate.reason === 'opposing-killers-mutual-elimination')
        ? succeed(Object.freeze({ kind: 'draw', gameId: game.id, reason: candidate.reason }))
        : fail({ type: 'INVALID_DRAW' })
    case 'none':
    default:
      return fail({ type: 'INVALID_STORED_FACTION_RESULT' })
  }
}

function copyWinnerIds(
  candidate: Readonly<Record<string, unknown>>,
  game: GameState,
): DomainResult<readonly PlayerId[], FactionResultShapeError> {
  if (!hasExactKeys(candidate, ['kind', 'gameId', 'winnerPlayerIds'])) {
    return fail({ type: 'INVALID_STORED_FACTION_RESULT' })
  }
  if (!Array.isArray(candidate.winnerPlayerIds)) {
    return fail({ type: 'INVALID_STORED_FACTION_RESULT' })
  }
  const winners: PlayerId[] = []
  const seen = new Set<PlayerId>()
  for (const value of candidate.winnerPlayerIds) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return fail({ type: 'INVALID_STORED_FACTION_RESULT' })
    }
    const winnerId = playerId(value)
    if (!game.players.some((player) => player.playerId === winnerId)) {
      return fail({ type: 'UNKNOWN_WINNER_PLAYER', playerId: winnerId })
    }
    if (seen.has(winnerId)) {
      return fail({ type: 'DUPLICATE_WINNER_PLAYER', playerId: winnerId })
    }
    seen.add(winnerId)
    winners.push(winnerId)
  }
  return succeed(Object.freeze(winners))
}

function sameFactionResult(left: TerminalFactionResult, right: TerminalFactionResult): boolean {
  if (left.kind !== right.kind || left.gameId !== right.gameId) {
    return false
  }
  switch (left.kind) {
    case 'town-victory':
      return true
    case 'draw':
      return right.kind === 'draw' && left.reason === right.reason
    case 'mafia-victory':
    case 'serial-killer-victory':
      return (
        right.kind === left.kind &&
        left.winnerPlayerIds.length === right.winnerPlayerIds.length &&
        left.winnerPlayerIds.every((winnerId, index) => winnerId === right.winnerPlayerIds[index])
      )
  }
}

function isOpposingKillerDraw(result: FactionResult): boolean {
  return (
    result.kind === 'draw' &&
    (result.reason === 'opposing-killers-stalemate' ||
      result.reason === 'opposing-killers-mutual-elimination')
  )
}

function invalidResult(
  kind: TerminalFactionResult['kind'],
): DomainResult<never, FinalizeFactionVictoryError & StoredFactionResultError> {
  switch (kind) {
    case 'town-victory':
      return fail({ type: 'INVALID_TOWN_RESULT' })
    case 'mafia-victory':
      return fail({ type: 'INVALID_MAFIA_RESULT' })
    case 'serial-killer-victory':
      return fail({ type: 'INVALID_SERIAL_KILLER_RESULT' })
    case 'draw':
      return fail({ type: 'INVALID_DRAW' })
  }
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function hasExactKeys(
  candidate: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(candidate)
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(candidate, key))
  )
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
