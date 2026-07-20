import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameInvariantError } from '@/domain/game/game-errors.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'
import type { TerminalFactionResult } from '@/domain/win-conditions/faction-result.ts'
import {
  validateStoredTerminalFactionResult,
  type EvaluatedFactionVictory,
  type StoredFactionResultError,
} from '@/domain/win-conditions/faction-victory.ts'

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

export type PublicGameOverPlayerView = Readonly<{
  playerDisplayLabel: string
  alive: boolean
  revealedRoleDisplayName: string | null
}>

export type PublicGameOverView = Readonly<{
  heading: 'Town wins' | 'Mafia wins' | 'Serial Killer wins' | 'Draw'
  status: 'town-victory' | 'mafia-victory' | 'serial-killer-victory' | 'draw'
  explanation: string | null
  dayNumber: number
  endedAtLabel: string
  players: readonly PublicGameOverPlayerView[]
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

export function selectPublicGameOverView(state: GameOverState): PublicGameOverView {
  const result = state.result
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
        const revealedRole =
          player.publiclyRevealedRoleId === null
            ? undefined
            : findRoleDefinition(player.publiclyRevealedRoleId)
        if (player.publiclyRevealedRoleId !== null && revealedRole === undefined) {
          throw new Error('A public game-over role is absent from the canonical registry.')
        }
        return Object.freeze({
          playerDisplayLabel: selectPlayerDisplayLabel(state.participants, player.playerId),
          alive: player.alive,
          revealedRoleDisplayName:
            revealedRole === undefined
              ? null
              : getRoleInstanceDisplayName(player.role, revealedRole),
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

function selectResultHeading(result: TerminalFactionResult): PublicGameOverView['heading'] {
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
