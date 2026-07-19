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
import { selectActiveRoleId } from '@/domain/neutral/executioner-conversion.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { ROLE_IDS, findRoleDefinition } from '@/domain/roles/role-registry.ts'

import type { DawnWorkflow } from '../night-completion/index.ts'

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

export type PublicDayPlayerView = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
  status: 'alive' | 'dead'
  publicRoleDisplayName: string | null
  publiclyRevealedMayor: boolean
  hasThreeVoteReminder: boolean
}>

export type PublicDayDiscussionView = Readonly<{
  dayNumber: number
  dayLabel: string
  livingPlayers: readonly PublicDayPlayerView[]
  deadPlayers: readonly PublicDayPlayerView[]
  mayorRevealAvailable: boolean
}>

export type MayorRevealCandidateView = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
}>

export type HostRoleDayPlayerView = Readonly<{
  playerDisplayLabel: string
  status: 'alive' | 'dead'
  activeRoleDisplayName: string
  originallyAssignedRoleDisplayName: string | null
  publicRole: Readonly<{
    displayName: string
    status: 'publicly-revealed-mayor' | 'revealed-on-death'
  }> | null
}>

export type HostRoleDayView = Readonly<{
  players: readonly HostRoleDayPlayerView[]
}>

export type HostRoleDayViewError =
  | InvalidDayDiscussionStateError
  | Readonly<{
      type: 'INVALID_ACTIVE_DAY_ROLE'
      playerId: PlayerId
    }>

export function createDayDiscussionState(
  dawn: DawnWorkflow,
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

export function selectPublicDayDiscussionView(state: DayDiscussionState): PublicDayDiscussionView {
  const validatedState = requireValidDayDiscussionState(state)
  const rows = validatedState.game.players.map((player) => {
    const publicRole =
      player.publiclyRevealedRoleId === null
        ? undefined
        : findRoleDefinition(player.publiclyRevealedRoleId)
    if (player.publiclyRevealedRoleId !== null && publicRole === undefined) {
      throw new Error('A public day role is absent from the canonical role registry.')
    }
    const publiclyRevealedMayor =
      player.publiclyRevealedRoleId === ROLE_IDS.mayor && player.role.roleId === ROLE_IDS.mayor

    return Object.freeze({
      playerId: player.playerId,
      playerDisplayLabel: selectPlayerDisplayLabel(validatedState.participants, player.playerId),
      status: player.alive ? ('alive' as const) : ('dead' as const),
      publicRoleDisplayName:
        publicRole === undefined ? null : getRoleInstanceDisplayName(player.role, publicRole),
      publiclyRevealedMayor,
      hasThreeVoteReminder: player.alive && publiclyRevealedMayor,
    })
  })

  return Object.freeze({
    dayNumber: validatedState.game.dayNumber,
    dayLabel: `Day ${String(validatedState.game.dayNumber)}`,
    livingPlayers: Object.freeze(rows.filter((row) => row.status === 'alive')),
    deadPlayers: Object.freeze(rows.filter((row) => row.status === 'dead')),
    mayorRevealAvailable: selectMayorRevealCandidates(validatedState).length > 0,
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

export function selectHostRoleDayView(
  state: DayDiscussionState,
): DomainResult<HostRoleDayView, HostRoleDayViewError> {
  const stateResult = validateDayDiscussionState(state)
  if (!stateResult.ok) {
    return stateResult
  }

  const rows: HostRoleDayPlayerView[] = []
  for (const player of stateResult.value.game.players) {
    const originalRole = findRoleDefinition(player.role.roleId)
    const activeRoleId = selectActiveRoleId(stateResult.value.game, player.playerId)
    const activeRole = activeRoleId === null ? undefined : findRoleDefinition(activeRoleId)
    const convertedExecutioner =
      player.role.roleId === ROLE_IDS.executioner && activeRoleId === ROLE_IDS.jester
    if (
      originalRole === undefined ||
      activeRole === undefined ||
      (activeRoleId !== player.role.roleId && !convertedExecutioner)
    ) {
      return fail({ type: 'INVALID_ACTIVE_DAY_ROLE', playerId: player.playerId })
    }

    const publicRole =
      player.publiclyRevealedRoleId === null
        ? undefined
        : findRoleDefinition(player.publiclyRevealedRoleId)
    if (player.publiclyRevealedRoleId !== null && publicRole === undefined) {
      return fail({ type: 'INVALID_ACTIVE_DAY_ROLE', playerId: player.playerId })
    }
    const publiclyRevealedMayor =
      player.publiclyRevealedRoleId === ROLE_IDS.mayor && player.role.roleId === ROLE_IDS.mayor

    rows.push(
      Object.freeze({
        playerDisplayLabel: selectPlayerDisplayLabel(
          stateResult.value.participants,
          player.playerId,
        ),
        status: player.alive ? ('alive' as const) : ('dead' as const),
        activeRoleDisplayName: convertedExecutioner
          ? activeRole.name
          : getRoleInstanceDisplayName(player.role, activeRole),
        originallyAssignedRoleDisplayName: convertedExecutioner
          ? getRoleInstanceDisplayName(player.role, originalRole)
          : null,
        publicRole:
          publicRole === undefined
            ? null
            : Object.freeze({
                displayName:
                  player.publiclyRevealedRoleId === player.role.roleId
                    ? getRoleInstanceDisplayName(player.role, publicRole)
                    : publicRole.name,
                status: publiclyRevealedMayor
                  ? ('publicly-revealed-mayor' as const)
                  : ('revealed-on-death' as const),
              }),
      }),
    )
  }

  return succeed(Object.freeze({ players: Object.freeze(rows) }))
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
