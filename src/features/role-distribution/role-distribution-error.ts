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
    case 'UNKNOWN_CARD_DELIVERY_PLAYER':
      return `Card delivery cannot be recorded because player ID ${error.playerId} is not participating.`
    case 'CARD_DELIVERY_INCOMPLETE':
      return `${String(error.undeliveredPlayerIds.length)} physical ${error.undeliveredPlayerIds.length === 1 ? 'card is' : 'cards are'} still waiting to be delivered.`
    case 'REASSIGNMENT_CONFIRMATION_REQUIRED':
      return `Confirm that ${String(error.deliveredPlayerIds.length)} existing card ${error.deliveredPlayerIds.length === 1 ? 'delivery will' : 'deliveries will'} be cleared before reassigning.`
    case 'REASSIGNMENT_AFTER_CONFIRMATION':
      return 'Roles cannot be reassigned after distribution is finalised. Abandon this game to restart from setup.'
  }
}

function formatOperation(
  operation: 'assign' | 'set-card-delivery' | 'confirm' | 'reassign',
): string {
  switch (operation) {
    case 'assign':
      return 'assign roles'
    case 'set-card-delivery':
      return 'update card delivery'
    case 'confirm':
      return 'confirm distribution'
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
    case 'NO_PARTICIPATING_PLAYERS':
      return 'The active game requires at least one participating player.'
    case 'MISSING_ROLE_ASSIGNMENT':
      return `Player ID ${error.playerId} has no role assignment.`
    case 'UNKNOWN_PLAYER_REFERENCE':
      return `The active game contains an unknown ${error.reference} player ID ${error.playerId}.`
    case 'UNKNOWN_ROLE_REFERENCE':
      return `Player ID ${error.playerId} references unknown ${error.reference} role ${error.roleId}.`
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
    case 'INVALID_ROLE_ORDINAL':
      return `Role instance ${error.roleInstanceId} has invalid ordinal ${String(error.ordinal)}.`
    case 'ROLE_ORDINAL_MISMATCH':
      return `Role instance ${error.roleInstanceId} has ordinal ${String(error.ordinal)} instead of ${String(error.expectedOrdinal)}.`
  }
}
