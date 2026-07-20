import { describe, expect, it } from 'vitest'

import { executePlayerDuringDay } from '@/domain/day/day-outcome.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'
import { evaluateFactionVictory } from '@/domain/win-conditions/faction-victory.ts'
import { createNightFixture } from '../../../tests/support/night-action-fixtures.ts'
import {
  beginNextNightActionCollection,
  confirmNightActionTarget,
  continueNightActionCollection,
  createNightActionCollectionForStartedNight,
  type ActiveNightActionCollectionWorkflow,
  type CompleteNightActionsWorkflow,
} from '../night-actions/index.ts'
import {
  beginFinalNightResolution,
  continueJesterRevengeResolution,
  prepareDawnAnnouncement,
} from './night-completion-workflow.ts'

function pendingNight(
  roles: Parameters<typeof createNightFixture>[0],
): ActiveNightActionCollectionWorkflow {
  const fixture = createNightFixture(roles, {
    phase: 'day-discussion',
    nightNumber: 1,
    settings: {
      allowFirstNightKills: false,
      doctorCanSelfProtect: true,
      revealRoleOnDeath: true,
    },
  })
  const jester = fixture.game.players[0]
  if (jester === undefined) throw new Error('Expected a Jester.')
  const execution = executePlayerDuringDay(fixture.game, jester.playerId)
  if (!execution.ok) throw new Error('Expected Jester execution.')
  const begun = beginNextNightActionCollection(execution.value, fixture.participants, {
    next: () => 0,
  })
  if (!begun.ok) throw new Error(`Expected Night 2: ${begun.error.type}`)
  const advanced = continueNightActionCollection(begun.value.workflow)
  if (!advanced.ok) throw new Error('Expected Mafia overview continuation.')
  return advanced.value
}

function confirm(
  workflow: ActiveNightActionCollectionWorkflow,
  targetPlayerId: PlayerId,
): ActiveNightActionCollectionWorkflow {
  if (workflow.status !== 'collecting') throw new Error('Expected a collecting actor.')
  const result = confirmNightActionTarget(workflow, targetPlayerId)
  if (!result.ok) throw new Error(`Expected action confirmation: ${result.error.type}`)
  return result.value
}

function complete(workflow: ActiveNightActionCollectionWorkflow): CompleteNightActionsWorkflow {
  if (workflow.status !== 'complete') throw new Error('Expected completed Night 2 actions.')
  return workflow
}

describe('Phase 7E Dawn completion ordering', () => {
  it('applies ordinary deaths first and selects revenge from protected post-ordinary survivors', () => {
    let workflow = pendingNight([
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.serialKiller },
      { roleId: ROLE_IDS.doctor },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.citizen },
    ])
    const ordinaryVictim = workflow.game.players[4]
    const protectedVictim = workflow.game.players[5]
    if (ordinaryVictim === undefined || protectedVictim === undefined) {
      throw new Error('Expected Night 2 victims.')
    }
    workflow = confirm(workflow, protectedVictim.playerId)
    workflow = confirm(workflow, ordinaryVictim.playerId)
    workflow = confirm(workflow, protectedVictim.playerId)
    const ready = beginFinalNightResolution(complete(workflow))
    if (!ready.ok) throw new Error(`Expected night resolution: ${ready.error.type}`)
    const revenge = prepareDawnAnnouncement(ready.value, { next: () => 0.61 })

    expect(revenge.ok).toBe(true)
    if (!revenge.ok || revenge.value.status !== 'revenge-resolution') {
      throw new Error('Expected pending revenge resolution.')
    }
    expect(revenge.value.game.players[4]).toMatchObject({ alive: false })
    expect(revenge.value.game.players[5]).toMatchObject({ alive: true })
    expect(revenge.value.game.deathRecords.at(-1)).toMatchObject({
      playerId: ordinaryVictim.playerId,
      cause: { kind: 'night-death', nightNumber: 2 },
    })
    expect(revenge.value.selectedRevenge.victimPlayerId).toBe(protectedVictim.playerId)
    expect(
      revenge.value.game.deathRecords.some((record) => record.cause.kind === 'jester-revenge'),
    ).toBe(false)

    const dawn = continueJesterRevengeResolution(revenge.value)
    expect(dawn.ok).toBe(true)
    if (!dawn.ok || dawn.value.status !== 'dawn') throw new Error('Expected non-terminal Dawn 2.')
    expect(dawn.value.game.deathRecords.slice(-2).map((record) => record.cause.kind)).toEqual([
      'night-death',
      'jester-revenge',
    ])
    expect(dawn.value.dawnAnnouncement).toEqual({
      outcome: 'deaths',
      nightNumber: 2,
      deaths: [
        { playerId: ordinaryVictim.playerId, revealedRoleId: ROLE_IDS.citizen },
        { playerId: protectedVictim.playerId, revealedRoleId: ROLE_IDS.citizen },
      ],
    })
  })

  it('defers victory until due revenge is applied and then enters terminal game over', () => {
    let workflow = pendingNight([
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.citizen },
      { roleId: ROLE_IDS.citizen },
    ])
    const ordinaryVictim = workflow.game.players[2]
    const revengeVictim = workflow.game.players[3]
    if (ordinaryVictim === undefined || revengeVictim === undefined) {
      throw new Error('Expected two Town victims.')
    }
    workflow = confirm(workflow, ordinaryVictim.playerId)
    const ready = beginFinalNightResolution(complete(workflow))
    if (!ready.ok) throw new Error('Expected night resolution.')
    const revenge = prepareDawnAnnouncement(ready.value, { next: () => 0.99 })
    if (!revenge.ok || revenge.value.status !== 'revenge-resolution') {
      throw new Error('Expected selected revenge.')
    }

    expect(evaluateFactionVictory(revenge.value.game)).toEqual({
      ok: false,
      error: { type: 'PENDING_JESTER_REVENGE_BLOCKS_VICTORY' },
    })
    expect(revenge.value.selectedRevenge.victimPlayerId).toBe(revengeVictim.playerId)
    const terminal = continueJesterRevengeResolution(revenge.value)

    expect(terminal.ok).toBe(true)
    if (!terminal.ok) throw new Error('Expected terminal post-revenge result.')
    expect(terminal.value).toMatchObject({
      status: 'game-over',
      game: {
        phase: 'game-over',
        nightNumber: 2,
        dayNumber: 1,
        pendingJesterRevenges: [],
      },
      result: { kind: 'mafia-victory' },
    })
    expect(terminal.value).not.toHaveProperty('dawnAnnouncement')
  })

  it('settles a post-revenge opposing-killer stalemate without exposing another Dawn or night', () => {
    let workflow = pendingNight([
      { roleId: ROLE_IDS.jester },
      { roleId: ROLE_IDS.godfather },
      { roleId: ROLE_IDS.serialKiller },
      { roleId: ROLE_IDS.citizen },
    ])
    const godfather = workflow.game.players[1]
    const serialKiller = workflow.game.players[2]
    const revengeVictim = workflow.game.players[3]
    if (godfather === undefined || serialKiller === undefined || revengeVictim === undefined) {
      throw new Error('Expected final-two workflow players.')
    }
    workflow = confirm(workflow, serialKiller.playerId)
    workflow = confirm(workflow, godfather.playerId)
    const ready = beginFinalNightResolution(complete(workflow))
    if (!ready.ok) throw new Error(`Expected night resolution: ${ready.error.type}`)
    const revenge = prepareDawnAnnouncement(ready.value, { next: () => 0.99 })
    if (!revenge.ok || revenge.value.status !== 'revenge-resolution') {
      throw new Error('Expected selected revenge.')
    }
    expect(revenge.value.selectedRevenge.victimPlayerId).toBe(revengeVictim.playerId)

    const terminal = continueJesterRevengeResolution(revenge.value)

    expect(terminal.ok).toBe(true)
    if (!terminal.ok || terminal.value.status !== 'game-over') {
      throw new Error('Expected final-two terminal result.')
    }
    expect(terminal.value.result).toEqual({
      kind: 'draw',
      gameId: workflow.game.id,
      reason: 'opposing-killers-stalemate',
    })
    expect(terminal.value.game.players.slice(1, 3).every((player) => player.alive)).toBe(true)
    expect(
      terminal.value.game.deathRecords.filter(
        (record) => record.cause.kind === 'final-killing-role-showdown',
      ),
    ).toEqual([])
    expect(terminal.value).not.toHaveProperty('dawnAnnouncement')
    expect(terminal.value).not.toHaveProperty('nextNight')
  })

  it('applies a post-Dawn mutual showdown after ordinary deaths leave the opposing final two', () => {
    const fixture = createNightFixture(
      [
        { roleId: ROLE_IDS.godfather },
        { roleId: ROLE_IDS.serialKiller },
        { roleId: ROLE_IDS.citizen },
      ],
      {
        phase: 'night-action-collection',
        nightNumber: 2,
        settings: {
          allowFirstNightKills: false,
          godfatherAndSerialCanKillEachOther: true,
        },
      },
    )
    const citizen = fixture.game.players[2]
    if (citizen === undefined) throw new Error('Expected an ordinary night victim.')
    const started = createNightActionCollectionForStartedNight(fixture.game, fixture.participants)
    if (!started.ok) throw new Error(`Expected Night 2 workflow: ${started.error.type}`)
    const afterOverview = continueNightActionCollection(started.value)
    if (!afterOverview.ok) throw new Error('Expected Mafia overview continuation.')

    let workflow: ActiveNightActionCollectionWorkflow = afterOverview.value
    workflow = confirm(workflow, citizen.playerId)
    workflow = confirm(workflow, citizen.playerId)
    const ready = beginFinalNightResolution(complete(workflow))
    if (!ready.ok) throw new Error(`Expected night resolution: ${ready.error.type}`)
    const terminal = prepareDawnAnnouncement(ready.value, { next: () => 0 })

    expect(terminal.ok).toBe(true)
    if (!terminal.ok || terminal.value.status !== 'game-over') {
      throw new Error('Expected a terminal post-Dawn showdown.')
    }
    expect(terminal.value.result).toEqual({
      kind: 'draw',
      gameId: fixture.game.id,
      reason: 'opposing-killers-mutual-elimination',
    })
    expect(terminal.value.game.players.every((player) => !player.alive)).toBe(true)
    expect(terminal.value.game.deathRecords.map((record) => record.cause.kind)).toEqual([
      'night-death',
      'final-killing-role-showdown',
      'final-killing-role-showdown',
    ])
    expect(
      terminal.value.game.deathRecords
        .filter((record) => record.cause.kind === 'final-killing-role-showdown')
        .map((record) => record.cause),
    ).toEqual([
      {
        kind: 'final-killing-role-showdown',
        boundary: { kind: 'post-dawn', nightNumber: 2 },
        opponentPlayerId: fixture.game.players[1]?.playerId,
      },
      {
        kind: 'final-killing-role-showdown',
        boundary: { kind: 'post-dawn', nightNumber: 2 },
        opponentPlayerId: fixture.game.players[0]?.playerId,
      },
    ])
    expect(terminal.value).not.toHaveProperty('dawnAnnouncement')
    expect(terminal.value).not.toHaveProperty('nextNight')
  })
})
