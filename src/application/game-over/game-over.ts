import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameInvariantError } from '@/domain/game/game-errors.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import type { TerminalFactionResult } from '@/domain/win-conditions/faction-result.ts'
import {
  validateStoredTerminalFactionResult,
  type EvaluatedFactionVictory,
  type StoredFactionResultError,
} from '@/domain/win-conditions/faction-victory.ts'
import { selectHostPlayerRoleViews, type HostPlayerRoleView } from '../player-roles/index.ts'

export type GameOverState = Readonly<{
  game: GameState
  participants: readonly Player[]
  result: TerminalFactionResult
}>

export type InvalidGameOverStateError =
  | Readonly<{ type: 'INVALID_GAME_OVER_GAME'; error: GameInvariantError }>
  | Readonly<{
      type: 'INVALID_GAME_OVER_COUNTERS'
      nightNumber: number
      dayNumber: number
    }>
  | Readonly<{ type: 'INVALID_GAME_OVER_RESULT'; error: StoredFactionResultError }>
  | Readonly<{
      type: 'INVALID_GAME_OVER_PARTICIPANTS'
      reason: 'invalid-player' | 'duplicate-player' | 'game-mismatch'
    }>

export type GameOverPlayerView = HostPlayerRoleView &
  Readonly<{
    alive: boolean
    deathCause:
      | Readonly<{ kind: 'night-death'; nightNumber: number }>
      | Readonly<{ kind: 'day-execution'; dayNumber: number }>
      | Readonly<{
          kind: 'jester-revenge'
          nightNumber: number
          jesterPlayerDisplayLabel: string
        }>
      | Readonly<{
          kind: 'final-killing-role-showdown'
          opponentPlayerDisplayLabel: string
        }>
      | null
    executionerTargetDisplayLabel: string | null
    promotionNightNumber: number | null
    conversionTargetDisplayLabel: string | null
    personalWins: readonly (
      | Readonly<{ kind: 'jester-executed'; dayNumber: number }>
      | Readonly<{
          kind: 'executioner-target-executed'
          dayNumber: number
          targetPlayerDisplayLabel: string
        }>
    )[]
    revengeResults: readonly (
      | Readonly<{
          kind: 'victim-killed'
          nightNumber: number
          victimPlayerDisplayLabel: string
        }>
      | Readonly<{ kind: 'no-survivor'; nightNumber: number }>
    )[]
  }>

export type HostGameOverView = Readonly<{
  heading: 'Town wins' | 'Mafia wins' | 'Serial Killer wins' | 'Draw'
  status: 'town-victory' | 'mafia-victory' | 'serial-killer-victory' | 'draw'
  explanation: string | null
  dayNumber: number
  endedAtLabel: string
  players: readonly GameOverPlayerView[]
}>

export function validateGameOverState(
  state: Readonly<{
    game: GameState
    participants: readonly Player[]
    result: unknown
  }>,
): DomainResult<GameOverState, InvalidGameOverStateError> {
  const baseResult = validateGameOverBase(state.game, state.participants)
  if (!baseResult.ok) {
    return baseResult
  }
  const resultValidation = validateStoredTerminalFactionResult(baseResult.value.game, state.result)
  if (!resultValidation.ok) {
    return fail({ type: 'INVALID_GAME_OVER_RESULT', error: resultValidation.error })
  }
  return succeed(
    deepFreeze({
      game: baseResult.value.game,
      participants: baseResult.value.participants,
      result: resultValidation.value,
    }),
  )
}

// Internal application capability for the value returned directly by the domain operation.
// Persisted or otherwise untrusted results must use validateGameOverState instead.
export function createTrustedGameOverStateFromEvaluation(
  evaluation: Extract<EvaluatedFactionVictory, Readonly<{ status: 'game-over' }>>,
  participants: readonly Player[],
): DomainResult<GameOverState, InvalidGameOverStateError> {
  const baseResult = validateGameOverBase(evaluation.game, participants)
  if (!baseResult.ok) {
    return baseResult
  }
  if (
    baseResult.value.game.phase !== 'game-over' ||
    baseResult.value.game.pendingJesterRevenges.length > 0 ||
    evaluation.result.gameId !== baseResult.value.game.id
  ) {
    return fail({
      type: 'INVALID_GAME_OVER_RESULT',
      error: { type: 'GAME_OVER_RESULT_MISMATCH' },
    })
  }
  return succeed(
    deepFreeze({
      game: baseResult.value.game,
      participants: baseResult.value.participants,
      result: evaluation.result,
    }),
  )
}

export function selectHostGameOverView(state: GameOverState): HostGameOverView {
  const result = state.result
  const hostPlayersResult = selectHostPlayerRoleViews(state.game, state.participants)
  if (!hostPlayersResult.ok) {
    throw new Error('The final host player view could not be derived.')
  }
  return Object.freeze({
    heading: selectResultHeading(result),
    status: result.kind,
    explanation: selectResultExplanation(result),
    dayNumber: state.game.dayNumber,
    endedAtLabel:
      state.game.nightNumber === state.game.dayNumber
        ? `after Day ${String(state.game.dayNumber)}`
        : `at Dawn ${String(state.game.nightNumber)}`,
    players: Object.freeze(
      state.game.players.map((player) => {
        const hostPlayer = requireHostPlayer(hostPlayersResult.value, player.playerId)
        const executionerTarget = state.game.executionerTargets.find(
          (target) => target.executionerPlayerId === player.playerId,
        )
        const promotion = state.game.godfatherPromotions.find(
          (record) => record.playerId === player.playerId,
        )
        const conversion = state.game.executionerConversions.find(
          (record) => record.playerId === player.playerId,
        )
        const personalWins: GameOverPlayerView['personalWins'][number][] = []
        for (const record of state.game.personalWins) {
          if (record.playerId !== player.playerId) {
            continue
          }
          personalWins.push(
            record.kind === 'jester-executed'
              ? Object.freeze({ kind: record.kind, dayNumber: record.dayNumber })
              : Object.freeze({
                  kind: record.kind,
                  dayNumber: record.dayNumber,
                  targetPlayerDisplayLabel: selectPlayerDisplayLabel(
                    state.participants,
                    record.targetPlayerId,
                  ),
                }),
          )
        }
        const revengeResults: GameOverPlayerView['revengeResults'][number][] = []
        for (const record of state.game.jesterRevengeResolutions) {
          if (record.jesterPlayerId !== player.playerId) {
            continue
          }
          revengeResults.push(
            record.kind === 'no-survivor'
              ? Object.freeze({
                  kind: record.kind,
                  nightNumber: record.resolvedAtNightNumber,
                })
              : Object.freeze({
                  kind: record.kind,
                  nightNumber: record.resolvedAtNightNumber,
                  victimPlayerDisplayLabel: selectPlayerDisplayLabel(
                    state.participants,
                    record.victimPlayerId,
                  ),
                }),
          )
        }
        return Object.freeze({
          ...hostPlayer,
          alive: player.alive,
          deathCause: selectGameOverDeathCause(state, player.playerId),
          executionerTargetDisplayLabel:
            executionerTarget === undefined
              ? null
              : selectPlayerDisplayLabel(state.participants, executionerTarget.targetPlayerId),
          promotionNightNumber: promotion?.promotedAtNightNumber ?? null,
          conversionTargetDisplayLabel:
            conversion === undefined
              ? null
              : selectPlayerDisplayLabel(state.participants, conversion.targetPlayerId),
          personalWins: Object.freeze(personalWins),
          revengeResults: Object.freeze(revengeResults),
        })
      }),
    ),
  })
}

function selectResultExplanation(result: TerminalFactionResult): string | null {
  switch (result.kind) {
    case 'town-victory':
    case 'mafia-victory':
    case 'serial-killer-victory':
      return null
    case 'draw':
      switch (result.reason) {
        case 'no-survivors':
          return 'No players survived.'
        case 'opposing-killers-stalemate':
          return 'The final two players could not eliminate each other.'
        case 'opposing-killers-mutual-elimination':
          return 'The final two players eliminated each other.'
      }
  }
}

function validateGameOverBase(
  game: GameState,
  participants: readonly Player[],
): DomainResult<
  Readonly<{ game: GameState; participants: readonly Player[] }>,
  InvalidGameOverStateError
> {
  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'INVALID_GAME_OVER_GAME', error: gameResult.error })
  }
  if (
    gameResult.value.nightNumber < 1 ||
    (gameResult.value.nightNumber !== gameResult.value.dayNumber &&
      gameResult.value.nightNumber !== gameResult.value.dayNumber + 1)
  ) {
    return fail({
      type: 'INVALID_GAME_OVER_COUNTERS',
      nightNumber: gameResult.value.nightNumber,
      dayNumber: gameResult.value.dayNumber,
    })
  }
  const participantsResult = copyParticipants(participants, gameResult.value)
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

function selectResultHeading(result: TerminalFactionResult): HostGameOverView['heading'] {
  switch (result.kind) {
    case 'town-victory':
      return 'Town wins'
    case 'mafia-victory':
      return 'Mafia wins'
    case 'serial-killer-victory':
      return 'Serial Killer wins'
    case 'draw':
      return 'Draw'
  }
}

function selectGameOverDeathCause(
  state: GameOverState,
  selectedPlayerId: PlayerId,
): GameOverPlayerView['deathCause'] {
  const record = state.game.deathRecords.find(
    (candidate) => candidate.playerId === selectedPlayerId,
  )
  if (record === undefined) {
    return null
  }
  switch (record.cause.kind) {
    case 'night-death':
      return Object.freeze({ kind: record.cause.kind, nightNumber: record.cause.nightNumber })
    case 'day-execution':
      return Object.freeze({ kind: record.cause.kind, dayNumber: record.cause.dayNumber })
    case 'jester-revenge':
      return Object.freeze({
        kind: record.cause.kind,
        nightNumber: record.cause.nightNumber,
        jesterPlayerDisplayLabel: selectPlayerDisplayLabel(
          state.participants,
          record.cause.jesterPlayerId,
        ),
      })
    case 'final-killing-role-showdown':
      return Object.freeze({
        kind: record.cause.kind,
        opponentPlayerDisplayLabel: selectPlayerDisplayLabel(
          state.participants,
          record.cause.opponentPlayerId,
        ),
      })
  }
}

function requireHostPlayer(
  players: readonly HostPlayerRoleView[],
  selectedPlayerId: PlayerId,
): HostPlayerRoleView {
  const player = players.find((candidate) => candidate.playerId === selectedPlayerId)
  if (player === undefined) {
    throw new Error('A final host player is absent from the canonical view.')
  }
  return player
}

function copyParticipants(
  participants: readonly Player[],
  game: GameState,
): DomainResult<
  readonly Player[],
  Extract<InvalidGameOverStateError, Readonly<{ type: 'INVALID_GAME_OVER_PARTICIPANTS' }>>
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
      return fail({ type: 'INVALID_GAME_OVER_PARTICIPANTS', reason: 'invalid-player' })
    }
    if (seen.has(participant.id)) {
      return fail({ type: 'INVALID_GAME_OVER_PARTICIPANTS', reason: 'duplicate-player' })
    }
    seen.add(participant.id)
    copied.push(Object.freeze({ ...participant }))
  }
  if (
    copied.length !== game.players.length ||
    copied.some((participant, index) => participant.id !== game.players[index]?.playerId)
  ) {
    return fail({ type: 'INVALID_GAME_OVER_PARTICIPANTS', reason: 'game-mismatch' })
  }
  return succeed(Object.freeze(copied))
}

function selectPlayerDisplayLabel(
  participants: readonly Player[],
  selectedPlayerId: PlayerId,
): string {
  const index = participants.findIndex((participant) => participant.id === selectedPlayerId)
  const participant = participants[index]
  if (participant === undefined) {
    throw new Error('A game-over player is absent from the participant roster.')
  }
  const duplicateName = participants.some(
    (candidate, candidateIndex) => candidateIndex !== index && candidate.name === participant.name,
  )
  return duplicateName ? `${participant.name} (Player ${String(index + 1)})` : participant.name
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
