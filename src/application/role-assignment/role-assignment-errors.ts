import type { CreateGameError } from '@/domain/game/game-errors.ts'
import type { GameId, PlayerId, RoleId, RoleInstanceId } from '@/domain/identifiers.ts'
import type { RoleAssignmentInvariantError } from '@/domain/roles/role-assignment.ts'

export type RoleAssignmentError =
  | Readonly<{ type: 'UNKNOWN_ROLE'; roleId: RoleId }>
  | Readonly<{ type: 'DUPLICATE_ROLE_COUNT'; roleId: RoleId }>
  | Readonly<{ type: 'INVALID_ROLE_COUNT'; roleId: RoleId; count: number }>
  | Readonly<{
      type: 'ASSIGNMENT_COUNT_MISMATCH'
      participatingPlayerCount: number
      roleInstanceCount: number
    }>
  | Readonly<{ type: 'DUPLICATE_PARTICIPATING_PLAYER'; playerId: PlayerId }>
  | Readonly<{
      type: 'IDENTIFIER_COLLISION'
      identityKind: 'game'
      id: GameId
    }>
  | Readonly<{
      type: 'IDENTIFIER_COLLISION'
      identityKind: 'role-instance'
      id: RoleInstanceId
    }>
  | Readonly<{
      type: 'IDENTIFIER_COLLISION'
      identityKind: 'player'
      id: PlayerId
    }>
  | Readonly<{
      type: 'INVALID_IDENTIFIER'
      identityKind: 'game' | 'player' | 'role-instance'
      value: unknown
    }>
  | Readonly<{ type: 'INVALID_RANDOM_VALUE'; value: number }>
  | Readonly<{
      type: 'DOMAIN_ASSIGNMENT_REJECTED'
      error: RoleAssignmentInvariantError
    }>
  | Readonly<{ type: 'ACTIVE_GAME_REJECTED'; error: CreateGameError }>

export type RoleDistributionOperation = 'assign' | 'confirm-all-role-cards-delivered' | 'reassign'

export type RoleDistributionError =
  | RoleAssignmentError
  | Readonly<{
      type: 'INVALID_ROLE_DISTRIBUTION_STATE'
      operation: RoleDistributionOperation
      status: 'unassigned' | 'distributing' | 'confirmed'
    }>
  | Readonly<{ type: 'INVALID_ROLE_DISTRIBUTION_AUTHORITY' }>
  | Readonly<{ type: 'ROLE_CARDS_UNAVAILABLE' }>
  | Readonly<{ type: 'ROLE_CARD_DELIVERY_ALREADY_COMPLETE' }>
  | Readonly<{ type: 'REASSIGNMENT_AFTER_CONFIRMATION' }>
