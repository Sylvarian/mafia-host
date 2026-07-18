import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

import type { DawnWorkflow, NightCompletionWorkflow } from './night-completion-workflow.ts'

export type DawnDeathView = Readonly<{
  playerId: DawnWorkflow['game']['players'][number]['playerId']
  playerDisplayLabel: string
  revealedRoleDisplayName: string | null
}>

export type DawnAnnouncementView =
  | Readonly<{ outcome: 'no-deaths'; nightNumber: number }>
  | Readonly<{
      outcome: 'deaths'
      nightNumber: number
      deaths: readonly DawnDeathView[]
    }>

export type NightCompletionView =
  | Readonly<{ status: 'ready-for-dawn' }>
  | Readonly<{ status: 'dawn'; announcement: DawnAnnouncementView }>

export function selectNightCompletionView(workflow: NightCompletionWorkflow): NightCompletionView {
  return workflow.status === 'ready-for-dawn'
    ? Object.freeze({ status: 'ready-for-dawn' })
    : Object.freeze({
        status: 'dawn',
        announcement: selectDawnAnnouncementView(workflow),
      })
}

export function selectDawnAnnouncementView(workflow: DawnWorkflow): DawnAnnouncementView {
  if (workflow.dawnAnnouncement.outcome === 'no-deaths') {
    return workflow.dawnAnnouncement
  }

  return Object.freeze({
    outcome: 'deaths',
    nightNumber: workflow.dawnAnnouncement.nightNumber,
    deaths: Object.freeze(
      workflow.dawnAnnouncement.deaths.map((death) => {
        const participantIndex = workflow.participants.findIndex(
          (candidate) => candidate.id === death.playerId,
        )
        const participant = workflow.participants[participantIndex]
        const gamePlayer = workflow.game.players.find(
          (candidate) => candidate.playerId === death.playerId,
        )
        if (participant === undefined || gamePlayer === undefined) {
          throw new Error(`Dawn player ${death.playerId} is unavailable.`)
        }
        const duplicateName = workflow.participants.some(
          (candidate, index) => index !== participantIndex && candidate.name === participant.name,
        )
        const role =
          death.revealedRoleId === null ? undefined : findRoleDefinition(death.revealedRoleId)
        if (death.revealedRoleId !== null && role === undefined) {
          throw new Error(`Dawn role ${death.revealedRoleId} is unavailable.`)
        }

        return Object.freeze({
          playerId: death.playerId,
          playerDisplayLabel: duplicateName
            ? `${participant.name} (Player ${String(participantIndex + 1)})`
            : participant.name,
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
