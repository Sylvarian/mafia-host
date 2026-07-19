import type { NightActionCollectionError } from '@/application/night-actions/index.ts'

export function getNightActionCollectionErrorMessage(error: NightActionCollectionError): string {
  switch (error.type) {
    case 'DISTRIBUTION_NOT_CONFIRMED':
      return 'Confirm every physical role card has been distributed before beginning the first night.'
    case 'EXECUTIONER_BRIEFING_REQUIRED':
      return 'Complete the private Executioner briefing before beginning Night 1.'
    case 'INVALID_STARTING_PHASE':
      return `The first night can begin only from role distribution. The game is currently in ${error.currentPhase}.`
    case 'INVALID_STARTED_NIGHT_PHASE':
      return `The night sequence cannot be created while the game is in ${error.currentPhase}.`
    case 'INVALID_NEXT_NIGHT_PHASE':
      return `The next night cannot begin while the game is in ${error.currentPhase}.`
    case 'INVALID_NEXT_NIGHT_COUNTERS':
      return 'The day and night counters do not permit the next night to begin.'
    case 'MISSING_COMPLETED_DAY_OUTCOME':
      return `Day ${String(error.dayNumber)} has no final recorded outcome.`
    case 'UNKNOWN_ACTOR':
      return 'The acting player is not part of this game.'
    case 'DEAD_ACTOR':
      return 'A dead player cannot submit a night action.'
    case 'UNKNOWN_ROLE_INSTANCE':
      return 'The acting role instance is not part of this game.'
    case 'ROLE_INSTANCE_DOES_NOT_BELONG_TO_ACTOR':
      return 'That role instance is assigned to a different player.'
    case 'ACTOR_ROLE_MISMATCH':
      return 'The submitted role does not match the actor’s assigned role.'
    case 'ROLE_HAS_NO_NIGHT_ACTION':
      return 'This role has no ordinary night action.'
    case 'WRONG_ACTION_KIND':
      return 'The submitted action kind does not match this role.'
    case 'UNKNOWN_TARGET':
      return 'That target is not part of this game.'
    case 'DEAD_TARGET':
      return 'Dead players cannot be selected as targets.'
    case 'INVALID_SELF_TARGET':
      return 'This role cannot target themselves under the current settings.'
    case 'DOCTOR_REPEATED_PREVIOUS_TARGET':
      return 'This Doctor cannot select the same target they personally selected on the previous night.'
    case 'DUPLICATE_ACTOR_ACTION':
    case 'ACTOR_ALREADY_COMPLETED':
      return 'This role instance has already completed its action for the night.'
    case 'BLOCKED_ACTOR_SUBMITTED_ACTION':
      return 'A blocked actor cannot submit an action.'
    case 'UNEXPECTED_ACTION':
      return 'This role instance is not expected to act in the current night sequence.'
    case 'MISSING_REQUIRED_ACTION':
      return 'An unblocked living actor is missing a required action.'
    case 'DUPLICATE_PREVIOUS_TARGET_CONTEXT':
      return 'Previous-night target context was supplied more than once for one role instance.'
    case 'UNKNOWN_PREVIOUS_TARGET_ROLE_INSTANCE':
      return 'Previous-night target context references a role instance outside this game.'
    case 'PREVIOUS_TARGET_ROLE_NOT_DOCTOR':
      return 'Previous-night target context may be supplied only for a Doctor.'
    case 'UNKNOWN_PREVIOUS_TARGET':
      return 'A Doctor’s previous target is not part of this game.'
    case 'ACTION_BATCH_GAME_MISMATCH':
      return 'The completed action batch does not belong to this game and night.'
    case 'INVALID_ACTION_BATCH':
      return 'The completed night-action batch is malformed.'
    case 'UNKNOWN_SEQUENCE_ROLE':
      return 'A living player has a role missing from the night registry.'
    case 'ACTIVE_GAME_REJECTED':
      return 'The active game failed domain validation and Night 1 was not started.'
    case 'INVALID_WORKFLOW_STATE':
      return `That action is not available while the night workflow is ${error.status}.`
    case 'INVALID_SEQUENCE_STEP':
      return 'That control is not valid for the current night step.'
    case 'NO_VALID_TARGETS':
      return 'This actor has no valid living target. Correct the game state before continuing.'
    case 'SEQUENCE_BOUNDARY':
      return 'The night sequence is already at its final step.'
    case 'ACTOR_BLOCKED':
      return 'This actor is blocked and cannot select a target.'
    case 'MISSING_BLOCK_STATE':
      return 'The current role-block state could not be established safely.'
    case 'INVALID_CURRENT_OUTCOME':
    case 'OUTCOME_ACTOR_MISMATCH':
    case 'IMMEDIATE_RESULT_DISAGREEMENT':
      return 'The private outcome does not match the confirmed sequential-night state.'
    case 'PRIVATE_OUTCOME_PENDING':
      return 'Continue from the current private outcome before confirming another target.'
    case 'DETECTIVE_ACTION_RECORDED_AS_VISIT':
      return 'The Detective visit ledger is invalid and the result was not shown.'
    case 'INVALID_IMMEDIATE_OUTCOME_ROLE':
      return 'The current role has no supported immediate-outcome rule.'
    case 'GODFATHER_SUCCESSION_GAME_REJECTED':
    case 'GODFATHER_PROMOTION_APPLICATION_REJECTED':
      return 'Godfather succession could not be validated, so the next night was not started.'
    case 'GODFATHER_SUCCESSION_WRONG_PHASE':
      return `Godfather succession cannot run while the game is in ${error.currentPhase}.`
    case 'GODFATHER_PROMOTION_NOT_ALLOWED_ON_NIGHT_ONE':
      return 'Godfather succession is available only when starting Night 2 or later.'
    case 'INVALID_GODFATHER_PROMOTION_RANDOM_OUTPUT':
      return `The random source returned ${String(error.value)} instead of a value from 0 inclusive to 1 exclusive.`
  }
}
