import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId } from '../identifiers.ts'
import { transitionPhase } from '../phases/phase-machine.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import type { DawnAnnouncement } from '../resolution/dawn-announcement.ts'
import type { BeginDayDiscussionError, ConfirmMayorRevealError } from './day-discussion-errors.ts'

export type { BeginDayDiscussionError, ConfirmMayorRevealError } from './day-discussion-errors.ts'

export function beginDayDiscussion(
  game: GameState,
  dawnAnnouncement: DawnAnnouncement,
): DomainResult<GameState, BeginDayDiscussionError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'INVALID_DAY_TRANSITION_GAME', error: gameResult.error })
  }

  if (gameResult.value.phase === 'day-discussion') {
    return fail({ type: 'DAY_TRANSITION_ALREADY_COMPLETED' })
  }
  if (gameResult.value.phase !== 'dawn-announcement') {
    return fail({
      type: 'INVALID_DAY_TRANSITION_PHASE',
      currentPhase: gameResult.value.phase,
    })
  }
  if (
    gameResult.value.nightNumber < 1 ||
    gameResult.value.dayNumber + 1 !== gameResult.value.nightNumber
  ) {
    return fail({
      type: 'INVALID_DAY_COUNTER_STATE',
      nightNumber: gameResult.value.nightNumber,
      dayNumber: gameResult.value.dayNumber,
    })
  }

  const announcementResult = validateDawnGameMatch(gameResult.value, dawnAnnouncement)
  if (!announcementResult.ok) {
    return announcementResult
  }

  const phaseResult = transitionPhase(gameResult.value.phase, 'day-discussion')
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected the defined Dawn-to-day transition.')
  }
  const transitionedResult = validateGameState({
    ...gameResult.value,
    phase: phaseResult.value,
    dayNumber: gameResult.value.dayNumber + 1,
  })
  if (!transitionedResult.ok) {
    return fail({ type: 'INVALID_DAY_TRANSITION_GAME', error: transitionedResult.error })
  }

  return succeed(deepFreeze(transitionedResult.value))
}

export function confirmMayorReveal(
  game: GameState,
  selectedPlayerId: PlayerId,
): DomainResult<GameState, ConfirmMayorRevealError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'MAYOR_REVEAL_GAME_REJECTED', error: gameResult.error })
  }
  if (gameResult.value.phase !== 'day-discussion') {
    return fail({
      type: 'INVALID_MAYOR_REVEAL_PHASE',
      currentPhase: gameResult.value.phase,
    })
  }
  if (typeof selectedPlayerId !== 'string' || selectedPlayerId.trim().length === 0) {
    return fail({ type: 'UNKNOWN_MAYOR_PLAYER', playerId: selectedPlayerId })
  }

  const selectedPlayer = gameResult.value.players.find(
    (player) => player.playerId === selectedPlayerId,
  )
  if (selectedPlayer === undefined) {
    return fail({
      type: 'NON_PARTICIPATING_MAYOR_PLAYER',
      playerId: selectedPlayerId,
    })
  }
  if (!selectedPlayer.alive) {
    return fail({ type: 'DEAD_MAYOR_CANNOT_REVEAL', playerId: selectedPlayer.playerId })
  }
  if (selectedPlayer.role.roleId !== ROLE_IDS.mayor) {
    return fail({
      type: 'SELECTED_PLAYER_IS_NOT_MAYOR',
      playerId: selectedPlayer.playerId,
      assignedRoleId: selectedPlayer.role.roleId,
    })
  }
  if (!hasCanonicalMayorMetadata(gameResult.value, selectedPlayer.playerId)) {
    return fail({
      type: 'INVALID_MAYOR_ROLE_METADATA',
      playerId: selectedPlayer.playerId,
    })
  }
  if (selectedPlayer.publiclyRevealedRoleId === ROLE_IDS.mayor) {
    return fail({ type: 'MAYOR_ALREADY_REVEALED', playerId: selectedPlayer.playerId })
  }

  const updatedResult = validateGameState({
    ...gameResult.value,
    players: gameResult.value.players.map((player) =>
      player.playerId === selectedPlayer.playerId
        ? { ...player, publiclyRevealedRoleId: ROLE_IDS.mayor }
        : player,
    ),
  })
  if (!updatedResult.ok) {
    return fail({ type: 'MAYOR_REVEAL_GAME_REJECTED', error: updatedResult.error })
  }

  return succeed(deepFreeze(updatedResult.value))
}

function validateDawnGameMatch(
  game: GameState,
  announcement: DawnAnnouncement,
): DomainResult<true, BeginDayDiscussionError> {
  const candidate: unknown = announcement
  if (
    !isUnknownRecord(candidate) ||
    typeof candidate.nightNumber !== 'number' ||
    !Number.isSafeInteger(candidate.nightNumber)
  ) {
    return invalidDawnMatch('invalid-announcement-shape')
  }
  if (candidate.nightNumber !== game.nightNumber) {
    return invalidDawnMatch('night-number-mismatch')
  }

  const deadPlayers = game.players.filter((player) => !player.alive)
  if (candidate.outcome === 'no-deaths') {
    return hasExactKeys(candidate, ['outcome', 'nightNumber']) && deadPlayers.length === 0
      ? succeed(true)
      : invalidDawnMatch('death-list-mismatch')
  }
  if (
    candidate.outcome !== 'deaths' ||
    !hasExactKeys(candidate, ['outcome', 'nightNumber', 'deaths']) ||
    !Array.isArray(candidate.deaths) ||
    candidate.deaths.length !== deadPlayers.length ||
    candidate.deaths.length === 0
  ) {
    return invalidDawnMatch('death-list-mismatch')
  }

  for (const [index, deathCandidate] of candidate.deaths.entries()) {
    if (
      !isUnknownRecord(deathCandidate) ||
      !hasExactKeys(deathCandidate, ['playerId', 'revealedRoleId']) ||
      typeof deathCandidate.playerId !== 'string' ||
      (deathCandidate.revealedRoleId !== null && typeof deathCandidate.revealedRoleId !== 'string')
    ) {
      return invalidDawnMatch('invalid-announcement-shape')
    }
    const expectedPlayer = deadPlayers[index]
    if (expectedPlayer === undefined || deathCandidate.playerId !== expectedPlayer.playerId) {
      return invalidDawnMatch('death-list-mismatch')
    }
    if (deathCandidate.revealedRoleId !== expectedPlayer.publiclyRevealedRoleId) {
      return invalidDawnMatch('public-reveal-mismatch')
    }
  }

  return succeed(true)
}

function hasCanonicalMayorMetadata(game: GameState, playerId: PlayerId): boolean {
  const mayorDefinition = findRoleDefinition(ROLE_IDS.mayor)
  const gameDefinition = game.roleDefinitions.find((definition) => definition.id === ROLE_IDS.mayor)
  const player = game.players.find((candidate) => candidate.playerId === playerId)
  return (
    mayorDefinition !== undefined &&
    gameDefinition !== undefined &&
    player?.role.roleId === mayorDefinition.id &&
    gameDefinition.name === mayorDefinition.name &&
    gameDefinition.faction === mayorDefinition.faction
  )
}

function invalidDawnMatch(
  reason: Extract<BeginDayDiscussionError, Readonly<{ type: 'INVALID_DAWN_GAME_MATCH' }>>['reason'],
): DomainResult<never, BeginDayDiscussionError> {
  return fail({ type: 'INVALID_DAWN_GAME_MATCH', reason })
}

function hasExactKeys(
  candidate: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const candidateKeys = Object.keys(candidate)
  return (
    candidateKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(candidate, key))
  )
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
