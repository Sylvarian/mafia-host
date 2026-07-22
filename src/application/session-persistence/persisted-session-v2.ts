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
  }>[]
  neutralStateVersion: 4
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
  deathRecords: readonly Readonly<{
    gameId: string
    playerId: string
    roleInstanceId: string
    cause:
      | Readonly<{ kind: 'night-death'; nightNumber: number }>
      | Readonly<{ kind: 'day-execution'; dayNumber: number }>
      | Readonly<{
          kind: 'jester-revenge'
          nightNumber: number
          jesterPlayerId: string
          jesterRoleInstanceId: string
          obligationId: string
          resolutionId: string
        }>
      | Readonly<{
          kind: 'final-killing-role-showdown'
          boundary:
            | Readonly<{ kind: 'post-day'; dayNumber: number }>
            | Readonly<{ kind: 'post-dawn'; nightNumber: number }>
          opponentPlayerId: string
        }>
  }>[]
  personalWins: readonly (
    | Readonly<{
        kind: 'jester-executed'
        gameId: string
        playerId: string
        roleInstanceId: string
        dayNumber: number
      }>
    | Readonly<{
        kind: 'executioner-target-executed'
        gameId: string
        playerId: string
        roleInstanceId: string
        targetPlayerId: string
        dayNumber: number
      }>
  )[]
  executionerConversions: readonly Readonly<{
    kind: 'executioner-to-jester'
    gameId: string
    playerId: string
    roleInstanceId: string
    targetPlayerId: string
  }>[]
  godfatherSuccessionStartNightNumber: number
  godfatherPromotions: readonly Readonly<{
    gameId: string
    playerId: string
    originalRoleInstanceId: string
    promotedAtNightNumber: number
    activeRoleId: string
  }>[]
  pendingJesterRevenges: readonly Readonly<{
    id: string
    gameId: string
    jesterPlayerId: string
    jesterRoleInstanceId: string
    triggeredOnDay: number
    status: 'pending'
  }>[]
  jesterRevengeResolutions: readonly (
    | Readonly<{
        id: string
        kind: 'victim-killed'
        gameId: string
        obligationId: string
        jesterPlayerId: string
        jesterRoleInstanceId: string
        victimPlayerId: string
        resolvedAtNightNumber: number
      }>
    | Readonly<{
        id: string
        kind: 'no-survivor'
        gameId: string
        obligationId: string
        jesterPlayerId: string
        jesterRoleInstanceId: string
        resolvedAtNightNumber: number
      }>
  )[]
  dayOutcomes: readonly (
    | Readonly<{
        kind: 'player-executed'
        gameId: string
        dayNumber: number
        playerId: string
      }>
    | Readonly<{
        kind: 'no-execution'
        gameId: string
        dayNumber: number
      }>
  )[]
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
      outcome: Extract<PersistedImmediateNightOutcomeV2, Readonly<{ kind: 'blocked' }>>
    }>
  | Readonly<{
      stepIndex: number
      status: 'action-confirmed'
      actorPlayerId: string
      actorRoleId: string
      actorRoleInstanceId: string
      action: PersistedSubmittedNightActionV2
      outcome: Exclude<PersistedImmediateNightOutcomeV2, Readonly<{ kind: 'blocked' }>> | null
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

export type PersistedTerminalFactionResultV2 =
  | Readonly<{ kind: 'town-victory'; gameId: string }>
  | Readonly<{
      kind: 'mafia-victory'
      gameId: string
      winnerPlayerIds: readonly string[]
    }>
  | Readonly<{
      kind: 'serial-killer-victory'
      gameId: string
      winnerPlayerIds: readonly string[]
    }>
  | Readonly<{
      kind: 'draw'
      gameId: string
      reason: 'no-survivors' | 'opposing-killers-stalemate' | 'opposing-killers-mutual-elimination'
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
      roleCardsDeliveryStatus: 'pending'
    }>
  | Readonly<{
      stage: 'role-distribution'
      workflowStatus: 'confirmed'
      setup: PersistedValidatedSetupV2
      game: PersistedGameV2
      roleCardsDeliveryStatus: 'complete'
    }>
  | Readonly<{
      stage: 'executioner-briefing'
      workflowStatus: 'briefing'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      currentBriefingIndex: number
      acknowledgedBriefingIds: readonly string[]
    }>
  | Readonly<{
      stage: 'sequential-night'
      workflowStatus: 'collecting' | 'awaiting-outcome-acknowledgement'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      currentStepIndex: number
      completedSteps: readonly PersistedSequentialNightStepV2[]
      currentOutcome: PersistedImmediateNightOutcomeV2 | null
    }>
  | Readonly<{
      stage: 'godfather-promotion-briefing'
      workflowStatus: 'promotion-briefing'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      currentStepIndex: 0
      completedSteps: readonly []
      currentOutcome: null
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
  | Readonly<{
      stage: 'revenge-resolution'
      workflowStatus: 'revenge-resolution'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      selectedRevenge: Readonly<{
        id: string
        kind: 'victim-selected'
        gameId: string
        obligationId: string
        jesterPlayerId: string
        jesterRoleInstanceId: string
        victimPlayerId: string
        resolvedAtNightNumber: number
      }>
    }>
  | Readonly<{
      stage: 'day-discussion'
      workflowStatus: 'day-discussion'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
    }>
  | Readonly<{
      stage: 'day-outcome'
      workflowStatus: 'day-outcome'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
    }>
  | Readonly<{
      stage: 'post-day-waiting'
      workflowStatus: 'post-day-waiting'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
    }>
  | Readonly<{
      stage: 'pending-revenge-waiting'
      workflowStatus: 'pending-revenge-waiting'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
    }>
  | Readonly<{
      stage: 'game-over'
      workflowStatus: 'game-over'
      game: PersistedGameV2
      participants: readonly PersistedPlayerV2[]
      result: PersistedTerminalFactionResultV2
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
  writeBackEnvelope?: PersistedSessionEnvelopeV2
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
    | 'Dawn resolution'
    | 'Dawn announcement'
    | 'Day discussion'
    | 'Day complete'
    | 'Game over'
  playerCount: number
  nightNumber: number | null
  dayNumber: number | null
  resultLabel: 'Town wins' | 'Mafia wins' | 'Serial Killer wins' | 'Draw' | null
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
            roleCardsDeliveryStatus: 'pending' as const,
          })
        : deepFreeze({
            ...source,
            workflowStatus: 'confirmed' as const,
            roleCardsDeliveryStatus: 'complete' as const,
          })
    }
    case 'executioner-briefing':
      return deepFreeze({
        stage: 'executioner-briefing',
        workflowStatus: 'briefing',
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
    case 'godfather-promotion-briefing':
      return deepFreeze({
        stage: 'godfather-promotion-briefing',
        workflowStatus: 'promotion-briefing',
        game: copyGame(session.workflow.game),
        participants: session.workflow.participants.map(copyPlayer),
        currentStepIndex: 0,
        completedSteps: [],
        currentOutcome: null,
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
    case 'revenge-resolution':
      return deepFreeze({
        stage: 'revenge-resolution',
        workflowStatus: 'revenge-resolution',
        game: copyGame(session.workflow.game),
        participants: session.workflow.participants.map(copyPlayer),
        selectedRevenge: { ...session.workflow.selectedRevenge },
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
    case 'day-discussion':
      return deepFreeze({
        stage: 'day-discussion',
        workflowStatus: 'day-discussion',
        game: copyGame(session.game),
        participants: session.participants.map(copyPlayer),
      })
    case 'day-outcome':
      return deepFreeze({
        stage: 'day-outcome',
        workflowStatus: 'day-outcome',
        game: copyGame(session.game),
        participants: session.participants.map(copyPlayer),
      })
    case 'post-day-waiting':
      return deepFreeze({
        stage: 'post-day-waiting',
        workflowStatus: 'post-day-waiting',
        game: copyGame(session.game),
        participants: session.participants.map(copyPlayer),
      })
    case 'pending-revenge-waiting':
      return deepFreeze({
        stage: 'pending-revenge-waiting',
        workflowStatus: 'pending-revenge-waiting',
        game: copyGame(session.game),
        participants: session.participants.map(copyPlayer),
      })
    case 'game-over':
      return deepFreeze({
        stage: 'game-over',
        workflowStatus: 'game-over',
        game: copyGame(session.game),
        participants: session.participants.map(copyPlayer),
        result:
          session.result.kind === 'mafia-victory' || session.result.kind === 'serial-killer-victory'
            ? { ...session.result, winnerPlayerIds: [...session.result.winnerPlayerIds] }
            : { ...session.result },
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
        resultLabel: null,
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
        resultLabel: null,
      })
    case 'executioner-briefing':
      return Object.freeze({
        stage: 'Private briefing',
        playerCount: session.game.players.length,
        nightNumber: session.game.nightNumber,
        dayNumber: session.game.dayNumber,
        resultLabel: null,
      })
    case 'sequential-night':
      return Object.freeze({
        stage: 'Night actions',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
        resultLabel: null,
      })
    case 'godfather-promotion-briefing':
      return Object.freeze({
        stage: 'Night actions',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
        resultLabel: null,
      })
    case 'night-resolution':
      return Object.freeze({
        stage: 'Night resolution',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
        resultLabel: null,
      })
    case 'revenge-resolution':
      return Object.freeze({
        stage: 'Dawn resolution',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
        resultLabel: null,
      })
    case 'dawn':
      return Object.freeze({
        stage: 'Dawn announcement',
        playerCount: session.workflow.game.players.length,
        nightNumber: session.workflow.game.nightNumber,
        dayNumber: session.workflow.game.dayNumber,
        resultLabel: null,
      })
    case 'day-discussion':
      return Object.freeze({
        stage: 'Day discussion',
        playerCount: session.game.players.length,
        nightNumber: session.game.nightNumber,
        dayNumber: session.game.dayNumber,
        resultLabel: null,
      })
    case 'day-outcome':
      return Object.freeze({
        stage: 'Day complete',
        playerCount: session.game.players.length,
        nightNumber: session.game.nightNumber,
        dayNumber: session.game.dayNumber,
        resultLabel: null,
      })
    case 'post-day-waiting':
    case 'pending-revenge-waiting':
      return Object.freeze({
        stage: 'Day complete',
        playerCount: session.game.players.length,
        nightNumber: session.game.nightNumber,
        dayNumber: session.game.dayNumber,
        resultLabel: null,
      })
    case 'game-over':
      return Object.freeze({
        stage: 'Game over',
        playerCount: session.game.players.length,
        nightNumber: session.game.nightNumber,
        dayNumber: session.game.dayNumber,
        resultLabel: selectPersistedResultLabel(session.result),
      })
  }
}

function selectPersistedResultLabel(
  result: Extract<ActiveAppSession, Readonly<{ stage: 'game-over' }>>['result'],
): NonNullable<SessionStageSummary['resultLabel']> {
  switch (result.kind) {
    case 'town-victory':
      return 'Town wins'
    case 'mafia-victory':
      return 'Mafia wins'
    case 'serial-killer-victory':
      return 'Serial Killer wins'
    case 'draw':
      return 'Draw'
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
    })),
    neutralStateVersion: 4,
    executionerBriefingStatus: game.executionerBriefingStatus,
    executionerTargets: game.executionerTargets.map((target) => ({ ...target })),
    settings: copySettings(game.settings),
    nightNumber: game.nightNumber,
    dayNumber: game.dayNumber,
    doctorPreviousTargets: game.doctorPreviousTargets.map((entry) => ({ ...entry })),
    deathRecords: game.deathRecords.map((record) => ({
      ...record,
      cause: { ...record.cause },
    })),
    personalWins: game.personalWins.map((record) => ({ ...record })),
    executionerConversions: game.executionerConversions.map((record) => ({ ...record })),
    godfatherSuccessionStartNightNumber: game.godfatherSuccessionStartNightNumber,
    godfatherPromotions: game.godfatherPromotions.map((record) => ({ ...record })),
    pendingJesterRevenges: game.pendingJesterRevenges.map((record) => ({ ...record })),
    jesterRevengeResolutions: game.jesterRevengeResolutions.map((record) => ({ ...record })),
    dayOutcomes: game.dayOutcomes.map((record) => ({ ...record })),
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
      }
    : {
        stepIndex: record.stepIndex,
        status: record.status,
        actorPlayerId: record.actorPlayerId,
        actorRoleId: record.actorRoleId,
        actorRoleInstanceId: record.actorRoleInstanceId,
        action: copyNightAction(record.action),
        outcome: record.outcome === null ? null : copyImmediateOutcome(record.outcome),
      }
}

function copyImmediateOutcome(
  outcome: Extract<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>>,
): Extract<PersistedImmediateNightOutcomeV2, Readonly<{ kind: 'blocked' }>>
function copyImmediateOutcome(
  outcome: Exclude<ImmediateNightOutcome, Readonly<{ kind: 'blocked' }>>,
): Exclude<PersistedImmediateNightOutcomeV2, Readonly<{ kind: 'blocked' }>>
function copyImmediateOutcome(outcome: ImmediateNightOutcome): PersistedImmediateNightOutcomeV2
function copyImmediateOutcome(outcome: ImmediateNightOutcome): PersistedImmediateNightOutcomeV2 {
  switch (outcome.kind) {
    case 'blocked':
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
