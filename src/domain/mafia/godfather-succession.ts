import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameInvariantError } from '../game/game-errors.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'
import type { RandomSource } from '../randomness/random-source.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import {
  orderGodfatherPromotions,
  validateCompleteGodfatherSuccessionHistory,
} from './godfather-promotion-invariants.ts'
import type { GodfatherPromotion } from './godfather-promotion-model.ts'

export type GodfatherSuccessionError =
  | Readonly<{
      type: 'GODFATHER_SUCCESSION_GAME_REJECTED'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'GODFATHER_SUCCESSION_WRONG_PHASE'
      currentPhase: GameState['phase']
    }>
  | Readonly<{ type: 'GODFATHER_PROMOTION_NOT_ALLOWED_ON_NIGHT_ONE' }>
  | Readonly<{ type: 'INVALID_GODFATHER_PROMOTION_RANDOM_OUTPUT'; value: number }>
  | Readonly<{ type: 'GODFATHER_PROMOTION_APPLICATION_REJECTED' }>

export type GodfatherSuccessionResult = Readonly<{
  game: GameState
  promotion: GodfatherPromotion | null
}>

export function applyGodfatherSuccessionForStartedNight(
  game: GameState,
  randomSource: RandomSource,
): DomainResult<GodfatherSuccessionResult, GodfatherSuccessionError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'GODFATHER_SUCCESSION_GAME_REJECTED', error: gameResult.error })
  }
  if (gameResult.value.phase !== 'night-action-collection') {
    return fail({
      type: 'GODFATHER_SUCCESSION_WRONG_PHASE',
      currentPhase: gameResult.value.phase,
    })
  }
  if (gameResult.value.nightNumber === 1) {
    return fail({ type: 'GODFATHER_PROMOTION_NOT_ALLOWED_ON_NIGHT_ONE' })
  }
  if (gameResult.value.nightNumber < gameResult.value.godfatherSuccessionStartNightNumber) {
    return succeedValidatedSuccession(gameResult.value, null)
  }

  const livingGodfather = gameResult.value.players.some(
    (player) =>
      player.alive && selectActiveRoleId(gameResult.value, player.playerId) === ROLE_IDS.godfather,
  )
  if (livingGodfather) {
    return succeedValidatedSuccession(gameResult.value, null)
  }

  const candidates = gameResult.value.players
    .map((player, rosterIndex) => ({ player, rosterIndex }))
    .filter(({ player }) => {
      if (!player.alive) {
        return false
      }
      const activeRoleId = selectActiveRoleId(gameResult.value, player.playerId)
      const activeRole = activeRoleId === null ? undefined : findRoleDefinition(activeRoleId)
      return activeRole?.faction === 'mafia' && activeRoleId !== ROLE_IDS.godfather
    })
    .sort(
      (left, right) =>
        (left.player.role.ordinal ?? 1) - (right.player.role.ordinal ?? 1) ||
        left.rosterIndex - right.rosterIndex,
    )

  if (candidates.length === 0) {
    return succeedValidatedSuccession(gameResult.value, null)
  }

  const randomValue = randomSource.next()
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    return fail({ type: 'INVALID_GODFATHER_PROMOTION_RANDOM_OUTPUT', value: randomValue })
  }
  const selected = candidates[Math.floor(randomValue * candidates.length)]?.player
  if (selected === undefined) {
    return fail({ type: 'INVALID_GODFATHER_PROMOTION_RANDOM_OUTPUT', value: randomValue })
  }

  const promotion: GodfatherPromotion = Object.freeze({
    gameId: gameResult.value.id,
    playerId: selected.playerId,
    originalRoleInstanceId: selected.role.instanceId,
    promotedAtNightNumber: gameResult.value.nightNumber,
    activeRoleId: ROLE_IDS.godfather,
  })
  const promotedGameResult = validateGameState({
    ...gameResult.value,
    godfatherPromotions: orderGodfatherPromotions(
      [...gameResult.value.godfatherPromotions, promotion],
      gameResult.value.players,
    ),
  })
  if (!promotedGameResult.ok) {
    return fail({ type: 'GODFATHER_PROMOTION_APPLICATION_REJECTED' })
  }

  return succeedValidatedSuccession(promotedGameResult.value, promotion)
}

function succeedValidatedSuccession(
  game: GameState,
  promotion: GodfatherPromotion | null,
): DomainResult<GodfatherSuccessionResult, GodfatherSuccessionError> {
  const historyResult = validateCompleteGodfatherSuccessionHistory(game)
  return historyResult.ok
    ? succeed(Object.freeze({ game, promotion }))
    : fail({ type: 'GODFATHER_PROMOTION_APPLICATION_REJECTED' })
}
