import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import { createGame } from '@/domain/game/game-invariants.ts'
import type { GamePlayerCandidate, GameState } from '@/domain/game/game-state.ts'
import type { GameId, PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'
import type { RandomSource } from '@/domain/randomness/random-source.ts'
import {
  assignDuplicateRoleOrdinals,
  type PlayerRoleAssignment,
} from '@/domain/roles/role-assignment.ts'
import { ROLE_REGISTRY } from '@/domain/roles/role-registry.ts'

import type { ValidatedGameSetup } from '../game-setup/game-setup-validation.ts'
import { expandRoleCounts } from './expand-role-counts.ts'
import type { RoleAssignmentIdentitySource } from './identity-source.ts'
import type { RoleAssignmentError } from './role-assignment-errors.ts'
import { shuffleRoleInstances } from './shuffle-role-instances.ts'

export type RoleAssignmentDependencies = Readonly<{
  randomSource: RandomSource
  identitySource: RoleAssignmentIdentitySource
}>

export type RoleAssignmentIdentifierReservations = Readonly<{
  gameIds: readonly GameId[]
  roleInstanceIds: readonly RoleInstanceId[]
}>

const NO_RESERVED_IDENTIFIERS: RoleAssignmentIdentifierReservations = {
  gameIds: [],
  roleInstanceIds: [],
}

export function assignRolesToValidatedSetup(
  setup: ValidatedGameSetup,
  dependencies: RoleAssignmentDependencies,
  reservedIdentifiers: RoleAssignmentIdentifierReservations = NO_RESERVED_IDENTIFIERS,
): DomainResult<GameState, RoleAssignmentError> {
  const playerIds = new Set<PlayerId>()

  for (const player of setup.participatingPlayers) {
    if (playerIds.has(player.id)) {
      return fail({ type: 'DUPLICATE_PARTICIPATING_PLAYER', playerId: player.id })
    }

    playerIds.add(player.id)
  }

  const reservedIdentityValues = new Set<string>([
    ...reservedIdentifiers.gameIds,
    ...reservedIdentifiers.roleInstanceIds,
  ])
  const expansionResult = expandRoleCounts(
    setup.roleCounts,
    setup.participatingPlayers.length,
    dependencies.identitySource,
    reservedIdentityValues,
  )

  if (!expansionResult.ok) {
    return expansionResult
  }

  const shuffleResult = shuffleRoleInstances(expansionResult.value, dependencies.randomSource)

  if (!shuffleResult.ok) {
    return shuffleResult
  }

  const unnumberedAssignments: PlayerRoleAssignment[] = []

  for (const [playerIndex, player] of setup.participatingPlayers.entries()) {
    const role = shuffleResult.value[playerIndex]

    if (role === undefined) {
      return fail({
        type: 'ASSIGNMENT_COUNT_MISMATCH',
        participatingPlayerCount: setup.participatingPlayers.length,
        roleInstanceCount: shuffleResult.value.length,
      })
    }

    unnumberedAssignments.push({ playerId: player.id, role })
  }

  const ordinalResult = assignDuplicateRoleOrdinals(unnumberedAssignments)

  if (!ordinalResult.ok) {
    return fail({ type: 'DOMAIN_ASSIGNMENT_REJECTED', error: ordinalResult.error })
  }

  const nextGameId = dependencies.identitySource.nextGameId()

  if (!isValidIdentifier(nextGameId)) {
    return fail({ type: 'INVALID_IDENTIFIER', identityKind: 'game', value: nextGameId })
  }

  const currentRoleInstanceIds = new Set(
    ordinalResult.value.map((assignment) => String(assignment.role.instanceId)),
  )

  if (reservedIdentityValues.has(nextGameId) || currentRoleInstanceIds.has(nextGameId)) {
    return fail({ type: 'IDENTIFIER_COLLISION', identityKind: 'game', id: nextGameId })
  }

  const gamePlayers: GamePlayerCandidate[] = ordinalResult.value.map((assignment) => ({
    playerId: assignment.playerId,
    role: assignment.role,
    alive: true,
    publiclyRevealedRoleId: null,
    mayorRevealed: false,
  }))
  const selectedRoleIds = new Set(ordinalResult.value.map((assignment) => assignment.role.roleId))
  const roleDefinitions = ROLE_REGISTRY.filter((role) => selectedRoleIds.has(role.id)).map(
    ({ id, name, faction }) => ({ id, name, faction }),
  )
  const gameResult = createGame({
    id: nextGameId,
    roster: setup.participatingPlayers,
    players: gamePlayers,
    roleDefinitions,
    settings: setup.settings,
  })

  return gameResult.ok
    ? succeed(gameResult.value)
    : fail({ type: 'ACTIVE_GAME_REJECTED', error: gameResult.error })
}

function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
