import type { GameId, PlayerId, RoleInstanceId } from '../identifiers.ts'

export type ExecutionerTargetInvariantError =
  | Readonly<{ type: 'INVALID_EXECUTIONER_TARGETS'; value: unknown }>
  | Readonly<{
      type: 'INVALID_EXECUTIONER_TARGET_RECORD'
      index: number
      field: 'gameId' | 'executionerPlayerId' | 'executionerRoleInstanceId' | 'targetPlayerId'
      value: unknown
    }>
  | Readonly<{
      type: 'EXECUTIONER_TARGET_GAME_MISMATCH'
      expectedGameId: GameId
      actualGameId: GameId
    }>
  | Readonly<{
      type: 'UNKNOWN_EXECUTIONER_PLAYER'
      executionerPlayerId: PlayerId
    }>
  | Readonly<{
      type: 'UNKNOWN_EXECUTIONER_ROLE_INSTANCE'
      executionerRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'EXECUTIONER_ROLE_INSTANCE_MISMATCH'
      executionerPlayerId: PlayerId
      executionerRoleInstanceId: RoleInstanceId
      actualRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'NON_EXECUTIONER_TARGET_OWNER'
      executionerPlayerId: PlayerId
      executionerRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'DUPLICATE_EXECUTIONER_TARGET'
      executionerRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'UNKNOWN_EXECUTIONER_TARGET_PLAYER'
      targetPlayerId: PlayerId
    }>
  | Readonly<{
      type: 'INELIGIBLE_EXECUTIONER_TARGET'
      targetPlayerId: PlayerId
    }>
  | Readonly<{
      type: 'EXECUTIONER_TARGET_ORDER_MISMATCH'
      executionerRoleInstanceId: RoleInstanceId
      expectedIndex: number
      actualIndex: number
    }>
  | Readonly<{
      type: 'MISSING_EXECUTIONER_TARGET'
      executionerPlayerId: PlayerId
      executionerRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'UNEXPECTED_EXECUTIONER_TARGET'
      executionerRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{ type: 'EXECUTIONER_TARGETS_BEFORE_FINALIZATION' }>
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_STATUS_MISMATCH'
      status: 'not-started' | 'not-required' | 'pending' | 'completed'
    }>
