import type { PlayerId, RoleId } from '../identifiers.ts'
import type { PersonalWinKind } from '../game/game-records.ts'
import type { RoleInstance } from '../roles/role-instance.ts'

export type GamePlayer = Readonly<{
  playerId: PlayerId
  role: RoleInstance
  alive: boolean
  publiclyRevealedRoleId: RoleId | null
  mayorRevealed: boolean
  executionerTargetId: PlayerId | null
  personalWin: PersonalWinKind | null
}>
