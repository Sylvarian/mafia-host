import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import type { VisitRecord } from './night-resolution-models.ts'

export function buildFinalVisits(
  effectiveActions: readonly SubmittedNightAction[],
): readonly VisitRecord[] {
  return Object.freeze(
    effectiveActions.map((action) =>
      Object.freeze({
        actorPlayerId: action.actorPlayerId,
        actorRoleId: action.actorRoleId,
        actorRoleInstanceId: action.actorRoleInstanceId,
        targetPlayerId: action.targetPlayerId,
      }),
    ),
  )
}
