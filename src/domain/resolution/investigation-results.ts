import { succeed, type DomainResult } from '../game/domain-result.ts'
import type { GameState } from '../game/game-state.ts'
import {
  resolveInvestigationGroup,
  type InvestigationGroupError,
} from '../investigation/investigation-groups.ts'
import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { FrameRecord, InvestigationResult } from './night-resolution-models.ts'

export function resolveInvestigationResults(
  game: GameState,
  effectiveActions: readonly SubmittedNightAction[],
  frames: readonly FrameRecord[],
): DomainResult<readonly InvestigationResult[], InvestigationGroupError> {
  const framedPlayerIds = new Set(frames.map((frame) => frame.framedPlayerId))
  let results: readonly InvestigationResult[] = []

  for (const action of effectiveActions) {
    if (
      action.actorRoleId !== ROLE_IDS.investigator &&
      action.actorRoleId !== ROLE_IDS.consigliere
    ) {
      continue
    }

    const target = game.players.find((player) => player.playerId === action.targetPlayerId)
    if (target === undefined) {
      throw new Error(`Validated investigation target ${action.targetPlayerId} is missing.`)
    }

    const groupResult = resolveInvestigationGroup(
      target.role.roleId,
      framedPlayerIds.has(target.playerId),
    )
    if (!groupResult.ok) {
      return groupResult
    }

    results = [
      ...results,
      Object.freeze({
        actorPlayerId: action.actorPlayerId,
        actorRoleId: action.actorRoleId,
        actorRoleInstanceId: action.actorRoleInstanceId,
        targetPlayerId: action.targetPlayerId,
        group: groupResult.value,
      }),
    ]
  }

  return succeed(Object.freeze(results))
}
