import type { PlayerId, RoleInstanceId } from '../identifiers.ts'

export type DoctorPreviousTarget = Readonly<{
  doctorRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
  nightNumber: number
}>
