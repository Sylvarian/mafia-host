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
    case 'NO_PENDING_JESTER_REVENGE':
    case 'INVALID_JESTER_REVENGE_SELECTION':
    case 'JESTER_REVENGE_SURVIVOR_STILL_EXISTS':
    case 'INVALID_REVENGE_RESOLUTION_WORKFLOW':
      return 'The pending Jester revenge no longer matches this Dawn.'
    case 'PENDING_JESTER_REVENGE_NOT_DUE':
      return 'The pending Jester revenge is not due at this Dawn.'
    case 'INVALID_JESTER_REVENGE_RANDOM_OUTPUT':
      return 'The random source returned an invalid revenge selection value.'
    case 'INVALID_JESTER_REVENGE_PHASE':
      return `Jester revenge cannot resolve while the game is in ${error.currentPhase}.`
    case 'JESTER_REVENGE_GAME_REJECTED':
    case 'JESTER_REVENGE_APPLICATION_REJECTED':
    case 'DAWN_FINALIZATION_GAME_REJECTED':
      return 'Dawn consequences could not be applied safely.'
    case 'MULTIPLE_PENDING_JESTER_REVENGES_UNRESOLVED_RULE':
      return 'Multiple simultaneous Jester revenge obligations are not defined by the game rules.'
    case 'INVALID_JESTER_REVENGE_VICTIM':
      return 'The selected revenge victim is no longer eligible.'
    case 'VICTORY_EVALUATION_GAME_REJECTED':
    case 'FACTION_GAME_FINALIZATION_REJECTED':
      return 'The final post-Dawn game state could not be validated.'
    case 'VICTORY_EVALUATION_WRONG_PHASE':
    case 'VICTORY_EVALUATION_COUNTER_MISMATCH':
    case 'VICTORY_EVALUATION_MISSING_DAY_OUTCOME':
    case 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY':
    case 'CONTRADICTORY_VICTORY_PREDICATES':
    case 'VICTORY_EVALUATION_UNKNOWN_ACTIVE_ROLE':
    case 'FINAL_TWO_KILLING_ROLE_GAME_REJECTED':
    case 'INVALID_FINAL_TWO_KILLING_ROLE_STATE':
    case 'UNSUPPORTED_FINAL_TWO_KILLING_ROLE_PAIRING':
    case 'INVALID_FINAL_TWO_KILLING_ROLE_ACTIVE_ROLE':
    case 'CONTRADICTORY_FINAL_TWO_ATTACK_OUTCOMES':
    case 'PREEXISTING_FINAL_TWO_KILLING_ROLE_SHOWDOWN':
    case 'FINAL_TWO_KILLING_ROLE_APPLICATION_REJECTED':
    case 'INVALID_STORED_FACTION_RESULT':
    case 'INVALID_TOWN_RESULT':
    case 'INVALID_MAFIA_RESULT':
    case 'INVALID_SERIAL_KILLER_RESULT':
    case 'INVALID_DRAW':
    case 'UNKNOWN_WINNER_PLAYER':
    case 'DUPLICATE_WINNER_PLAYER':
    case 'FACTION_RESULT_GAME_MISMATCH':
    case 'FACTION_RESULT_CONFLICTS_WITH_FINAL_TWO_DRAW':
    case 'NON_TERMINAL_FACTION_RESULT':
      return 'Faction victory could not be evaluated safely after Dawn.'
    case 'RESOLUTION_ALREADY_APPLIED':
      return 'This night has already been applied.'
  }
}
