import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import { selectActiveRoleId } from '@/domain/neutral/executioner-conversion.ts'
import type { Player } from '@/domain/players/player.ts'
import type { Faction } from '@/domain/roles/faction.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

export type AlignmentDisplayName = 'Mafia' | 'Town' | 'Neutral'

export type HostPlayerRoleView = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
  status: 'alive' | 'dead'
  activeRoleDisplayName: string
  originallyAssignedRoleDisplayName: string | null
  alignment: Faction
  alignmentDisplayName: AlignmentDisplayName
}>

type ActiveAlignmentPlayer = Pick<HostPlayerRoleView, 'alignment' | 'alignmentDisplayName'>

export type HostPlayerAlignmentGroup<
  PlayerView extends ActiveAlignmentPlayer = HostPlayerRoleView,
> = Readonly<{
  alignment: Faction
  alignmentDisplayName: AlignmentDisplayName
  players: readonly PlayerView[]
}>

export type HostPlayerRoleViewError = Readonly<{
  type: 'INVALID_HOST_PLAYER_ROLE_VIEW'
  playerId: PlayerId | null
}>

export function selectHostPlayerRoleViews(
  game: GameState,
  participants: readonly Player[],
): DomainResult<readonly HostPlayerRoleView[], HostPlayerRoleViewError> {
  if (
    participants.length !== game.players.length ||
    participants.some((participant, index) => participant.id !== game.players[index]?.playerId)
  ) {
    return fail({ type: 'INVALID_HOST_PLAYER_ROLE_VIEW', playerId: null })
  }

  const rows: HostPlayerRoleView[] = []
  for (const gamePlayer of game.players) {
    const participantIndex = participants.findIndex(
      (participant) => participant.id === gamePlayer.playerId,
    )
    const participant = participants[participantIndex]
    const activeRoleId = selectActiveRoleId(game, gamePlayer.playerId)
    const activeRole = activeRoleId === null ? undefined : findRoleDefinition(activeRoleId)
    const originalRole = findRoleDefinition(gamePlayer.role.roleId)
    if (participant === undefined || activeRole === undefined || originalRole === undefined) {
      return fail({ type: 'INVALID_HOST_PLAYER_ROLE_VIEW', playerId: gamePlayer.playerId })
    }
    const duplicateName = participants.some(
      (candidate, candidateIndex) =>
        candidateIndex !== participantIndex && candidate.name === participant.name,
    )

    rows.push(
      Object.freeze({
        playerId: gamePlayer.playerId,
        playerDisplayLabel: duplicateName
          ? `${participant.name} (Player ${String(participantIndex + 1)})`
          : participant.name,
        status: gamePlayer.alive ? ('alive' as const) : ('dead' as const),
        activeRoleDisplayName:
          activeRoleId === gamePlayer.role.roleId
            ? getRoleInstanceDisplayName(gamePlayer.role, activeRole)
            : activeRole.name,
        originallyAssignedRoleDisplayName:
          activeRoleId === gamePlayer.role.roleId
            ? null
            : getRoleInstanceDisplayName(gamePlayer.role, originalRole),
        alignment: activeRole.faction,
        alignmentDisplayName: formatAlignment(activeRole.faction),
      }),
    )
  }

  return succeed(Object.freeze(rows))
}

export function groupHostPlayersByActiveAlignment<PlayerView extends ActiveAlignmentPlayer>(
  players: readonly PlayerView[],
): readonly HostPlayerAlignmentGroup<PlayerView>[] {
  return Object.freeze(
    (['mafia', 'town', 'neutral'] as const).map((alignment) =>
      Object.freeze({
        alignment,
        alignmentDisplayName: formatAlignment(alignment),
        players: Object.freeze(players.filter((player) => player.alignment === alignment)),
      }),
    ),
  )
}

function formatAlignment(faction: Faction): AlignmentDisplayName {
  switch (faction) {
    case 'mafia':
      return 'Mafia'
    case 'town':
      return 'Town'
    case 'neutral':
      return 'Neutral'
  }
}
