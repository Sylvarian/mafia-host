import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameState } from '../game/game-state.ts'
import type { RoleId } from '../identifiers.ts'
import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS, findRoleDefinition } from '../roles/role-registry.ts'
import type { InvalidResolutionRoleMetadataError } from './night-resolution-errors.ts'
import type { FrameRecord, SheriffResult } from './night-resolution-models.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'

export function resolveSheriffResults(
  game: GameState,
  effectiveActions: readonly SubmittedNightAction[],
  frames: readonly FrameRecord[],
): DomainResult<readonly SheriffResult[], InvalidResolutionRoleMetadataError> {
  const framedPlayerIds = new Set(frames.map((frame) => frame.framedPlayerId))
  let results: readonly SheriffResult[] = []

  for (const action of effectiveActions) {
    if (action.actorRoleId !== ROLE_IDS.sheriff) {
      continue
    }

    const target = game.players.find((player) => player.playerId === action.targetPlayerId)
    if (target === undefined) {
      throw new Error(`Validated Sheriff target ${action.targetPlayerId} is missing.`)
    }

    const suspicionResult = isSuspiciousToSheriff(
      selectActiveRoleId(game, target.playerId) ?? target.role.roleId,
      framedPlayerIds.has(target.playerId),
      game.settings.godfatherAppearsSuspiciousToSheriff,
    )
    if (!suspicionResult.ok) {
      return suspicionResult
    }

    results = [
      ...results,
      Object.freeze({
        status: suspicionResult.value ? 'suspicious' : 'not-suspicious',
        actorPlayerId: action.actorPlayerId,
        actorRoleInstanceId: action.actorRoleInstanceId,
        targetPlayerId: action.targetPlayerId,
      }),
    ]
  }

  return succeed(Object.freeze(results))
}

export function isSuspiciousToSheriff(
  targetRoleId: RoleId,
  framed: boolean,
  godfatherAppearsSuspicious: boolean,
): DomainResult<boolean, InvalidResolutionRoleMetadataError> {
  const targetRole = findRoleDefinition(targetRoleId)
  if (targetRole === undefined) {
    return fail({
      type: 'INVALID_RESOLUTION_ROLE_METADATA',
      roleId: targetRoleId,
      reason: 'missing-registry-entry',
    })
  }

  if (framed || targetRoleId === ROLE_IDS.serialKiller) {
    return succeed(true)
  }

  if (targetRoleId === ROLE_IDS.godfather) {
    return succeed(godfatherAppearsSuspicious)
  }

  switch (targetRoleId) {
    case ROLE_IDS.framer:
    case ROLE_IDS.consort:
    case ROLE_IDS.consigliere:
      return succeed(true)
    case ROLE_IDS.doctor:
    case ROLE_IDS.sheriff:
    case ROLE_IDS.detective:
    case ROLE_IDS.investigator:
    case ROLE_IDS.mayor:
    case ROLE_IDS.citizen:
    case ROLE_IDS.jester:
    case ROLE_IDS.executioner:
      return succeed(false)
    default:
      return fail({
        type: 'INVALID_RESOLUTION_ROLE_METADATA',
        roleId: targetRole.id,
        reason: 'missing-sheriff-suspicion-rule',
      })
  }
}
