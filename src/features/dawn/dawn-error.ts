import type { NightPresentationError } from '@/application/night-presentation/index.ts'

export function getNightPresentationErrorMessage(error: NightPresentationError): string {
  switch (error.type) {
    case 'NIGHT_ACTION_WORKFLOW_NOT_COMPLETE':
      return 'Finish and review every required night action before resolving the night.'
    case 'INVALID_NIGHT_RESOLUTION_PHASE':
    case 'INVALID_NIGHT_APPLICATION_PHASE':
      return `Night results cannot be prepared while the game is in ${error.currentPhase}.`
    case 'NIGHT_RESOLUTION_GAME_ID_MISMATCH':
    case 'NIGHT_APPLICATION_GAME_ID_MISMATCH':
      return 'The night result belongs to a different active game.'
    case 'NIGHT_RESOLUTION_NIGHT_NUMBER_MISMATCH':
    case 'NIGHT_APPLICATION_NIGHT_NUMBER_MISMATCH':
      return 'The night result is stale or belongs to a different night.'
    case 'INVALID_GAME_STATE_FOR_NIGHT_RESOLUTION':
    case 'INVALID_GAME_STATE_FOR_NIGHT_APPLICATION':
      return 'The active game failed domain validation. Correct its state before continuing.'
    case 'INVALID_COLLECTED_NIGHT_ACTIONS':
    case 'INVALID_COLLECTED_ACTIONS_FOR_NIGHT_APPLICATION':
      return 'The completed night-action batch is no longer valid for this game.'
    case 'INVALID_RESOLUTION_ROLE_METADATA':
      return 'Role metadata no longer matches the canonical night-resolution registry.'
    case 'INVALID_INVESTIGATION_GROUP_DEFINITION':
    case 'MISSING_CANONICAL_INVESTIGATION_GROUP':
      return 'The permanent investigation-card registry is invalid.'
    case 'INVALID_NIGHT_RESOLUTION':
      return 'The canonical night result is malformed and cannot be applied.'
    case 'UNKNOWN_PROVISIONAL_DEATH_PLAYER':
      return 'A provisional death references a player outside this game.'
    case 'DUPLICATE_PROVISIONAL_DEATH':
      return 'A player appears more than once in the provisional death list.'
    case 'PROVISIONAL_DEATH_PLAYER_ALREADY_DEAD':
      return 'A provisional death references a player who was already dead before this night.'
    case 'INVALID_PROVISIONAL_DEATH_ROLE':
      return 'A provisional death contains a role that does not match the assignment.'
    case 'NIGHT_RESOLUTION_REVALIDATION_FAILED':
    case 'NIGHT_RESOLUTION_CONTENT_MISMATCH':
      return 'The night result no longer matches the completed action batch.'
    case 'INVALID_DAWN_ANNOUNCEMENT':
      return 'A public-safe Dawn announcement could not be constructed.'
    case 'INVALID_PRIVATE_RESULT_QUEUE':
      return 'The private investigative-result queue is invalid.'
    case 'UNKNOWN_PRIVATE_RESULT_ACKNOWLEDGEMENT':
      return 'That private result is not part of this night.'
    case 'DUPLICATE_PRIVATE_RESULT_ACKNOWLEDGEMENT':
      return 'That private result has already been acknowledged.'
    case 'PRIVATE_RESULT_NOT_CURRENT':
      return 'Only the private result currently on screen can be acknowledged.'
    case 'PRIVATE_RESULTS_INCOMPLETE':
      return 'Acknowledge every private result before preparing Dawn.'
    case 'PRIVATE_RESULT_NAVIGATION_BOUNDARY':
      return error.direction === 'previous'
        ? 'This is the first private result.'
        : 'This is the last private result.'
    case 'PRIVATE_RESULT_NOT_ACKNOWLEDGED':
      return 'Acknowledge this private result before showing the next one.'
    case 'RESOLUTION_ALREADY_APPLIED':
      return 'This night has already been applied and the Dawn announcement is final.'
    case 'INVALID_NIGHT_PRESENTATION_WORKFLOW_STATE':
      return `That action is unavailable while night presentation is ${error.status}.`
  }
}
