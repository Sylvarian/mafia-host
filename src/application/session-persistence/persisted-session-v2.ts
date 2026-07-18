import type { GameSettings } from '@/domain/game/game-settings.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { NightActionKind } from '@/domain/night-actions/night-action-kind.ts'
import type {
  AttackOutcome,
  NightResolution,
  RoleBlockAttemptOutcome,
} from '@/domain/resolution/night-resolution-models.ts'

import type { GameSetupDraft, RoleCount } from '../game-setup/index.ts'
import type {
  ImmediateNightOutcome,
  SequentialNightStepRecord,
  SubmittedNightAction,
} from '../night-actions/index.ts'
import type { ActiveAppSession } from './active-app-session.ts'

export const PERSISTED_SESSION_SCHEMA_VERSION = 2 as const

export type PersistedPlayerV2 = Readonly<{
  id: string
  name: string
  playing: boolean
}>

export type PersistedRoleCountV2 = Readonly<{ roleId: string; count: number }>

export type PersistedSetupDraftV2 = Readonly<{
  roster: readonly PersistedPlayerV2[]
  roleCounts: readonly PersistedRoleCountV2[]
  settings: GameSettings
  nextPlayerNumber: number
}>

export type PersistedValidatedSetupV2 = Readonly<{
  participatingPlayers: readonly PersistedPlayerV2[]
  roleCounts: readonly PersistedRoleCountV2[]
  settings: GameSettings
}>

export type PersistedGameV2 = Readonly<{
  id: string
  phase: string
  players: readonly Readonly<{
    playerId: string
    role: Readonly<{
      instanceId: string
      roleId: string
      ordinal: number | null
    }>
    alive: boolean
    publiclyRevealedRoleId: string | null
    mayorRevealed: boolean
  }>[]
  neutralStateVersion: 1
  executionerBriefingStatus: 'not-started' | 'not-required' | 'pending' | 'completed'
  executionerTargets: readonly Readonly<{
    gameId: string
    executionerPlayerId: string
    executionerRoleInstanceId: string
    targetPlayerId: string
  }>[]
  settings: GameSettings
  nightNumber: number
  dayNumber: number
  doctorPreviousTargets: readonly Readonly<{
    doctorRoleInstanceId: string
    targetPlayerId: string
    nightNumber: number
  }>[]
}>

export type PersistedSubmittedNightActionV2 = Readonly<{
  actorPlayerId: string
  actorRoleInstanceId: string
  actorRoleId: string
  actionKind: NightActionKind
  targetPlayerId: string
}>

type PersistedImmediateOutcomeBaseV2 = Readonly<{
  actorPlayerId: string
  actorRoleId: string
  actorRoleInstanceId: string
}>

export type PersistedImmediateNightOutcomeV2 =
  | (PersistedImmediateOutcomeBaseV2 & Readonly<{ kind: 'blocked' }>)
  | (PersistedImmediateOutcomeBaseV2 &
      Readonly<{ kind: 'action-recorded'; targetPlayerId: string }>)
  | (PersistedImmediateOutcomeBaseV2 &
      Readonly<{
        kind: 'sheriff-result'
        targetPlayerId: string
        status: 'suspicious' | 'not-suspicious'
      }>)
  | (PersistedImmediateOutcomeBaseV2 &
      Readonly<{
        kind: 'investigation-result'
        targetPlayerId: string
        investigationRole: 'investigator' | 'consigliere'
        groupId: string
      }>)
  | (PersistedImmediateOutcomeBaseV2 &
      (
        | Readonly<{
            kind: 'detective-result'
            targetPlayerId: string
            status: 'visited-nobody'
          }>
        | Readonly<{
            kind: 'detective-result'
            targetPlayerId: string
            status: 'visited-player'
            visitedPlayerId: string
          }>
      ))

export type PersistedSequentialNightStepV2 =
  | Readonly<{
      stepIndex: number
      status: 'blocked'
      actorPlayerId: string
      actorRoleId: string
      actorRoleInstanceId: string
      outcome: PersistedImmediateNightOutcomeV2
      acknowledged: boolean
    }>
  | Readonly<{
      stepIndex: number
      status: 'action-confirmed'
      actorPlayerId: string
      actorRoleId: string
      actorRoleInstanceId: string
      action: PersistedSubmittedNightActionV2
      outcome: PersistedImmediateNightOutcomeV2
      acknowledged: boolean
    }>

export type PersistedNightResolutionV2 = Readonly<{
  gameId: string
  nightNumber: number
  roleBlockAttempts: readonly Readonly<{
    actorPlayerId: string
    actorRoleInstanceId: string
    targetPlayerId: string
    targetRoleInstanceId: string
    outcome: RoleBlockAttemptOutcome
  }>[]
  blockedActors: readonly Readonly<{
    blockedPlayerId: string
    blockedRoleInstanceId: string
    sources: readonly Readonly<{
      consortPlayerId: string
      consortRoleInstanceId: string
    }>[]
  }>[]
  finalVisits: readonly Readonly<{
    actorPlayerId: string
    actorRoleId: string
    actorRoleInstanceId: string
    targetPlayerId: string
  }>[]
  frames: readonly Readonly<{
    framedPlayerId: string
    sources: readonly Readonly<{
      framerPlayerId: string
      framerRoleInstanceId: string
    }>[]
  }>[]
  protections: readonly Readonly<{
    protectedPlayerId: string
    sources: readonly Readonly<{
      doctorPlayerId: string
      doctorRoleInstanceId: string
    }>[]
  }>[]
  attackAttempts: readonly Readonly<{
    attackerPlayerId: string
    attackerRoleId: string
    attackerRoleInstanceId: string
    targetPlayerId: string
    outcome: AttackOutcome
  }>[]
  provisionalDeaths: readonly Readonly<{
    deadPlayerId: string
    actualRoleId: string
    nightNumber: number
    sources: readonly Readonly<{
      attackerPlayerId: string
      attackerRoleId: string
      attackerRoleInstanceId: string
    }>[]
  }>[]
  sheriffResults: readonly Readonly<{
    actorPlayerId: string
    actorRoleInstanceId: string
    targetPlayerId: string
    status: 'suspicious' | 'not-suspicious'
  }>[]
  investigationResults: readonly Readonly<{
    actorPlayerId: string
    actorRoleId: string
    actorRoleInstanceId: string
    targetPlayerId: string
    groupId: string
  }>[]
  detectiveResults: readonly (
    | Readonly<{
        actorPlayerId: string
        actorRoleInstanceId: string
        targetPlayerId: string
        status: 'visited-nobody'
      }>
    | Readonly<{
        actorPlayerId: string
        actorRoleInstanceId: string
        targetPlayerId: string
        status: 'visited-player'
        visitedPlayerId: string
      }>
  )[]
}>

export type PersistedDawnAnnouncementV2 =
  | Readonly<{ outcome: 'no-deaths'; nightNumber: number }>
  | Readonly<{
      outcome: 'deaths'
      nightNumber: number
      deaths: readonly Readonly<{
        playerId: string
        revealedRoleId: string | null
      }>[]
    }>

export type PersistedAppSessionV2 =
  | Readonly<{
      stage: 'setup'
      workflowStatus: 'editing' | 'ready'
      draft: PersistedSetupDraftV2
    }>
  | Readonly<{
      stage: 'role-distribution'
      workflowStatus: 'distributing'
      setup: PersistedValidatedSetupV2
      game: PersistedGameV2
      deliveredPlayerIds: readonly string[]
    }>
  | Readonly<{
      stage: 'role-distribution'
      workflowStatus: 'confirmed'
      setup: PersistedValidatedSetupV2
      game: PersistedGameV2
    }>
  | Readonly<{
      stage: 'executioner-briefing'
      workflowStatus: 'briefing' | 'ready'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      currentBriefingIndex: number
      acknowledgedBriefingIds: readonly string[]
    }>
  | Readonly<{
      stage: 'sequential-night'
      workflowStatus: 'collecting' | 'awaiting-outcome-acknowledgement' | 'outcome-acknowledged'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      currentStepIndex: number
      completedSteps: readonly PersistedSequentialNightStepV2[]
      currentOutcome: PersistedImmediateNightOutcomeV2 | null
    }>
  | Readonly<{
      stage: 'night-resolution'
      workflowStatus: 'ready-for-dawn'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      collectedActions: readonly PersistedSubmittedNightActionV2[]
      resolution: PersistedNightResolutionV2
    }>
  | Readonly<{
      stage: 'dawn'
      workflowStatus: 'dawn'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      dawnAnnouncement: PersistedDawnAnnouncementV2
    }>

export type PersistedSessionEnvelopeV2 = Readonly<{
  schemaVersion: 2
  savedAt: string
  session: PersistedAppSessionV2
}>

export type RestoredSessionEnvelopeV2 = Readonly<{
  schemaVersion: 2
  savedAt: string
  session: ActiveAppSession
}>

export type SessionStageSummary = Readonly<{
  stage:
    | 'Setup editing'
    | 'Setup prepared'
    | 'Role distribution'
    | 'Role distribution confirmed'
    | 'Private briefing'
    | 'Night actions'
    | 'Night resolution'
    | 'Dawn announcement'
  playerCount: number
  nightNumber: number | null
  dayNumber: number | null
}>

export function createPersistedSessionEnvelopeV2(
  session: ActiveAppSession,
  savedAt: string,
): PersistedSessionEnvelopeV2 {
  return deepFreeze({
    schemaVersion: PERSISTED_SESSION_SCHEMA_VERSION,
    savedAt,
    session: toPersistedAppSessionV2(session),
  })
}

export function toPersistedAppSessionV2(session: ActiveAppSession): PersistedAppSessionV2 {
  switch (session.stage) {
    case 'setup':
      return deepFreeze({
        stage: 'setup',
        workflowStatus: session.workflow.status,
        draft: copySetupDraft(session.workflow.draft),
      })
    case 'role-distribution': {
      const source = {
        stage: 'role-distribution' as const,
        setup: {
          participatingPlayers: session.workflow.setup.participatingPlayers.map(copyPlayer),
          roleCounts: session.workflow.setup.roleCounts.map(copyRoleCount),
          settings: copySettings(session.workflow.setup.settings),
        },
        game: copyGame(session.workflow.game),
      }
      return session.workflow.status === 'distributing'
        ? deepFreeze({
            ...source,
            workflowStatus: 'distributing' as const,
            deliveredPlayerIds: [...session.workflow.deliveredPlayerIds],
          })
        : deepFreeze({ ...source, workflowStatus: 'confirmed' as const })
    }
    case 'executioner-briefing':
      return deepFreeze({
        stage: 'executioner-briefing',
        workflowStatus: session.workflow.status,
        game: copyGame(session.game),
        participants: session.participants.map(copyPlayer),
        currentBriefingIndex: session.workflow.currentBriefingIndex,
        acknowledgedBriefingIds: [...session.workflow.acknowledgedBriefingIds],
      })
    case 'sequential-night':
      return deepFreeze({
        stage: 'sequential-night',
        workflowStatus: session.workflow.status,
        game: copyGame(session.workflow.game),
        participants: session.workflow.participants.map(copyPlayer),
        currentStepIndex: session.workflow.currentStepIndex,
        completedSteps: session.workflow.completedSteps.map(copySequentialStep),
        currentOutcome:
          session.workflow.currentOutcome === null
            ? null
            : copyImmediateOutcome(session.workflow.currentOutcome),
      })
    case 'night-resolution':
      return deepFreeze({
        stage: 'night-resolution',
        workflowStatus: 'ready-for-dawn',
        game: copyGame(session.workflow.game),
        participants: session.workflow.participants.map(copyPlayer),
        collectedActions: session.workflow.collectedActions.actions.map(copyNightAction),
        resolution: toPersistedNightResolutionV2(session.workflow.resolution),
      })
    case 'dawn':
      return deepFreeze({
        stage: 'dawn',
        workflowStatus: 'dawn',
        game: copyGame(session.workflow.game),
        participants: session.workflow.participants.map(copyPlayer),
        dawnAnnouncement:
          session.workflow.dawnAnnouncement.outcome === 'no-deaths'
            ? {
                outcome: 'no-deaths',
                nightNumber: session.workflow.dawnAnnouncement.nightNumber,
              }
            : {
                outcome: 'deaths',
                nightNumber: session.workflow.dawnAnnouncement.nightNumber,
                deaths: session.workflow.dawnAnnouncement.deaths.map((death) => ({
                  playerId: death.playerId,
                  revealedRoleId: death.revealedRoleId,
                })),
              },
      })
  }
}

export function toPersistedNightResolutionV2(
  resolution: NightResolution,
): PersistedNightResolutionV2 {
  return deepFreeze({
    gameId: resolution.gameId,
    nightNumber: resolution.nightNumber,
    roleBlockAttempts: resolution.roleBlockAttempts.map((entry) => ({ ...entry })),
    blockedActors: resolution.blockedActors.map((entry) => ({
      ...entry,
      sources: entry.sources.map((source) => ({ ...source })),
    })),
    finalVisits: resolution.finalVisits.map((entry) => ({ ...entry })),
    frames: resolution.frames.map((entry) => ({
      ...entry,
      sources: entry.sources.map((source) => ({ ...source })),
    })),
    protections: resolution.protections.map((entry) => ({
      ...entry,
      sources: entry.sources.map((source) => ({ ...source })),
    })),
    attackAttempts: resolution.attackAttempts.map((entry) => ({ ...entry })),
    provisionalDeaths: resolution.provisionalDeaths.map((entry) => ({
      ...entry,
      sources: entry.sources.map((source) => ({ ...source })),
    })),
    sheriffResults: resolution.sheriffResults.map((entry) => ({ ...entry })),
    investigationResults: resolution.investigationResults.map((entry) => ({
      actorPlayerId: entry.actorPlayerId,
      actorRoleId: entry.actorRoleId,
      actorRoleInstanceId: entry.actorRoleInstanceId,
      targetPlayerId: entry.targetPlayerId,
      groupId: entry.group.id,
    })),
    detectiveResults: resolution.detectiveResults.map((entry) => ({ ...entry })),
  })
}

export function createSessionStageSummary(session: ActiveAppSession): SessionStageSummary {
  switch (session.stage) {
    case 'setup':
      return Object.freeze({
        stage: session.workflow.status === 'editing' ? 'Setup editing' : 'Setup prepared',
        playerCount: session.workflow.draft.roster.filter((player) => player.playing).length,
        nightNumber: null,
        dayNumber: null,
      })
    case 'role-distribution':
      return Object.freeze({
        stage:
          session.workflow.status === 'confirmed'
            ? 'Role distribution confirmed'
            : 'Role distribution',
        playerCount: session.workflow.game.players.length,
        nightNumber: null,
        dayNumber: null,
      })
    case 'executioner-briefing':
      return Object.freeze({
        stage: 'Private briefing',
        playerCount: session.game.players.length,
        nightNumber: session.game.nightNumber,
        dayNumber: session.game.dayNumber,
      })
    case 'sequential-night':
      return Object.freeze({
        stage: 'Night actions',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
      })
    case 'night-resolution':
      return Object.freeze({
        stage: 'Night resolution',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
      })
    case 'dawn':
      return Object.freeze({
        stage: 'Dawn announcement',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
      })
  }
}

function copySetupDraft(draft: GameSetupDraft): PersistedSetupDraftV2 {
  return {
    roster: draft.roster.map(copyPlayer),
    roleCounts: draft.roleCounts.map(copyRoleCount),
    settings: copySettings(draft.settings),
    nextPlayerNumber: draft.nextPlayerNumber,
  }
}

function copyPlayer(player: Readonly<{ id: PlayerId; name: string; playing: boolean }>) {
  return { id: player.id, name: player.name, playing: player.playing }
}

function copyRoleCount(roleCount: RoleCount) {
  return { roleId: roleCount.roleId, count: roleCount.count }
}

function copySettings(settings: GameSettings): GameSettings {
  return { ...settings }
}

function copyGame(game: GameState): PersistedGameV2 {
  return {
    id: game.id,
    phase: game.phase,
    players: game.players.map((player) => ({
      playerId: player.playerId,
      role: { ...player.role },
      alive: player.alive,
      publiclyRevealedRoleId: player.publiclyRevealedRoleId,
      mayorRevealed: player.mayorRevealed,
    })),
    neutralStateVersion: 1,
    executionerBriefingStatus: game.executionerBriefingStatus,
    executionerTargets: game.executionerTargets.map((target) => ({ ...target })),
    settings: copySettings(game.settings),
    nightNumber: game.nightNumber,
    dayNumber: game.dayNumber,
    doctorPreviousTargets: game.doctorPreviousTargets.map((entry) => ({ ...entry })),
  }
}

function copyNightAction(action: SubmittedNightAction): PersistedSubmittedNightActionV2 {
  return { ...action }
}

function copySequentialStep(record: SequentialNightStepRecord): PersistedSequentialNightStepV2 {
  return record.status === 'blocked'
    ? {
        stepIndex: record.stepIndex,
        status: record.status,
        actorPlayerId: record.actorPlayerId,
        actorRoleId: record.actorRoleId,
        actorRoleInstanceId: record.actorRoleInstanceId,
        outcome: copyImmediateOutcome(record.outcome),
        acknowledged: record.acknowledged,
      }
    : {
        stepIndex: record.stepIndex,
        status: record.status,
        actorPlayerId: record.actorPlayerId,
        actorRoleId: record.actorRoleId,
        actorRoleInstanceId: record.actorRoleInstanceId,
        action: copyNightAction(record.action),
        outcome: copyImmediateOutcome(record.outcome),
        acknowledged: record.acknowledged,
      }
}

function copyImmediateOutcome(outcome: ImmediateNightOutcome): PersistedImmediateNightOutcomeV2 {
  switch (outcome.kind) {
    case 'blocked':
    case 'action-recorded':
    case 'sheriff-result':
      return { ...outcome }
    case 'investigation-result':
      return {
        kind: outcome.kind,
        actorPlayerId: outcome.actorPlayerId,
        actorRoleId: outcome.actorRoleId,
        actorRoleInstanceId: outcome.actorRoleInstanceId,
        targetPlayerId: outcome.targetPlayerId,
        investigationRole: outcome.investigationRole,
        groupId: outcome.group.id,
      }
    case 'detective-result':
      return outcome.result.status === 'visited-nobody'
        ? {
            kind: outcome.kind,
            actorPlayerId: outcome.actorPlayerId,
            actorRoleId: outcome.actorRoleId,
            actorRoleInstanceId: outcome.actorRoleInstanceId,
            targetPlayerId: outcome.targetPlayerId,
            status: 'visited-nobody',
          }
        : {
            kind: outcome.kind,
            actorPlayerId: outcome.actorPlayerId,
            actorRoleId: outcome.actorRoleId,
            actorRoleInstanceId: outcome.actorRoleInstanceId,
            targetPlayerId: outcome.targetPlayerId,
            status: 'visited-player',
            visitedPlayerId: outcome.result.visitedPlayerId,
          }
  }
}

function deepFreeze<Value>(value: Value): Value {
  freezeRecursively(value)
  return value
}

function freezeRecursively(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return
  }
  for (const child of Object.values(value)) {
    freezeRecursively(child)
  }
  Object.freeze(value)
}
