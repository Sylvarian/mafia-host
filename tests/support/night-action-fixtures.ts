import type { GameSettings } from '../../src/domain/game/game-settings.ts'
import type { DoctorPreviousTarget } from '../../src/domain/game/doctor-previous-target.ts'
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
import {
  ROLE_IDS,
  ROLE_REGISTRY,
  findRoleDefinition,
} from '../../src/domain/roles/role-registry.ts'
import type { RoleDistributionWorkflow } from '../../src/application/role-assignment/role-distribution-workflow.ts'

export { ROLE_IDS as FIXTURE_ROLE_IDS }

export type NightFixtureRole = Readonly<{
  roleId: RoleId
  name?: string
  alive?: boolean
  executionerTargetId?: PlayerId | null
}>

export function nightFixturePlayerId(value: string): PlayerId {
  return playerId(value)
}

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
    dayNumber?: number
    settings?: Partial<GameSettings>
    distributionStatus?: RoleDistributionWorkflow['status']
    doctorPreviousTargets?: readonly DoctorPreviousTarget[]
    executionerBriefingStatus?: GameState['executionerBriefingStatus']
    godfatherSuccessionStartNightNumber?: number
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
      publiclyRevealedRoleId:
        role.alive === false && settings.revealRoleOnDeath ? role.roleId : null,
    }
  })
  const selectedRoleIds = new Set(roles.map((role) => role.roleId))
  const roleDefinitions = ROLE_REGISTRY.filter((role) => selectedRoleIds.has(role.id)).map(
    ({ id, name, faction }) => ({ id, name, faction }),
  )
  const fixtureGameId = gameId('night-fixture-game')
  const phase = options.phase ?? 'role-distribution'
  const nightNumber = options.nightNumber ?? 0
  const dayNumber = options.dayNumber ?? inferDayNumber(phase, nightNumber)
  const defaultExecutionerTarget = players.find(
    (player) => findRoleDefinition(player.role.roleId)?.faction === 'town',
  )
  const executionerTargets = roles.flatMap((role, index) => {
    if (role.roleId !== ROLE_IDS.executioner) {
      return []
    }

    const owner = players[index]
    const selectedTargetId =
      role.executionerTargetId === undefined
        ? phase === 'role-distribution'
          ? undefined
          : defaultExecutionerTarget?.playerId
        : role.executionerTargetId === null
          ? undefined
          : role.executionerTargetId

    return owner === undefined || selectedTargetId === undefined
      ? []
      : [
          {
            gameId: fixtureGameId,
            executionerPlayerId: owner.playerId,
            executionerRoleInstanceId: owner.role.instanceId,
            targetPlayerId: selectedTargetId,
          },
        ]
  })
  const requiresFinalDeathAuthority = phase !== 'role-distribution'
  const deathRecords = requiresFinalDeathAuthority
    ? players.flatMap((player) =>
        player.alive
          ? []
          : [
              {
                gameId: fixtureGameId,
                playerId: player.playerId,
                roleInstanceId: player.role.instanceId,
                cause: {
                  kind: 'night-death' as const,
                  nightNumber:
                    (phase === 'night-action-collection' || phase === 'night-resolution') &&
                    nightNumber > 1
                      ? nightNumber - 1
                      : Math.max(1, nightNumber),
                },
              },
            ],
      )
    : []
  const deadPlayerIds = new Set(deathRecords.map((record) => record.playerId))
  const executionerConversions = executionerTargets.flatMap((target) =>
    deadPlayerIds.has(target.targetPlayerId)
      ? [
          {
            kind: 'executioner-to-jester' as const,
            gameId: fixtureGameId,
            playerId: target.executionerPlayerId,
            roleInstanceId: target.executionerRoleInstanceId,
            targetPlayerId: target.targetPlayerId,
          },
        ]
      : [],
  )
  const game: GameState = {
    id: fixtureGameId,
    phase,
    players,
    roleDefinitions,
    settings,
    nightNumber,
    dayNumber,
    doctorPreviousTargets: options.doctorPreviousTargets ?? [],
    executionerTargets,
    executionerBriefingStatus:
      options.executionerBriefingStatus ??
      (phase === 'role-distribution'
        ? 'not-started'
        : roles.some((role) => role.roleId === ROLE_IDS.executioner)
          ? phase === 'executioner-briefing'
            ? 'pending'
            : 'completed'
          : 'not-required'),
    deathRecords,
    personalWins: [],
    executionerConversions,
    godfatherSuccessionStartNightNumber: options.godfatherSuccessionStartNightNumber ?? 2,
    godfatherPromotions: [],
    pendingJesterRevenges: [],
    jesterRevengeResolutions: [],
    dayOutcomes: Array.from({ length: completedDayCount(phase, dayNumber) }, (_, index) => ({
      kind: 'no-execution' as const,
      gameId: fixtureGameId,
      dayNumber: index + 1,
    })),
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
      distribution = {
        status: 'distributing',
        setup,
        game,
        roleCardDistributionPlayerIds: game.players.map((player) => player.playerId),
      }
      break
    case 'confirmed':
      distribution = {
        status: 'confirmed',
        setup,
        game,
        roleCardDistributionPlayerIds: game.players.map((player) => player.playerId),
      }
      break
  }

  return { game, distribution, participants }
}

function inferDayNumber(phase: GamePhase, nightNumber: number): number {
  switch (phase) {
    case 'executioner-briefing':
    case 'night-action-collection':
    case 'night-resolution':
    case 'dawn-resolution':
    case 'dawn-announcement':
      return Math.max(0, nightNumber - 1)
    case 'day-discussion':
    case 'trial':
    case 'trial-voting':
    case 'execution-resolution':
    case 'game-over':
      return nightNumber
    case 'roster':
    case 'setup':
    case 'role-distribution':
      return 0
  }
}

function completedDayCount(phase: GamePhase, dayNumber: number): number {
  switch (phase) {
    case 'day-discussion':
    case 'trial':
    case 'trial-voting':
      return Math.max(0, dayNumber - 1)
    case 'night-action-collection':
    case 'night-resolution':
    case 'dawn-resolution':
    case 'dawn-announcement':
    case 'execution-resolution':
    case 'game-over':
      return dayNumber
    case 'roster':
    case 'setup':
    case 'role-distribution':
    case 'executioner-briefing':
      return 0
  }
}

export function getFixtureRoleName(roleId: RoleId): string {
  return findRoleDefinition(roleId)?.name ?? roleId
}
