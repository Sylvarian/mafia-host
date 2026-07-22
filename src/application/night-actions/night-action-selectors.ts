import type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'
import type { Faction } from '@/domain/roles/faction.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { ROLE_IDS, findRoleDefinition } from '@/domain/roles/role-registry.ts'
import { selectActiveRoleId } from '@/domain/neutral/executioner-conversion.ts'

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
}>

export type NightTargetOption = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
  alive: boolean
  enabled: boolean
  disabledReason: NightActionCollectionError | null
}>

export type CurrentNightStepView =
  | (NightStepViewBase &
      Readonly<{ type: 'mafia-overview'; mafiaMembers: readonly MafiaOverviewMember[] }>)
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
        status: 'suspicious' | 'not-suspicious'
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
    targetOptions: Object.freeze(
      workflow.game.players.map((target) => {
        const confirmationResult = validateCurrentNightActionTarget(workflow, target.playerId)

        return Object.freeze({
          playerId: target.playerId,
          playerDisplayLabel: selectPlayerDisplayLabel(workflow.participants, target.playerId),
          alive: target.alive,
          enabled: confirmationResult.ok,
          disabledReason: confirmationResult.ok ? null : confirmationResult.error,
        })
      }),
    ),
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
    case 'sheriff-result':
      return Object.freeze({
        ...base,
        kind: outcome.kind,
        targetDisplayLabel: selectPlayerDisplayLabel(workflow.participants, outcome.targetPlayerId),
        status: outcome.status,
      })
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
  })
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
