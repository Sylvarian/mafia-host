import type { GameState } from '../game/game-state.ts'
import type { RoleId } from '../identifiers.ts'
import type { SubmittedNightAction } from '../night-actions/night-action.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type {
  AttackAttempt,
  AttackOutcome,
  AttackSource,
  ProtectionRecord,
  ProvisionalDeath,
} from './night-resolution-models.ts'
import { freezeResolutionSources } from './resolution-sources.ts'

export function resolveAttacks(
  game: GameState,
  effectiveActions: readonly SubmittedNightAction[],
  protections: readonly ProtectionRecord[],
): readonly AttackAttempt[] {
  const protectedPlayerIds = new Set(protections.map((record) => record.protectedPlayerId))
  return Object.freeze(
    effectiveActions.flatMap((action): readonly AttackAttempt[] => {
      if (
        action.actorRoleId !== ROLE_IDS.godfather &&
        action.actorRoleId !== ROLE_IDS.serialKiller
      ) {
        return []
      }

      const target = game.players.find((player) => player.playerId === action.targetPlayerId)
      if (target === undefined) {
        throw new Error(`Validated attack target ${action.targetPlayerId} is missing.`)
      }

      return [
        Object.freeze({
          attackerPlayerId: action.actorPlayerId,
          attackerRoleId: action.actorRoleId,
          attackerRoleInstanceId: action.actorRoleInstanceId,
          targetPlayerId: action.targetPlayerId,
          outcome: determineAttackOutcome(
            action.actorRoleId,
            target.role.roleId,
            game.settings.godfatherAndSerialCanKillEachOther,
            protectedPlayerIds.has(target.playerId),
          ),
        }),
      ]
    }),
  )
}

export function determineProvisionalDeaths(
  game: GameState,
  attacks: readonly AttackAttempt[],
): readonly ProvisionalDeath[] {
  return Object.freeze(
    game.players.flatMap((player): readonly ProvisionalDeath[] => {
      const sources: readonly AttackSource[] = attacks
        .filter(
          (attack) => attack.outcome === 'lethal' && attack.targetPlayerId === player.playerId,
        )
        .map((attack) =>
          Object.freeze({
            attackerPlayerId: attack.attackerPlayerId,
            attackerRoleId: attack.attackerRoleId,
            attackerRoleInstanceId: attack.attackerRoleInstanceId,
          }),
        )
      const firstSource = sources[0]
      return firstSource === undefined
        ? []
        : [
            Object.freeze({
              deadPlayerId: player.playerId,
              actualRoleId: player.role.roleId,
              nightNumber: game.nightNumber,
              sources: freezeResolutionSources(firstSource, sources.slice(1)),
            }),
          ]
    }),
  )
}

function determineAttackOutcome(
  attackerRoleId: RoleId,
  targetRoleId: GameState['players'][number]['role']['roleId'],
  mutualKillingEnabled: boolean,
  targetProtected: boolean,
): AttackOutcome {
  const targetsOpposingKillingRole =
    (attackerRoleId === ROLE_IDS.godfather && targetRoleId === ROLE_IDS.serialKiller) ||
    (attackerRoleId === ROLE_IDS.serialKiller && targetRoleId === ROLE_IDS.godfather)

  if (targetsOpposingKillingRole && !mutualKillingEnabled) {
    return 'mutual-kill-disabled'
  }

  return targetProtected ? 'protected' : 'lethal'
}
