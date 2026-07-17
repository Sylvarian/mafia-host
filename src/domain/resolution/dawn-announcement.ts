import type { NightNumber } from '../game/game-records.ts'
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
