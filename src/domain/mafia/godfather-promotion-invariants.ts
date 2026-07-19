import type { DeathRecord } from '../game/death-record.ts'
import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import type { GamePlayer } from '../players/game-player.ts'
import type { ExecutionerToJesterConversion } from '../neutral/neutral-outcome-model.ts'
import { gameId, playerId, roleInstanceId, type GameId, type PlayerId } from '../identifiers.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import type { GodfatherPromotion } from './godfather-promotion-model.ts'

export type GodfatherPromotionInvariantError = Readonly<{
  type: 'INVALID_GODFATHER_PROMOTIONS'
  reason:
    | 'not-an-array'
    | 'invalid-record'
    | 'game-mismatch'
    | 'unknown-player'
    | 'role-instance-mismatch'
    | 'non-mafia-player'
    | 'original-godfather'
    | 'player-not-alive'
    | 'invalid-night'
    | 'living-godfather-existed'
    | 'duplicate-player'
    | 'duplicate-night'
    | 'contradictory-transformation'
    | 'order-mismatch'
    | 'missing-required-promotion'
    | 'unexpected-promotion'
  index?: number
  playerId?: PlayerId
}>

export function copyAndValidateGodfatherPromotions(
  candidate: unknown,
  context: Readonly<{
    gameId: GameId
    phase: GamePhase
    players: readonly GamePlayer[]
    deathRecords: readonly DeathRecord[]
    executionerConversions: readonly ExecutionerToJesterConversion[]
    nightNumber: number
    godfatherSuccessionStartNightNumber: number
  }>,
): DomainResult<readonly GodfatherPromotion[], GodfatherPromotionInvariantError> {
  if (!Array.isArray(candidate)) {
    return invalidPromotions('not-an-array')
  }

  const promotions: GodfatherPromotion[] = []
  const promotedPlayers = new Set<PlayerId>()
  const promotionNights = new Set<number>()

  for (const [index, value] of candidate.entries()) {
    if (
      !isUnknownRecord(value) ||
      !hasExactKeys(value, [
        'gameId',
        'playerId',
        'originalRoleInstanceId',
        'promotedAtNightNumber',
        'activeRoleId',
      ]) ||
      !isNonblankString(value.gameId) ||
      !isNonblankString(value.playerId) ||
      !isNonblankString(value.originalRoleInstanceId) ||
      typeof value.promotedAtNightNumber !== 'number' ||
      !Number.isSafeInteger(value.promotedAtNightNumber) ||
      value.promotedAtNightNumber < context.godfatherSuccessionStartNightNumber ||
      value.activeRoleId !== ROLE_IDS.godfather
    ) {
      return invalidPromotions('invalid-record', index)
    }

    const promotedAtNightNumber = value.promotedAtNightNumber
    if (!Number.isSafeInteger(promotedAtNightNumber)) {
      return invalidPromotions('invalid-record', index)
    }
    const promotion: GodfatherPromotion = Object.freeze({
      gameId: gameId(value.gameId),
      playerId: playerId(value.playerId),
      originalRoleInstanceId: roleInstanceId(value.originalRoleInstanceId),
      promotedAtNightNumber,
      activeRoleId: ROLE_IDS.godfather,
    })

    if (promotion.gameId !== context.gameId) {
      return invalidPromotions('game-mismatch', index, promotion.playerId)
    }
    if (promotion.promotedAtNightNumber > context.nightNumber) {
      return invalidPromotions('invalid-night', index, promotion.playerId)
    }

    const owner = context.players.find((player) => player.playerId === promotion.playerId)
    if (owner === undefined) {
      return invalidPromotions('unknown-player', index, promotion.playerId)
    }
    if (owner.role.instanceId !== promotion.originalRoleInstanceId) {
      return invalidPromotions('role-instance-mismatch', index, promotion.playerId)
    }

    const originalRole = findRoleDefinition(owner.role.roleId)
    if (originalRole?.faction !== 'mafia') {
      return invalidPromotions('non-mafia-player', index, promotion.playerId)
    }
    if (owner.role.roleId === ROLE_IDS.godfather) {
      return invalidPromotions('original-godfather', index, promotion.playerId)
    }
    if (
      context.executionerConversions.some(
        (conversion) => conversion.roleInstanceId === promotion.originalRoleInstanceId,
      )
    ) {
      return invalidPromotions('contradictory-transformation', index, promotion.playerId)
    }
    if (
      !wasAliveAtStartOfNight(
        promotion.playerId,
        promotion.promotedAtNightNumber,
        context.deathRecords,
      )
    ) {
      return invalidPromotions('player-not-alive', index, promotion.playerId)
    }
    if (
      livingGodfatherExistedBeforePromotion(
        promotion,
        promotions,
        context.players,
        context.deathRecords,
      )
    ) {
      return invalidPromotions('living-godfather-existed', index, promotion.playerId)
    }
    if (promotedPlayers.has(promotion.playerId)) {
      return invalidPromotions('duplicate-player', index, promotion.playerId)
    }
    if (promotionNights.has(promotion.promotedAtNightNumber)) {
      return invalidPromotions('duplicate-night', index, promotion.playerId)
    }

    promotedPlayers.add(promotion.playerId)
    promotionNights.add(promotion.promotedAtNightNumber)
    promotions.push(promotion)
  }

  const ordered = orderGodfatherPromotions(promotions, context.players)
  if (
    ordered.length !== promotions.length ||
    ordered.some((promotion, index) => {
      const candidatePromotion = promotions[index]
      return (
        candidatePromotion === undefined ||
        promotionKey(promotion) !== promotionKey(candidatePromotion)
      )
    })
  ) {
    return invalidPromotions('order-mismatch')
  }

  return succeed(Object.freeze(promotions))
}

export function validateCompleteGodfatherSuccessionHistory(
  game: Readonly<{
    players: readonly GamePlayer[]
    deathRecords: readonly DeathRecord[]
    godfatherSuccessionStartNightNumber: number
    godfatherPromotions: readonly GodfatherPromotion[]
    nightNumber: number
  }>,
): DomainResult<true, GodfatherPromotionInvariantError> {
  for (
    let nightNumber = game.godfatherSuccessionStartNightNumber;
    nightNumber <= game.nightNumber;
    nightNumber += 1
  ) {
    const livingMafia = game.players.filter((player) => {
      const originalRole = findRoleDefinition(player.role.roleId)
      return (
        originalRole?.faction === 'mafia' &&
        wasAliveAtStartOfNight(player.playerId, nightNumber, game.deathRecords)
      )
    })
    const livingGodfatherExisted = livingMafia.some(
      (player) =>
        player.role.roleId === ROLE_IDS.godfather ||
        game.godfatherPromotions.some(
          (promotion) =>
            promotion.playerId === player.playerId && promotion.promotedAtNightNumber < nightNumber,
        ),
    )
    const eligibleCandidateExisted =
      !livingGodfatherExisted &&
      livingMafia.some((player) => player.role.roleId !== ROLE_IDS.godfather)
    const promotion = game.godfatherPromotions.find(
      (record) => record.promotedAtNightNumber === nightNumber,
    )

    if (eligibleCandidateExisted && promotion === undefined) {
      return invalidPromotions('missing-required-promotion')
    }
    if (!eligibleCandidateExisted && promotion !== undefined) {
      return invalidPromotions('unexpected-promotion')
    }
  }
  return succeed(true)
}

export function orderGodfatherPromotions(
  promotions: readonly GodfatherPromotion[],
  players: readonly GamePlayer[],
): readonly GodfatherPromotion[] {
  const rosterOrder = new Map(players.map((player, index) => [player.playerId, index]))
  return Object.freeze(
    [...promotions].sort((left, right) => {
      const nightDifference = left.promotedAtNightNumber - right.promotedAtNightNumber
      if (nightDifference !== 0) {
        return nightDifference
      }
      const leftPlayer = players.find((player) => player.playerId === left.playerId)
      const rightPlayer = players.find((player) => player.playerId === right.playerId)
      const ordinalDifference = (leftPlayer?.role.ordinal ?? 1) - (rightPlayer?.role.ordinal ?? 1)
      return ordinalDifference !== 0
        ? ordinalDifference
        : (rosterOrder.get(left.playerId) ?? Number.MAX_SAFE_INTEGER) -
            (rosterOrder.get(right.playerId) ?? Number.MAX_SAFE_INTEGER)
    }),
  )
}

function livingGodfatherExistedBeforePromotion(
  promotion: GodfatherPromotion,
  earlierPromotions: readonly GodfatherPromotion[],
  players: readonly GamePlayer[],
  deaths: readonly DeathRecord[],
): boolean {
  return players.some((player) => {
    if (!wasAliveAtStartOfNight(player.playerId, promotion.promotedAtNightNumber, deaths)) {
      return false
    }
    return (
      player.role.roleId === ROLE_IDS.godfather ||
      earlierPromotions.some(
        (earlier) =>
          earlier.playerId === player.playerId &&
          earlier.promotedAtNightNumber < promotion.promotedAtNightNumber,
      )
    )
  })
}

function wasAliveAtStartOfNight(
  selectedPlayerId: PlayerId,
  nightNumber: number,
  deaths: readonly DeathRecord[],
): boolean {
  const death = deaths.find((record) => record.playerId === selectedPlayerId)
  if (death === undefined) {
    return true
  }
  switch (death.cause.kind) {
    case 'night-death':
    case 'jester-revenge':
      return death.cause.nightNumber >= nightNumber
    case 'day-execution':
      return death.cause.dayNumber >= nightNumber
  }
}

function promotionKey(promotion: GodfatherPromotion): string {
  return `${String(promotion.promotedAtNightNumber)}:${promotion.playerId}:${promotion.originalRoleInstanceId}`
}

function invalidPromotions(
  reason: GodfatherPromotionInvariantError['reason'],
  index?: number,
  selectedPlayerId?: PlayerId,
): DomainResult<never, GodfatherPromotionInvariantError> {
  return fail({
    type: 'INVALID_GODFATHER_PROMOTIONS',
    reason,
    ...(index === undefined ? {} : { index }),
    ...(selectedPlayerId === undefined ? {} : { playerId: selectedPlayerId }),
  })
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
