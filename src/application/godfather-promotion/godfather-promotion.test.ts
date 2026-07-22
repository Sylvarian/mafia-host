import { describe, expect, it } from 'vitest'

import { beginNextNightActionCollection, ROLE_IDS } from '../night-actions/index.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { selectGodfatherPromotionBriefingView } from './godfather-promotion.ts'

function createPromotionWorkflow() {
  const fixture = createNightFixture(
    [
      { roleId: ROLE_IDS.godfather, name: 'Alex', alive: false },
      { roleId: ROLE_IDS.framer, name: 'Alex' },
      { roleId: ROLE_IDS.citizen, name: 'Taylor' },
    ],
    { phase: 'execution-resolution', nightNumber: 1, dayNumber: 1 },
  )
  const result = beginNextNightActionCollection(fixture.game, fixture.participants, {
    next: () => 0,
  })
  if (!result.ok || result.value.promotion === null) {
    throw new Error('Expected a Godfather promotion workflow.')
  }
  return result.value.workflow
}

describe('Godfather promotion briefing selector', () => {
  it('returns the duplicate-safe promoted player label', () => {
    expect(selectGodfatherPromotionBriefingView(createPromotionWorkflow())).toEqual({
      ok: true,
      value: {
        nightNumber: 2,
        roleDisplayName: 'Godfather',
        alignment: 'mafia',
        alignmentDisplayName: 'Mafia',
        promotedPlayerDisplayLabel: 'Alex (Player 2)',
      },
    })
  })

  it('fails with a structured error when the promoted player is absent from participants', () => {
    const workflow = createPromotionWorkflow()
    const promotion = workflow.game.godfatherPromotions[0]
    if (promotion === undefined) throw new Error('Expected promotion authority.')

    expect(
      selectGodfatherPromotionBriefingView({
        ...workflow,
        participants: workflow.participants.filter(
          (participant) => participant.id !== promotion.playerId,
        ),
      }),
    ).toEqual({
      ok: false,
      error: { type: 'INVALID_GODFATHER_PROMOTION_PLAYER' },
    })
  })
})
