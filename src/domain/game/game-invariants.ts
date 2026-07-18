import {
  playerId,
  roleInstanceId,
  type PlayerId,
  type RoleId,
  type RoleInstanceId,
} from '../identifiers.ts'
import { copyAndValidateExecutionerTargets } from '../executioner/executioner-target-invariants.ts'
import { isGamePhase } from '../phases/game-phase.ts'
import type { GamePlayer } from '../players/game-player.ts'
import type { Player } from '../players/player.ts'
import type { RoleDefinition } from '../roles/role-definition.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import { fail, succeed, type DomainResult } from './domain-result.ts'
import type { DoctorPreviousTarget } from './doctor-previous-target.ts'
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
    doctorPreviousTargets: [],
    executionerTargets: [],
    executionerBriefingStatus: 'not-started',
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
  if (!isRuntimeIdentity(candidate.id)) {
    return invalidIdentity('gameId', candidate.id)
  }

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

  const doctorHistoryResult = copyDoctorPreviousTargets(
    candidate.doctorPreviousTargets,
    playerResult.value,
    candidate.nightNumber,
  )

  if (!doctorHistoryResult.ok) {
    return doctorHistoryResult
  }

  const executionerBriefingStatus = candidate.executionerBriefingStatus
  if (
    executionerBriefingStatus !== 'not-started' &&
    executionerBriefingStatus !== 'not-required' &&
    executionerBriefingStatus !== 'pending' &&
    executionerBriefingStatus !== 'completed'
  ) {
    return fail({
      type: 'INVALID_EXECUTIONER_TARGETS',
      value: executionerBriefingStatus,
    })
  }

  const executionerTargetResult = copyAndValidateExecutionerTargets(
    candidate.executionerTargets,
    candidate.id,
    playerResult.value,
    candidate.phase,
    executionerBriefingStatus,
  )

  if (!executionerTargetResult.ok) {
    return executionerTargetResult
  }

  return succeed({
    id: candidate.id,
    phase: candidate.phase,
    players: playerResult.value,
    roleDefinitions: roleDefinitionResult.value.definitions,
    settings: settingsResult.value,
    nightNumber: candidate.nightNumber,
    dayNumber: candidate.dayNumber,
    doctorPreviousTargets: doctorHistoryResult.value,
    executionerTargets: executionerTargetResult.value,
    executionerBriefingStatus,
  })
}

function copyDoctorPreviousTargets(
  candidate: unknown,
  gamePlayers: readonly GamePlayer[],
  currentNightNumber: number,
): DomainResult<readonly DoctorPreviousTarget[], GameInvariantError> {
  if (!isUnknownArray(candidate)) {
    return fail({ type: 'INVALID_DOCTOR_HISTORY', value: candidate })
  }

  const copiedHistory: DoctorPreviousTarget[] = []
  const roleInstanceIds = new Set<RoleInstanceId>()
  let previousPlayerIndex = -1

  for (const [index, entry] of candidate.entries()) {
    if (!isUnknownRecord(entry)) {
      return fail({
        type: 'INVALID_DOCTOR_HISTORY_ENTRY',
        index,
        field: 'doctorRoleInstanceId',
        value: undefined,
      })
    }

    const doctorRoleInstanceId =
      'doctorRoleInstanceId' in entry ? entry.doctorRoleInstanceId : undefined
    const targetPlayerId = 'targetPlayerId' in entry ? entry.targetPlayerId : undefined
    const nightNumber = 'nightNumber' in entry ? entry.nightNumber : undefined

    if (typeof doctorRoleInstanceId !== 'string') {
      return fail({
        type: 'INVALID_DOCTOR_HISTORY_ENTRY',
        index,
        field: 'doctorRoleInstanceId',
        value: doctorRoleInstanceId,
      })
    }

    if (typeof targetPlayerId !== 'string') {
      return fail({
        type: 'INVALID_DOCTOR_HISTORY_ENTRY',
        index,
        field: 'targetPlayerId',
        value: targetPlayerId,
      })
    }

    if (typeof nightNumber !== 'number') {
      return fail({
        type: 'INVALID_DOCTOR_HISTORY_ENTRY',
        index,
        field: 'nightNumber',
        value: nightNumber,
      })
    }

    const validatedDoctorRoleInstanceId = roleInstanceId(doctorRoleInstanceId)
    const validatedTargetPlayerId = playerId(targetPlayerId)

    const doctor = gamePlayers.find(
      (player) => player.role.instanceId === validatedDoctorRoleInstanceId,
    )

    if (doctor === undefined) {
      return fail({
        type: 'UNKNOWN_DOCTOR_ROLE_INSTANCE',
        doctorRoleInstanceId: validatedDoctorRoleInstanceId,
      })
    }

    if (doctor.role.roleId !== ROLE_IDS.doctor) {
      return fail({
        type: 'NON_DOCTOR_HISTORY_ENTRY',
        doctorRoleInstanceId: validatedDoctorRoleInstanceId,
        roleId: doctor.role.roleId,
      })
    }

    if (!gamePlayers.some((player) => player.playerId === validatedTargetPlayerId)) {
      return fail({
        type: 'UNKNOWN_DOCTOR_TARGET',
        doctorRoleInstanceId: validatedDoctorRoleInstanceId,
        targetPlayerId: validatedTargetPlayerId,
      })
    }

    if (!Number.isSafeInteger(nightNumber) || nightNumber < 0 || nightNumber > currentNightNumber) {
      return fail({
        type: 'INVALID_DOCTOR_HISTORY_NIGHT',
        doctorRoleInstanceId: validatedDoctorRoleInstanceId,
        nightNumber,
        currentNightNumber,
      })
    }

    if (roleInstanceIds.has(validatedDoctorRoleInstanceId)) {
      return fail({
        type: 'DUPLICATE_DOCTOR_HISTORY',
        doctorRoleInstanceId: validatedDoctorRoleInstanceId,
      })
    }

    const playerIndex = gamePlayers.indexOf(doctor)
    if (playerIndex < previousPlayerIndex) {
      return fail({
        type: 'DOCTOR_HISTORY_ORDER_MISMATCH',
        doctorRoleInstanceId: validatedDoctorRoleInstanceId,
        expectedIndex: previousPlayerIndex,
        actualIndex: playerIndex,
      })
    }

    roleInstanceIds.add(validatedDoctorRoleInstanceId)
    previousPlayerIndex = playerIndex
    copiedHistory.push(
      Object.freeze({
        doctorRoleInstanceId: validatedDoctorRoleInstanceId,
        targetPlayerId: validatedTargetPlayerId,
        nightNumber,
      }),
    )
  }

  return succeed(Object.freeze(copiedHistory))
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

  for (const [index, definition] of definitions.entries()) {
    if (!isRuntimeIdentity(definition.id)) {
      return invalidIdentity('roleDefinitionId', definition.id, index)
    }

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

  for (const [index, candidate] of candidates.entries()) {
    if (!isRuntimeIdentity(candidate.playerId)) {
      return invalidIdentity('playerId', candidate.playerId, index)
    }

    if (playerIds.has(candidate.playerId)) {
      return fail({ type: 'DUPLICATE_PARTICIPATING_PLAYER', playerId: candidate.playerId })
    }

    playerIds.add(candidate.playerId)

    if (candidate.role === null) {
      return fail({ type: 'MISSING_ROLE_ASSIGNMENT', playerId: candidate.playerId })
    }

    if (!isRuntimeIdentity(candidate.role.instanceId)) {
      return invalidIdentity('roleInstanceId', candidate.role.instanceId, index)
    }

    if (!isRuntimeIdentity(candidate.role.roleId)) {
      return invalidIdentity('roleId', candidate.role.roleId, index)
    }

    if (typeof candidate.alive !== 'boolean') {
      return fail({
        type: 'INVALID_GAME_STATE',
        reason: {
          type: 'INVALID_PLAYER_ALIVE_STATE',
          playerId: candidate.playerId,
          value: candidate.alive,
        },
      })
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
      typeof candidate.publiclyRevealedRoleId !== 'string'
    ) {
      return fail({
        type: 'INVALID_PUBLIC_ROLE_REVEAL',
        playerId: candidate.playerId,
        reason: 'invalid-type',
        value: candidate.publiclyRevealedRoleId,
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

    if (
      candidate.publiclyRevealedRoleId !== null &&
      candidate.publiclyRevealedRoleId !== candidate.role.roleId
    ) {
      return fail({
        type: 'INVALID_PUBLIC_ROLE_REVEAL',
        playerId: candidate.playerId,
        reason: 'assigned-role-mismatch',
        assignedRoleId: candidate.role.roleId,
        revealedRoleId: candidate.publiclyRevealedRoleId,
      })
    }

    gamePlayers.push({
      playerId: candidate.playerId,
      role: { ...candidate.role },
      alive: candidate.alive,
      publiclyRevealedRoleId: candidate.publiclyRevealedRoleId,
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

function isRuntimeIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function invalidIdentity(
  field: Extract<
    Extract<GameInvariantError, Readonly<{ type: 'INVALID_GAME_STATE' }>>['reason'],
    Readonly<{ type: 'INVALID_IDENTITY' }>
  >['field'],
  value: unknown,
  index?: number,
): DomainResult<never, GameInvariantError> {
  return fail({
    type: 'INVALID_GAME_STATE',
    reason: {
      type: 'INVALID_IDENTITY',
      field,
      ...(index === undefined ? {} : { index }),
      value,
    },
  })
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
