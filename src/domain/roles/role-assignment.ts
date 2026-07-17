import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import type { RoleInstance } from './role-instance.ts'

export type PlayerRoleAssignment = Readonly<{
  playerId: PlayerId
  role: RoleInstance
}>

export type RoleAssignmentInvariantError =
  | Readonly<{
      type: 'DUPLICATE_PLAYER_ASSIGNMENT'
      playerId: PlayerId
    }>
  | Readonly<{
      type: 'DUPLICATE_ROLE_INSTANCE_ASSIGNMENT'
      roleInstanceId: RoleInstanceId
    }>

export function assignDuplicateRoleOrdinals(
  assignmentsInParticipatingRosterOrder: readonly PlayerRoleAssignment[],
): DomainResult<readonly PlayerRoleAssignment[], RoleAssignmentInvariantError> {
  const playerIds = new Set<PlayerId>()
  const roleInstanceIds = new Set<RoleInstanceId>()
  const roleCounts = new Map<RoleId, number>()

  for (const assignment of assignmentsInParticipatingRosterOrder) {
    if (playerIds.has(assignment.playerId)) {
      return fail({ type: 'DUPLICATE_PLAYER_ASSIGNMENT', playerId: assignment.playerId })
    }

    if (roleInstanceIds.has(assignment.role.instanceId)) {
      return fail({
        type: 'DUPLICATE_ROLE_INSTANCE_ASSIGNMENT',
        roleInstanceId: assignment.role.instanceId,
      })
    }

    playerIds.add(assignment.playerId)
    roleInstanceIds.add(assignment.role.instanceId)
    roleCounts.set(assignment.role.roleId, (roleCounts.get(assignment.role.roleId) ?? 0) + 1)
  }

  const nextOrdinalByRole = new Map<RoleId, number>()
  const assignments = assignmentsInParticipatingRosterOrder.map((assignment) => {
    const roleCount = roleCounts.get(assignment.role.roleId) ?? 0
    const ordinal =
      roleCount === 1 ? null : (nextOrdinalByRole.get(assignment.role.roleId) ?? 0) + 1

    if (ordinal !== null) {
      nextOrdinalByRole.set(assignment.role.roleId, ordinal)
    }

    return {
      playerId: assignment.playerId,
      role: {
        ...assignment.role,
        ordinal,
      },
    }
  })

  return succeed(assignments)
}
