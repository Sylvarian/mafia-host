import {
  beginDayDiscussion,
  confirmMayorReveal,
  type BeginDayDiscussionError,
  type ConfirmMayorRevealError,
} from '@/domain/day/day-discussion.ts'
import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameInvariantError } from '@/domain/game/game-errors.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { ROLE_IDS, findRoleDefinition } from '@/domain/roles/role-registry.ts'

import type { DawnWorkflow } from '../night-completion/index.ts'
import {
  groupHostPlayersByActiveAlignment,
  selectHostPlayerRoleViews,
  type HostPlayerRoleView,
} from '../player-roles/index.ts'

export type DayDiscussionState = Readonly<{
  game: GameState
  participants: readonly Player[]
}>

export type InvalidDayDiscussionStateError =
  | Readonly<{
      type: 'INVALID_DAY_DISCUSSION_GAME'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'DAY_DISCUSSION_PHASE_MISMATCH'
      currentPhase: GameState['phase']
    }>
  | Readonly<{
      type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS'
      reason: 'invalid-player' | 'duplicate-player' | 'game-mismatch'
    }>
  | Readonly<{
      type: 'INVALID_DAY_DISCUSSION_COUNTERS'
      nightNumber: number
      dayNumber: number
    }>

export type BeginDayDiscussionWorkflowError =
  | BeginDayDiscussionError
  | Extract<
      InvalidDayDiscussionStateError,
      Readonly<{ type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS' }>
    >

export type ConfirmMayorRevealWorkflowError =
  ConfirmMayorRevealError | InvalidDayDiscussionStateError

export type DayVotingRequirementsView = Readonly<{
  livingPlayerCount: number
  votesToPutOnTrial: number
}>

export type MayorRevealCandidateView = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
}>

export type DayPlayerView = HostPlayerRoleView &
  Readonly<{
    announcedRole: Readonly<{
      displayName: string
      status: 'publicly-revealed-mayor' | 'revealed-on-death'
    }> | null
    deathCause:
      | Readonly<{ kind: 'night-death'; nightNumber: number }>
      | Readonly<{ kind: 'day-execution'; dayNumber: number }>
      | Readonly<{ kind: 'jester-revenge'; nightNumber: number }>
      | Readonly<{ kind: 'final-killing-role-showdown' }>
      | null
  }>

export type DayDiscussionView = Readonly<{
  dayNumber: number
  dayLabel: string
  mayorRevealAvailable: boolean
  votingRequirements: DayVotingRequirementsView
  groups: ReturnType<typeof groupHostPlayersByActiveAlignment<DayPlayerView>>
}>

export type DayDiscussionViewError =
  | InvalidDayDiscussionStateError
  | Readonly<{
      type: 'INVALID_ACTIVE_DAY_ROLE'
      playerId: PlayerId
    }>

export function createDayDiscussionState(
  dawn: Pick<DawnWorkflow, 'status' | 'game' | 'participants' | 'dawnAnnouncement'>,
): DomainResult<DayDiscussionState, BeginDayDiscussionWorkflowError> {
  const participantResult = copyAndValidateParticipants(dawn.participants, dawn.game)
  if (!participantResult.ok) {
    return participantResult
  }
  const transitionResult = beginDayDiscussion(dawn.game, dawn.dawnAnnouncement)
  if (!transitionResult.ok) {
    return transitionResult
  }
  const stateResult = validateDayDiscussionState({
    game: transitionResult.value,
    participants: participantResult.value,
  })
  if (stateResult.ok) {
    return succeed(stateResult.value)
  }
  switch (stateResult.error.type) {
    case 'INVALID_DAY_DISCUSSION_GAME':
      return fail({
        type: 'INVALID_DAY_TRANSITION_GAME',
        error: stateResult.error.error,
      })
    case 'DAY_DISCUSSION_PHASE_MISMATCH':
      return fail({
        type: 'INVALID_DAY_TRANSITION_PHASE',
        currentPhase: stateResult.error.currentPhase,
      })
    case 'INVALID_DAY_DISCUSSION_PARTICIPANTS':
      return fail(stateResult.error)
    case 'INVALID_DAY_DISCUSSION_COUNTERS':
      return fail({
        type: 'INVALID_DAY_COUNTER_STATE',
        nightNumber: stateResult.error.nightNumber,
        dayNumber: stateResult.error.dayNumber,
      })
  }
}

export function confirmMayorRevealDuringDay(
  state: DayDiscussionState,
  selectedPlayerId: PlayerId,
): DomainResult<DayDiscussionState, ConfirmMayorRevealWorkflowError> {
  const stateResult = validateDayDiscussionState(state)
  if (!stateResult.ok) {
    return stateResult
  }
  const revealResult = confirmMayorReveal(stateResult.value.game, selectedPlayerId)
  if (!revealResult.ok) {
    return revealResult
  }

  return succeed(
    Object.freeze({
      game: revealResult.value,
      participants: stateResult.value.participants,
    }),
  )
}

export function validateDayDiscussionState(
  state: DayDiscussionState,
): DomainResult<DayDiscussionState, InvalidDayDiscussionStateError> {
  const gameResult = validateGameState(state.game)
  if (!gameResult.ok) {
    return fail({ type: 'INVALID_DAY_DISCUSSION_GAME', error: gameResult.error })
  }
  if (gameResult.value.phase !== 'day-discussion') {
    return fail({
      type: 'DAY_DISCUSSION_PHASE_MISMATCH',
      currentPhase: gameResult.value.phase,
    })
  }
  if (
    gameResult.value.dayNumber < 1 ||
    gameResult.value.nightNumber !== gameResult.value.dayNumber
  ) {
    return fail({
      type: 'INVALID_DAY_DISCUSSION_COUNTERS',
      nightNumber: gameResult.value.nightNumber,
      dayNumber: gameResult.value.dayNumber,
    })
  }
  const participantResult = copyAndValidateParticipants(state.participants, gameResult.value)
  if (!participantResult.ok) {
    return participantResult
  }
  return succeed(
    Object.freeze({
      game: gameResult.value,
      participants: participantResult.value,
    }),
  )
}

export function selectDayVotingRequirements(livingPlayerCount: number): DayVotingRequirementsView {
  if (!Number.isSafeInteger(livingPlayerCount) || livingPlayerCount < 0) {
    throw new RangeError('Living player count must be a non-negative safe integer.')
  }
  return Object.freeze({
    livingPlayerCount,
    votesToPutOnTrial: Math.floor(livingPlayerCount / 2) + 1,
  })
}

export function selectMayorRevealCandidates(
  state: DayDiscussionState,
): readonly MayorRevealCandidateView[] {
  const validatedState = requireValidDayDiscussionState(state)
  const rosterOrder = new Map(
    validatedState.game.players.map((player, index) => [player.playerId, index]),
  )

  return Object.freeze(
    validatedState.game.players
      .filter(
        (player) =>
          player.alive &&
          player.role.roleId === ROLE_IDS.mayor &&
          player.publiclyRevealedRoleId === null,
      )
      .sort((left, right) => {
        const ordinalDifference = (left.role.ordinal ?? 1) - (right.role.ordinal ?? 1)
        return ordinalDifference !== 0
          ? ordinalDifference
          : (rosterOrder.get(left.playerId) ?? Number.MAX_SAFE_INTEGER) -
              (rosterOrder.get(right.playerId) ?? Number.MAX_SAFE_INTEGER)
      })
      .map((player) =>
        Object.freeze({
          playerId: player.playerId,
          playerDisplayLabel: selectPlayerDisplayLabel(
            validatedState.participants,
            player.playerId,
          ),
        }),
      ),
  )
}

export function selectDayDiscussionView(
  state: DayDiscussionState,
): DomainResult<DayDiscussionView, DayDiscussionViewError> {
  const stateResult = validateDayDiscussionState(state)
  if (!stateResult.ok) {
    return stateResult
  }

  const hostRowsResult = selectHostPlayerRoleViews(
    stateResult.value.game,
    stateResult.value.participants,
  )
  if (!hostRowsResult.ok) {
    const fallbackPlayer = stateResult.value.game.players[0]
    if (fallbackPlayer === undefined) {
      throw new Error('A validated day game has no participating players.')
    }
    return fail({
      type: 'INVALID_ACTIVE_DAY_ROLE',
      playerId: hostRowsResult.error.playerId ?? fallbackPlayer.playerId,
    })
  }

  const rows: DayPlayerView[] = []
  for (const hostRow of hostRowsResult.value) {
    const player = stateResult.value.game.players.find(
      (candidate) => candidate.playerId === hostRow.playerId,
    )
    if (player === undefined) {
      return fail({ type: 'INVALID_ACTIVE_DAY_ROLE', playerId: hostRow.playerId })
    }

    const announcedRole =
      player.publiclyRevealedRoleId === null
        ? undefined
        : findRoleDefinition(player.publiclyRevealedRoleId)
    if (player.publiclyRevealedRoleId !== null && announcedRole === undefined) {
      return fail({ type: 'INVALID_ACTIVE_DAY_ROLE', playerId: player.playerId })
    }
    const publiclyRevealedMayor =
      player.publiclyRevealedRoleId === ROLE_IDS.mayor && player.role.roleId === ROLE_IDS.mayor

    rows.push(
      Object.freeze({
        playerId: hostRow.playerId,
        playerDisplayLabel: hostRow.playerDisplayLabel,
        status: hostRow.status,
        activeRoleDisplayName: hostRow.activeRoleDisplayName,
        originallyAssignedRoleDisplayName: hostRow.originallyAssignedRoleDisplayName,
        alignment: hostRow.alignment,
        alignmentDisplayName: hostRow.alignmentDisplayName,
        announcedRole:
          announcedRole === undefined
            ? null
            : Object.freeze({
                displayName:
                  player.publiclyRevealedRoleId === player.role.roleId
                    ? getRoleInstanceDisplayName(player.role, announcedRole)
                    : announcedRole.name,
                status: publiclyRevealedMayor
                  ? ('publicly-revealed-mayor' as const)
                  : ('revealed-on-death' as const),
              }),
        deathCause: selectDayDeathCause(stateResult.value.game, player.playerId),
      }),
    )
  }

  return succeed(
    Object.freeze({
      dayNumber: stateResult.value.game.dayNumber,
      dayLabel: `Day ${String(stateResult.value.game.dayNumber)}`,
      mayorRevealAvailable: selectMayorRevealCandidates(stateResult.value).length > 0,
      votingRequirements: selectDayVotingRequirements(
        rows.filter((row) => row.status === 'alive').length,
      ),
      groups: Object.freeze(groupHostPlayersByActiveAlignment(rows)),
    }),
  )
}

function selectDayDeathCause(
  game: GameState,
  selectedPlayerId: PlayerId,
): DayPlayerView['deathCause'] {
  const record = game.deathRecords.find((candidate) => candidate.playerId === selectedPlayerId)
  if (record === undefined) {
    return null
  }
  switch (record.cause.kind) {
    case 'night-death':
      return Object.freeze({ kind: record.cause.kind, nightNumber: record.cause.nightNumber })
    case 'day-execution':
      return Object.freeze({ kind: record.cause.kind, dayNumber: record.cause.dayNumber })
    case 'jester-revenge':
      return Object.freeze({ kind: record.cause.kind, nightNumber: record.cause.nightNumber })
    case 'final-killing-role-showdown':
      return Object.freeze({ kind: record.cause.kind })
  }
}

function requireValidDayDiscussionState(state: DayDiscussionState): DayDiscussionState {
  const result = validateDayDiscussionState(state)
  if (!result.ok) {
    throw new Error(`Invalid day discussion state: ${result.error.type}.`)
  }
  return result.value
}

function copyAndValidateParticipants(
  participants: readonly Player[],
  game: GameState,
): DomainResult<
  readonly Player[],
  Extract<InvalidDayDiscussionStateError, Readonly<{ type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS' }>>
> {
  const copiedParticipants: Player[] = []
  const seen = new Set<PlayerId>()
  for (const participant of participants) {
    if (
      typeof participant.id !== 'string' ||
      participant.id.trim().length === 0 ||
      typeof participant.name !== 'string' ||
      participant.name.trim().length === 0 ||
      typeof participant.playing !== 'boolean' ||
      !participant.playing
    ) {
      return fail({
        type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS',
        reason: 'invalid-player',
      })
    }
    if (seen.has(participant.id)) {
      return fail({
        type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS',
        reason: 'duplicate-player',
      })
    }
    seen.add(participant.id)
    copiedParticipants.push(Object.freeze({ ...participant }))
  }

  if (
    copiedParticipants.length !== game.players.length ||
    copiedParticipants.some(
      (participant, index) => participant.id !== game.players[index]?.playerId,
    )
  ) {
    return fail({
      type: 'INVALID_DAY_DISCUSSION_PARTICIPANTS',
      reason: 'game-mismatch',
    })
  }
  return succeed(Object.freeze(copiedParticipants))
}

function selectPlayerDisplayLabel(
  participants: readonly Player[],
  selectedPlayerId: PlayerId,
): string {
  const index = participants.findIndex((participant) => participant.id === selectedPlayerId)
  const participant = participants[index]
  if (participant === undefined) {
    throw new Error('A day player is absent from the canonical participant roster.')
  }
  const duplicateName = participants.some(
    (candidate, candidateIndex) => candidateIndex !== index && candidate.name === participant.name,
  )
  return duplicateName ? `${participant.name} (Player ${String(index + 1)})` : participant.name
}
