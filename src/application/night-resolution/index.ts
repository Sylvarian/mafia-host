export type { NightResolutionError } from '@/domain/resolution/night-resolution-errors.ts'
export type {
  AttackAttempt,
  AttackOutcome,
  AttackSource,
  BlockedActorRecord,
  DetectiveResult,
  FrameRecord,
  FrameSource,
  InvestigationResult,
  NightResolution,
  ProtectionRecord,
  ProtectionSource,
  ProvisionalDeath,
  RoleBlockAttempt,
  RoleBlockAttemptOutcome,
  RoleBlockSource,
  ResolutionSources,
  SheriffResult,
  VisitRecord,
} from '@/domain/resolution/night-resolution-models.ts'

export { resolveCompletedNightWorkflow } from './resolve-completed-night.ts'
export type {
  IncompleteNightActionWorkflowError,
  ResolveCompletedNightWorkflowError,
} from './resolve-completed-night.ts'
