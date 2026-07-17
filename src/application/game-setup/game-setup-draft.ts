import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameSettings } from '@/domain/game/game-settings.ts'
import { playerId, type PlayerId, type RoleId } from '@/domain/identifiers.ts'
import type { Player } from '@/domain/players/player.ts'
import { ROLE_REGISTRY } from '@/domain/roles/role-registry.ts'

export type RoleCount = Readonly<{
  roleId: RoleId
  count: number
}>

export type GameSettingKey = keyof GameSettings

export type GameSetupDraft = Readonly<{
  roster: readonly Player[]
  roleCounts: readonly RoleCount[]
  settings: GameSettings
  nextPlayerNumber: number
}>

export type EmptyPlayerNameError =
  | Readonly<{
      type: 'EMPTY_PLAYER_NAME'
      operation: 'add'
    }>
  | Readonly<{
      type: 'EMPTY_PLAYER_NAME'
      operation: 'rename'
      playerId: PlayerId
    }>

export type PlayerNotFoundError = Readonly<{
  type: 'PLAYER_NOT_FOUND'
  playerId: PlayerId
}>

export type RoleNotFoundError = Readonly<{
  type: 'ROLE_NOT_FOUND'
  roleId: RoleId
}>

export type InvalidRoleCountError = Readonly<{
  type: 'INVALID_ROLE_COUNT'
  roleId: RoleId
  count: number
}>

export type RosterEditError = EmptyPlayerNameError | PlayerNotFoundError
export type RoleCountEditError = RoleNotFoundError | InvalidRoleCountError
export type GameSetupEditError = RosterEditError | RoleCountEditError

// The specification does not yet designate defaults. Phase 2 uses explicit false values only as
// provisional form defaults; they are not authoritative Mafia rules.
const PROVISIONAL_DEFAULT_GAME_SETTINGS: GameSettings = Object.freeze({
  godfatherAndSerialCanKillEachOther: false,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: false,
  revealRoleOnDeath: false,
  allowFirstNightKills: false,
})

export function createInitialGameSetupDraft(): GameSetupDraft {
  return {
    roster: [],
    roleCounts: ROLE_REGISTRY.map((role) => ({ roleId: role.id, count: 0 })),
    settings: { ...PROVISIONAL_DEFAULT_GAME_SETTINGS },
    nextPlayerNumber: 1,
  }
}

export function addPlayer(
  draft: GameSetupDraft,
  submittedName: string,
): DomainResult<GameSetupDraft, EmptyPlayerNameError> {
  const name = submittedName.trim()

  if (name.length === 0) {
    return fail({ type: 'EMPTY_PLAYER_NAME', operation: 'add' })
  }

  const nextPlayerNumber = getNextAvailablePlayerNumber(draft)
  const player: Player = {
    id: playerId(`player-${String(nextPlayerNumber)}`),
    name,
    playing: true,
  }

  return succeed({
    ...draft,
    roster: [...draft.roster, player],
    nextPlayerNumber: nextPlayerNumber === Number.MAX_SAFE_INTEGER ? 1 : nextPlayerNumber + 1,
  })
}

export function renamePlayer(
  draft: GameSetupDraft,
  id: PlayerId,
  submittedName: string,
): DomainResult<GameSetupDraft, EmptyPlayerNameError | PlayerNotFoundError> {
  const name = submittedName.trim()

  if (name.length === 0) {
    return fail({ type: 'EMPTY_PLAYER_NAME', operation: 'rename', playerId: id })
  }

  if (!draft.roster.some((player) => player.id === id)) {
    return fail({ type: 'PLAYER_NOT_FOUND', playerId: id })
  }

  return succeed({
    ...draft,
    roster: draft.roster.map((player) => (player.id === id ? { ...player, name } : player)),
  })
}

export function removePlayer(
  draft: GameSetupDraft,
  id: PlayerId,
): DomainResult<GameSetupDraft, PlayerNotFoundError> {
  if (!draft.roster.some((player) => player.id === id)) {
    return fail({ type: 'PLAYER_NOT_FOUND', playerId: id })
  }

  return succeed({
    ...draft,
    roster: draft.roster.filter((player) => player.id !== id),
  })
}

export function togglePlayerParticipation(
  draft: GameSetupDraft,
  id: PlayerId,
): DomainResult<GameSetupDraft, PlayerNotFoundError> {
  if (!draft.roster.some((player) => player.id === id)) {
    return fail({ type: 'PLAYER_NOT_FOUND', playerId: id })
  }

  return succeed({
    ...draft,
    roster: draft.roster.map((player) =>
      player.id === id ? { ...player, playing: !player.playing } : player,
    ),
  })
}

export function setRoleCount(
  draft: GameSetupDraft,
  id: RoleId,
  count: number,
): DomainResult<GameSetupDraft, RoleNotFoundError | InvalidRoleCountError> {
  if (!draft.roleCounts.some((roleCount) => roleCount.roleId === id)) {
    return fail({ type: 'ROLE_NOT_FOUND', roleId: id })
  }

  if (!isNonNegativeInteger(count)) {
    return fail({ type: 'INVALID_ROLE_COUNT', roleId: id, count })
  }

  return succeed({
    ...draft,
    roleCounts: draft.roleCounts.map((roleCount) =>
      roleCount.roleId === id ? { ...roleCount, count } : roleCount,
    ),
  })
}

export function incrementRoleCount(
  draft: GameSetupDraft,
  id: RoleId,
): DomainResult<GameSetupDraft, RoleNotFoundError | InvalidRoleCountError> {
  const count = getRoleCount(draft, id)

  if (count === undefined) {
    return fail({ type: 'ROLE_NOT_FOUND', roleId: id })
  }

  return setRoleCount(draft, id, count + 1)
}

export function decrementRoleCount(
  draft: GameSetupDraft,
  id: RoleId,
): DomainResult<GameSetupDraft, RoleNotFoundError | InvalidRoleCountError> {
  const count = getRoleCount(draft, id)

  if (count === undefined) {
    return fail({ type: 'ROLE_NOT_FOUND', roleId: id })
  }

  return setRoleCount(draft, id, count - 1)
}

export function setGameSetting(
  draft: GameSetupDraft,
  setting: GameSettingKey,
  value: boolean,
): GameSetupDraft {
  return {
    ...draft,
    settings: {
      ...draft.settings,
      [setting]: value,
    },
  }
}

export function getRoleCount(draft: GameSetupDraft, id: RoleId): number | undefined {
  return draft.roleCounts.find((roleCount) => roleCount.roleId === id)?.count
}

export function getParticipatingPlayerCount(draft: GameSetupDraft): number {
  return draft.roster.filter((player) => player.playing).length
}

export function getSelectedRoleCount(draft: GameSetupDraft): number {
  return draft.roleCounts.reduce(
    (total, roleCount) => (isNonNegativeInteger(roleCount.count) ? total + roleCount.count : total),
    0,
  )
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function getNextAvailablePlayerNumber(draft: GameSetupDraft): number {
  const existingIds = new Set(draft.roster.map((player) => player.id))
  const configuredNextNumber =
    Number.isSafeInteger(draft.nextPlayerNumber) && draft.nextPlayerNumber > 0
      ? draft.nextPlayerNumber
      : 1
  const largestGeneratedNumber = draft.roster.reduce((largest, player) => {
    const match = /^player-(0|[1-9]\d*)$/.exec(player.id)

    if (match === null) {
      return largest
    }

    const rosterNumber = Number(match[1])
    return Number.isSafeInteger(rosterNumber) ? Math.max(largest, rosterNumber) : largest
  }, 0)
  let candidate =
    largestGeneratedNumber < Number.MAX_SAFE_INTEGER
      ? Math.max(configuredNextNumber, largestGeneratedNumber + 1)
      : configuredNextNumber

  while (existingIds.has(playerId(`player-${String(candidate)}`))) {
    candidate = candidate === Number.MAX_SAFE_INTEGER ? 1 : candidate + 1
  }

  return candidate
}
