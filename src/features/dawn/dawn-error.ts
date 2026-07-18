import type { NightCompletionError } from '@/application/night-completion/index.ts'

export function getNightCompletionErrorMessage(error: NightCompletionError): string {
  switch (error.type) {
    case 'NIGHT_ACTION_WORKFLOW_NOT_COMPLETE':
      return 'Finish every sequential night step before resolving the night.'
    case 'INVALID_NIGHT_RESOLUTION_PHASE':
    case 'INVALID_NIGHT_APPLICATION_PHASE':
      return `Dawn cannot be prepared while the game is in ${error.currentPhase}.`
    case 'NIGHT_RESOLUTION_GAME_ID_MISMATCH':
    case 'NIGHT_APPLICATION_GAME_ID_MISMATCH':
      return 'The night result belongs to a different active game.'
    case 'NIGHT_RESOLUTION_NIGHT_NUMBER_MISMATCH':
    case 'NIGHT_APPLICATION_NIGHT_NUMBER_MISMATCH':
      return 'The night result belongs to a different night.'
    case 'INVALID_GAME_STATE_FOR_NIGHT_RESOLUTION':
    case 'INVALID_GAME_STATE_FOR_NIGHT_APPLICATION':
      return 'The active game failed domain validation.'
    case 'INVALID_COLLECTED_NIGHT_ACTIONS':
    case 'INVALID_COLLECTED_ACTIONS_FOR_NIGHT_APPLICATION':
      return 'The completed sequential action batch is invalid.'
    case 'INVALID_RESOLUTION_ROLE_METADATA':
      return 'Role metadata no longer matches the canonical resolution registry.'
    case 'INVALID_INVESTIGATION_GROUP_DEFINITION':
    case 'MISSING_CANONICAL_INVESTIGATION_GROUP':
      return 'The permanent investigation-card registry is invalid.'
    case 'INVALID_NIGHT_RESOLUTION':
      return 'The canonical night result is malformed.'
    case 'UNKNOWN_PROVISIONAL_DEATH_PLAYER':
      return 'A provisional death references a player outside this game.'
    case 'DUPLICATE_PROVISIONAL_DEATH':
      return 'A player appears more than once in the provisional death list.'
    case 'PROVISIONAL_DEATH_PLAYER_ALREADY_DEAD':
      return 'A provisional death references a player who was already dead.'
    case 'INVALID_PROVISIONAL_DEATH_ROLE':
      return 'A provisional death role does not match the assignment.'
    case 'NIGHT_RESOLUTION_REVALIDATION_FAILED':
    case 'NIGHT_RESOLUTION_CONTENT_MISMATCH':
      return 'The night result no longer matches the completed sequential actions.'
    case 'INVALID_DAWN_ANNOUNCEMENT':
      return 'A public-safe Dawn announcement could not be constructed.'
    case 'RESOLUTION_ALREADY_APPLIED':
      return 'This night has already been applied.'
  }
}
