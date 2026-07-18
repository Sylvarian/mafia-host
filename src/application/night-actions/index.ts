export type { GameState } from '@/domain/game/game-state.ts'
export type { PlayerId, RoleId, RoleInstanceId } from '@/domain/identifiers.ts'
export type {
  CollectedNightActions,
  NightActionBatchError,
  NightActionValidationError,
  PreviousNightTarget,
  SubmittedNightAction,
} from '@/domain/night-actions/night-action.ts'
export type { NightActionKind } from '@/domain/night-actions/night-action-kind.ts'
export { ROLE_IDS } from '@/domain/roles/role-registry.ts'

export {
  beginFirstNight,
  createNightActionCollectionForStartedNight,
  continueNightActionCollection,
  createNightActionCollectionWorkflow,
  editNightAction,
  finaliseNightActionCollection,
  previousNightActionCollection,
  selectDoctorPreviousTargetsForNight,
  selectNightActionTarget,
} from './night-action-workflow.ts'
export type {
  ActiveNightActionCollectionWorkflow,
  CollectingNightActionsWorkflow,
  CompleteNightActionsWorkflow,
  NightActionCollectionError,
  NightActionCollectionWorkflow,
  ReviewingNightActionsWorkflow,
} from './night-action-workflow.ts'
export { selectCurrentNightStepView, selectNightActionReview } from './night-action-selectors.ts'
export type {
  CurrentNightStepView,
  MafiaOverviewMember,
  NightActionReviewRow,
  NightTargetOption,
} from './night-action-selectors.ts'
export { buildNightActionSequence, orderNightActionsBySequence } from './night-sequence.ts'
export type { NightSequenceError, NightSequenceStep } from './night-sequence.ts'
