import type { PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import { isGamePhase } from '../phases/game-phase.ts'
import type { GamePlayer } from '../players/game-player.ts'
import type { Player } from '../players/player.ts'
import type { RoleDefinition } from '../roles/role-definition.ts'
import { fail, succeed, type DomainResult } from './domain-result.ts'
import type { CreateGameError, GameInvariantError } from './game-errors.ts'
import { validateGameSettings } from './game-settings.ts'
import type {
  CreateGameInput,
  GamePlayerCandidate,
  GameState,
  GameStateCandidate,
} from './game-state.ts'

export function createGame(input: CreateGameInput): DomainResult<GameState, CreateGameError> {
  const rosterResult = validateRosterAssignments(input.roster, input.players)

  if (!rosterResult.ok) {
    return rosterResult
  }

  const gameResult = validateGameState({
    id: input.id,
    phase: 'role-distribution',
    players: input.players,
    roleDefinitions: input.roleDefinitions,
    settings: input.settings,
    nightNumber: 0,
    dayNumber: 0,
  })

  if (!gameResult.ok) {
    return gameResult
  }

  const orderResult = validateParticipatingRosterOrder(input.roster, gameResult.value.players)

  return orderResult.ok ? gameResult : orderResult
}

export function validateGameState(
  candidate: GameStateCandidate,
): DomainResult<GameState, GameInvariantError> {
  if (!isGamePhase(candidate.phase)) {
    return fail({
      type: 'INVALID_GAME_STATE',
      reason: { type: 'INVALID_PHASE', phase: candidate.phase },
    })
  }

  if (!isNonNegativeInteger(candidate.nightNumber)) {
    return fail({
      type: 'INVALID_GAME_STATE',
      reason: { type: 'INVALID_COUNTER', counter: 'night', value: candidate.nightNumber },
    })
  }

  if (!isNonNegativeInteger(candidate.dayNumber)) {
    return fail({
      type: 'INVALID_GAME_STATE',
      reason: { type: 'INVALID_COUNTER', counter: 'day', value: candidate.dayNumber },
    })
  }

  const settingsResult = validateGameSettings(candidate.settings)

  if (!settingsResult.ok) {
    return fail({ type: 'INVALID_GAME_STATE', reason: settingsResult.error })
  }

  if (candidate.players.length === 0) {
    return fail({ type: 'NO_PARTICIPATING_PLAYERS' })
  }

  const roleDefinitionResult = copyRoleDefinitions(candidate.roleDefinitions)

  if (!roleDefinitionResult.ok) {
    return roleDefinitionResult
  }

  const playerResult = copyGamePlayers(candidate.players, roleDefinitionResult.value.roleIds)

  if (!playerResult.ok) {
    return playerResult
  }

  const participatingPlayerIds = new Set(
    playerResult.value.map((gamePlayer) => gamePlayer.playerId),
  )

  for (const gamePlayer of playerResult.value) {
    if (
      gamePlayer.executionerTargetId !== null &&
      !participatingPlayerIds.has(gamePlayer.executionerTargetId)
    ) {
      return fail({
        type: 'UNKNOWN_PLAYER_REFERENCE',
        playerId: gamePlayer.executionerTargetId,
        reference: 'executioner-target',
      })
    }
  }

  return succeed({
    id: candidate.id,
    phase: candidate.phase,
    players: playerResult.value,
    roleDefinitions: roleDefinitionResult.value.definitions,
    settings: settingsResult.value,
    nightNumber: candidate.nightNumber,
    dayNumber: candidate.dayNumber,
  })
}

function validateRosterAssignments(
  roster: readonly Player[],
  gamePlayers: readonly GamePlayerCandidate[],
): DomainResult<true, CreateGameError> {
  const rosterById = new Map<PlayerId, Player>()

  for (const player of roster) {
    if (rosterById.has(player.id)) {
      return fail({ type: 'DUPLICATE_ROSTER_PLAYER', playerId: player.id })
    }

    rosterById.set(player.id, player)
  }

  const assignedPlayerIds = new Set<PlayerId>()

  for (const gamePlayer of gamePlayers) {
    const rosterPlayer = rosterById.get(gamePlayer.playerId)

    if (rosterPlayer === undefined) {
      return fail({
        type: 'UNKNOWN_PLAYER_REFERENCE',
        playerId: gamePlayer.playerId,
        reference: 'game-player',
      })
    }

    if (!rosterPlayer.playing) {
      return fail({ type: 'NON_PARTICIPATING_PLAYER', playerId: gamePlayer.playerId })
    }

    assignedPlayerIds.add(gamePlayer.playerId)
  }

  for (const rosterPlayer of roster) {
    if (rosterPlayer.playing && !assignedPlayerIds.has(rosterPlayer.id)) {
      return fail({ type: 'MISSING_PARTICIPATING_PLAYER', playerId: rosterPlayer.id })
    }
  }

  return succeed(true)
}

function validateParticipatingRosterOrder(
  roster: readonly Player[],
  gamePlayers: readonly GamePlayer[],
): DomainResult<true, CreateGameError> {
  const participatingRoster = roster.filter((player) => player.playing)

  for (const [index, expectedPlayer] of participatingRoster.entries()) {
    const actualPlayer = gamePlayers[index]

    if (actualPlayer !== undefined && actualPlayer.playerId !== expectedPlayer.id) {
      return fail({
        type: 'PARTICIPATING_PLAYER_ORDER_MISMATCH',
        index,
        expectedPlayerId: expectedPlayer.id,
        actualPlayerId: actualPlayer.playerId,
      })
    }
  }

  return succeed(true)
}

function copyRoleDefinitions(
  definitions: readonly RoleDefinition[],
): DomainResult<
  Readonly<{ definitions: readonly RoleDefinition[]; roleIds: ReadonlySet<RoleId> }>,
  GameInvariantError
> {
  const roleIds = new Set<RoleId>()
  const copiedDefinitions: RoleDefinition[] = []

  for (const definition of definitions) {
    if (roleIds.has(definition.id)) {
      return fail({ type: 'DUPLICATE_ROLE_DEFINITION', roleId: definition.id })
    }

    roleIds.add(definition.id)
    copiedDefinitions.push({ ...definition })
  }

  return succeed({ definitions: copiedDefinitions, roleIds })
}

function copyGamePlayers(
  candidates: readonly GamePlayerCandidate[],
  roleIds: ReadonlySet<RoleId>,
): DomainResult<readonly GamePlayer[], GameInvariantError> {
  const playerIds = new Set<PlayerId>()
  const roleInstanceIds = new Set<RoleInstanceId>()
  const gamePlayers: GamePlayer[] = []

  for (const candidate of candidates) {
    if (playerIds.has(candidate.playerId)) {
      return fail({ type: 'DUPLICATE_PARTICIPATING_PLAYER', playerId: candidate.playerId })
    }

    playerIds.add(candidate.playerId)

    if (candidate.role === null) {
      return fail({ type: 'MISSING_ROLE_ASSIGNMENT', playerId: candidate.playerId })
    }

    if (roleInstanceIds.has(candidate.role.instanceId)) {
      return fail({
        type: 'DUPLICATE_ROLE_ASSIGNMENT',
        roleInstanceId: candidate.role.instanceId,
      })
    }

    roleInstanceIds.add(candidate.role.instanceId)

    if (!roleIds.has(candidate.role.roleId)) {
      return fail({
        type: 'UNKNOWN_ROLE_REFERENCE',
        playerId: candidate.playerId,
        roleId: candidate.role.roleId,
        reference: 'assigned-role',
      })
    }

    if (
      candidate.role.ordinal !== null &&
      (!Number.isInteger(candidate.role.ordinal) || candidate.role.ordinal < 1)
    ) {
      return fail({
        type: 'INVALID_GAME_STATE',
        reason: {
          type: 'INVALID_ROLE_ORDINAL',
          roleInstanceId: candidate.role.instanceId,
          ordinal: candidate.role.ordinal,
        },
      })
    }

    if (
      candidate.publiclyRevealedRoleId !== null &&
      !roleIds.has(candidate.publiclyRevealedRoleId)
    ) {
      return fail({
        type: 'UNKNOWN_ROLE_REFERENCE',
        playerId: candidate.playerId,
        roleId: candidate.publiclyRevealedRoleId,
        reference: 'public-role-reveal',
      })
    }

    gamePlayers.push({
      playerId: candidate.playerId,
      role: { ...candidate.role },
      alive: candidate.alive,
      publiclyRevealedRoleId: candidate.publiclyRevealedRoleId,
      mayorRevealed: candidate.mayorRevealed,
      executionerTargetId: candidate.executionerTargetId,
      personalWin: candidate.personalWin,
    })
  }

  const ordinalResult = validateRoleOrdinals(gamePlayers)

  return ordinalResult.ok ? succeed(gamePlayers) : ordinalResult
}

function validateRoleOrdinals(
  gamePlayers: readonly GamePlayer[],
): DomainResult<true, GameInvariantError> {
  // `GamePlayer.role` is the immutable role assigned at game creation. Later conversions belong in
  // separate state, so deaths or conversions must not renumber these assignment ordinals.
  const roleCounts = new Map<RoleId, number>()

  for (const gamePlayer of gamePlayers) {
    roleCounts.set(gamePlayer.role.roleId, (roleCounts.get(gamePlayer.role.roleId) ?? 0) + 1)
  }

  const nextOrdinalByRole = new Map<RoleId, number>()

  for (const gamePlayer of gamePlayers) {
    const roleCount = roleCounts.get(gamePlayer.role.roleId) ?? 0
    const expectedOrdinal =
      roleCount === 1 ? null : (nextOrdinalByRole.get(gamePlayer.role.roleId) ?? 0) + 1

    if (gamePlayer.role.ordinal !== expectedOrdinal) {
      return fail({
        type: 'INVALID_GAME_STATE',
        reason: {
          type: 'ROLE_ORDINAL_MISMATCH',
          roleInstanceId: gamePlayer.role.instanceId,
          roleId: gamePlayer.role.roleId,
          ordinal: gamePlayer.role.ordinal,
          expectedOrdinal,
        },
      })
    }

    if (expectedOrdinal !== null) {
      nextOrdinalByRole.set(gamePlayer.role.roleId, expectedOrdinal)
    }
  }

  return succeed(true)
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}
