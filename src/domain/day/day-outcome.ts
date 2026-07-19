import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { DeathRecord } from '../game/death-record.ts'
import { validateGameState } from '../game/game-invariants.ts'
import {
  orderDeathRecords,
  orderPendingJesterRevenges,
  orderPersonalWins,
} from '../game/outcome-state-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId } from '../identifiers.ts'
import {
  isExecutionerRoleInstanceConverted,
  selectActiveRoleId,
} from '../neutral/executioner-conversion.ts'
import type { PendingJesterRevenge, PersonalWinRecord } from '../neutral/neutral-outcome-model.ts'
import { transitionPhase } from '../phases/phase-machine.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import type { CompleteDayOutcomeError } from './day-outcome-errors.ts'
import type { DayOutcome } from './day-outcome-model.ts'

export type { CompleteDayOutcomeError } from './day-outcome-errors.ts'
export type { DayOutcome } from './day-outcome-model.ts'

export function executePlayerDuringDay(
  game: GameState,
  selectedPlayerId: PlayerId,
): DomainResult<GameState, CompleteDayOutcomeError> {
  const gameResult = validateDayCompletionGame(game)
  if (!gameResult.ok) {
    return gameResult
  }
  if (typeof selectedPlayerId !== 'string' || selectedPlayerId.trim().length === 0) {
    return fail({ type: 'INVALID_EXECUTION_PLAYER_ID', playerId: selectedPlayerId })
  }
  const selectedPlayer = gameResult.value.players.find(
    (player) => player.playerId === selectedPlayerId,
  )
  if (selectedPlayer === undefined) {
    return fail({
      type: 'NON_PARTICIPATING_EXECUTION_PLAYER',
      playerId: selectedPlayerId,
    })
  }
  if (!selectedPlayer.alive) {
    return fail({ type: 'DEAD_EXECUTION_PLAYER', playerId: selectedPlayer.playerId })
  }
  const activeRoleId = selectActiveRoleId(gameResult.value, selectedPlayer.playerId)
  if (
    activeRoleId === null ||
    findRoleDefinition(activeRoleId) === undefined ||
    findRoleDefinition(selectedPlayer.role.roleId) === undefined
  ) {
    return fail({
      type: 'INVALID_EXECUTION_ROLE_METADATA',
      playerId: selectedPlayer.playerId,
    })
  }

  const outcome: DayOutcome = Object.freeze({
    kind: 'player-executed',
    gameId: gameResult.value.id,
    dayNumber: gameResult.value.dayNumber,
    playerId: selectedPlayer.playerId,
  })
  const executionDeath: DeathRecord = Object.freeze({
    gameId: gameResult.value.id,
    playerId: selectedPlayer.playerId,
    roleInstanceId: selectedPlayer.role.instanceId,
    cause: Object.freeze({
      kind: 'day-execution',
      dayNumber: gameResult.value.dayNumber,
    }),
  })
  const personalWins = createExecutionPersonalWins(
    gameResult.value,
    selectedPlayer.playerId,
    activeRoleId,
  )
  const pendingJesterRevenges = createPendingJesterRevenges(
    gameResult.value,
    selectedPlayer.playerId,
    activeRoleId,
  )
  const phaseResult = transitionPhase(gameResult.value.phase, 'execution-resolution')
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected the final day-outcome transition.')
  }
  const finalResult = validateGameState({
    ...gameResult.value,
    phase: phaseResult.value,
    players: gameResult.value.players.map((player) =>
      player.playerId === selectedPlayer.playerId
        ? {
            ...player,
            alive: false,
            publiclyRevealedRoleId: gameResult.value.settings.revealRoleOnDeath
              ? player.role.roleId
              : player.publiclyRevealedRoleId,
          }
        : player,
    ),
    deathRecords: orderDeathRecords(
      [...gameResult.value.deathRecords, executionDeath],
      gameResult.value.players,
    ),
    personalWins,
    pendingJesterRevenges,
    dayOutcome: outcome,
  })
  return finalResult.ok
    ? succeed(deepFreeze(finalResult.value))
    : fail({ type: 'DAY_OUTCOME_GAME_REJECTED', error: finalResult.error })
}

export function endDayWithoutExecution(
  game: GameState,
): DomainResult<GameState, CompleteDayOutcomeError> {
  const gameResult = validateDayCompletionGame(game)
  if (!gameResult.ok) {
    return gameResult
  }
  const phaseResult = transitionPhase(gameResult.value.phase, 'execution-resolution')
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected the no-execution day transition.')
  }
  const outcome: DayOutcome = Object.freeze({
    kind: 'no-execution',
    gameId: gameResult.value.id,
    dayNumber: gameResult.value.dayNumber,
  })
  const finalResult = validateGameState({
    ...gameResult.value,
    phase: phaseResult.value,
    dayOutcome: outcome,
  })
  return finalResult.ok
    ? succeed(deepFreeze(finalResult.value))
    : fail({ type: 'DAY_OUTCOME_GAME_REJECTED', error: finalResult.error })
}

function validateDayCompletionGame(
  game: GameState,
): DomainResult<GameState, CompleteDayOutcomeError> {
  const result = validateGameState(game)
  if (!result.ok) {
    return fail({ type: 'DAY_OUTCOME_GAME_REJECTED', error: result.error })
  }
  if (result.value.dayOutcome !== null) {
    return fail({ type: 'DAY_OUTCOME_ALREADY_RECORDED' })
  }
  if (result.value.phase !== 'day-discussion') {
    return fail({
      type: 'INVALID_DAY_OUTCOME_PHASE',
      currentPhase: result.value.phase,
    })
  }
  if (result.value.dayNumber < 1 || result.value.nightNumber !== result.value.dayNumber) {
    return fail({
      type: 'INVALID_DAY_OUTCOME_COUNTERS',
      nightNumber: result.value.nightNumber,
      dayNumber: result.value.dayNumber,
    })
  }
  return succeed(result.value)
}

function createExecutionPersonalWins(
  game: GameState,
  executedPlayerId: PlayerId,
  activeRoleId: ReturnType<typeof selectActiveRoleId>,
): readonly PersonalWinRecord[] {
  const records: PersonalWinRecord[] = [...game.personalWins]
  if (activeRoleId === ROLE_IDS.jester) {
    const executedPlayer = game.players.find((player) => player.playerId === executedPlayerId)
    if (executedPlayer === undefined) {
      throw new Error('A validated execution player disappeared.')
    }
    records.push(
      Object.freeze({
        kind: 'jester-executed',
        gameId: game.id,
        playerId: executedPlayer.playerId,
        roleInstanceId: executedPlayer.role.instanceId,
        dayNumber: game.dayNumber,
      }),
    )
  }
  for (const target of game.executionerTargets) {
    if (
      target.targetPlayerId !== executedPlayerId ||
      isExecutionerRoleInstanceConverted(game, target.executionerRoleInstanceId)
    ) {
      continue
    }
    records.push(
      Object.freeze({
        kind: 'executioner-target-executed',
        gameId: game.id,
        playerId: target.executionerPlayerId,
        roleInstanceId: target.executionerRoleInstanceId,
        targetPlayerId: target.targetPlayerId,
        dayNumber: game.dayNumber,
      }),
    )
  }
  return orderPersonalWins(records, game.players)
}

function createPendingJesterRevenges(
  game: GameState,
  executedPlayerId: PlayerId,
  activeRoleId: ReturnType<typeof selectActiveRoleId>,
): readonly PendingJesterRevenge[] {
  if (activeRoleId !== ROLE_IDS.jester) {
    return game.pendingJesterRevenges
  }
  const executedPlayer = game.players.find((player) => player.playerId === executedPlayerId)
  if (executedPlayer === undefined) {
    throw new Error('A validated executed Jester disappeared.')
  }
  return orderPendingJesterRevenges(
    [
      ...game.pendingJesterRevenges,
      Object.freeze({
        gameId: game.id,
        jesterPlayerId: executedPlayer.playerId,
        jesterRoleInstanceId: executedPlayer.role.instanceId,
        triggeredOnDay: game.dayNumber,
        status: 'pending' as const,
      }),
    ],
    game.players,
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
