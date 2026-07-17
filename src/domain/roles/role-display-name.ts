import type { RoleDefinition } from './role-definition.ts'
import type { RoleInstance } from './role-instance.ts'

export function getRoleInstanceDisplayName(
  instance: RoleInstance,
  definition: RoleDefinition,
): string {
  if (instance.roleId !== definition.id) {
    throw new Error(
      `Cannot format role instance ${instance.instanceId} with definition ${definition.id}.`,
    )
  }

  return instance.ordinal === null
    ? definition.name
    : `${definition.name} ${String(instance.ordinal)}`
}
