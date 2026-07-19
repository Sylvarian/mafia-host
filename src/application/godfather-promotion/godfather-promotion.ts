import type { PlayerId } from '@/domain/identifiers.ts'

import type { CollectingNightActionsWorkflow } from '../night-actions/index.ts'

export type GodfatherPromotionBriefingView = Readonly<{
  nightNumber: number
  promotedPlayerDisplayLabel: string
}>

export type GodfatherPromotionBriefingViewError =
  | Readonly<{ type: 'MISSING_CURRENT_GODFATHER_PROMOTION' }>
  | Readonly<{ type: 'MULTIPLE_CURRENT_GODFATHER_PROMOTIONS' }>
  | Readonly<{ type: 'INVALID_GODFATHER_PROMOTION_PLAYER' }>

export function selectGodfatherPromotionBriefingView(
  workflow: CollectingNightActionsWorkflow,
):
  | Readonly<{ ok: true; value: GodfatherPromotionBriefingView }>
  | Readonly<{ ok: false; error: GodfatherPromotionBriefingViewError }> {
  const promotions = workflow.game.godfatherPromotions.filter(
    (promotion) => promotion.promotedAtNightNumber === workflow.game.nightNumber,
  )
  if (promotions.length === 0) {
    return { ok: false, error: { type: 'MISSING_CURRENT_GODFATHER_PROMOTION' } }
  }
  if (promotions.length !== 1) {
    return { ok: false, error: { type: 'MULTIPLE_CURRENT_GODFATHER_PROMOTIONS' } }
  }
  const promotion = promotions[0]
  if (
    promotion === undefined ||
    !workflow.game.players.some(
      (player) =>
        player.playerId === promotion.playerId &&
        player.role.instanceId === promotion.originalRoleInstanceId,
    )
  ) {
    return { ok: false, error: { type: 'INVALID_GODFATHER_PROMOTION_PLAYER' } }
  }
  const participantIndex = workflow.participants.findIndex(
    (participant) => participant.id === promotion.playerId,
  )
  const participant = workflow.participants[participantIndex]
  if (participant === undefined) {
    return { ok: false, error: { type: 'INVALID_GODFATHER_PROMOTION_PLAYER' } }
  }
  return {
    ok: true,
    value: Object.freeze({
      nightNumber: workflow.game.nightNumber,
      promotedPlayerDisplayLabel: selectPlayerDisplayLabel(
        workflow.participants,
        participantIndex,
        participant,
      ),
    }),
  }
}

function selectPlayerDisplayLabel(
  participants: readonly Readonly<{ id: PlayerId; name: string }>[],
  index: number,
  participant: Readonly<{ name: string }>,
): string {
  const duplicate = participants.some(
    (candidate, candidateIndex) => candidateIndex !== index && candidate.name === participant.name,
  )
  return duplicate ? `${participant.name} (Player ${String(index + 1)})` : participant.name
}
