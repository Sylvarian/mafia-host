import type { GameState } from '../game/game-state.ts'
import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { ProtectionRecord, ProtectionSource } from './night-resolution-models.ts'
import { freezeResolutionSources } from './resolution-sources.ts'

export function resolveProtections(
  game: GameState,
  effectiveActions: readonly SubmittedNightAction[],
): readonly ProtectionRecord[] {
  const doctorActions = effectiveActions.filter((action) => action.actorRoleId === ROLE_IDS.doctor)

  return Object.freeze(
    game.players.flatMap((player): readonly ProtectionRecord[] => {
      const sources: readonly ProtectionSource[] = doctorActions
        .filter((action) => action.targetPlayerId === player.playerId)
        .map((action) =>
          Object.freeze({
            doctorPlayerId: action.actorPlayerId,
            doctorRoleInstanceId: action.actorRoleInstanceId,
          }),
        )
      const firstSource = sources[0]
      return firstSource === undefined
        ? []
        : [
            Object.freeze({
              protectedPlayerId: player.playerId,
              sources: freezeResolutionSources(firstSource, sources.slice(1)),
            }),
          ]
    }),
  )
}
