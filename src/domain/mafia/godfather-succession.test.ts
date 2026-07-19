import { describe, expect, it, vi } from 'vitest'

import { validateGameState } from '@/domain/game/game-invariants.ts'
import { handleGameCommand } from '@/domain/game/game-reducer.ts'
import { INVESTIGATION_GROUP_IDS } from '@/domain/investigation/investigation-groups.ts'
import { selectActiveRoleId } from '@/domain/neutral/executioner-conversion.ts'
import type { SubmittedNightAction } from '@/domain/night-actions/night-action.ts'
import { resolveInvestigationResults } from '@/domain/resolution/investigation-results.ts'
import { resolveSheriffResults } from '@/domain/resolution/sheriff-results.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import { applyGodfatherSuccessionForStartedNight } from './godfather-succession.ts'

describe('Godfather succession', () => {
  it('does nothing without consuming randomness while a living original Godfather exists', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.framer }],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const next = vi.fn(() => 0)
    const result = applyGodfatherSuccessionForStartedNight(fixture.game, { next })

    expect(result).toEqual({
      ok: true,
      value: { game: fixture.game, promotion: null },
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('promotes exactly one canonical living Mafia candidate with one injected sample', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const next = vi.fn(() => 0.75)
    const result = applyGodfatherSuccessionForStartedNight(fixture.game, { next })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected promotion: ${result.error.type}`)
    const selected = fixture.game.players[2]
    if (selected === undefined) throw new Error('Expected selected Consort.')
    expect(next).toHaveBeenCalledOnce()
    expect(result.value.promotion).toEqual({
      gameId: fixture.game.id,
      playerId: selected.playerId,
      originalRoleInstanceId: selected.role.instanceId,
      promotedAtNightNumber: 2,
      activeRoleId: ROLE_IDS.godfather,
    })
    expect(result.value.game.players[2]?.role).toEqual(selected.role)
    expect(selectActiveRoleId(result.value.game, selected.playerId)).toBe(ROLE_IDS.godfather)
  })

  it('promotes a living Mafia member on a later night when no Godfather was assigned', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.consort }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const result = applyGodfatherSuccessionForStartedNight(fixture.game, { next: () => 0 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`Expected promotion: ${result.error.type}`)
    const promotedPlayer = fixture.game.players[0]
    if (promotedPlayer === undefined) throw new Error('Expected promotion candidate.')
    expect(result.value.promotion?.playerId).toBe(promotedPlayer.playerId)
    expect(selectActiveRoleId(result.value.game, promotedPlayer.playerId)).toBe(ROLE_IDS.godfather)
  })

  it('does not apply succession before an explicit compatibility cutover', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather, alive: false }, { roleId: ROLE_IDS.framer }],
      {
        phase: 'night-action-collection',
        nightNumber: 2,
        godfatherSuccessionStartNightNumber: 3,
      },
    )
    const next = vi.fn(() => 0)

    expect(applyGodfatherSuccessionForStartedNight(fixture.game, { next })).toEqual({
      ok: true,
      value: { game: fixture.game, promotion: null },
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('fails closed when an earlier required promotion is missing from history', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather, alive: false }, { roleId: ROLE_IDS.framer }],
      { phase: 'night-action-collection', nightNumber: 3 },
    )
    const missingHistory = {
      ...fixture.game,
      deathRecords: fixture.game.deathRecords.map((record) => ({
        ...record,
        cause: { kind: 'night-death' as const, nightNumber: 1 },
      })),
    }

    expect(applyGodfatherSuccessionForStartedNight(missingHistory, { next: () => 0 })).toEqual({
      ok: false,
      error: { type: 'GODFATHER_PROMOTION_APPLICATION_REJECTED' },
    })
  })

  it('fails closed on invalid randomness and does not partially promote', () => {
    const fixture = createNightFixture(
      [{ roleId: ROLE_IDS.godfather, alive: false }, { roleId: ROLE_IDS.framer }],
      { phase: 'night-action-collection', nightNumber: 2 },
    )

    expect(applyGodfatherSuccessionForStartedNight(fixture.game, { next: () => 1 })).toEqual({
      ok: false,
      error: { type: 'INVALID_GODFATHER_PROMOTION_RANDOM_OUTPUT', value: 1 },
    })
    expect(fixture.game.godfatherPromotions).toEqual([])
  })

  it('skips succession with no living Mafia or with duplicate living Godfathers', () => {
    const noMafia = createNightFixture(
      [{ roleId: ROLE_IDS.godfather, alive: false }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const duplicates = createNightFixture(
      [{ roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.godfather }, { roleId: ROLE_IDS.framer }],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const next = vi.fn(() => 0)

    expect(applyGodfatherSuccessionForStartedNight(noMafia.game, { next })).toMatchObject({
      ok: true,
      value: { promotion: null },
    })
    expect(applyGodfatherSuccessionForStartedNight(duplicates.game, { next })).toMatchObject({
      ok: true,
      value: { promotion: null },
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects Night 1 and the wrong phase', () => {
    const nightOne = createNightFixture(
      [{ roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.citizen }],
      { phase: 'night-action-collection', nightNumber: 1 },
    )
    const day = createNightFixture([{ roleId: ROLE_IDS.framer }, { roleId: ROLE_IDS.citizen }], {
      phase: 'day-discussion',
      nightNumber: 1,
    })

    expect(applyGodfatherSuccessionForStartedNight(nightOne.game, { next: () => 0 })).toEqual({
      ok: false,
      error: { type: 'GODFATHER_PROMOTION_NOT_ALLOWED_ON_NIGHT_ONE' },
    })
    expect(applyGodfatherSuccessionForStartedNight(day.game, { next: () => 0 })).toEqual({
      ok: false,
      error: { type: 'GODFATHER_SUCCESSION_WRONG_PHASE', currentPhase: 'day-discussion' },
    })
  })

  it('uses the promoted Godfather role for Sheriff and Investigator results', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.sheriff },
        { roleId: ROLE_IDS.investigator },
      ],
      {
        phase: 'night-action-collection',
        nightNumber: 2,
        settings: { godfatherAppearsSuspiciousToSheriff: true },
      },
    )
    const promotion = applyGodfatherSuccessionForStartedNight(fixture.game, { next: () => 0 })
    if (!promotion.ok) throw new Error('Expected promoted Framer.')
    const target = promotion.value.game.players[1]
    const sheriff = promotion.value.game.players[2]
    const investigator = promotion.value.game.players[3]
    if (target === undefined || sheriff === undefined || investigator === undefined) {
      throw new Error('Expected investigation actors and target.')
    }
    const actions: readonly SubmittedNightAction[] = [
      {
        actorPlayerId: sheriff.playerId,
        actorRoleId: ROLE_IDS.sheriff,
        actorRoleInstanceId: sheriff.role.instanceId,
        actionKind: 'investigate',
        targetPlayerId: target.playerId,
      },
      {
        actorPlayerId: investigator.playerId,
        actorRoleId: ROLE_IDS.investigator,
        actorRoleInstanceId: investigator.role.instanceId,
        actionKind: 'investigate',
        targetPlayerId: target.playerId,
      },
    ]

    expect(resolveSheriffResults(promotion.value.game, actions, [])).toMatchObject({
      ok: true,
      value: [{ status: 'suspicious', targetPlayerId: target.playerId }],
    })
    expect(resolveInvestigationResults(promotion.value.game, actions, [])).toMatchObject({
      ok: true,
      value: [{ group: { id: INVESTIGATION_GROUP_IDS.groupA } }],
    })
  })

  it('allows a later replacement after a promoted Godfather dies', () => {
    const nightTwo = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather, alive: false },
        { roleId: ROLE_IDS.framer },
        { roleId: ROLE_IDS.consort },
        { roleId: ROLE_IDS.citizen },
      ],
      { phase: 'night-action-collection', nightNumber: 2 },
    )
    const first = applyGodfatherSuccessionForStartedNight(nightTwo.game, { next: () => 0 })
    if (!first.ok || first.value.promotion === null) {
      throw new Error('Expected first promotion.')
    }
    const firstPromotedPlayer = first.value.game.players[1]
    if (firstPromotedPlayer === undefined) throw new Error('Expected promoted Framer.')
    const currentGame = validateGameState({
      ...first.value.game,
      phase: 'execution-resolution',
      nightNumber: 2,
      dayNumber: 2,
      players: first.value.game.players.map((player) =>
        player.playerId === firstPromotedPlayer.playerId ? { ...player, alive: false } : player,
      ),
      deathRecords: [
        ...first.value.game.deathRecords,
        {
          gameId: first.value.game.id,
          playerId: firstPromotedPlayer.playerId,
          roleInstanceId: firstPromotedPlayer.role.instanceId,
          cause: { kind: 'night-death' as const, nightNumber: 2 },
        },
      ],
      dayOutcomes: [
        ...first.value.game.dayOutcomes,
        { kind: 'no-execution' as const, gameId: first.value.game.id, dayNumber: 2 },
      ],
    })
    if (!currentGame.ok) throw new Error(`Expected valid history: ${currentGame.error.type}`)

    const next = vi.fn(() => 0)
    const startedNightThree = handleGameCommand(currentGame.value, {
      type: 'ADVANCE_PHASE',
      targetPhase: 'night-action-collection',
    })
    if (!startedNightThree.ok) throw new Error('Expected Night 3 transition.')
    const second = applyGodfatherSuccessionForStartedNight(startedNightThree.value.state, { next })
    if (!second.ok) throw new Error(`Expected Night 3: ${second.error.type}`)
    expect(second.value.game.godfatherPromotions).toHaveLength(2)
    expect(second.value.promotion?.playerId).toBe(nightTwo.game.players[2]?.playerId)
    expect(next).toHaveBeenCalledOnce()
  })
})
