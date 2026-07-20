import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameInvariantError } from '../game/game-errors.ts'
import { validateGameState } from '../game/game-invariants.ts'
import { orderDeathRecords } from '../game/outcome-state-invariants.ts'
import type { DeathCause, DeathRecord } from '../game/death-record.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import { addConversionsForProvenNonExecutionDeaths } from '../neutral/executioner-conversion.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'
import { transitionPhase } from '../phases/phase-machine.ts'
import type { GamePlayer } from '../players/game-player.ts'
import { findRoleDefinition, ROLE_IDS } from '../roles/role-registry.ts'
import { determineOrdinaryAttackOutcome } from '../resolution/attacks.ts'
import type { AttackOutcome } from '../resolution/night-resolution-models.ts'

export type FinalTwoKillingRoleParticipant = Readonly<{
  playerId: PlayerId
  roleId: RoleId
  roleInstanceId: RoleInstanceId
}>

type FinalTwoKillingRoleParticipants = readonly [
  FinalTwoKillingRoleParticipant,
  FinalTwoKillingRoleParticipant,
]

export type FinalTwoKillingRoleOutcome =
  | Readonly<{ kind: 'not-applicable' }>
  | Readonly<{
      kind: 'stalemate'
      participants: FinalTwoKillingRoleParticipants
    }>
  | Readonly<{
      kind: 'mutual-elimination'
      participants: FinalTwoKillingRoleParticipants
    }>

export type FinalTwoKillingRoleOutcomeError =
  | Readonly<{
      type: 'FINAL_TWO_KILLING_ROLE_GAME_REJECTED'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE'
      reason:
        | 'invalid-boundary'
        | 'counter-mismatch'
        | 'pending-revenge'
        | 'missing-current-promotion'
        | 'missing-completed-day-outcome'
    }>
  | Readonly<{
      type: 'UNSUPPORTED_FINAL_TWO_KILLING_ROLE_PAIRING'
      roleIds: readonly [RoleId, RoleId]
    }>
  | Readonly<{
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_ACTIVE_ROLE'
      playerId: PlayerId
      roleId: RoleId | null
    }>
  | Readonly<{
      type: 'CONTRADICTORY_FINAL_TWO_ATTACK_OUTCOMES'
      outcomes: readonly [AttackOutcome, AttackOutcome]
    }>
  | Readonly<{
      type: 'PREEXISTING_FINAL_TWO_KILLING_ROLE_SHOWDOWN'
    }>
  | Readonly<{
      type: 'FINAL_TWO_KILLING_ROLE_APPLICATION_REJECTED'
      error: GameInvariantError
    }>

export type StoredFinalTwoKillingRoleDrawError =
  | FinalTwoKillingRoleOutcomeError
  | Readonly<{ type: 'SAME_FACTION_KILLERS_NOT_OPPOSING' }>
  | Readonly<{ type: 'PARTIAL_FINAL_KILLING_ROLE_SHOWDOWN' }>
  | Readonly<{ type: 'INVALID_FINAL_KILLING_ROLE_SHOWDOWN_EVIDENCE' }>
  | Readonly<{ type: 'FINAL_TWO_DRAW_RESULT_MISMATCH' }>

type PairClassification =
  | Readonly<{ kind: 'not-killing' }>
  | Readonly<{ kind: 'same-interest' }>
  | Readonly<{
      kind: 'opposing'
      participants: FinalTwoKillingRoleParticipants
    }>

const NOT_APPLICABLE = Object.freeze({ kind: 'not-applicable' as const })

export function evaluateFinalTwoKillingRoleOutcome(
  game: GameState,
): DomainResult<FinalTwoKillingRoleOutcome, FinalTwoKillingRoleOutcomeError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'FINAL_TWO_KILLING_ROLE_GAME_REJECTED', error: gameResult.error })
  }
  const boundaryResult = validateEvaluationBoundary(gameResult.value)
  if (!boundaryResult.ok) {
    return boundaryResult
  }
  return evaluateValidatedFinalTwoKillingRoleOutcome(gameResult.value)
}

export function evaluatePostPromotionFinalTwoKillingRoleOutcome(
  game: GameState,
): DomainResult<FinalTwoKillingRoleOutcome, FinalTwoKillingRoleOutcomeError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'FINAL_TWO_KILLING_ROLE_GAME_REJECTED', error: gameResult.error })
  }
  const boundaryResult = validatePostPromotionBoundary(gameResult.value)
  if (!boundaryResult.ok) {
    return boundaryResult
  }
  if (gameResult.value.pendingJesterRevenges.length > 0) {
    return succeed(NOT_APPLICABLE)
  }
  return evaluateValidatedFinalTwoKillingRoleOutcome(gameResult.value)
}

export function applyFinalTwoKillingRoleMutualElimination(
  game: GameState,
): DomainResult<GameState, FinalTwoKillingRoleOutcomeError> {
  const outcomeResult = evaluateFinalTwoKillingRoleOutcome(game)
  if (!outcomeResult.ok) {
    return outcomeResult
  }
  if (outcomeResult.value.kind !== 'mutual-elimination') {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'invalid-boundary',
    })
  }

  return applyValidatedMutualElimination(game, outcomeResult.value, createShowdownBoundary(game))
}

export function applyPostPromotionFinalTwoKillingRoleMutualElimination(
  game: GameState,
): DomainResult<GameState, FinalTwoKillingRoleOutcomeError> {
  const outcomeResult = evaluatePostPromotionFinalTwoKillingRoleOutcome(game)
  if (!outcomeResult.ok) {
    return outcomeResult
  }
  if (outcomeResult.value.kind !== 'mutual-elimination') {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'invalid-boundary',
    })
  }
  const phaseResult = transitionPhase(game.phase, 'game-over')
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected a validated post-promotion final-two transition.')
  }
  return applyValidatedMutualElimination(
    game,
    outcomeResult.value,
    Object.freeze({ kind: 'post-dawn', nightNumber: game.nightNumber }),
    phaseResult.value,
  )
}

function applyValidatedMutualElimination(
  game: GameState,
  outcome: Extract<FinalTwoKillingRoleOutcome, Readonly<{ kind: 'mutual-elimination' }>>,
  boundary: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'],
  phase = game.phase,
): DomainResult<GameState, FinalTwoKillingRoleOutcomeError> {
  const [first, second] = outcome.participants
  const newDeathRecords: readonly [DeathRecord, DeathRecord] = Object.freeze([
    createShowdownDeath(game, first, second.playerId, boundary),
    createShowdownDeath(game, second, first.playerId, boundary),
  ])
  const deadPlayerIds = new Set(newDeathRecords.map((record) => record.playerId))
  const players = Object.freeze(
    game.players.map((player) =>
      deadPlayerIds.has(player.playerId)
        ? Object.freeze({
            ...player,
            alive: false,
            publiclyRevealedRoleId: game.settings.revealRoleOnDeath
              ? player.role.roleId
              : player.publiclyRevealedRoleId,
          })
        : player,
    ),
  )
  const candidate = {
    ...game,
    phase,
    players,
    deathRecords: orderDeathRecords([...game.deathRecords, ...newDeathRecords], players),
    executionerConversions: addConversionsForProvenNonExecutionDeaths(game, newDeathRecords),
  }
  const appliedResult = validateGameState(candidate)
  return appliedResult.ok
    ? succeed(deepFreeze(appliedResult.value))
    : fail({
        type: 'FINAL_TWO_KILLING_ROLE_APPLICATION_REJECTED',
        error: appliedResult.error,
      })
}

function evaluateValidatedFinalTwoKillingRoleOutcome(
  game: GameState,
): DomainResult<FinalTwoKillingRoleOutcome, FinalTwoKillingRoleOutcomeError> {
  if (selectShowdownDeaths(game).length > 0) {
    return fail({ type: 'PREEXISTING_FINAL_TWO_KILLING_ROLE_SHOWDOWN' })
  }
  const livingPlayers = game.players.filter((player) => player.alive)
  if (livingPlayers.length !== 2) {
    return succeed(NOT_APPLICABLE)
  }
  const pairResult = classifyKillingRolePair(game, livingPlayers)
  if (!pairResult.ok) {
    return pairResult
  }
  if (pairResult.value.kind !== 'opposing') {
    return succeed(NOT_APPLICABLE)
  }
  return deriveOutcomeFromAttackAuthority(game, pairResult.value.participants)
}

export function deriveStoredFinalTwoKillingRoleOutcome(
  game: GameState,
): DomainResult<FinalTwoKillingRoleOutcome, StoredFinalTwoKillingRoleDrawError> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'FINAL_TWO_KILLING_ROLE_GAME_REJECTED', error: gameResult.error })
  }
  if (gameResult.value.phase !== 'game-over') {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'invalid-boundary',
    })
  }
  if (gameResult.value.pendingJesterRevenges.length > 0) {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'pending-revenge',
    })
  }

  const showdownDeaths = selectShowdownDeaths(gameResult.value)
  if (showdownDeaths.length === 0) {
    const livingPlayers = gameResult.value.players.filter((player) => player.alive)
    return deriveStoredPairOutcome(gameResult.value, livingPlayers, false)
  }

  if (showdownDeaths.length === 1) {
    return fail({ type: 'PARTIAL_FINAL_KILLING_ROLE_SHOWDOWN' })
  }
  if (
    showdownDeaths.length !== 2 ||
    gameResult.value.players.some((player) => player.alive) ||
    !hasValidLinkedShowdownEvidence(gameResult.value, showdownDeaths)
  ) {
    return fail({ type: 'INVALID_FINAL_KILLING_ROLE_SHOWDOWN_EVIDENCE' })
  }
  const showdownPlayerIds = new Set(showdownDeaths.map((record) => record.playerId))
  const preShowdownSurvivors = gameResult.value.players.filter(
    (player) => player.alive || showdownPlayerIds.has(player.playerId),
  )
  return deriveStoredPairOutcome(gameResult.value, preShowdownSurvivors, true)
}

function deriveStoredPairOutcome(
  game: GameState,
  players: readonly GamePlayer[],
  hasShowdownDeaths: boolean,
): DomainResult<FinalTwoKillingRoleOutcome, StoredFinalTwoKillingRoleDrawError> {
  if (players.length !== 2) {
    return hasShowdownDeaths
      ? fail({
          type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
          reason: 'counter-mismatch',
        })
      : succeed(NOT_APPLICABLE)
  }
  const pairResult = classifyKillingRolePair(game, players)
  if (!pairResult.ok) {
    return pairResult
  }
  if (pairResult.value.kind === 'same-interest') {
    return hasShowdownDeaths
      ? fail({ type: 'SAME_FACTION_KILLERS_NOT_OPPOSING' })
      : succeed(NOT_APPLICABLE)
  }
  if (pairResult.value.kind !== 'opposing') {
    return hasShowdownDeaths
      ? fail({
          type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
          reason: 'counter-mismatch',
        })
      : succeed(NOT_APPLICABLE)
  }
  const outcomeResult = deriveOutcomeFromAttackAuthority(game, pairResult.value.participants)
  if (!outcomeResult.ok) {
    return outcomeResult
  }
  const evidenceMatches =
    (hasShowdownDeaths && outcomeResult.value.kind === 'mutual-elimination') ||
    (!hasShowdownDeaths && outcomeResult.value.kind === 'stalemate')
  return evidenceMatches ? outcomeResult : fail({ type: 'FINAL_TWO_DRAW_RESULT_MISMATCH' })
}

function classifyKillingRolePair(
  game: GameState,
  players: readonly GamePlayer[],
): DomainResult<PairClassification, FinalTwoKillingRoleOutcomeError> {
  const firstPlayer = players[0]
  const secondPlayer = players[1]
  if (firstPlayer === undefined || secondPlayer === undefined) {
    return succeed(Object.freeze({ kind: 'not-killing' }))
  }
  const firstResult = selectKillingRoleParticipant(game, firstPlayer)
  if (!firstResult.ok) {
    return firstResult
  }
  const secondResult = selectKillingRoleParticipant(game, secondPlayer)
  if (!secondResult.ok) {
    return secondResult
  }
  const first = firstResult.value
  const second = secondResult.value
  if (first === null || second === null) {
    return succeed(Object.freeze({ kind: 'not-killing' }))
  }
  const firstRole = findRoleDefinition(first.roleId)
  const secondRole = findRoleDefinition(second.roleId)
  if (firstRole === undefined || secondRole === undefined) {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_ACTIVE_ROLE',
      playerId: firstRole === undefined ? first.playerId : second.playerId,
      roleId: firstRole === undefined ? first.roleId : second.roleId,
    })
  }
  if (first.roleId === second.roleId || firstRole.faction === secondRole.faction) {
    return succeed(Object.freeze({ kind: 'same-interest' }))
  }
  const canonicalOpposingPair =
    (first.roleId === ROLE_IDS.godfather && second.roleId === ROLE_IDS.serialKiller) ||
    (first.roleId === ROLE_IDS.serialKiller && second.roleId === ROLE_IDS.godfather)
  if (!canonicalOpposingPair) {
    return fail({
      type: 'UNSUPPORTED_FINAL_TWO_KILLING_ROLE_PAIRING',
      roleIds: Object.freeze([first.roleId, second.roleId]),
    })
  }
  return succeed(
    Object.freeze({
      kind: 'opposing',
      participants: Object.freeze([first, second] as const),
    }),
  )
}

function selectKillingRoleParticipant(
  game: GameState,
  player: GamePlayer,
): DomainResult<FinalTwoKillingRoleParticipant | null, FinalTwoKillingRoleOutcomeError> {
  const activeRoleId = selectActiveRoleId(game, player.playerId)
  const role = activeRoleId === null ? undefined : findRoleDefinition(activeRoleId)
  if (activeRoleId === null || role === undefined) {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_ACTIVE_ROLE',
      playerId: player.playerId,
      roleId: activeRoleId,
    })
  }
  return succeed(
    role.nightAction.hasNightAction && role.nightAction.actionKind === 'attack'
      ? Object.freeze({
          playerId: player.playerId,
          roleId: role.id,
          roleInstanceId: player.role.instanceId,
        })
      : null,
  )
}

function deriveOutcomeFromAttackAuthority(
  game: GameState,
  participants: FinalTwoKillingRoleParticipants,
): DomainResult<FinalTwoKillingRoleOutcome, FinalTwoKillingRoleOutcomeError> {
  const [first, second] = participants
  const firstOutcome = determineOrdinaryAttackOutcome(
    first.roleId,
    second.roleId,
    game.settings.godfatherAndSerialCanKillEachOther,
    false,
  )
  const secondOutcome = determineOrdinaryAttackOutcome(
    second.roleId,
    first.roleId,
    game.settings.godfatherAndSerialCanKillEachOther,
    false,
  )
  if (firstOutcome === 'mutual-kill-disabled' && secondOutcome === 'mutual-kill-disabled') {
    return succeed(Object.freeze({ kind: 'stalemate', participants }))
  }
  if (firstOutcome === 'lethal' && secondOutcome === 'lethal') {
    return succeed(Object.freeze({ kind: 'mutual-elimination', participants }))
  }
  return fail({
    type: 'CONTRADICTORY_FINAL_TWO_ATTACK_OUTCOMES',
    outcomes: Object.freeze([firstOutcome, secondOutcome]),
  })
}

function validateEvaluationBoundary(
  game: GameState,
): DomainResult<true, FinalTwoKillingRoleOutcomeError> {
  if (game.phase !== 'execution-resolution' && game.phase !== 'dawn-resolution') {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'invalid-boundary',
    })
  }
  const counterMatch =
    game.phase === 'execution-resolution'
      ? game.nightNumber >= 1 && game.nightNumber === game.dayNumber
      : game.nightNumber >= 1 && game.nightNumber === game.dayNumber + 1
  if (!counterMatch) {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'counter-mismatch',
    })
  }
  return game.pendingJesterRevenges.length === 0
    ? succeed(true)
    : fail({
        type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
        reason: 'pending-revenge',
      })
}

function validatePostPromotionBoundary(
  game: GameState,
): DomainResult<true, FinalTwoKillingRoleOutcomeError> {
  if (game.phase !== 'night-action-collection') {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'invalid-boundary',
    })
  }
  if (game.nightNumber < 2 || game.nightNumber !== game.dayNumber + 1) {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'counter-mismatch',
    })
  }
  if (!game.dayOutcomes.some((outcome) => outcome.dayNumber === game.dayNumber)) {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'missing-completed-day-outcome',
    })
  }
  if (
    game.godfatherPromotions.filter(
      (promotion) => promotion.promotedAtNightNumber === game.nightNumber,
    ).length !== 1
  ) {
    return fail({
      type: 'INVALID_FINAL_TWO_KILLING_ROLE_STATE',
      reason: 'missing-current-promotion',
    })
  }
  return succeed(true)
}

function createShowdownBoundary(
  game: GameState,
): Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'] {
  return game.phase === 'execution-resolution'
    ? Object.freeze({ kind: 'post-day', dayNumber: game.dayNumber })
    : Object.freeze({ kind: 'post-dawn', nightNumber: game.nightNumber })
}

function createShowdownDeath(
  game: GameState,
  participant: FinalTwoKillingRoleParticipant,
  opponentPlayerId: PlayerId,
  boundary: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'],
): DeathRecord {
  return Object.freeze({
    gameId: game.id,
    playerId: participant.playerId,
    roleInstanceId: participant.roleInstanceId,
    cause: Object.freeze({
      kind: 'final-killing-role-showdown',
      boundary,
      opponentPlayerId,
    }),
  })
}

function selectShowdownDeaths(game: GameState): readonly DeathRecord[] {
  return game.deathRecords.filter(
    (
      record,
    ): record is DeathRecord & {
      cause: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>
    } => record.cause.kind === 'final-killing-role-showdown',
  )
}

function hasValidLinkedShowdownEvidence(game: GameState, deaths: readonly DeathRecord[]): boolean {
  const first = deaths[0]
  const second = deaths[1]
  if (
    first === undefined ||
    second === undefined ||
    first.cause.kind !== 'final-killing-role-showdown' ||
    second.cause.kind !== 'final-killing-role-showdown'
  ) {
    return false
  }
  const expectedBoundary =
    game.nightNumber === game.dayNumber
      ? { kind: 'post-day' as const, dayNumber: game.dayNumber }
      : { kind: 'post-dawn' as const, nightNumber: game.nightNumber }
  return (
    first.cause.opponentPlayerId === second.playerId &&
    second.cause.opponentPlayerId === first.playerId &&
    sameBoundary(first.cause.boundary, expectedBoundary) &&
    sameBoundary(second.cause.boundary, expectedBoundary)
  )
}

function sameBoundary(
  left: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'],
  right: Extract<DeathCause, Readonly<{ kind: 'final-killing-role-showdown' }>>['boundary'],
): boolean {
  return left.kind === 'post-day'
    ? right.kind === 'post-day' && left.dayNumber === right.dayNumber
    : right.kind === 'post-dawn' && left.nightNumber === right.nightNumber
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
