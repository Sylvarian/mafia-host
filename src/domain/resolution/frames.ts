import type { GameState } from '../game/game-state.ts'
import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { FrameRecord, FrameSource } from './night-resolution-models.ts'
import { freezeResolutionSources } from './resolution-sources.ts'

export function resolveFrames(
  game: GameState,
  effectiveActions: readonly SubmittedNightAction[],
): readonly FrameRecord[] {
  const framerActions = effectiveActions.filter((action) => action.actorRoleId === ROLE_IDS.framer)

  return Object.freeze(
    game.players.flatMap((player): readonly FrameRecord[] => {
      const sources: readonly FrameSource[] = framerActions
        .filter((action) => action.targetPlayerId === player.playerId)
        .map((action) =>
          Object.freeze({
            framerPlayerId: action.actorPlayerId,
            framerRoleInstanceId: action.actorRoleInstanceId,
          }),
        )
      const firstSource = sources[0]
      return firstSource === undefined
        ? []
        : [
            Object.freeze({
              framedPlayerId: player.playerId,
              sources: freezeResolutionSources(firstSource, sources.slice(1)),
            }),
          ]
    }),
  )
}
