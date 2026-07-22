import type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'
import type { Faction } from '@/domain/roles/faction.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { ROLE_IDS, findRoleDefinition } from '@/domain/roles/role-registry.ts'
import { selectActiveRoleId } from '@/domain/neutral/executioner-conversion.ts'
import { resolveFrames } from '@/domain/resolution/frames.ts'
import {
  groupHostPlayersByActiveAlignment,
  selectHostPlayerRoleViews,
  type HostPlayerAlignmentGroup,
  type HostPlayerRoleView,
} from '../player-roles/index.ts'

import {
  validateCurrentNightActionTarget,
  type AwaitingNightOutcomeWorkflow,
  type CollectingNightActionsWorkflow,
  type ImmediateNightOutcome,
  type NightActionCollectionError,
} from './night-action-workflow.ts'

type NightStepViewBase = Readonly<{
  nightNumber: number
  position: number
  totalSteps: number
}>

export type MafiaOverviewMember = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
  roleDisplayName: string
  originallyAssignedRoleDisplayName: string | null
}>

export type MafiaOverviewPromotion = Readonly<{
  promotedPlayerDisplayLabel: string
  currentRoleDisplayName: 'Godfather'
  originallyAssignedRoleDisplayName: string
}>

export type NightTargetOption = HostPlayerRoleView &
  Readonly<{
    alive: boolean
    enabled: boolean
    disabledReason: NightActionCollectionError | null
  }>

export type NightTargetGroup = HostPlayerAlignmentGroup<NightTargetOption>

export type CurrentNightStepView =
  | (NightStepViewBase &
      Readonly<{
        type: 'mafia-overview'
        mafiaMembers: readonly MafiaOverviewMember[]
        promotion: MafiaOverviewPromotion | null
      }>)
  | (NightStepViewBase &
      Readonly<{
        type: 'actor-action'
        actorPlayerId: PlayerId
        actorDisplayLabel: string
        actorRoleInstanceId: RoleInstanceId
        roleDisplayName: string
        faction: Faction
        factionLabel: 'Mafia' | 'Town' | 'Neutral'
        hostPrompt: string
        confirmationMode: 'advance-directly' | 'show-private-result'
        targetOptions: readonly NightTargetOption[]
        targetGroups: readonly NightTargetGroup[]
      }>)

type ImmediateNightOutcomeViewBase = Readonly<{
  nightNumber: number
  actorPlayerId: PlayerId
  actorDisplayLabel: string
  actorRoleInstanceId: RoleInstanceId
  roleDisplayName: string
  faction: Faction
  factionLabel: 'Mafia' | 'Town' | 'Neutral'
}>

export type ImmediateNightOutcomeView =
  | (ImmediateNightOutcomeViewBase & Readonly<{ kind: 'blocked' }>)
  | (ImmediateNightOutcomeViewBase &
      Readonly<{
        kind: 'sheriff-result'
        targetDisplayLabel: string
        targetRoleDisplayName: string
        targetOriginallyAssignedRoleDisplayName: string | null
        targetAlignmentDisplayName: 'Mafia' | 'Town' | 'Neutral'
        status: 'suspicious' | 'not-suspicious'
        reason:
          | 'framed-tonight'
          | 'serial-killer-role'
          | 'godfather-detection-enabled'
          | 'godfather-detection-disabled'
          | 'role-appears-suspicious'
          | 'role-does-not-appear-suspicious'
      }>)
  | (ImmediateNightOutcomeViewBase &
      Readonly<{
        kind: 'investigation-result'
        targetDisplayLabel: string
        investigationRole: 'investigator' | 'consigliere'
        groupLabel: string
        groupRoleDisplayNames: readonly string[]
      }>)
  | (ImmediateNightOutcomeViewBase &
      Readonly<{
        kind: 'detective-result'
        targetDisplayLabel: string
        result:
          | Readonly<{ status: 'visited-nobody' }>
          | Readonly<{ status: 'visited-player'; visitedPlayerDisplayLabel: string }>
      }>)

export function selectCurrentNightStepView(
  workflow: CollectingNightActionsWorkflow,
): CurrentNightStepView {
  const step = workflow.steps[workflow.currentStepIndex]
  if (step === undefined) {
    throw new Error(`Night sequence index ${String(workflow.currentStepIndex)} is out of bounds.`)
  }

  const base: NightStepViewBase = {
    nightNumber: workflow.game.nightNumber,
    position: workflow.currentStepIndex + 1,
    totalSteps: workflow.steps.length,
  }

  if (step.type === 'mafia-overview') {
    return {
      ...base,
      type: 'mafia-overview',
      mafiaMembers: Object.freeze(
        step.mafiaPlayerIds.map((playerId) => selectMafiaMember(workflow, playerId)),
      ),
      promotion: selectMafiaOverviewPromotion(workflow),
    }
  }

  const actor = workflow.game.players.find((player) => player.playerId === step.actorPlayerId)
  const participant = workflow.participants.find((player) => player.id === step.actorPlayerId)
  if (actor === undefined || participant === undefined) {
    throw new Error(`Night actor ${step.actorPlayerId} is missing from the active game.`)
  }
  const activeRoleId = selectRequiredActiveRoleId(workflow.game, actor.playerId)
  const role = findRoleDefinition(activeRoleId)
  if (role === undefined || !role.nightAction.hasNightAction) {
    throw new Error(`Night actor ${step.actorPlayerId} has no collection metadata.`)
  }

  const hostRowsResult = selectHostPlayerRoleViews(workflow.game, workflow.participants)
  if (!hostRowsResult.ok) {
    throw new Error('Night targets could not derive canonical active role metadata.')
  }
  const targetOptions = Object.freeze(
    hostRowsResult.value.map((target) => {
      const confirmationResult = validateCurrentNightActionTarget(workflow, target.playerId)

      return Object.freeze({
        ...target,
        alive: target.status === 'alive',
        enabled: confirmationResult.ok,
        disabledReason: confirmationResult.ok ? null : confirmationResult.error,
      })
    }),
  )

  return Object.freeze({
    ...base,
    type: 'actor-action',
    actorPlayerId: actor.playerId,
    actorDisplayLabel: selectPlayerDisplayLabel(workflow.participants, actor.playerId),
    actorRoleInstanceId: actor.role.instanceId,
    roleDisplayName:
      activeRoleId === actor.role.roleId ? getRoleInstanceDisplayName(actor.role, role) : role.name,
    faction: role.faction,
    factionLabel: formatFaction(role.faction),
    hostPrompt: role.nightAction.hostPrompt,
    confirmationMode:
      role.id === ROLE_IDS.sheriff ||
      role.id === ROLE_IDS.investigator ||
      role.id === ROLE_IDS.consigliere ||
      role.id === ROLE_IDS.detective
        ? 'show-private-result'
        : 'advance-directly',
    targetOptions,
    targetGroups: groupHostPlayersByActiveAlignment(targetOptions),
  })
}

export function selectImmediateNightOutcomeView(
  workflow: AwaitingNightOutcomeWorkflow,
): ImmediateNightOutcomeView {
  const outcome = workflow.currentOutcome
  const actor = workflow.game.players.find(
    (player) => player.role.instanceId === outcome.actorRoleInstanceId,
  )
  if (actor === undefined || actor.playerId !== outcome.actorPlayerId) {
    throw new Error('The current immediate outcome actor is unavailable.')
  }
  const activeRoleId = selectRequiredActiveRoleId(workflow.game, actor.playerId)
  const role = findRoleDefinition(activeRoleId)
  if (role === undefined || role.id !== outcome.actorRoleId) {
    throw new Error('The current immediate outcome role is unavailable.')
  }

  const base: ImmediateNightOutcomeViewBase = Object.freeze({
    nightNumber: workflow.game.nightNumber,
    actorPlayerId: actor.playerId,
    actorDisplayLabel: selectPlayerDisplayLabel(workflow.participants, actor.playerId),
    actorRoleInstanceId: actor.role.instanceId,
    roleDisplayName:
      activeRoleId === actor.role.roleId ? getRoleInstanceDisplayName(actor.role, role) : role.name,
    faction: role.faction,
    factionLabel: formatFaction(role.faction),
  })

  switch (outcome.kind) {
    case 'blocked':
      return Object.freeze({ ...base, kind: outcome.kind })
    case 'sheriff-result': {
      const target = selectImmediateOutcomeTarget(workflow, outcome.targetPlayerId)
      return Object.freeze({
        ...base,
        kind: outcome.kind,
        targetDisplayLabel: target.playerDisplayLabel,
        targetRoleDisplayName: target.activeRoleDisplayName,
        targetOriginallyAssignedRoleDisplayName: target.originallyAssignedRoleDisplayName,
        targetAlignmentDisplayName: target.alignmentDisplayName,
        status: outcome.status,
        reason: selectSheriffReason(workflow, outcome.targetPlayerId, target.activeRoleDisplayName),
      })
    }
    case 'investigation-result':
      return Object.freeze({
        ...base,
        kind: outcome.kind,
        targetDisplayLabel: selectPlayerDisplayLabel(workflow.participants, outcome.targetPlayerId),
        investigationRole: outcome.investigationRole,
        groupLabel: outcome.group.label,
        groupRoleDisplayNames: outcome.group.roleDisplayNames,
      })
    case 'detective-result':
      return Object.freeze({
        ...base,
        kind: outcome.kind,
        targetDisplayLabel: selectPlayerDisplayLabel(workflow.participants, outcome.targetPlayerId),
        result:
          outcome.result.status === 'visited-nobody'
            ? Object.freeze({ status: 'visited-nobody' })
            : Object.freeze({
                status: 'visited-player',
                visitedPlayerDisplayLabel: selectPlayerDisplayLabel(
                  workflow.participants,
                  outcome.result.visitedPlayerId,
                ),
              }),
      })
  }
}

function selectImmediateOutcomeTarget(
  workflow: AwaitingNightOutcomeWorkflow,
  selectedPlayerId: PlayerId,
): HostPlayerRoleView {
  const result = selectHostPlayerRoleViews(workflow.game, workflow.participants)
  const target = result.ok
    ? result.value.find((candidate) => candidate.playerId === selectedPlayerId)
    : undefined
  if (target === undefined) {
    throw new Error('The immediate outcome target role is unavailable.')
  }
  return target
}

function selectSheriffReason(
  workflow: AwaitingNightOutcomeWorkflow,
  targetPlayerId: PlayerId,
  targetRoleDisplayName: string,
): Extract<ImmediateNightOutcomeView, Readonly<{ kind: 'sheriff-result' }>>['reason'] {
  const confirmedActions = workflow.completedSteps.flatMap((step) =>
    step.status === 'action-confirmed' ? [step.action] : [],
  )
  if (
    resolveFrames(workflow.game, confirmedActions).some(
      (frame) => frame.framedPlayerId === targetPlayerId,
    )
  ) {
    return 'framed-tonight'
  }
  const target = workflow.game.players.find((player) => player.playerId === targetPlayerId)
  const activeRoleId =
    target === undefined ? null : selectActiveRoleId(workflow.game, target.playerId)
  if (activeRoleId === ROLE_IDS.serialKiller) {
    return 'serial-killer-role'
  }
  if (activeRoleId === ROLE_IDS.godfather) {
    return workflow.game.settings.godfatherAppearsSuspiciousToSheriff
      ? 'godfather-detection-enabled'
      : 'godfather-detection-disabled'
  }
  if (activeRoleId === null || targetRoleDisplayName.length === 0) {
    throw new Error('The Sheriff target role is unavailable.')
  }
  return workflow.currentOutcome.kind === 'sheriff-result' &&
    workflow.currentOutcome.status === 'suspicious'
    ? 'role-appears-suspicious'
    : 'role-does-not-appear-suspicious'
}

function selectMafiaMember(
  workflow: CollectingNightActionsWorkflow,
  playerId: PlayerId,
): MafiaOverviewMember {
  const gamePlayer = workflow.game.players.find((player) => player.playerId === playerId)
  if (gamePlayer === undefined) {
    throw new Error(`Mafia overview player ${playerId} is missing from the active game.`)
  }
  const activeRoleId = selectRequiredActiveRoleId(workflow.game, gamePlayer.playerId)
  const role = findRoleDefinition(activeRoleId)
  if (role === undefined || role.faction !== 'mafia') {
    throw new Error(`Mafia overview player ${playerId} does not have a Mafia role.`)
  }

  return Object.freeze({
    playerId,
    playerDisplayLabel: selectPlayerDisplayLabel(workflow.participants, playerId),
    roleDisplayName:
      activeRoleId === gamePlayer.role.roleId
        ? getRoleInstanceDisplayName(gamePlayer.role, role)
        : role.name,
    originallyAssignedRoleDisplayName:
      activeRoleId === gamePlayer.role.roleId
        ? null
        : getOriginalRoleDisplayName(gamePlayer.role.roleId, gamePlayer.role),
  })
}

function selectMafiaOverviewPromotion(
  workflow: CollectingNightActionsWorkflow,
): MafiaOverviewPromotion | null {
  const promotions = workflow.game.godfatherPromotions.filter(
    (promotion) => promotion.promotedAtNightNumber === workflow.game.nightNumber,
  )
  if (promotions.length === 0) {
    return null
  }
  const promotion = promotions[0]
  if (promotion === undefined || promotions.length !== 1) {
    throw new Error('The Mafia overview has invalid current Godfather promotion authority.')
  }
  const promotedPlayer = workflow.game.players.find(
    (player) =>
      player.playerId === promotion.playerId &&
      player.role.instanceId === promotion.originalRoleInstanceId,
  )
  if (promotedPlayer === undefined || promotion.activeRoleId !== ROLE_IDS.godfather) {
    throw new Error('The promoted Godfather is unavailable to the Mafia overview.')
  }
  return Object.freeze({
    promotedPlayerDisplayLabel: selectPlayerDisplayLabel(
      workflow.participants,
      promotedPlayer.playerId,
    ),
    currentRoleDisplayName: 'Godfather',
    originallyAssignedRoleDisplayName: getOriginalRoleDisplayName(
      promotedPlayer.role.roleId,
      promotedPlayer.role,
    ),
  })
}

function getOriginalRoleDisplayName(
  originalRoleId: CollectingNightActionsWorkflow['game']['players'][number]['role']['roleId'],
  roleInstance: CollectingNightActionsWorkflow['game']['players'][number]['role'],
): string {
  const originalRole = findRoleDefinition(originalRoleId)
  if (originalRole === undefined) {
    throw new Error('An original Mafia role is absent from the canonical registry.')
  }
  return getRoleInstanceDisplayName(roleInstance, originalRole)
}

function selectRequiredActiveRoleId(
  game: CollectingNightActionsWorkflow['game'],
  selectedPlayerId: PlayerId,
) {
  const activeRoleId = selectActiveRoleId(game, selectedPlayerId)
  if (activeRoleId === null) {
    throw new Error('A validated night player has no active role.')
  }
  return activeRoleId
}

function selectPlayerDisplayLabel(
  participants: readonly Readonly<{ id: PlayerId; name: string }>[],
  playerId: PlayerId,
): string {
  const index = participants.findIndex((participant) => participant.id === playerId)
  const participant = participants[index]
  if (participant === undefined) {
    throw new Error(`Player ${playerId} is missing from the confirmed participant roster.`)
  }
  const duplicate = participants.some(
    (candidate, candidateIndex) => candidateIndex !== index && candidate.name === participant.name,
  )
  return duplicate ? `${participant.name} (Player ${String(index + 1)})` : participant.name
}

function formatFaction(faction: Faction): 'Mafia' | 'Town' | 'Neutral' {
  switch (faction) {
    case 'mafia':
      return 'Mafia'
    case 'town':
      return 'Town'
    case 'neutral':
      return 'Neutral'
  }
}

export function selectImmediateOutcome(
  workflow: AwaitingNightOutcomeWorkflow,
): ImmediateNightOutcome {
  return workflow.currentOutcome
}
