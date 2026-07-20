export { ROLE_REGISTRY, findRoleDefinition } from '@/domain/roles/role-registry.ts'
export type { GameplayImplementationStatus } from '@/domain/roles/role-registry.ts'
export type { GameSettings } from '@/domain/game/game-settings.ts'
export type { PlayerId, RoleId } from '@/domain/identifiers.ts'
export type { Player } from '@/domain/players/player.ts'
export type { Faction } from '@/domain/roles/faction.ts'

export { getParticipatingPlayerCount } from './game-setup-draft.ts'
export type {
  GameSetupDraft,
  GameSettingKey,
  GameSetupEditError,
  RoleCount,
  RoleCountEditError,
  RosterEditError,
} from './game-setup-draft.ts'
export { DEFAULT_GAME_SETTINGS } from './game-setup-draft.ts'
export { inspectGameSetupDraft, validateGameSetupDraft } from './game-setup-validation.ts'
export type {
  GameSetupDraftCandidate,
  GameSetupValidation,
  GameSetupValidationError,
  ValidatedGameSetup,
} from './game-setup-validation.ts'
export { createGameSetupWorkflow, reduceGameSetupWorkflow } from './game-setup-workflow.ts'
export type { GameSetupWorkflowCommand, GameSetupWorkflowState } from './game-setup-workflow.ts'
export {
  clearNextGameSetupTemplate,
  createDefaultNextGameSetupTemplate,
  createGameSetupDraftFromTemplate,
  createNextGameSetupTemplate,
  loadNextGameSetupTemplate,
  saveNextGameSetupTemplate,
  validateNextGameSetupTemplate,
} from './next-game-setup-template.ts'
export type {
  InvalidNextGameSetupTemplateError,
  LoadedNextGameSetupTemplate,
  NextGameSetupRosterEntry,
  NextGameSetupTemplate,
  NextGameSetupTemplateRepository,
  NextGameSetupTemplateRepositoryError,
  NextGameSetupTemplateRepositoryLoadResult,
  NextGameSetupTemplateRepositoryWriteResult,
} from './next-game-setup-template.ts'
