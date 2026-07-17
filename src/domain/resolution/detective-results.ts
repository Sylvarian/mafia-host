import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { DetectiveResult, VisitRecord } from './night-resolution-models.ts'

export function resolveDetectiveResults(
  effectiveActions: readonly SubmittedNightAction[],
  finalVisits: readonly VisitRecord[],
): readonly DetectiveResult[] {
  return Object.freeze(
    effectiveActions.flatMap((action): readonly DetectiveResult[] => {
      if (action.actorRoleId !== ROLE_IDS.detective) {
        return []
      }

      const trackedVisit = finalVisits.find(
        (visit) => visit.actorPlayerId === action.targetPlayerId,
      )
      const base = {
        actorPlayerId: action.actorPlayerId,
        actorRoleInstanceId: action.actorRoleInstanceId,
        targetPlayerId: action.targetPlayerId,
      }

      return trackedVisit === undefined
        ? [Object.freeze({ ...base, status: 'visited-nobody' })]
        : [
            Object.freeze({
              ...base,
              status: 'visited-player',
              visitedPlayerId: trackedVisit.targetPlayerId,
            }),
          ]
    }),
  )
}
