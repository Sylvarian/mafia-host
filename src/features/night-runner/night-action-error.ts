import type { NightActionCollectionError } from '@/application/night-actions/index.ts'

export function getNightActionCollectionErrorMessage(error: NightActionCollectionError): string {
  switch (error.type) {
    case 'DISTRIBUTION_NOT_CONFIRMED':
      return 'Confirm every physical role card has been distributed before beginning the first night.'
    case 'EXECUTIONER_TARGET_REQUIRED':
      return 'This game contains an Executioner, but Executioner target eligibility has not been configured yet. The first night cannot begin until R-008 is resolved.'
    case 'EXECUTIONER_BRIEFING_REQUIRED':
      return 'This Executioner requires a private first-night briefing. Phase 4 does not implement or skip that briefing.'
    case 'INVALID_STARTING_PHASE':
      return `The first night can begin only from role distribution. The game is currently in ${error.currentPhase}.`
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
      return 'This role has no ordinary night action to collect.'
    case 'WRONG_ACTION_KIND':
      return 'The submitted action kind does not match this role’s collection metadata.'
    case 'UNKNOWN_TARGET':
      return 'That target is not part of this game.'
    case 'DEAD_TARGET':
      return 'Dead players cannot be selected as targets.'
    case 'INVALID_SELF_TARGET':
      return 'This role cannot target themselves under the current settings.'
    case 'DOCTOR_REPEATED_PREVIOUS_TARGET':
      return 'This Doctor cannot select the same target they personally selected on the previous night.'
    case 'DUPLICATE_ACTOR_ACTION':
      return 'This role instance has more than one submitted action for the night.'
    case 'UNEXPECTED_ACTION':
      return 'This role instance is not expected to act in the current night sequence.'
    case 'MISSING_REQUIRED_ACTION':
      return 'A living acting role is missing its required night action.'
    case 'DUPLICATE_PREVIOUS_TARGET_CONTEXT':
      return 'Previous-night target context was supplied more than once for one role instance.'
    case 'UNKNOWN_PREVIOUS_TARGET_ROLE_INSTANCE':
      return 'Previous-night target context references a role instance that is not part of this game.'
    case 'PREVIOUS_TARGET_ROLE_NOT_DOCTOR':
      return 'Previous-night target context may be supplied only for an assigned Doctor role instance.'
    case 'UNKNOWN_PREVIOUS_TARGET':
      return 'A Doctor’s previous target is not part of this game.'
    case 'ACTION_BATCH_GAME_MISMATCH':
      return 'The collected action batch does not belong to this game and night.'
    case 'INVALID_ACTION_BATCH':
      return 'The collected night-action batch is malformed and cannot be used.'
    case 'UNKNOWN_SEQUENCE_ROLE':
      return 'A living player has a role that is missing from the collection registry.'
    case 'ACTIVE_GAME_REJECTED':
      return 'The active game failed domain validation and the first night was not started.'
    case 'INVALID_WORKFLOW_STATE':
      return `That action is not available while night collection is ${error.status}.`
    case 'INVALID_SEQUENCE_STEP':
      return 'That control is not valid for the current night instruction.'
    case 'NO_VALID_TARGETS':
      return 'This actor has no structurally valid living target. Correct the game state before collecting actions.'
    case 'TARGET_REQUIRED':
      return 'Select a valid target before continuing.'
    case 'SEQUENCE_BOUNDARY':
      return error.direction === 'previous'
        ? 'You are already at the first night instruction.'
        : 'You are already at the end of the collection sequence.'
    case 'ACTION_NOT_FOUND':
      return 'The selected review action no longer exists.'
    case 'INCOMPLETE_ACTION_BATCH':
      return 'Every living acting role must have one valid target before collection can be finalised.'
  }
}
