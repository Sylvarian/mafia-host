import type {
  GameSetupEditError,
  RoleCountEditError,
  RosterEditError,
} from '@/application/game-setup/index.ts'

export function selectRosterEditError(error: GameSetupEditError | null): RosterEditError | null {
  if (error === null) {
    return null
  }

  switch (error.type) {
    case 'EMPTY_PLAYER_NAME':
    case 'PLAYER_NOT_FOUND':
      return error
    case 'ROLE_NOT_FOUND':
    case 'INVALID_ROLE_COUNT':
      return null
  }
}

export function selectRoleCountEditError(
  error: GameSetupEditError | null,
): RoleCountEditError | null {
  if (error === null) {
    return null
  }

  switch (error.type) {
    case 'ROLE_NOT_FOUND':
    case 'INVALID_ROLE_COUNT':
      return error
    case 'EMPTY_PLAYER_NAME':
    case 'PLAYER_NOT_FOUND':
      return null
  }
}

export function getRosterEditErrorMessage(error: RosterEditError | null): string | null {
  if (error === null) {
    return null
  }

  switch (error.type) {
    case 'EMPTY_PLAYER_NAME':
      return error.operation === 'add'
        ? 'Enter a player name before adding them.'
        : 'A player name cannot be empty.'
    case 'PLAYER_NOT_FOUND':
      return 'That player is no longer in the roster.'
  }
}

export function getRoleEditErrorMessage(error: RoleCountEditError | null): string | null {
  if (error === null) {
    return null
  }

  switch (error.type) {
    case 'ROLE_NOT_FOUND':
      return `The role ID ${error.roleId} is not available in this setup.`
    case 'INVALID_ROLE_COUNT':
      return 'Role counts must be non-negative whole numbers within the supported numeric range.'
  }
}
