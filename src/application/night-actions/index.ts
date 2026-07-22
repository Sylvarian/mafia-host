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
  beginNextNightActionCollection,
  beginFirstNight,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  createNightActionCollectionWorkflow,
  selectDoctorPreviousTargetsForNight,
  validateCurrentNightActionTarget,
} from './night-action-workflow.ts'
export type {
  ActiveNightActionCollectionWorkflow,
  AwaitingNightOutcomeWorkflow,
  CollectingNightActionsWorkflow,
  CompleteNightActionsWorkflow,
  ImmediateNightOutcome,
  NightActionCollectionError,
  NightActionCollectionWorkflow,
  SequentialNightStepRecord,
} from './night-action-workflow.ts'
export {
  selectCurrentNightStepView,
  selectImmediateNightOutcomeView,
} from './night-action-selectors.ts'
export type {
  CurrentNightStepView,
  ImmediateNightOutcomeView,
  MafiaOverviewMember,
  NightTargetGroup,
  NightTargetOption,
} from './night-action-selectors.ts'
export { buildNightActionSequence } from './night-sequence.ts'
export type { NightSequenceError, NightSequenceStep } from './night-sequence.ts'
