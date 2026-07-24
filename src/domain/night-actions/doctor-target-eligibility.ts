import type { GameState } from '../game/game-state.ts'
import type { PlayerId } from '../identifiers.ts'
import { selectActiveRoleId } from '../neutral/executioner-conversion.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'

export function isDoctorProtectionForbiddenForRevealedMayor(
  game: GameState,
  targetPlayerId: PlayerId,
): boolean {
  if (!game.settings.doctorCannotProtectRevealedMayor) {
    return false
  }

  const target = game.players.find((player) => player.playerId === targetPlayerId)
  return (
    target?.alive === true &&
    target.publiclyRevealedRoleId === ROLE_IDS.mayor &&
    selectActiveRoleId(game, target.playerId) === ROLE_IDS.mayor
  )
}
