import type { RoleDistributionError } from '@/application/role-assignment/index.ts'

type ActiveGameRejection = Extract<
  RoleDistributionError,
  Readonly<{ type: 'ACTIVE_GAME_REJECTED' }>
>['error']

export function getRoleDistributionErrorMessage(error: RoleDistributionError): string {
  switch (error.type) {
    case 'UNKNOWN_ROLE':
      return `Role assignment stopped because ${error.roleId} is not in the role registry.`
    case 'DUPLICATE_ROLE_COUNT':
      return `Role assignment stopped because ${error.roleId} has more than one count entry.`
    case 'INVALID_ROLE_COUNT':
      return `Role assignment stopped because ${error.roleId} has the invalid count ${String(error.count)}.`
    case 'ASSIGNMENT_COUNT_MISMATCH':
      return `Role assignment needs ${String(error.participatingPlayerCount)} role instances but received ${String(error.roleInstanceCount)}.`
    case 'DUPLICATE_PARTICIPATING_PLAYER':
      return `Role assignment stopped because player ID ${error.playerId} appears more than once.`
    case 'IDENTIFIER_COLLISION':
      return `A fresh ${error.identityKind} ID could not be created because ${error.id} was already used.`
    case 'INVALID_IDENTIFIER':
      return `The ${error.identityKind} identity source returned an empty or non-string ID.`
    case 'INVALID_RANDOM_VALUE':
      return `The random source returned ${String(error.value)} instead of a value from 0 inclusive to 1 exclusive.`
    case 'DOMAIN_ASSIGNMENT_REJECTED':
      return error.error.type === 'DUPLICATE_PLAYER_ASSIGNMENT'
        ? `Player ID ${error.error.playerId} received more than one assignment.`
        : `Role instance ${error.error.roleInstanceId} was assigned more than once.`
    case 'ACTIVE_GAME_REJECTED':
      return getActiveGameRejectionMessage(error.error)
    case 'INVALID_ROLE_DISTRIBUTION_STATE':
      return `The ${formatOperation(error.operation)} action is unavailable while distribution is ${error.status}.`
    case 'INVALID_ROLE_DISTRIBUTION_AUTHORITY':
      return 'The role distribution is invalid, so delivery cannot be confirmed.'
    case 'ROLE_CARDS_UNAVAILABLE':
      return 'Every private role card must be available before delivery can be confirmed.'
    case 'ROLE_CARD_DELIVERY_ALREADY_COMPLETE':
      return 'Role-card delivery is already complete and cannot be confirmed again.'
    case 'REASSIGNMENT_AFTER_CONFIRMATION':
      return 'Roles cannot be reassigned after distribution is finalised. Abandon this game to restart from setup.'
    case 'INVALID_ROLE_CARD_DISTRIBUTION_ORDER':
      return 'The physical role-card delivery order is invalid, so delivery cannot be confirmed.'
  }
}

function formatOperation(
  operation: 'assign' | 'confirm-all-role-cards-delivered' | 'reassign',
): string {
  switch (operation) {
    case 'assign':
      return 'assign roles'
    case 'confirm-all-role-cards-delivered':
      return 'confirm all role cards delivered'
    case 'reassign':
      return 'reassign roles'
  }
}

function getActiveGameRejectionMessage(error: ActiveGameRejection): string {
  switch (error.type) {
    case 'DUPLICATE_ROSTER_PLAYER':
      return `The active game rejected duplicate roster player ID ${error.playerId}.`
    case 'MISSING_PARTICIPATING_PLAYER':
      return `The active game is missing participating player ID ${error.playerId}.`
    case 'PARTICIPATING_PLAYER_ORDER_MISMATCH':
      return `The active game expected player ID ${error.expectedPlayerId} at participating roster position ${String(error.index + 1)}, but received ${error.actualPlayerId}.`
    case 'NON_PARTICIPATING_PLAYER':
      return `Player ID ${error.playerId} is not marked as participating.`
    case 'DUPLICATE_PARTICIPATING_PLAYER':
      return `The active game contains player ID ${error.playerId} more than once.`
    case 'DUPLICATE_ROLE_ASSIGNMENT':
      return `The active game assigned role instance ${error.roleInstanceId} more than once.`
    case 'DUPLICATE_ROLE_DEFINITION':
      return `The active game contains duplicate role definition ${error.roleId}.`
    case 'INVALID_DEATH_RECORDS':
      return 'The active game contains invalid or incomplete death authority.'
    case 'INVALID_EXECUTIONER_CONVERSIONS':
      return 'The active game contains invalid Executioner conversion authority.'
    case 'INVALID_PERSONAL_WINS':
      return 'The active game contains invalid personal-win authority.'
    case 'INVALID_PENDING_JESTER_REVENGES':
      return 'The active game contains invalid pending Jester-revenge authority.'
    case 'INVALID_JESTER_REVENGE_RESOLUTIONS':
      return 'The active game contains invalid resolved Jester-revenge authority.'
    case 'INVALID_DAY_OUTCOMES':
      return 'The active game contains invalid completed-day authority.'
    case 'INVALID_GODFATHER_PROMOTIONS':
      return 'The active game contains invalid Godfather succession authority.'
    case 'INVALID_GODFATHER_SUCCESSION_START':
      return 'The active game contains an invalid Godfather succession start night.'
    case 'NO_PARTICIPATING_PLAYERS':
      return 'The active game requires at least one participating player.'
    case 'MISSING_ROLE_ASSIGNMENT':
      return `Player ID ${error.playerId} has no role assignment.`
    case 'UNKNOWN_PLAYER_REFERENCE':
      return `The active game contains an unknown ${error.reference} player ID ${error.playerId}.`
    case 'UNKNOWN_ROLE_REFERENCE':
      return `Player ID ${error.playerId} references unknown ${error.reference} role ${error.roleId}.`
    case 'INVALID_PUBLIC_ROLE_REVEAL':
      return `Player ID ${error.playerId} has an invalid public role reveal value.`
    case 'INVALID_DOCTOR_HISTORY':
      return 'The active game Doctor history must be an array.'
    case 'INVALID_DOCTOR_HISTORY_ENTRY':
      return `Doctor history entry ${String(error.index + 1)} has an invalid ${error.field} value.`
    case 'UNKNOWN_DOCTOR_ROLE_INSTANCE':
      return `Doctor history references unknown role instance ${error.doctorRoleInstanceId}.`
    case 'NON_DOCTOR_HISTORY_ENTRY':
      return `Role instance ${error.doctorRoleInstanceId} is not a Doctor and cannot have Doctor target history.`
    case 'UNKNOWN_DOCTOR_TARGET':
      return `Doctor history references unknown target player ${error.targetPlayerId}.`
    case 'INVALID_DOCTOR_HISTORY_NIGHT':
      return `Doctor history has invalid night number ${String(error.nightNumber)}.`
    case 'DUPLICATE_DOCTOR_HISTORY':
      return `Doctor role instance ${error.doctorRoleInstanceId} appears more than once in target history.`
    case 'DOCTOR_HISTORY_ORDER_MISMATCH':
      return 'Doctor target history is not in canonical participating-player order.'
    case 'INVALID_EXECUTIONER_TARGETS':
      return 'Executioner target state is malformed.'
    case 'INVALID_EXECUTIONER_TARGET_RECORD':
      return `Executioner target record ${String(error.index + 1)} has an invalid ${error.field} value.`
    case 'EXECUTIONER_TARGET_GAME_MISMATCH':
      return 'An Executioner target belongs to a different game.'
    case 'UNKNOWN_EXECUTIONER_PLAYER':
      return `Executioner target state references unknown owner ${error.executionerPlayerId}.`
    case 'UNKNOWN_EXECUTIONER_ROLE_INSTANCE':
      return `Executioner target state references unknown role instance ${error.executionerRoleInstanceId}.`
    case 'EXECUTIONER_ROLE_INSTANCE_MISMATCH':
      return 'An Executioner target owner does not match the assigned role instance.'
    case 'NON_EXECUTIONER_TARGET_OWNER':
      return 'A non-Executioner role instance cannot own an Executioner target.'
    case 'DUPLICATE_EXECUTIONER_TARGET':
      return `Executioner role instance ${error.executionerRoleInstanceId} has more than one target.`
    case 'UNKNOWN_EXECUTIONER_TARGET_PLAYER':
      return `Executioner target state references unknown player ${error.targetPlayerId}.`
    case 'INELIGIBLE_EXECUTIONER_TARGET':
      return `Player ${error.targetPlayerId} is not an eligible Town target.`
    case 'EXECUTIONER_TARGET_ORDER_MISMATCH':
      return 'Executioner targets are not in canonical role-instance order.'
    case 'MISSING_EXECUTIONER_TARGET':
      return `Executioner role instance ${error.executionerRoleInstanceId} is missing a target.`
    case 'UNEXPECTED_EXECUTIONER_TARGET':
      return `Role instance ${error.executionerRoleInstanceId} has an unexpected Executioner target.`
    case 'EXECUTIONER_TARGETS_BEFORE_FINALIZATION':
      return 'Executioner targets cannot exist before role distribution is finalised.'
    case 'EXECUTIONER_BRIEFING_STATUS_MISMATCH':
      return 'Executioner briefing status does not match the active game phase.'
    case 'INVALID_GAME_STATE':
      return getInvalidGameStateMessage(error.reason)
  }
}

function getInvalidGameStateMessage(
  error: Extract<ActiveGameRejection, Readonly<{ type: 'INVALID_GAME_STATE' }>>['reason'],
): string {
  switch (error.type) {
    case 'INVALID_GAME_SETTING':
      return `The active game rejected the ${error.setting} setting because it is not an explicit boolean.`
    case 'INVALID_PHASE':
      return `The active game cannot begin in the unknown phase ${error.phase}.`
    case 'INVALID_COUNTER':
      return `The active game rejected ${error.counter} counter ${String(error.value)}.`
    case 'PHASE_COUNTER_MISMATCH':
      return `The active game phase ${error.phase} does not match night ${String(error.nightNumber)} and day ${String(error.dayNumber)}.`
    case 'INVALID_IDENTITY':
      return `The active game rejected an invalid ${error.field} identity.`
    case 'INVALID_PLAYER_ALIVE_STATE':
      return `Player ID ${error.playerId} has an invalid alive state; expected an explicit boolean.`
    case 'INVALID_ROLE_ORDINAL':
      return `Role instance ${error.roleInstanceId} has invalid ordinal ${String(error.ordinal)}.`
    case 'ROLE_ORDINAL_MISMATCH':
      return `Role instance ${error.roleInstanceId} has ordinal ${String(error.ordinal)} instead of ${String(error.expectedOrdinal)}.`
  }
}
