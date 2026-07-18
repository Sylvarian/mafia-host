import type { ExecutionerBriefingError } from '@/application/executioner-briefing/index.ts'

export function getExecutionerBriefingErrorMessage(error: ExecutionerBriefingError): string {
  switch (error.type) {
    case 'EXECUTIONER_BRIEFING_GAME_REJECTED':
      return 'The active game failed validation, so the private briefing was not changed.'
    case 'EXECUTIONER_BRIEFING_GAME_MISMATCH':
      return 'This private briefing belongs to a different game.'
    case 'EXECUTIONER_BRIEFING_PHASE_MISMATCH':
      return `Executioner briefing controls are unavailable while the game is in ${error.currentPhase}.`
    case 'NO_EXECUTIONERS_FOR_BRIEFING':
      return 'No Executioner briefing should exist for this game.'
    case 'MISSING_EXECUTIONER_TARGET_RELATIONSHIP':
      return 'An Executioner is missing their finalized Town target.'
    case 'INVALID_EXECUTIONER_BRIEFING_RECORD':
      return 'The private briefing queue no longer matches the finalized target assignments.'
    case 'UNKNOWN_EXECUTIONER_BRIEFING_ID':
      return 'That private briefing is not part of this game.'
    case 'DUPLICATE_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT':
      return 'This Executioner briefing has already been acknowledged.'
    case 'UNKNOWN_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT':
      return 'The saved acknowledgement refers to an unknown Executioner briefing.'
    case 'EXECUTIONER_BRIEFING_NOT_CURRENT':
      return 'Only the private briefing currently on screen can be acknowledged.'
    case 'EXECUTIONER_BRIEFING_NOT_ACKNOWLEDGED':
      return 'Mark this Executioner as briefed before continuing.'
    case 'EXECUTIONER_BRIEFING_INDEX_OUT_OF_RANGE':
      return 'The current private briefing position is invalid.'
    case 'EXECUTIONER_BRIEFING_NAVIGATION_BOUNDARY':
      return error.direction === 'previous'
        ? 'This is the first Executioner briefing.'
        : 'This is the last Executioner briefing.'
    case 'INCOMPLETE_EXECUTIONER_BRIEFINGS':
      return 'Acknowledge every Executioner briefing before beginning Night 1.'
    case 'INVALID_EXECUTIONER_BRIEFING_WORKFLOW':
      return 'The private briefing state is malformed and cannot be changed.'
  }
}
