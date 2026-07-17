export type { GameState } from '@/domain/game/game-state.ts'
export type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'

export {
  acknowledgePrivateNightResult,
  beginNightResultPresentation,
  nextPrivateNightResult,
  prepareDawnAnnouncement,
  previousPrivateNightResult,
} from './night-presentation-workflow.ts'
export type {
  NightPresentationError,
  NightPresentationOperation,
  NightPresentationWorkflow,
} from './night-presentation-workflow.ts'
export {
  selectDawnAnnouncementView,
  selectNightPresentationView,
} from './night-presentation-selectors.ts'
export type {
  DawnAnnouncementView,
  DawnDeathView,
  NightPresentationView,
} from './night-presentation-selectors.ts'
export { buildPrivateNightResults } from './private-night-results.ts'
export type {
  DetectivePrivateResult,
  InvestigationPrivateResult,
  PrivateNightResult,
  PrivateNightResultConstructionError,
  PrivateNightResultId,
  SheriffPrivateResult,
} from './private-night-results.ts'
