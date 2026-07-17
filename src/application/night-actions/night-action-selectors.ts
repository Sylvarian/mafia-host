import type { PlayerId, RoleInstanceId } from '@/domain/identifiers.ts'
import type { NightActionKind } from '@/domain/night-actions/night-action-kind.ts'
import type { Faction } from '@/domain/roles/faction.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

import {
  selectNightActionTarget,
  type CollectingNightActionsWorkflow,
  type NightActionCollectionError,
  type ReviewingNightActionsWorkflow,
} from './night-action-workflow.ts'
import { orderNightActionsBySequence } from './night-sequence.ts'

type NightStepViewBase = Readonly<{
  nightNumber: number
  position: number
  totalSteps: number
}>

export type MafiaOverviewMember = Readonly<{
  playerId: PlayerId
  playerName: string
  showStableId: boolean
  roleDisplayName: string
}>

export type NightTargetOption = Readonly<{
  playerId: PlayerId
  playerName: string
  showStableId: boolean
  alive: boolean
  selected: boolean
  enabled: boolean
  disabledReason: NightActionCollectionError | null
}>

export type CurrentNightStepView =
  | (NightStepViewBase & Readonly<{ type: 'night-opening' }>)
  | (NightStepViewBase &
      Readonly<{ type: 'mafia-opening'; mafiaMembers: readonly MafiaOverviewMember[] }>)
  | (NightStepViewBase &
      Readonly<{
        type: 'actor-action'
        actorPlayerId: PlayerId
        actorPlayerName: string
        showActorStableId: boolean
        actorRoleInstanceId: RoleInstanceId
        roleDisplayName: string
        faction: Faction
        hostPrompt: string
        selectedTargetId: PlayerId | null
        targetOptions: readonly NightTargetOption[]
      }>)
  | (NightStepViewBase & Readonly<{ type: 'mafia-closing' }>)

export type NightActionReviewRow = Readonly<{
  actorRoleInstanceId: RoleInstanceId
  actorPlayerId: PlayerId
  actorPlayerName: string
  showActorStableId: boolean
  roleDisplayName: string
  actionDescription: string
  targetPlayerName: string
  targetPlayerId: PlayerId
  showTargetStableId: boolean
}>

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

  switch (step.type) {
    case 'night-opening':
      return { ...base, type: step.type }
    case 'mafia-opening':
      return {
        ...base,
        type: step.type,
        mafiaMembers: Object.freeze(
          step.mafiaPlayerIds.map((playerId) => selectMafiaMember(workflow, playerId)),
        ),
      }
    case 'actor-action': {
      const actor = workflow.game.players.find((player) => player.playerId === step.actorPlayerId)
      const participant = workflow.participants.find((player) => player.id === step.actorPlayerId)

      if (actor === undefined || participant === undefined) {
        throw new Error(`Night actor ${step.actorPlayerId} is missing from the active game.`)
      }

      const role = findRoleDefinition(actor.role.roleId)

      if (role === undefined || !role.nightAction.hasNightAction) {
        throw new Error(`Night actor ${step.actorPlayerId} has no collection metadata.`)
      }

      const selectedTargetId =
        workflow.submittedActions.find(
          (action) => action.actorRoleInstanceId === step.actorRoleInstanceId,
        )?.targetPlayerId ?? null
      const duplicateNames = getDuplicateNames(workflow.participants.map((player) => player.name))

      return {
        ...base,
        type: step.type,
        actorPlayerId: actor.playerId,
        actorPlayerName: participant.name,
        showActorStableId: duplicateNames.has(participant.name),
        actorRoleInstanceId: actor.role.instanceId,
        roleDisplayName: getRoleInstanceDisplayName(actor.role, role),
        faction: role.faction,
        hostPrompt: role.nightAction.hostPrompt,
        selectedTargetId,
        targetOptions: Object.freeze(
          workflow.game.players.map((target) => {
            const targetParticipant = workflow.participants.find(
              (player) => player.id === target.playerId,
            )

            if (targetParticipant === undefined) {
              throw new Error(`Target ${target.playerId} is missing from the confirmed setup.`)
            }

            const selectionResult = selectNightActionTarget(workflow, target.playerId)

            return Object.freeze({
              playerId: target.playerId,
              playerName: targetParticipant.name,
              showStableId: duplicateNames.has(targetParticipant.name),
              alive: target.alive,
              selected: selectedTargetId === target.playerId,
              enabled: selectionResult.ok,
              disabledReason: selectionResult.ok ? null : selectionResult.error,
            })
          }),
        ),
      }
    }
    case 'mafia-closing':
      return { ...base, type: step.type }
    case 'review':
      throw new Error('Review steps must be represented by the reviewing workflow state.')
  }
}

export function selectNightActionReview(
  workflow: ReviewingNightActionsWorkflow,
): readonly NightActionReviewRow[] {
  const duplicateNames = getDuplicateNames(workflow.participants.map((player) => player.name))

  return Object.freeze(
    orderNightActionsBySequence(workflow.steps, workflow.submittedActions).map((action) => {
      const actor = workflow.game.players.find((player) => player.playerId === action.actorPlayerId)
      const actorParticipant = workflow.participants.find(
        (player) => player.id === action.actorPlayerId,
      )
      const targetParticipant = workflow.participants.find(
        (player) => player.id === action.targetPlayerId,
      )

      if (
        actor === undefined ||
        actorParticipant === undefined ||
        targetParticipant === undefined
      ) {
        throw new Error(
          `Review action ${action.actorRoleInstanceId} has invalid player references.`,
        )
      }

      const role = findRoleDefinition(actor.role.roleId)

      if (role === undefined) {
        throw new Error(`Review actor ${actor.playerId} has an unknown role.`)
      }

      return Object.freeze({
        actorRoleInstanceId: action.actorRoleInstanceId,
        actorPlayerId: action.actorPlayerId,
        actorPlayerName: actorParticipant.name,
        showActorStableId: duplicateNames.has(actorParticipant.name),
        roleDisplayName: getRoleInstanceDisplayName(actor.role, role),
        actionDescription: formatActionDescription(action.actionKind),
        targetPlayerName: targetParticipant.name,
        targetPlayerId: action.targetPlayerId,
        showTargetStableId: duplicateNames.has(targetParticipant.name),
      })
    }),
  )
}

function selectMafiaMember(
  workflow: CollectingNightActionsWorkflow,
  playerId: PlayerId,
): MafiaOverviewMember {
  const gamePlayer = workflow.game.players.find((player) => player.playerId === playerId)
  const participant = workflow.participants.find((player) => player.id === playerId)

  if (gamePlayer === undefined || participant === undefined) {
    throw new Error(`Mafia overview player ${playerId} is missing from the active game.`)
  }

  const role = findRoleDefinition(gamePlayer.role.roleId)

  if (role === undefined || role.faction !== 'mafia') {
    throw new Error(`Mafia overview player ${playerId} does not have a Mafia role.`)
  }

  const duplicateNames = getDuplicateNames(workflow.participants.map((player) => player.name))

  return Object.freeze({
    playerId,
    playerName: participant.name,
    showStableId: duplicateNames.has(participant.name),
    roleDisplayName: getRoleInstanceDisplayName(gamePlayer.role, role),
  })
}

function getDuplicateNames(names: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const name of names) {
    if (seen.has(name)) {
      duplicates.add(name)
    }
    seen.add(name)
  }

  return duplicates
}

function formatActionDescription(actionKind: NightActionKind): string {
  switch (actionKind) {
    case 'attack':
      return 'attack'
    case 'frame':
      return 'frame'
    case 'role-block':
      return 'role-block'
    case 'investigate':
      return 'investigate'
    case 'track':
      return 'track'
    case 'protect':
      return 'protect'
  }
}
