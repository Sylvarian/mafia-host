import type { GameId, RoleInstanceId } from '@/domain/identifiers.ts'

export interface RoleAssignmentIdentitySource {
  nextGameId(): GameId
  nextRoleInstanceId(): RoleInstanceId
}
