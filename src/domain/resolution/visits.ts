import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { VisitRecord } from './night-resolution-models.ts'

export function buildFinalVisits(
  effectiveActions: readonly SubmittedNightAction[],
): readonly VisitRecord[] {
  return Object.freeze(
    effectiveActions.flatMap((action): readonly VisitRecord[] =>
      action.actorRoleId === ROLE_IDS.detective
        ? []
        : [
            Object.freeze({
              actorPlayerId: action.actorPlayerId,
              actorRoleId: action.actorRoleId,
              actorRoleInstanceId: action.actorRoleInstanceId,
              targetPlayerId: action.targetPlayerId,
            }),
          ],
    ),
  )
}
