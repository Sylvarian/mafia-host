import {
  endDayWithoutExecution,
  executePlayerDuringDay,
  type CompleteDayOutcomeError,
  type DayOutcome,
} from '@/domain/day/day-outcome.ts'
import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameInvariantError } from '@/domain/game/game-errors.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

import {
  validateDayDiscussionState,
  type DayDiscussionState,
  type InvalidDayDiscussionStateError,
} from '../day-discussion/index.ts'
import { selectHostPlayerRoleViews, type HostPlayerRoleView } from '../player-roles/index.ts'

export type DayExecutionCandidateView = Omit<HostPlayerRoleView, 'status'>

export type DayOutcomeState = Readonly<{
  game: GameState
  participants: readonly Player[]
}>

export type InvalidDayOutcomeStateError =
  | Readonly<{
      type: 'INVALID_DAY_OUTCOME_GAME'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'DAY_OUTCOME_PHASE_MISMATCH'
      currentPhase: GameState['phase']
    }>
  | Readonly<{
      type: 'DAY_OUTCOME_COUNTER_MISMATCH'
      nightNumber: number
      dayNumber: number
    }>
  | Readonly<{ type: 'MISSING_DAY_OUTCOME' }>
  | Readonly<{
      type: 'INVALID_DAY_OUTCOME_PARTICIPANTS'
      reason: 'invalid-player' | 'duplicate-player' | 'game-mismatch'
    }>

export type CompleteDayOutcomeWorkflowError =
  CompleteDayOutcomeError | InvalidDayDiscussionStateError | InvalidDayOutcomeStateError

export type DayOutcomeView = Readonly<{
  dayNumber: number
  dayLabel: string
  announcement:
    | Readonly<{
        kind: 'player-executed'
        playerDisplayLabel: string
        revealedRoleDisplayName: string | null
      }>
    | Readonly<{ kind: 'no-execution' }>
  hostResult:
    | Readonly<{
        kind: 'player-executed'
        playerDisplayLabel: string
        currentRoleDisplayName: string
        originalRoleDisplayName: string | null
        alignmentDisplayName: string
      }>
    | Readonly<{ kind: 'no-execution' }>
}>

export function selectDayExecutionCandidates(
  state: DayDiscussionState,
): readonly DayExecutionCandidateView[] {
  const stateResult = validateDayDiscussionState(state)
  if (!stateResult.ok) {
    throw new Error(`Invalid day discussion state: ${stateResult.error.type}.`)
  }
  const rowsResult = selectHostPlayerRoleViews(
    stateResult.value.game,
    stateResult.value.participants,
  )
  if (!rowsResult.ok) {
    throw new Error('Living execution candidates have invalid active role metadata.')
  }
  return Object.freeze(
    rowsResult.value.flatMap((player) =>
      player.status === 'dead'
        ? []
        : [
            Object.freeze({
              playerId: player.playerId,
              playerDisplayLabel: player.playerDisplayLabel,
              activeRoleDisplayName: player.activeRoleDisplayName,
              originallyAssignedRoleDisplayName: player.originallyAssignedRoleDisplayName,
              alignment: player.alignment,
              alignmentDisplayName: player.alignmentDisplayName,
            }),
          ],
    ),
  )
}

export function executePlayerAndCompleteDay(
  state: DayDiscussionState,
  selectedPlayerId: PlayerId,
): DomainResult<DayOutcomeState, CompleteDayOutcomeWorkflowError> {
  const stateResult = validateDayDiscussionState(state)
  if (!stateResult.ok) {
    return stateResult
  }
  const result = executePlayerDuringDay(stateResult.value.game, selectedPlayerId)
  return result.ok
    ? validateDayOutcomeState({
        game: result.value,
        participants: stateResult.value.participants,
      })
    : result
}

export function completeDayWithoutExecution(
  state: DayDiscussionState,
): DomainResult<DayOutcomeState, CompleteDayOutcomeWorkflowError> {
  const stateResult = validateDayDiscussionState(state)
  if (!stateResult.ok) {
    return stateResult
  }
  const result = endDayWithoutExecution(stateResult.value.game)
  return result.ok
    ? validateDayOutcomeState({
        game: result.value,
        participants: stateResult.value.participants,
      })
    : result
}

export function validateDayOutcomeState(
  state: DayOutcomeState,
): DomainResult<DayOutcomeState, InvalidDayOutcomeStateError> {
  const gameResult = validateGameState(state.game)
  if (!gameResult.ok) {
    return fail({ type: 'INVALID_DAY_OUTCOME_GAME', error: gameResult.error })
  }
  if (gameResult.value.phase !== 'execution-resolution') {
    return fail({
      type: 'DAY_OUTCOME_PHASE_MISMATCH',
      currentPhase: gameResult.value.phase,
    })
  }
  if (
    gameResult.value.dayNumber < 1 ||
    gameResult.value.nightNumber !== gameResult.value.dayNumber
  ) {
    return fail({
      type: 'DAY_OUTCOME_COUNTER_MISMATCH',
      nightNumber: gameResult.value.nightNumber,
      dayNumber: gameResult.value.dayNumber,
    })
  }
  if (
    !gameResult.value.dayOutcomes.some(
      (outcome) => outcome.dayNumber === gameResult.value.dayNumber,
    )
  ) {
    return fail({ type: 'MISSING_DAY_OUTCOME' })
  }
  const participantsResult = copyParticipants(state.participants, gameResult.value)
  if (!participantsResult.ok) {
    return participantsResult
  }
  return succeed(
    Object.freeze({
      game: gameResult.value,
      participants: participantsResult.value,
    }),
  )
}

export function selectDayOutcomeView(state: DayOutcomeState): DayOutcomeView {
  const result = validateDayOutcomeState(state)
  if (!result.ok) {
    throw new Error(`Invalid day outcome state: ${result.error.type}.`)
  }
  const outcome = requireOutcome(
    result.value.game.dayOutcomes.find(
      (candidate) => candidate.dayNumber === result.value.game.dayNumber,
    ) ?? null,
  )
  if (outcome.kind === 'no-execution') {
    return Object.freeze({
      dayNumber: outcome.dayNumber,
      dayLabel: `Day ${String(outcome.dayNumber)}`,
      announcement: Object.freeze({ kind: 'no-execution' }),
      hostResult: Object.freeze({ kind: 'no-execution' }),
    })
  }
  const player = result.value.game.players.find(
    (candidate) => candidate.playerId === outcome.playerId,
  )
  if (player === undefined) {
    throw new Error('The executed player is absent from the outcome game.')
  }
  const revealedRole =
    player.publiclyRevealedRoleId === null
      ? undefined
      : findRoleDefinition(player.publiclyRevealedRoleId)
  if (player.publiclyRevealedRoleId !== null && revealedRole === undefined) {
    throw new Error('The execution reveal role is absent from the canonical registry.')
  }
  const hostRoles = selectHostPlayerRoleViews(result.value.game, result.value.participants)
  if (!hostRoles.ok) {
    throw new Error('The executed player has invalid active role metadata.')
  }
  const hostPlayer = hostRoles.value.find((candidate) => candidate.playerId === player.playerId)
  if (hostPlayer === undefined) {
    throw new Error('The executed player is absent from the host role view.')
  }
  return Object.freeze({
    dayNumber: outcome.dayNumber,
    dayLabel: `Day ${String(outcome.dayNumber)}`,
    announcement: Object.freeze({
      kind: 'player-executed',
      playerDisplayLabel: hostPlayer.playerDisplayLabel,
      revealedRoleDisplayName:
        revealedRole === undefined ? null : getRoleInstanceDisplayName(player.role, revealedRole),
    }),
    hostResult: Object.freeze({
      kind: 'player-executed',
      playerDisplayLabel: hostPlayer.playerDisplayLabel,
      currentRoleDisplayName: hostPlayer.activeRoleDisplayName,
      originalRoleDisplayName: hostPlayer.originallyAssignedRoleDisplayName,
      alignmentDisplayName: hostPlayer.alignmentDisplayName,
    }),
  })
}

function requireOutcome(outcome: DayOutcome | null): DayOutcome {
  if (outcome === null) {
    throw new Error('A validated post-day state has no final outcome.')
  }
  return outcome
}

function copyParticipants(
  participants: readonly Player[],
  game: GameState,
): DomainResult<
  readonly Player[],
  Extract<InvalidDayOutcomeStateError, Readonly<{ type: 'INVALID_DAY_OUTCOME_PARTICIPANTS' }>>
> {
  const copied: Player[] = []
  const seen = new Set<PlayerId>()
  for (const participant of participants) {
    if (
      typeof participant.id !== 'string' ||
      participant.id.trim().length === 0 ||
      typeof participant.name !== 'string' ||
      participant.name.trim().length === 0 ||
      !participant.playing
    ) {
      return fail({
        type: 'INVALID_DAY_OUTCOME_PARTICIPANTS',
        reason: 'invalid-player',
      })
    }
    if (seen.has(participant.id)) {
      return fail({
        type: 'INVALID_DAY_OUTCOME_PARTICIPANTS',
        reason: 'duplicate-player',
      })
    }
    seen.add(participant.id)
    copied.push(Object.freeze({ ...participant }))
  }
  if (
    copied.length !== game.players.length ||
    copied.some((participant, index) => participant.id !== game.players[index]?.playerId)
  ) {
    return fail({
      type: 'INVALID_DAY_OUTCOME_PARTICIPANTS',
      reason: 'game-mismatch',
    })
  }
  return succeed(Object.freeze(copied))
}
