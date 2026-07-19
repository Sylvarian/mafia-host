import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameState } from '../game/game-state.ts'
import type { GameId, PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'
import { selectBlockedRoleInstanceIds } from '../resolution/role-block-status.ts'
import type { NightActionKind } from './night-action-kind.ts'

export type SubmittedNightAction = Readonly<{
  actorPlayerId: PlayerId
  actorRoleInstanceId: RoleInstanceId
  actorRoleId: RoleId
  actionKind: NightActionKind
  targetPlayerId: PlayerId
}>

export type PreviousNightTarget = Readonly<{
  actorRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId | null
}>

export type CollectedNightActions = Readonly<{
  gameId: GameId
  nightNumber: number
  actions: readonly SubmittedNightAction[]
}>

export type NightActionValidationError =
  | Readonly<{ type: 'UNKNOWN_ACTOR'; actorPlayerId: PlayerId }>
  | Readonly<{ type: 'DEAD_ACTOR'; actorPlayerId: PlayerId }>
  | Readonly<{ type: 'UNKNOWN_ROLE_INSTANCE'; actorRoleInstanceId: RoleInstanceId }>
  | Readonly<{
      type: 'ROLE_INSTANCE_DOES_NOT_BELONG_TO_ACTOR'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'ACTOR_ROLE_MISMATCH'
      actorPlayerId: PlayerId
      expectedRoleId: RoleId
      submittedRoleId: RoleId
    }>
  | Readonly<{ type: 'ROLE_HAS_NO_NIGHT_ACTION'; actorRoleId: RoleId }>
  | Readonly<{
      type: 'WRONG_ACTION_KIND'
      actorRoleId: RoleId
      expectedActionKind: NightActionKind
      submittedActionKind: NightActionKind
    }>
  | Readonly<{ type: 'UNKNOWN_TARGET'; targetPlayerId: PlayerId }>
  | Readonly<{ type: 'DEAD_TARGET'; targetPlayerId: PlayerId }>
  | Readonly<{
      type: 'INVALID_SELF_TARGET'
      actorPlayerId: PlayerId
      actorRoleId: RoleId
    }>
  | Readonly<{
      type: 'DOCTOR_REPEATED_PREVIOUS_TARGET'
      actorRoleInstanceId: RoleInstanceId
      targetPlayerId: PlayerId
    }>

export type NightActionBatchError =
  | NightActionValidationError
  | Readonly<{
      type: 'INVALID_ACTION_BATCH'
      reason: 'invalid-batch' | 'invalid-action'
      index?: number
    }>
  | Readonly<{
      type: 'UNEXPECTED_ACTION'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'DUPLICATE_ACTOR_ACTION'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'MISSING_REQUIRED_ACTION'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'BLOCKED_ACTOR_SUBMITTED_ACTION'
      actorPlayerId: PlayerId
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'DUPLICATE_PREVIOUS_TARGET_CONTEXT'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'UNKNOWN_PREVIOUS_TARGET_ROLE_INSTANCE'
      actorRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'PREVIOUS_TARGET_ROLE_NOT_DOCTOR'
      actorRoleInstanceId: RoleInstanceId
      actorRoleId: RoleId
    }>
  | Readonly<{
      type: 'UNKNOWN_PREVIOUS_TARGET'
      actorRoleInstanceId: RoleInstanceId
      targetPlayerId: PlayerId
    }>
  | Readonly<{
      type: 'ACTION_BATCH_GAME_MISMATCH'
      reason: 'game-id' | 'night-number' | 'game-phase'
    }>

export function createSubmittedNightAction(
  game: GameState,
  action: SubmittedNightAction,
  previousTargetId: PlayerId | null,
): DomainResult<SubmittedNightAction, NightActionValidationError> {
  const actor = game.players.find((player) => player.playerId === action.actorPlayerId)

  if (actor === undefined) {
    return fail({ type: 'UNKNOWN_ACTOR', actorPlayerId: action.actorPlayerId })
  }

  if (!actor.alive) {
    return fail({ type: 'DEAD_ACTOR', actorPlayerId: action.actorPlayerId })
  }

  const roleInstanceOwner = game.players.find(
    (player) => player.role.instanceId === action.actorRoleInstanceId,
  )

  if (roleInstanceOwner === undefined) {
    return fail({
      type: 'UNKNOWN_ROLE_INSTANCE',
      actorRoleInstanceId: action.actorRoleInstanceId,
    })
  }

  if (roleInstanceOwner.playerId !== actor.playerId) {
    return fail({
      type: 'ROLE_INSTANCE_DOES_NOT_BELONG_TO_ACTOR',
      actorPlayerId: actor.playerId,
      actorRoleInstanceId: action.actorRoleInstanceId,
    })
  }

  if (actor.role.roleId !== action.actorRoleId) {
    return fail({
      type: 'ACTOR_ROLE_MISMATCH',
      actorPlayerId: actor.playerId,
      expectedRoleId: actor.role.roleId,
      submittedRoleId: action.actorRoleId,
    })
  }

  const activeRoleId = selectActiveRoleId(game, actor.playerId)
  const role = activeRoleId === null ? undefined : findRoleDefinition(activeRoleId)

  if (role === undefined || !role.nightAction.hasNightAction) {
    return fail({ type: 'ROLE_HAS_NO_NIGHT_ACTION', actorRoleId: actor.role.roleId })
  }

  if (role.nightAction.actionKind !== action.actionKind) {
    return fail({
      type: 'WRONG_ACTION_KIND',
      actorRoleId: actor.role.roleId,
      expectedActionKind: role.nightAction.actionKind,
      submittedActionKind: action.actionKind,
    })
  }

  const target = game.players.find((player) => player.playerId === action.targetPlayerId)

  if (target === undefined) {
    return fail({ type: 'UNKNOWN_TARGET', targetPlayerId: action.targetPlayerId })
  }

  if (!target.alive) {
    return fail({ type: 'DEAD_TARGET', targetPlayerId: target.playerId })
  }

  if (target.playerId === actor.playerId) {
    const doctorMaySelfTarget =
      actor.role.roleId === ROLE_IDS.doctor && game.settings.doctorCanSelfProtect

    if (!doctorMaySelfTarget) {
      return fail({
        type: 'INVALID_SELF_TARGET',
        actorPlayerId: actor.playerId,
        actorRoleId: actor.role.roleId,
      })
    }
  }

  if (
    actor.role.roleId === ROLE_IDS.doctor &&
    game.settings.doctorCannotRepeatPreviousTarget &&
    previousTargetId === target.playerId
  ) {
    return fail({
      type: 'DOCTOR_REPEATED_PREVIOUS_TARGET',
      actorRoleInstanceId: actor.role.instanceId,
      targetPlayerId: target.playerId,
    })
  }

  return succeed(
    Object.freeze({
      actorPlayerId: action.actorPlayerId,
      actorRoleInstanceId: action.actorRoleInstanceId,
      actorRoleId: action.actorRoleId,
      actionKind: action.actionKind,
      targetPlayerId: action.targetPlayerId,
    }),
  )
}

export function isNightActionRequiredForPlayer(game: GameState, actorPlayerId: PlayerId): boolean {
  const actor = game.players.find((player) => player.playerId === actorPlayerId)

  if (actor === undefined || !actor.alive) {
    return false
  }

  const activeRoleId = selectActiveRoleId(game, actor.playerId)
  const role = activeRoleId === null ? undefined : findRoleDefinition(activeRoleId)

  if (role?.nightAction.hasNightAction !== true) {
    return false
  }

  const isSkippedFirstNightKillingRole =
    game.nightNumber === 1 &&
    !game.settings.allowFirstNightKills &&
    (activeRoleId === ROLE_IDS.godfather || activeRoleId === ROLE_IDS.serialKiller)

  return !isSkippedFirstNightKillingRole
}

export function createCollectedNightActions(
  game: GameState,
  actions: readonly SubmittedNightAction[],
  previousTargets: readonly PreviousNightTarget[] = [],
): DomainResult<CollectedNightActions, NightActionBatchError> {
  if (game.phase !== 'night-action-collection') {
    return fail({ type: 'ACTION_BATCH_GAME_MISMATCH', reason: 'game-phase' })
  }

  const previousTargetResult = validatePreviousNightTargets(game, previousTargets)

  if (!previousTargetResult.ok) {
    return previousTargetResult
  }

  const previousTargetsByRoleInstance = new Map(
    previousTargetResult.value.map((target) => [target.actorRoleInstanceId, target.targetPlayerId]),
  )

  const actorPlayerIds = new Set<PlayerId>()
  const actorRoleInstanceIds = new Set<RoleInstanceId>()
  const copiedActions: SubmittedNightAction[] = []

  for (const action of actions) {
    if (
      actorPlayerIds.has(action.actorPlayerId) ||
      actorRoleInstanceIds.has(action.actorRoleInstanceId)
    ) {
      return fail({
        type: 'DUPLICATE_ACTOR_ACTION',
        actorPlayerId: action.actorPlayerId,
        actorRoleInstanceId: action.actorRoleInstanceId,
      })
    }

    const actionResult = createSubmittedNightAction(
      game,
      action,
      previousTargetsByRoleInstance.get(action.actorRoleInstanceId) ?? null,
    )

    if (!actionResult.ok) {
      return actionResult
    }

    if (!isNightActionRequiredForPlayer(game, actionResult.value.actorPlayerId)) {
      return fail({
        type: 'UNEXPECTED_ACTION',
        actorPlayerId: actionResult.value.actorPlayerId,
        actorRoleInstanceId: actionResult.value.actorRoleInstanceId,
      })
    }

    actorPlayerIds.add(action.actorPlayerId)
    actorRoleInstanceIds.add(action.actorRoleInstanceId)
    copiedActions.push(actionResult.value)
  }

  const blockedRoleInstanceIds = selectBlockedRoleInstanceIds(game, copiedActions)
  for (const player of game.players) {
    if (
      isNightActionRequiredForPlayer(game, player.playerId) &&
      !blockedRoleInstanceIds.has(player.role.instanceId) &&
      !actorRoleInstanceIds.has(player.role.instanceId)
    ) {
      return fail({
        type: 'MISSING_REQUIRED_ACTION',
        actorPlayerId: player.playerId,
        actorRoleInstanceId: player.role.instanceId,
      })
    }
  }

  const blockedAction = copiedActions.find((action) =>
    blockedRoleInstanceIds.has(action.actorRoleInstanceId),
  )
  if (blockedAction !== undefined) {
    return fail({
      type: 'BLOCKED_ACTOR_SUBMITTED_ACTION',
      actorPlayerId: blockedAction.actorPlayerId,
      actorRoleInstanceId: blockedAction.actorRoleInstanceId,
    })
  }

  return succeed(
    Object.freeze({
      gameId: game.id,
      nightNumber: game.nightNumber,
      actions: Object.freeze(copiedActions),
    }),
  )
}

export function validateCollectedNightActions(
  game: GameState,
  batch: CollectedNightActions,
  previousTargets: readonly PreviousNightTarget[] = [],
): DomainResult<CollectedNightActions, NightActionBatchError> {
  const batchCandidate: unknown = batch
  if (
    !isUnknownRecord(batchCandidate) ||
    typeof batchCandidate.gameId !== 'string' ||
    !Number.isSafeInteger(batchCandidate.nightNumber) ||
    !isUnknownArray(batchCandidate.actions)
  ) {
    return fail({ type: 'INVALID_ACTION_BATCH', reason: 'invalid-batch' })
  }

  for (const [index, action] of batchCandidate.actions.entries()) {
    if (
      !isUnknownRecord(action) ||
      typeof action.actorPlayerId !== 'string' ||
      typeof action.actorRoleInstanceId !== 'string' ||
      typeof action.actorRoleId !== 'string' ||
      typeof action.actionKind !== 'string' ||
      typeof action.targetPlayerId !== 'string'
    ) {
      return fail({ type: 'INVALID_ACTION_BATCH', reason: 'invalid-action', index })
    }
  }

  if (batch.gameId !== game.id) {
    return fail({ type: 'ACTION_BATCH_GAME_MISMATCH', reason: 'game-id' })
  }

  if (batch.nightNumber !== game.nightNumber) {
    return fail({ type: 'ACTION_BATCH_GAME_MISMATCH', reason: 'night-number' })
  }

  const validationResult = createCollectedNightActions(game, batch.actions, previousTargets)
  return validationResult
}

export function validatePreviousNightTargets(
  game: GameState,
  previousTargets: readonly PreviousNightTarget[],
): DomainResult<readonly PreviousNightTarget[], NightActionBatchError> {
  const roleInstanceIds = new Set<RoleInstanceId>()
  const copiedTargets: PreviousNightTarget[] = []

  for (const previousTarget of previousTargets) {
    if (roleInstanceIds.has(previousTarget.actorRoleInstanceId)) {
      return fail({
        type: 'DUPLICATE_PREVIOUS_TARGET_CONTEXT',
        actorRoleInstanceId: previousTarget.actorRoleInstanceId,
      })
    }

    const actor = game.players.find(
      (player) => player.role.instanceId === previousTarget.actorRoleInstanceId,
    )

    if (actor === undefined) {
      return fail({
        type: 'UNKNOWN_PREVIOUS_TARGET_ROLE_INSTANCE',
        actorRoleInstanceId: previousTarget.actorRoleInstanceId,
      })
    }

    if (actor.role.roleId !== ROLE_IDS.doctor) {
      return fail({
        type: 'PREVIOUS_TARGET_ROLE_NOT_DOCTOR',
        actorRoleInstanceId: actor.role.instanceId,
        actorRoleId: actor.role.roleId,
      })
    }

    if (
      previousTarget.targetPlayerId !== null &&
      !game.players.some((player) => player.playerId === previousTarget.targetPlayerId)
    ) {
      return fail({
        type: 'UNKNOWN_PREVIOUS_TARGET',
        actorRoleInstanceId: actor.role.instanceId,
        targetPlayerId: previousTarget.targetPlayerId,
      })
    }

    roleInstanceIds.add(actor.role.instanceId)
    copiedTargets.push(Object.freeze({ ...previousTarget }))
  }

  return succeed(Object.freeze(copiedTargets))
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
