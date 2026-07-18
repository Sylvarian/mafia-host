export type { GameState } from '@/domain/game/game-state.ts'
export type { GameId, PlayerId, RoleId, RoleInstanceId } from '@/domain/identifiers.ts'
export type { Faction } from '@/domain/roles/faction.ts'
export type { RoleInstance } from '@/domain/roles/role-instance.ts'

export { assignRolesToValidatedSetup } from './assign-roles.ts'
export type {
  RoleAssignmentDependencies,
  RoleAssignmentIdentifierReservations,
} from './assign-roles.ts'
export { expandRoleCounts } from './expand-role-counts.ts'
export type { RoleAssignmentIdentitySource } from './identity-source.ts'
export type { RoleAssignmentError, RoleDistributionError } from './role-assignment-errors.ts'
export {
  assignRoleDistribution,
  confirmRoleDistribution,
  createRoleDistributionWorkflow,
  getRoleDistributionProgress,
  markAllParticipatingCardsDelivered,
  reassignRoleDistribution,
  setCardDelivered,
} from './role-distribution-workflow.ts'
export type {
  ConfirmedRoleDistributionWorkflow,
  DistributingRolesWorkflow,
  RoleDistributionWorkflow,
} from './role-distribution-workflow.ts'
export { selectRoleDistributionRows } from './role-distribution-selectors.ts'
export type { RoleDistributionRow } from './role-distribution-selectors.ts'
export { shuffleRoleInstances } from './shuffle-role-instances.ts'
