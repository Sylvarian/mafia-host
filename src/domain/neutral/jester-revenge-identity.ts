import type { RoleInstanceId } from '../identifiers.ts'
import type { JesterRevengeResolutionId, PendingJesterRevengeId } from './neutral-outcome-model.ts'

export function createPendingJesterRevengeId(
  roleInstanceIdentity: RoleInstanceId,
  triggeredOnDay: number,
): PendingJesterRevengeId {
  return `jester-revenge:${String(triggeredOnDay)}:${roleInstanceIdentity}`
}

export function createJesterRevengeResolutionId(
  obligationId: PendingJesterRevengeId,
): JesterRevengeResolutionId {
  return `${obligationId}:resolution`
}
