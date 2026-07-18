import type {
  BeginDayDiscussionWorkflowError,
  ConfirmMayorRevealWorkflowError,
  MayorRevealCandidateView,
} from '@/application/day-discussion/index.ts'

export function getBeginDayDiscussionErrorMessage(error: BeginDayDiscussionWorkflowError): string {
  switch (error.type) {
    case 'DAY_TRANSITION_ALREADY_COMPLETED':
      return 'Day discussion has already begun.'
    case 'INVALID_DAY_TRANSITION_PHASE':
      return `Day discussion cannot begin while the game is in ${error.currentPhase}.`
    case 'INVALID_DAY_TRANSITION_GAME':
      return 'The active Dawn game failed domain validation. Dawn is unchanged and can be retried after correction.'
    case 'INVALID_DAWN_GAME_MATCH':
      return 'The public Dawn announcement no longer matches this game and night. Dawn is unchanged.'
    case 'INVALID_DAY_COUNTER_STATE':
      return 'The current day and night counters are incompatible with beginning day discussion.'
    case 'INVALID_DAY_DISCUSSION_PARTICIPANTS':
      return 'The saved participant roster no longer matches the Dawn game.'
  }
}

export function getMayorRevealErrorMessage(
  error: ConfirmMayorRevealWorkflowError,
  candidates: readonly MayorRevealCandidateView[],
): string {
  switch (error.type) {
    case 'MAYOR_REVEAL_GAME_REJECTED':
    case 'INVALID_DAY_DISCUSSION_GAME':
      return 'The active day game failed domain validation. No reveal was recorded.'
    case 'INVALID_MAYOR_REVEAL_PHASE':
    case 'DAY_DISCUSSION_PHASE_MISMATCH':
      return `A Mayor reveal cannot be recorded while the game is in ${error.currentPhase}.`
    case 'UNKNOWN_MAYOR_PLAYER':
      return 'The selected Mayor identity is invalid.'
    case 'NON_PARTICIPATING_MAYOR_PLAYER':
      return 'The selected player is not part of this active game.'
    case 'DEAD_MAYOR_CANNOT_REVEAL':
      return `${selectCandidateLabel(candidates, error.playerId)} is dead and cannot newly reveal.`
    case 'SELECTED_PLAYER_IS_NOT_MAYOR':
      return `${selectCandidateLabel(candidates, error.playerId)} is not eligible to reveal as Mayor.`
    case 'MAYOR_ALREADY_REVEALED':
      return `${selectCandidateLabel(candidates, error.playerId)} is already publicly revealed as Mayor.`
    case 'INVALID_MAYOR_ROLE_METADATA':
      return 'The canonical Mayor role metadata is invalid. No reveal was recorded.'
    case 'INVALID_DAY_DISCUSSION_PARTICIPANTS':
      return 'The active participant roster no longer matches the day game.'
    case 'INVALID_DAY_DISCUSSION_COUNTERS':
      return 'The current day and night counters are incompatible.'
  }
}

function selectCandidateLabel(
  candidates: readonly MayorRevealCandidateView[],
  playerId: MayorRevealCandidateView['playerId'],
): string {
  return (
    candidates.find((candidate) => candidate.playerId === playerId)?.playerDisplayLabel ??
    'The selected player'
  )
}
