import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

import type { NightPresentationWorkflow } from './night-presentation-workflow.ts'
import type { PrivateNightResult } from './private-night-results.ts'

export type DawnDeathView = Readonly<{
  playerId: NightPresentationWorkflow['game']['players'][number]['playerId']
  playerName: string
  showStableId: boolean
  revealedRoleDisplayName: string | null
}>

export type DawnAnnouncementView =
  | Readonly<{
      outcome: 'no-deaths'
      nightNumber: number
    }>
  | Readonly<{
      outcome: 'deaths'
      nightNumber: number
      deaths: readonly DawnDeathView[]
    }>

export type NightPresentationView =
  | Readonly<{
      status: 'private-results'
      currentResult: PrivateNightResult
      currentResultIndex: number
      resultCount: number
      acknowledged: boolean
    }>
  | Readonly<{ status: 'ready-for-dawn' }>
  | Readonly<{
      status: 'dawn'
      announcement: DawnAnnouncementView
    }>

export function selectNightPresentationView(
  workflow: NightPresentationWorkflow,
): NightPresentationView {
  if (workflow.status === 'dawn') {
    return Object.freeze({
      status: 'dawn',
      announcement: selectDawnAnnouncementView(workflow),
    })
  }
  if (workflow.status === 'ready-for-dawn') {
    return Object.freeze({ status: 'ready-for-dawn' })
  }

  const currentResult = workflow.results[workflow.currentResultIndex]
  if (currentResult === undefined) {
    throw new Error('The current private result is missing.')
  }

  return Object.freeze({
    status: 'private-results',
    currentResult,
    currentResultIndex: workflow.currentResultIndex,
    resultCount: workflow.results.length,
    acknowledged: workflow.acknowledgedResultIds.some((resultId) => resultId === currentResult.id),
  })
}

export function selectDawnAnnouncementView(
  workflow: Extract<NightPresentationWorkflow, Readonly<{ status: 'dawn' }>>,
): DawnAnnouncementView {
  if (workflow.dawnAnnouncement.outcome === 'no-deaths') {
    return workflow.dawnAnnouncement
  }

  const duplicateNames = new Set(
    workflow.participants
      .map((participant) => participant.name)
      .filter((name, index, names) => names.indexOf(name) !== index),
  )

  return Object.freeze({
    outcome: 'deaths',
    nightNumber: workflow.dawnAnnouncement.nightNumber,
    deaths: Object.freeze(
      workflow.dawnAnnouncement.deaths.map((death) => {
        const participant = workflow.participants.find(
          (candidate) => candidate.id === death.playerId,
        )
        const gamePlayer = workflow.game.players.find(
          (candidate) => candidate.playerId === death.playerId,
        )

        if (participant === undefined || gamePlayer === undefined) {
          throw new Error(`Dawn player ${death.playerId} is unavailable.`)
        }

        const role =
          death.revealedRoleId === null ? undefined : findRoleDefinition(death.revealedRoleId)
        if (death.revealedRoleId !== null && role === undefined) {
          throw new Error(`Dawn role ${death.revealedRoleId} is unavailable.`)
        }

        return Object.freeze({
          playerId: death.playerId,
          playerName: participant.name,
          showStableId: duplicateNames.has(participant.name),
          revealedRoleDisplayName:
            role === undefined
              ? null
              : death.revealedRoleId === gamePlayer.role.roleId
                ? getRoleInstanceDisplayName(gamePlayer.role, role)
                : role.name,
        })
      }),
    ),
  })
}
