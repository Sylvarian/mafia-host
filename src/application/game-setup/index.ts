export { ROLE_REGISTRY, findRoleDefinition } from '@/domain/roles/role-registry.ts'
export type { GameplayImplementationStatus } from '@/domain/roles/role-registry.ts'
export type { GameSettings } from '@/domain/game/game-settings.ts'
export type { PlayerId, RoleId } from '@/domain/identifiers.ts'
export type { Player } from '@/domain/players/player.ts'
export type { Faction } from '@/domain/roles/faction.ts'

export { getParticipatingPlayerCount } from './game-setup-draft.ts'
export type {
  GameSettingKey,
  GameSetupEditError,
  RoleCount,
  RoleCountEditError,
  RosterEditError,
} from './game-setup-draft.ts'
export { inspectGameSetupDraft } from './game-setup-validation.ts'
export type {
  GameSetupDraftCandidate,
  GameSetupValidation,
  GameSetupValidationError,
  ValidatedGameSetup,
} from './game-setup-validation.ts'
export { createGameSetupWorkflow, reduceGameSetupWorkflow } from './game-setup-workflow.ts'
