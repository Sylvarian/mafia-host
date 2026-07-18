import type { GameSettings } from '@/domain/game/game-settings.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import type { PlayerId, RoleId, RoleInstanceId } from '@/domain/identifiers.ts'
import type { NightActionKind } from '@/domain/night-actions/night-action-kind.ts'
import type {
  AttackOutcome,
  NightResolution,
  RoleBlockAttemptOutcome,
} from '@/domain/resolution/night-resolution-models.ts'

import type { GameSetupDraft, RoleCount } from '../game-setup/index.ts'
import type { ActiveAppSession } from './active-app-session.ts'

export const PERSISTED_SESSION_SCHEMA_VERSION = 1 as const

export type PersistedPlayerV1 = Readonly<{
  id: string
  name: string
  playing: boolean
}>

export type PersistedRoleCountV1 = Readonly<{
  roleId: string
  count: number
}>

export type PersistedSetupDraftV1 = Readonly<{
  roster: readonly PersistedPlayerV1[]
  roleCounts: readonly PersistedRoleCountV1[]
  settings: GameSettings
  nextPlayerNumber: number
}>

export type PersistedValidatedSetupV1 = Readonly<{
  participatingPlayers: readonly PersistedPlayerV1[]
  roleCounts: readonly PersistedRoleCountV1[]
  settings: GameSettings
}>

export type PersistedRoleInstanceV1 = Readonly<{
  instanceId: string
  roleId: string
  ordinal: number | null
}>

export type PersistedGamePlayerV1 = Readonly<{
  playerId: string
  role: PersistedRoleInstanceV1
  alive: boolean
  publiclyRevealedRoleId: string | null
  mayorRevealed: boolean
}>

export type PersistedDoctorPreviousTargetV1 = Readonly<{
  doctorRoleInstanceId: string
  targetPlayerId: string
  nightNumber: number
}>

export type PersistedGameV1 = Readonly<{
  id: string
  phase: string
  players: readonly PersistedGamePlayerV1[]
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
  doctorPreviousTargets: readonly PersistedDoctorPreviousTargetV1[]
}>

export type PersistedSubmittedNightActionV1 = Readonly<{
  actorPlayerId: string
  actorRoleInstanceId: string
  actorRoleId: string
  actionKind: NightActionKind
  targetPlayerId: string
}>

export type PersistedNightResolutionV1 = Readonly<{
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
        status: 'visited-player'
        visitedPlayerId: string
      }>
    | Readonly<{
        actorPlayerId: string
        actorRoleInstanceId: string
        targetPlayerId: string
        status: 'visited-nobody'
      }>
  )[]
}>

export type PersistedDawnAnnouncementV1 =
  | Readonly<{
      outcome: 'no-deaths'
      nightNumber: number
    }>
  | Readonly<{
      outcome: 'deaths'
      nightNumber: number
      deaths: readonly Readonly<{
        playerId: string
        revealedRoleId: string | null
      }>[]
    }>

export type PersistedAppSessionV1 =
  | Readonly<{
      stage: 'setup'
      workflowStatus: 'editing' | 'ready'
      draft: PersistedSetupDraftV1
    }>
  | Readonly<{
      stage: 'role-distribution'
      workflowStatus: 'distributing'
      setup: PersistedValidatedSetupV1
      game: PersistedGameV1
      deliveredPlayerIds: readonly string[]
    }>
  | Readonly<{
      stage: 'role-distribution'
      workflowStatus: 'confirmed'
      setup: PersistedValidatedSetupV1
      game: PersistedGameV1
    }>
  | Readonly<{
      stage: 'executioner-briefing'
      workflowStatus: 'briefing' | 'ready'
      game: PersistedGameV1
      participants: readonly PersistedPlayerV1[]
      currentBriefingIndex: number
      acknowledgedBriefingIds: readonly string[]
    }>
  | Readonly<{
      stage: 'night-action'
      workflowStatus: 'collecting' | 'reviewing' | 'complete'
      game: PersistedGameV1
      participants: readonly PersistedPlayerV1[]
      submittedActions: readonly PersistedSubmittedNightActionV1[]
      currentStepIndex: number | null
      returnToReviewAfterActor: boolean
    }>
  | Readonly<{
      stage: 'night-presentation'
      workflowStatus: 'private-results' | 'ready-for-dawn'
      game: PersistedGameV1
      participants: readonly PersistedPlayerV1[]
      collectedActions: readonly PersistedSubmittedNightActionV1[]
      resolution: PersistedNightResolutionV1
      acknowledgedResultIds: readonly string[]
      currentResultIndex: number | null
    }>
  | Readonly<{
      stage: 'dawn'
      workflowStatus: 'dawn'
      game: PersistedGameV1
      participants: readonly PersistedPlayerV1[]
      dawnAnnouncement: PersistedDawnAnnouncementV1
    }>

export type PersistedSessionEnvelopeV1 = Readonly<{
  schemaVersion: 1
  savedAt: string
  session: PersistedAppSessionV1
}>

export type RestoredSessionEnvelopeV1 = Readonly<{
  schemaVersion: 1
  savedAt: string
  session: ActiveAppSession
}>

export type SessionStageSummary = Readonly<{
  stage:
    | 'Setup editing'
    | 'Setup prepared'
    | 'Role distribution'
    | 'Role distribution confirmed'
    | 'Executioner briefing'
    | 'Night action collection'
    | 'Night actions complete'
    | 'Private results'
    | 'Ready for Dawn'
    | 'Dawn announcement'
  playerCount: number
  nightNumber: number | null
  dayNumber: number | null
}>

export function createPersistedSessionEnvelopeV1(
  session: ActiveAppSession,
  savedAt: string,
): PersistedSessionEnvelopeV1 {
  return deepFreeze({
    schemaVersion: PERSISTED_SESSION_SCHEMA_VERSION,
    savedAt,
    session: toPersistedAppSessionV1(session),
  })
}

export function toPersistedAppSessionV1(session: ActiveAppSession): PersistedAppSessionV1 {
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
    case 'night-action': {
      const submittedActions =
        session.workflow.status === 'complete'
          ? session.workflow.collectedActions.actions
          : session.workflow.submittedActions
      return deepFreeze({
        stage: 'night-action',
        workflowStatus: session.workflow.status,
        game: copyGame(session.workflow.game),
        participants: session.workflow.participants.map(copyPlayer),
        submittedActions: submittedActions.map(copyNightAction),
        currentStepIndex:
          session.workflow.status === 'collecting' ? session.workflow.currentStepIndex : null,
        returnToReviewAfterActor:
          session.workflow.status === 'collecting'
            ? session.workflow.returnToReviewAfterActor
            : false,
      })
    }
    case 'night-presentation':
      return deepFreeze({
        stage: 'night-presentation',
        workflowStatus: session.workflow.status,
        game: copyGame(session.workflow.game),
        participants: session.workflow.participants.map(copyPlayer),
        collectedActions: session.workflow.collectedActions.actions.map(copyNightAction),
        resolution: toPersistedNightResolutionV1(session.workflow.resolution),
        acknowledgedResultIds: [...session.workflow.acknowledgedResultIds],
        currentResultIndex:
          session.workflow.status === 'private-results'
            ? session.workflow.currentResultIndex
            : null,
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

export function toPersistedNightResolutionV1(
  resolution: NightResolution,
): PersistedNightResolutionV1 {
  return deepFreeze({
    gameId: resolution.gameId,
    nightNumber: resolution.nightNumber,
    roleBlockAttempts: resolution.roleBlockAttempts.map((attempt) => ({ ...attempt })),
    blockedActors: resolution.blockedActors.map((record) => ({
      blockedPlayerId: record.blockedPlayerId,
      blockedRoleInstanceId: record.blockedRoleInstanceId,
      sources: record.sources.map((source) => ({ ...source })),
    })),
    finalVisits: resolution.finalVisits.map((visit) => ({ ...visit })),
    frames: resolution.frames.map((frame) => ({
      framedPlayerId: frame.framedPlayerId,
      sources: frame.sources.map((source) => ({ ...source })),
    })),
    protections: resolution.protections.map((protection) => ({
      protectedPlayerId: protection.protectedPlayerId,
      sources: protection.sources.map((source) => ({ ...source })),
    })),
    attackAttempts: resolution.attackAttempts.map((attack) => ({ ...attack })),
    provisionalDeaths: resolution.provisionalDeaths.map((death) => ({
      deadPlayerId: death.deadPlayerId,
      actualRoleId: death.actualRoleId,
      nightNumber: death.nightNumber,
      sources: death.sources.map((source) => ({ ...source })),
    })),
    sheriffResults: resolution.sheriffResults.map((result) => ({ ...result })),
    investigationResults: resolution.investigationResults.map((result) => ({
      actorPlayerId: result.actorPlayerId,
      actorRoleId: result.actorRoleId,
      actorRoleInstanceId: result.actorRoleInstanceId,
      targetPlayerId: result.targetPlayerId,
      groupId: result.group.id,
    })),
    detectiveResults: resolution.detectiveResults.map((result) => ({ ...result })),
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
        stage: 'Executioner briefing',
        playerCount: session.game.players.length,
        nightNumber: session.game.nightNumber,
        dayNumber: session.game.dayNumber,
      })
    case 'night-action':
      return Object.freeze({
        stage:
          session.workflow.status === 'complete'
            ? 'Night actions complete'
            : 'Night action collection',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
      })
    case 'night-presentation':
      return Object.freeze({
        stage: session.workflow.status === 'ready-for-dawn' ? 'Ready for Dawn' : 'Private results',
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

function copySetupDraft(draft: GameSetupDraft): PersistedSetupDraftV1 {
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
  return {
    godfatherAndSerialCanKillEachOther: settings.godfatherAndSerialCanKillEachOther,
    godfatherAppearsSuspiciousToSheriff: settings.godfatherAppearsSuspiciousToSheriff,
    doctorCanSelfProtect: settings.doctorCanSelfProtect,
    doctorCannotRepeatPreviousTarget: settings.doctorCannotRepeatPreviousTarget,
    revealRoleOnDeath: settings.revealRoleOnDeath,
    allowFirstNightKills: settings.allowFirstNightKills,
  }
}

function copyGame(game: GameState): PersistedGameV1 {
  return {
    id: game.id,
    phase: game.phase,
    players: game.players.map((player) => ({
      playerId: player.playerId,
      role: {
        instanceId: player.role.instanceId,
        roleId: player.role.roleId,
        ordinal: player.role.ordinal,
      },
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

function copyNightAction(
  action: Readonly<{
    actorPlayerId: PlayerId
    actorRoleInstanceId: RoleInstanceId
    actorRoleId: RoleId
    actionKind: NightActionKind
    targetPlayerId: PlayerId
  }>,
): PersistedSubmittedNightActionV1 {
  return { ...action }
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
