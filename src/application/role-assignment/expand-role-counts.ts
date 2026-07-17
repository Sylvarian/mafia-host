import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { RoleInstance } from '@/domain/roles/role-instance.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

import type { RoleCount } from '../game-setup/game-setup-draft.ts'
import type { RoleAssignmentIdentitySource } from './identity-source.ts'
import type { RoleAssignmentError } from './role-assignment-errors.ts'

export function expandRoleCounts(
  roleCounts: readonly RoleCount[],
  participatingPlayerCount: number,
  identitySource: RoleAssignmentIdentitySource,
  reservedIdentityValues: ReadonlySet<string> = new Set<string>(),
): DomainResult<readonly RoleInstance[], RoleAssignmentError> {
  const seenRoleIds = new Set<RoleCount['roleId']>()

  for (const roleCount of roleCounts) {
    if (findRoleDefinition(roleCount.roleId) === undefined) {
      return fail({ type: 'UNKNOWN_ROLE', roleId: roleCount.roleId })
    }

    if (seenRoleIds.has(roleCount.roleId)) {
      return fail({ type: 'DUPLICATE_ROLE_COUNT', roleId: roleCount.roleId })
    }

    if (!Number.isSafeInteger(roleCount.count) || roleCount.count < 0) {
      return fail({
        type: 'INVALID_ROLE_COUNT',
        roleId: roleCount.roleId,
        count: roleCount.count,
      })
    }

    seenRoleIds.add(roleCount.roleId)
  }

  const roleInstanceCount = roleCounts.reduce((total, roleCount) => total + roleCount.count, 0)

  if (!Number.isSafeInteger(roleInstanceCount) || roleInstanceCount !== participatingPlayerCount) {
    return fail({
      type: 'ASSIGNMENT_COUNT_MISMATCH',
      participatingPlayerCount,
      roleInstanceCount,
    })
  }

  const roleInstanceIds = new Set<string>(reservedIdentityValues)
  const roleInstances: RoleInstance[] = []

  for (const roleCount of roleCounts) {
    for (let copyNumber = 0; copyNumber < roleCount.count; copyNumber += 1) {
      const instanceId = identitySource.nextRoleInstanceId()

      if (!isValidIdentifier(instanceId)) {
        return fail({
          type: 'INVALID_IDENTIFIER',
          identityKind: 'role-instance',
          value: instanceId,
        })
      }

      if (roleInstanceIds.has(instanceId)) {
        return fail({ type: 'IDENTIFIER_COLLISION', identityKind: 'role-instance', id: instanceId })
      }

      roleInstanceIds.add(instanceId)
      roleInstances.push({ instanceId, roleId: roleCount.roleId, ordinal: null })
    }
  }

  return succeed(roleInstances)
}

function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
