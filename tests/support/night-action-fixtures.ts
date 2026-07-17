import type { GameSettings } from '../../src/domain/game/game-settings.ts'
import type { GameState } from '../../src/domain/game/game-state.ts'
import {
  gameId,
  playerId,
  roleInstanceId,
  type PlayerId,
  type RoleId,
} from '../../src/domain/identifiers.ts'
import type { GamePhase } from '../../src/domain/phases/game-phase.ts'
import type { Player } from '../../src/domain/players/player.ts'
import { ROLE_REGISTRY, findRoleDefinition } from '../../src/domain/roles/role-registry.ts'
import type { RoleDistributionWorkflow } from '../../src/application/role-assignment/role-distribution-workflow.ts'

export type NightFixtureRole = Readonly<{
  roleId: RoleId
  name?: string
  alive?: boolean
  executionerTargetId?: PlayerId | null
}>

const defaultSettings: GameSettings = {
  godfatherAndSerialCanKillEachOther: false,
  godfatherAppearsSuspiciousToSheriff: true,
  doctorCanSelfProtect: false,
  doctorCannotRepeatPreviousTarget: false,
  revealRoleOnDeath: false,
  allowFirstNightKills: false,
}

export function createNightFixture(
  roles: readonly NightFixtureRole[],
  options: Readonly<{
    phase?: GamePhase
    nightNumber?: number
    settings?: Partial<GameSettings>
    distributionStatus?: RoleDistributionWorkflow['status']
  }> = {},
): Readonly<{
  game: GameState
  distribution: RoleDistributionWorkflow
  participants: readonly Player[]
}> {
  const counts = new Map<RoleId, number>()
  for (const role of roles) {
    counts.set(role.roleId, (counts.get(role.roleId) ?? 0) + 1)
  }

  const nextOrdinal = new Map<RoleId, number>()
  const participants = roles.map((role, index) => ({
    id: playerId(`player-${String(index + 1)}`),
    name: role.name ?? `Player ${String(index + 1)}`,
    playing: true,
  }))
  const settings = { ...defaultSettings, ...options.settings }
  const players = roles.map((role, index) => {
    const count = counts.get(role.roleId) ?? 0
    const ordinal = count > 1 ? (nextOrdinal.get(role.roleId) ?? 0) + 1 : null

    if (ordinal !== null) {
      nextOrdinal.set(role.roleId, ordinal)
    }

    return {
      playerId: participants[index]?.id ?? playerId('fixture-missing-player'),
      role: {
        instanceId: roleInstanceId(`role-instance-${String(index + 1)}`),
        roleId: role.roleId,
        ordinal,
      },
      alive: role.alive ?? true,
      publiclyRevealedRoleId: null,
      mayorRevealed: false,
      executionerTargetId: role.executionerTargetId ?? null,
      personalWin: null,
    }
  })
  const selectedRoleIds = new Set(roles.map((role) => role.roleId))
  const roleDefinitions = ROLE_REGISTRY.filter((role) => selectedRoleIds.has(role.id)).map(
    ({ id, name, faction }) => ({ id, name, faction }),
  )
  const game: GameState = {
    id: gameId('night-fixture-game'),
    phase: options.phase ?? 'role-distribution',
    players,
    roleDefinitions,
    settings,
    nightNumber: options.nightNumber ?? 0,
    dayNumber: 0,
  }
  const roleCounts = ROLE_REGISTRY.map((role) => ({
    roleId: role.id,
    count: roles.filter((selectedRole) => selectedRole.roleId === role.id).length,
  }))
  const setup = { participatingPlayers: participants, roleCounts, settings }
  const distributionStatus = options.distributionStatus ?? 'confirmed'
  let distribution: RoleDistributionWorkflow

  switch (distributionStatus) {
    case 'unassigned':
      distribution = { status: 'unassigned', setup }
      break
    case 'distributing':
      distribution = { status: 'distributing', setup, game, deliveredPlayerIds: [] }
      break
    case 'confirmed':
      distribution = { status: 'confirmed', setup, game }
      break
  }

  return { game, distribution, participants }
}

export function getFixtureRoleName(roleId: RoleId): string {
  return findRoleDefinition(roleId)?.name ?? roleId
}
