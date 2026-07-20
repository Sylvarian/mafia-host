import type { PlayerId } from '@/domain/identifiers.ts'
import type { Faction } from '@/domain/roles/faction.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

import type { DistributingRolesWorkflow } from './role-distribution-workflow.ts'

export type RoleDistributionRow = Readonly<{
  playerId: PlayerId
  playerName: string
  roleDisplayName: string
  faction: Faction
  description: string
}>

export function selectRoleDistributionRows(
  workflow: DistributingRolesWorkflow,
): readonly RoleDistributionRow[] {
  return workflow.game.players.map((gamePlayer) => {
    const player = workflow.setup.participatingPlayers.find(
      (participant) => participant.id === gamePlayer.playerId,
    )
    const role = findRoleDefinition(gamePlayer.role.roleId)

    if (player === undefined) {
      throw new Error(
        `Active game player ${gamePlayer.playerId} is absent from its validated setup.`,
      )
    }

    if (role === undefined) {
      throw new Error(
        `Active game role ${gamePlayer.role.roleId} is absent from the role registry.`,
      )
    }

    return {
      playerId: gamePlayer.playerId,
      playerName: player.name,
      roleDisplayName: getRoleInstanceDisplayName(gamePlayer.role, role),
      faction: role.faction,
      description: role.description,
    }
  })
}
