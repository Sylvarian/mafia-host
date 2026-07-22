import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  groupHostPlayersByActiveAlignment,
  selectHostPlayerRoleViews,
} from './host-player-role-view.ts'

describe('canonical host player role views', () => {
  it('uses active promotion and conversion authority with original roles kept as history', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.framer, name: 'Alex' },
        { roleId: ROLE_IDS.executioner, name: 'Alex' },
        { roleId: ROLE_IDS.citizen, name: 'Taylor', alive: false },
      ],
      { phase: 'day-discussion', nightNumber: 2, dayNumber: 2 },
    )
    const promotedPlayer = fixture.game.players[0]
    if (promotedPlayer === undefined) throw new Error('Expected promotion candidate.')
    const game = {
      ...fixture.game,
      godfatherPromotions: [
        {
          gameId: fixture.game.id,
          playerId: promotedPlayer.playerId,
          originalRoleInstanceId: promotedPlayer.role.instanceId,
          promotedAtNightNumber: 2,
          activeRoleId: ROLE_IDS.godfather,
        },
      ],
    }

    const result = selectHostPlayerRoleViews(game, fixture.participants)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected host player role rows.')
    expect(result.value).toMatchObject([
      {
        playerDisplayLabel: 'Alex (Player 1)',
        activeRoleDisplayName: 'Godfather',
        originallyAssignedRoleDisplayName: 'Framer',
        alignment: 'mafia',
      },
      {
        playerDisplayLabel: 'Alex (Player 2)',
        activeRoleDisplayName: 'Jester',
        originallyAssignedRoleDisplayName: 'Executioner',
        alignment: 'neutral',
      },
      {
        playerDisplayLabel: 'Taylor',
        activeRoleDisplayName: 'Citizen',
        originallyAssignedRoleDisplayName: null,
        alignment: 'town',
        status: 'dead',
      },
    ])
    expect(groupHostPlayersByActiveAlignment(result.value).map((group) => group.alignment)).toEqual(
      ['mafia', 'town', 'neutral'],
    )
    expect(JSON.stringify(result.value)).not.toMatch(
      /executionerTarget|personalWin|pendingJester|revenge|blocked|promotionHistory/,
    )
  })

  it('fails when participant identity/order cannot cover the active game exactly', () => {
    const fixture = createNightFixture([{ roleId: ROLE_IDS.godfather }])
    expect(selectHostPlayerRoleViews(fixture.game, [])).toEqual({
      ok: false,
      error: { type: 'INVALID_HOST_PLAYER_ROLE_VIEW', playerId: null },
    })
  })
})
