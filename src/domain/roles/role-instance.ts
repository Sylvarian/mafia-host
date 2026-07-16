import type { RoleId, RoleInstanceId } from '../identifiers.ts'

export type RoleInstance = Readonly<{
  instanceId: RoleInstanceId
  roleId: RoleId
  ordinal: number | null
}>
