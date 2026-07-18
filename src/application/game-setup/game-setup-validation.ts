import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import {
  validateGameSettings,
  type GameSettings,
  type InvalidGameSettingError,
} from '@/domain/game/game-settings.ts'
import type { PlayerId, RoleId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import { ROLE_IDS, ROLE_REGISTRY } from '@/domain/roles/role-registry.ts'

import type { GameSetupDraft, RoleCount } from './game-setup-draft.ts'
import { getParticipatingPlayerCount, getSelectedRoleCount } from './game-setup-draft.ts'

export type GameSetupValidationError =
  | InvalidGameSettingError
  | Readonly<{ type: 'INVALID_PLAYER_ID'; playerId: PlayerId }>
  | Readonly<{ type: 'INVALID_PLAYER_NAME'; playerId: PlayerId }>
  | Readonly<{ type: 'DUPLICATE_PLAYER_ID'; playerId: PlayerId }>
  | Readonly<{ type: 'UNKNOWN_ROLE_COUNT'; roleId: RoleId }>
  | Readonly<{ type: 'DUPLICATE_ROLE_COUNT'; roleId: RoleId }>
  | Readonly<{ type: 'MISSING_ROLE_COUNT'; roleId: RoleId }>
  | Readonly<{ type: 'INVALID_ROLE_COUNT'; roleId: RoleId; count: number }>
  | Readonly<{ type: 'NO_PARTICIPATING_PLAYERS' }>
  | Readonly<{
      type: 'ROLE_COUNT_MISMATCH'
      participatingCount: number
      selectedRoleCount: number
    }>
  | Readonly<{ type: 'NO_MAFIA_ROLE' }>
  | Readonly<{ type: 'EXECUTIONER_REQUIRES_TOWN_TARGET' }>

export type GameSetupValidation = Readonly<{
  isValid: boolean
  errors: readonly GameSetupValidationError[]
  participatingPlayerCount: number
  selectedRoleCount: number
  roleCountDifference: number
}>

export type ValidatedGameSetup = Readonly<{
  participatingPlayers: readonly Player[]
  roleCounts: readonly RoleCount[]
  settings: GameSettings
}>

export type GameSetupDraftCandidate = Readonly<
  Omit<GameSetupDraft, 'settings'> & { settings: unknown }
>

export function inspectGameSetupDraft(draft: GameSetupDraftCandidate): GameSetupValidation {
  const participatingPlayerCount = getParticipatingPlayerCount(draft)
  const selectedRoleCount = getSelectedRoleCount(draft)
  const errors: GameSetupValidationError[] = []
  const settingsResult = validateGameSettings(draft.settings)

  if (!settingsResult.ok) {
    errors.push(settingsResult.error)
  }
  const playerIds = new Set<PlayerId>()
  const invalidPlayerIds = new Set<PlayerId>()
  const invalidPlayerNameIds = new Set<PlayerId>()
  const duplicatePlayerIds = new Set<PlayerId>()

  for (const player of draft.roster) {
    if (player.id.trim().length === 0 && !invalidPlayerIds.has(player.id)) {
      errors.push({ type: 'INVALID_PLAYER_ID', playerId: player.id })
      invalidPlayerIds.add(player.id)
    }

    if (player.name.trim().length === 0 && !invalidPlayerNameIds.has(player.id)) {
      errors.push({ type: 'INVALID_PLAYER_NAME', playerId: player.id })
      invalidPlayerNameIds.add(player.id)
    }

    if (playerIds.has(player.id) && !duplicatePlayerIds.has(player.id)) {
      errors.push({ type: 'DUPLICATE_PLAYER_ID', playerId: player.id })
      duplicatePlayerIds.add(player.id)
    }

    playerIds.add(player.id)
  }

  const knownRoleIds = new Set(ROLE_REGISTRY.map((role) => role.id))
  const seenRoleIds = new Set<RoleId>()
  const unknownRoleIds = new Set<RoleId>()
  const duplicateRoleIds = new Set<RoleId>()
  const invalidRoleIds = new Set<RoleId>()

  for (const roleCount of draft.roleCounts) {
    if (!knownRoleIds.has(roleCount.roleId) && !unknownRoleIds.has(roleCount.roleId)) {
      errors.push({ type: 'UNKNOWN_ROLE_COUNT', roleId: roleCount.roleId })
      unknownRoleIds.add(roleCount.roleId)
    }

    if (seenRoleIds.has(roleCount.roleId) && !duplicateRoleIds.has(roleCount.roleId)) {
      errors.push({ type: 'DUPLICATE_ROLE_COUNT', roleId: roleCount.roleId })
      duplicateRoleIds.add(roleCount.roleId)
    }

    seenRoleIds.add(roleCount.roleId)

    if (!isValidRoleCount(roleCount.count) && !invalidRoleIds.has(roleCount.roleId)) {
      errors.push({
        type: 'INVALID_ROLE_COUNT',
        roleId: roleCount.roleId,
        count: roleCount.count,
      })
      invalidRoleIds.add(roleCount.roleId)
    }
  }

  for (const role of ROLE_REGISTRY) {
    if (!seenRoleIds.has(role.id)) {
      errors.push({ type: 'MISSING_ROLE_COUNT', roleId: role.id })
    }
  }

  if (participatingPlayerCount === 0) {
    errors.push({ type: 'NO_PARTICIPATING_PLAYERS' })
  }

  if (selectedRoleCount !== participatingPlayerCount) {
    errors.push({
      type: 'ROLE_COUNT_MISMATCH',
      participatingCount: participatingPlayerCount,
      selectedRoleCount,
    })
  }

  const hasMafiaRole = ROLE_REGISTRY.some(
    (role) =>
      role.faction === 'mafia' &&
      draft.roleCounts.some(
        (roleCount) =>
          roleCount.roleId === role.id && isValidRoleCount(roleCount.count) && roleCount.count > 0,
      ),
  )

  if (!hasMafiaRole) {
    errors.push({ type: 'NO_MAFIA_ROLE' })
  }

  const executionerCount = getValidRoleCount(draft.roleCounts, ROLE_IDS.executioner)
  const townRoleCount = ROLE_REGISTRY.filter((role) => role.faction === 'town').reduce(
    (total, role) => total + getValidRoleCount(draft.roleCounts, role.id),
    0,
  )
  if (executionerCount > 0 && townRoleCount === 0) {
    errors.push({ type: 'EXECUTIONER_REQUIRES_TOWN_TARGET' })
  }

  return Object.freeze({
    isValid: errors.length === 0,
    errors: Object.freeze(errors),
    participatingPlayerCount,
    selectedRoleCount,
    roleCountDifference: selectedRoleCount - participatingPlayerCount,
  })
}

export function validateGameSetupDraft(
  draft: GameSetupDraftCandidate,
): DomainResult<ValidatedGameSetup, readonly GameSetupValidationError[]> {
  const validation = inspectGameSetupDraft(draft)

  if (!validation.isValid) {
    return fail(validation.errors)
  }

  const settingsResult = validateGameSettings(draft.settings)

  if (!settingsResult.ok) {
    return fail([settingsResult.error])
  }

  const participatingPlayers = Object.freeze(
    draft.roster.filter((player) => player.playing).map((player) => Object.freeze({ ...player })),
  )
  const roleCounts = Object.freeze(
    draft.roleCounts.map((roleCount) => Object.freeze({ ...roleCount })),
  )
  const settings = settingsResult.value

  return succeed(
    Object.freeze({
      participatingPlayers,
      roleCounts,
      settings,
    }),
  )
}

function isValidRoleCount(count: number): boolean {
  return Number.isSafeInteger(count) && count >= 0
}

function getValidRoleCount(roleCounts: readonly RoleCount[], roleId: RoleId): number {
  const matchingCounts = roleCounts.filter((roleCount) => roleCount.roleId === roleId)
  if (matchingCounts.length !== 1) {
    return 0
  }

  const count = matchingCounts[0]?.count
  return count !== undefined && isValidRoleCount(count) ? count : 0
}
