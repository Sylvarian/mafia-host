import type { NightNumber } from '../game/game-records.ts'
import type { GameState } from '../game/game-state.ts'
import type { PlayerId, RoleId } from '../identifiers.ts'

export type DawnDeath = Readonly<{
  playerId: PlayerId
  revealedRoleId: RoleId | null
}>

export type DawnAnnouncement =
  | Readonly<{
      outcome: 'no-deaths'
      nightNumber: NightNumber
    }>
  | Readonly<{
      outcome: 'deaths'
      nightNumber: NightNumber
      deaths: readonly DawnDeath[]
    }>

export function buildCurrentDawnAnnouncement(game: GameState): DawnAnnouncement {
  const currentDeathPlayerIds = new Set(
    game.deathRecords.flatMap((record): readonly PlayerId[] => {
      switch (record.cause.kind) {
        case 'night-death':
        case 'jester-revenge':
          return record.cause.nightNumber === game.nightNumber ? [record.playerId] : []
        case 'day-execution':
          return []
      }
    }),
  )
  if (currentDeathPlayerIds.size === 0) {
    return Object.freeze({
      outcome: 'no-deaths',
      nightNumber: game.nightNumber,
    })
  }
  return Object.freeze({
    outcome: 'deaths',
    nightNumber: game.nightNumber,
    deaths: Object.freeze(
      game.players.flatMap((player): readonly DawnDeath[] =>
        currentDeathPlayerIds.has(player.playerId)
          ? [
              Object.freeze({
                playerId: player.playerId,
                revealedRoleId: player.publiclyRevealedRoleId,
              }),
            ]
          : [],
      ),
    ),
  })
}
