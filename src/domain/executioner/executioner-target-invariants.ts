import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameState } from '../game/game-state.ts'
import {
  gameId,
  playerId,
  roleInstanceId,
  type GameId,
  type RoleInstanceId,
} from '../identifiers.ts'
import type { GamePlayer } from '../players/game-player.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import type { ExecutionerTargetInvariantError } from './executioner-target-errors.ts'
import type { ExecutionerTarget } from './executioner-target-model.ts'

export function copyAndValidateExecutionerTargets(
  candidate: unknown,
  expectedGameId: GameId,
  players: readonly GamePlayer[],
  phase: GameState['phase'],
  briefingStatus: unknown,
): DomainResult<readonly ExecutionerTarget[], ExecutionerTargetInvariantError> {
  if (
    briefingStatus !== 'not-started' &&
    briefingStatus !== 'not-required' &&
    briefingStatus !== 'pending' &&
    briefingStatus !== 'completed'
  ) {
    return fail({
      type: 'INVALID_EXECUTIONER_TARGETS',
      value: briefingStatus,
    })
  }
  if (!Array.isArray(candidate)) {
    return fail({ type: 'INVALID_EXECUTIONER_TARGETS', value: candidate })
  }

  const copiedTargets: ExecutionerTarget[] = []
  const seenOwnerRoleInstanceIds = new Set<RoleInstanceId>()

  for (const [index, targetCandidate] of candidate.entries()) {
    if (!isUnknownRecord(targetCandidate)) {
      return invalidTargetRecord(index, 'gameId', undefined)
    }

    const recordResult = copyTargetRecord(targetCandidate, index)
    if (!recordResult.ok) {
      return recordResult
    }
    const target = recordResult.value

    if (target.gameId !== expectedGameId) {
      return fail({
        type: 'EXECUTIONER_TARGET_GAME_MISMATCH',
        expectedGameId,
        actualGameId: target.gameId,
      })
    }

    const owner = players.find((player) => player.playerId === target.executionerPlayerId)
    if (owner === undefined) {
      return fail({
        type: 'UNKNOWN_EXECUTIONER_PLAYER',
        executionerPlayerId: target.executionerPlayerId,
      })
    }

    const roleOwner = players.find(
      (player) => player.role.instanceId === target.executionerRoleInstanceId,
    )
    if (roleOwner === undefined) {
      return fail({
        type: 'UNKNOWN_EXECUTIONER_ROLE_INSTANCE',
        executionerRoleInstanceId: target.executionerRoleInstanceId,
      })
    }

    if (owner.role.instanceId !== target.executionerRoleInstanceId) {
      return fail({
        type: 'EXECUTIONER_ROLE_INSTANCE_MISMATCH',
        executionerPlayerId: owner.playerId,
        executionerRoleInstanceId: target.executionerRoleInstanceId,
        actualRoleInstanceId: owner.role.instanceId,
      })
    }

    if (
      owner.role.roleId !== ROLE_IDS.executioner ||
      roleOwner.role.roleId !== ROLE_IDS.executioner
    ) {
      return fail({
        type: 'NON_EXECUTIONER_TARGET_OWNER',
        executionerPlayerId: owner.playerId,
        executionerRoleInstanceId: target.executionerRoleInstanceId,
      })
    }

    if (seenOwnerRoleInstanceIds.has(target.executionerRoleInstanceId)) {
      return fail({
        type: 'DUPLICATE_EXECUTIONER_TARGET',
        executionerRoleInstanceId: target.executionerRoleInstanceId,
      })
    }

    const selectedTarget = players.find((player) => player.playerId === target.targetPlayerId)
    if (selectedTarget === undefined) {
      return fail({
        type: 'UNKNOWN_EXECUTIONER_TARGET_PLAYER',
        targetPlayerId: target.targetPlayerId,
      })
    }
    if (!isTownPlayer(selectedTarget)) {
      return fail({
        type: 'INELIGIBLE_EXECUTIONER_TARGET',
        targetPlayerId: target.targetPlayerId,
      })
    }

    seenOwnerRoleInstanceIds.add(target.executionerRoleInstanceId)
    copiedTargets.push(Object.freeze(target))
  }

  const executioners = selectExecutionersInCanonicalOrder(players)
  if (phase === 'roster' || phase === 'setup' || phase === 'role-distribution') {
    if (briefingStatus !== 'not-started') {
      return fail({ type: 'EXECUTIONER_BRIEFING_STATUS_MISMATCH', status: briefingStatus })
    }
    return copiedTargets.length === 0
      ? succeed(Object.freeze(copiedTargets))
      : fail({ type: 'EXECUTIONER_TARGETS_BEFORE_FINALIZATION' })
  }

  if (phase === 'executioner-briefing') {
    if (executioners.length === 0 || briefingStatus !== 'pending') {
      return fail({ type: 'EXECUTIONER_BRIEFING_STATUS_MISMATCH', status: briefingStatus })
    }
  } else if (briefingStatus !== (executioners.length === 0 ? 'not-required' : 'completed')) {
    return fail({ type: 'EXECUTIONER_BRIEFING_STATUS_MISMATCH', status: briefingStatus })
  }

  if (executioners.length === 0 && copiedTargets.length > 0) {
    const unexpectedTarget = copiedTargets[0]
    if (unexpectedTarget === undefined) {
      throw new Error('A non-empty Executioner target array did not contain a first record.')
    }
    return fail({
      type: 'UNEXPECTED_EXECUTIONER_TARGET',
      executionerRoleInstanceId: unexpectedTarget.executionerRoleInstanceId,
    })
  }

  for (const [expectedIndex, executioner] of executioners.entries()) {
    const actualTargetIndex = copiedTargets.findIndex(
      (target) => target.executionerRoleInstanceId === executioner.role.instanceId,
    )
    if (actualTargetIndex === -1) {
      return fail({
        type: 'MISSING_EXECUTIONER_TARGET',
        executionerPlayerId: executioner.playerId,
        executionerRoleInstanceId: executioner.role.instanceId,
      })
    }
    if (actualTargetIndex !== expectedIndex) {
      return fail({
        type: 'EXECUTIONER_TARGET_ORDER_MISMATCH',
        executionerRoleInstanceId: executioner.role.instanceId,
        expectedIndex,
        actualIndex: actualTargetIndex,
      })
    }
  }

  if (copiedTargets.length > executioners.length) {
    const unexpectedTarget = copiedTargets[executioners.length]
    if (unexpectedTarget === undefined) {
      throw new Error('Executioner target count exceeded owners without an extra record.')
    }
    return fail({
      type: 'UNEXPECTED_EXECUTIONER_TARGET',
      executionerRoleInstanceId: unexpectedTarget.executionerRoleInstanceId,
    })
  }

  return succeed(Object.freeze(copiedTargets))
}

export function orderExecutionerTargets(
  targets: readonly ExecutionerTarget[],
  players: readonly GamePlayer[],
): readonly ExecutionerTarget[] {
  const ownerOrder = new Map(
    selectExecutionersInCanonicalOrder(players).map((player, index) => [
      player.role.instanceId,
      index,
    ]),
  )

  return Object.freeze(
    [...targets].sort(
      (left, right) =>
        (ownerOrder.get(left.executionerRoleInstanceId) ?? Number.MAX_SAFE_INTEGER) -
        (ownerOrder.get(right.executionerRoleInstanceId) ?? Number.MAX_SAFE_INTEGER),
    ),
  )
}

export function selectExecutionersInCanonicalOrder(
  players: readonly GamePlayer[],
): readonly GamePlayer[] {
  const rosterIndex = new Map(players.map((player, index) => [player.playerId, index]))

  return [...players]
    .filter((player) => player.role.roleId === ROLE_IDS.executioner)
    .sort((left, right) => {
      const ordinalDifference = (left.role.ordinal ?? 1) - (right.role.ordinal ?? 1)
      return ordinalDifference !== 0
        ? ordinalDifference
        : (rosterIndex.get(left.playerId) ?? Number.MAX_SAFE_INTEGER) -
            (rosterIndex.get(right.playerId) ?? Number.MAX_SAFE_INTEGER)
    })
}

export function isTownPlayer(player: GamePlayer): boolean {
  return findRoleDefinition(player.role.roleId)?.faction === 'town'
}

function copyTargetRecord(
  candidate: Readonly<Record<string, unknown>>,
  index: number,
): DomainResult<ExecutionerTarget, ExecutionerTargetInvariantError> {
  const candidateGameId = candidate.gameId
  if (typeof candidateGameId !== 'string' || candidateGameId.trim().length === 0) {
    return invalidTargetRecord(index, 'gameId', candidateGameId)
  }
  const candidateExecutionerPlayerId = candidate.executionerPlayerId
  if (
    typeof candidateExecutionerPlayerId !== 'string' ||
    candidateExecutionerPlayerId.trim().length === 0
  ) {
    return invalidTargetRecord(index, 'executionerPlayerId', candidateExecutionerPlayerId)
  }
  const candidateExecutionerRoleInstanceId = candidate.executionerRoleInstanceId
  if (
    typeof candidateExecutionerRoleInstanceId !== 'string' ||
    candidateExecutionerRoleInstanceId.trim().length === 0
  ) {
    return invalidTargetRecord(
      index,
      'executionerRoleInstanceId',
      candidateExecutionerRoleInstanceId,
    )
  }
  const candidateTargetPlayerId = candidate.targetPlayerId
  if (typeof candidateTargetPlayerId !== 'string' || candidateTargetPlayerId.trim().length === 0) {
    return invalidTargetRecord(index, 'targetPlayerId', candidateTargetPlayerId)
  }

  return succeed({
    gameId: gameId(candidateGameId),
    executionerPlayerId: playerId(candidateExecutionerPlayerId),
    executionerRoleInstanceId: roleInstanceId(candidateExecutionerRoleInstanceId),
    targetPlayerId: playerId(candidateTargetPlayerId),
  })
}

function invalidTargetRecord(
  index: number,
  field: Extract<
    ExecutionerTargetInvariantError,
    Readonly<{ type: 'INVALID_EXECUTIONER_TARGET_RECORD' }>
  >['field'],
  value: unknown,
): DomainResult<never, ExecutionerTargetInvariantError> {
  return fail({ type: 'INVALID_EXECUTIONER_TARGET_RECORD', index, field, value })
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
