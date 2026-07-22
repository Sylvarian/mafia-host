import type { DeathCause } from '@/domain/game/death-record.ts'
import type { PlayerId } from '@/domain/identifiers.ts'
import type { ImportantAttackEvent } from '@/domain/resolution/important-night-events.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { findRoleDefinition } from '@/domain/roles/role-registry.ts'

import { selectHostPlayerRoleViews, type HostPlayerRoleView } from '../player-roles/index.ts'
import type {
  DawnWorkflow,
  ReadyForDawnWorkflow,
  RevengeResolutionWorkflow,
} from './night-completion-workflow.ts'

export type DawnDeathAnnouncementView = Readonly<{
  playerId: PlayerId
  playerDisplayLabel: string
  revealedRoleDisplayName: string | null
}>

export type DawnAnnouncementView =
  | Readonly<{ outcome: 'no-deaths'; nightNumber: number }>
  | Readonly<{
      outcome: 'deaths'
      nightNumber: number
      deaths: readonly DawnDeathAnnouncementView[]
    }>

export type HostNightPlayerView = Pick<
  HostPlayerRoleView,
  | 'playerId'
  | 'playerDisplayLabel'
  | 'activeRoleDisplayName'
  | 'originallyAssignedRoleDisplayName'
  | 'alignment'
  | 'alignmentDisplayName'
>

export type DawnHostDeathView = HostNightPlayerView &
  Readonly<{
    cause:
      | Readonly<{
          kind: 'ordinary-night-attack'
          attackers: readonly HostNightPlayerView[]
        }>
      | Readonly<{
          kind: 'jester-revenge'
          jester: HostNightPlayerView
        }>
  }>

export type DawnConversionView = Readonly<{
  convertedPlayer: HostNightPlayerView
  targetPlayer: HostNightPlayerView
}>

export type ImportantNightEventView =
  | Readonly<{
      kind: 'role-blocked'
      consort: HostNightPlayerView
      target: HostNightPlayerView
    }>
  | Readonly<{
      kind: 'role-block-immune'
      consort: HostNightPlayerView
      target: HostNightPlayerView
    }>
  | Readonly<{
      kind: 'framed'
      framer: HostNightPlayerView
      target: HostNightPlayerView
    }>
  | Readonly<{
      kind: 'doctor-save'
      attacker: HostNightPlayerView
      target: HostNightPlayerView
      doctors: readonly HostNightPlayerView[]
    }>
  | Readonly<{
      kind: 'attack-immunity'
      attacker: HostNightPlayerView
      target: HostNightPlayerView
    }>
  | Readonly<{
      kind: 'mutual-attack-immunity'
      firstAttacker: HostNightPlayerView
      secondAttacker: HostNightPlayerView
    }>

export type DawnHostResultsView = Readonly<{
  deaths: readonly DawnHostDeathView[]
  conversions: readonly DawnConversionView[]
}>

export type NightCompletionView =
  | Readonly<{ status: 'ready-for-dawn' }>
  | Readonly<{
      status: 'dawn'
      announcement: DawnAnnouncementView
      hostResults: DawnHostResultsView
      importantEvents: readonly ImportantNightEventView[]
    }>

export type RevengeResolutionView = Readonly<{
  nightNumber: number
  roleDisplayName: 'Jester'
  alignment: 'neutral'
  alignmentDisplayName: 'Neutral'
  victimDisplayLabel: string
}>

export function selectNightCompletionView(
  workflow: ReadyForDawnWorkflow | DawnWorkflow,
): NightCompletionView {
  if (workflow.status === 'ready-for-dawn') {
    return Object.freeze({ status: 'ready-for-dawn' })
  }

  const players = selectHostPlayers(workflow)
  return Object.freeze({
    status: 'dawn',
    announcement: selectDawnAnnouncementView(workflow, players),
    hostResults: selectDawnHostResults(workflow, players),
    importantEvents: selectImportantNightEventViews(workflow, players),
  })
}

export function selectDawnAnnouncementView(
  workflow: DawnWorkflow,
  players: readonly HostPlayerRoleView[] = selectHostPlayers(workflow),
): DawnAnnouncementView {
  if (workflow.dawnAnnouncement.outcome === 'no-deaths') {
    return workflow.dawnAnnouncement
  }

  return Object.freeze({
    outcome: 'deaths',
    nightNumber: workflow.dawnAnnouncement.nightNumber,
    deaths: Object.freeze(
      workflow.dawnAnnouncement.deaths.map((death) => {
        const player = requireHostPlayer(players, death.playerId)
        const gamePlayer = workflow.game.players.find(
          (candidate) => candidate.playerId === death.playerId,
        )
        const revealedRole =
          death.revealedRoleId === null ? undefined : findRoleDefinition(death.revealedRoleId)
        if (
          gamePlayer === undefined ||
          (death.revealedRoleId !== null && revealedRole === undefined)
        ) {
          throw new Error('A Dawn announcement role is unavailable.')
        }
        return Object.freeze({
          playerId: death.playerId,
          playerDisplayLabel: player.playerDisplayLabel,
          revealedRoleDisplayName:
            revealedRole === undefined
              ? null
              : death.revealedRoleId === gamePlayer.role.roleId
                ? getRoleInstanceDisplayName(gamePlayer.role, revealedRole)
                : revealedRole.name,
        })
      }),
    ),
  })
}

function selectDawnHostResults(
  workflow: DawnWorkflow,
  players: readonly HostPlayerRoleView[],
): DawnHostResultsView {
  const announcedDeathPlayerIds =
    workflow.dawnAnnouncement.outcome === 'deaths'
      ? new Set(workflow.dawnAnnouncement.deaths.map((death) => death.playerId))
      : new Set<PlayerId>()
  const records = workflow.game.deathRecords.filter(
    (record) =>
      announcedDeathPlayerIds.has(record.playerId) &&
      isCurrentDawnCause(record.cause, workflow.game.nightNumber),
  )
  const deaths = records.map((record): DawnHostDeathView => {
    const player = toHostNightPlayer(requireHostPlayer(players, record.playerId))
    if (record.cause.kind === 'night-death') {
      const attackers = workflow.importantNightEvents.events.flatMap((event) =>
        event.kind === 'attack' &&
        event.outcome === 'lethal' &&
        event.targetPlayerId === record.playerId
          ? [toHostNightPlayer(requireHostPlayer(players, event.attackerPlayerId))]
          : [],
      )
      return Object.freeze({
        ...player,
        cause: Object.freeze({
          kind: 'ordinary-night-attack' as const,
          attackers: Object.freeze(attackers),
        }),
      })
    }
    if (record.cause.kind !== 'jester-revenge') {
      throw new Error('A current Dawn death has an unsupported cause.')
    }
    return Object.freeze({
      ...player,
      cause: Object.freeze({
        kind: 'jester-revenge' as const,
        jester: toHostNightPlayer(requireHostPlayer(players, record.cause.jesterPlayerId)),
      }),
    })
  })

  const conversions = workflow.game.executionerConversions.flatMap((conversion) =>
    announcedDeathPlayerIds.has(conversion.targetPlayerId)
      ? [
          Object.freeze({
            convertedPlayer: toHostNightPlayer(requireHostPlayer(players, conversion.playerId)),
            targetPlayer: toHostNightPlayer(requireHostPlayer(players, conversion.targetPlayerId)),
          }),
        ]
      : [],
  )

  return Object.freeze({
    deaths: Object.freeze(deaths),
    conversions: Object.freeze(conversions),
  })
}

function selectImportantNightEventViews(
  workflow: DawnWorkflow,
  players: readonly HostPlayerRoleView[],
): readonly ImportantNightEventView[] {
  if (workflow.importantNightEvents.completeness === 'legacy-unavailable') {
    return Object.freeze([])
  }

  const events: ImportantNightEventView[] = []
  const combinedMutualAttackers = new Set<PlayerId>()
  for (const event of workflow.importantNightEvents.events) {
    switch (event.kind) {
      case 'role-block':
        events.push(
          Object.freeze({
            kind:
              event.outcome === 'blocked-target'
                ? ('role-blocked' as const)
                : ('role-block-immune' as const),
            consort: toHostNightPlayer(requireHostPlayer(players, event.consortPlayerId)),
            target: toHostNightPlayer(requireHostPlayer(players, event.targetPlayerId)),
          }),
        )
        break
      case 'frame':
        events.push(
          Object.freeze({
            kind: 'framed',
            framer: toHostNightPlayer(requireHostPlayer(players, event.framerPlayerId)),
            target: toHostNightPlayer(requireHostPlayer(players, event.targetPlayerId)),
          }),
        )
        break
      case 'attack':
        if (event.outcome === 'protected') {
          events.push(
            Object.freeze({
              kind: 'doctor-save',
              attacker: toHostNightPlayer(requireHostPlayer(players, event.attackerPlayerId)),
              target: toHostNightPlayer(requireHostPlayer(players, event.targetPlayerId)),
              doctors: Object.freeze(
                event.doctors.map((doctor) =>
                  toHostNightPlayer(requireHostPlayer(players, doctor.doctorPlayerId)),
                ),
              ),
            }),
          )
        } else if (event.outcome === 'mutual-kill-disabled') {
          addAttackImmunityView(
            events,
            combinedMutualAttackers,
            event,
            workflow.importantNightEvents.events.filter(
              (candidate): candidate is ImportantAttackEvent => candidate.kind === 'attack',
            ),
            players,
          )
        }
        break
    }
  }
  return Object.freeze(events)
}

function addAttackImmunityView(
  views: ImportantNightEventView[],
  combinedAttackers: Set<PlayerId>,
  event: ImportantAttackEvent,
  attacks: readonly ImportantAttackEvent[],
  players: readonly HostPlayerRoleView[],
): void {
  if (combinedAttackers.has(event.attackerPlayerId)) {
    return
  }
  const reverse = attacks.find(
    (candidate) =>
      candidate.outcome === 'mutual-kill-disabled' &&
      candidate.attackerPlayerId === event.targetPlayerId &&
      candidate.targetPlayerId === event.attackerPlayerId,
  )
  if (reverse === undefined) {
    views.push(
      Object.freeze({
        kind: 'attack-immunity',
        attacker: toHostNightPlayer(requireHostPlayer(players, event.attackerPlayerId)),
        target: toHostNightPlayer(requireHostPlayer(players, event.targetPlayerId)),
      }),
    )
    return
  }
  combinedAttackers.add(event.attackerPlayerId)
  combinedAttackers.add(reverse.attackerPlayerId)
  views.push(
    Object.freeze({
      kind: 'mutual-attack-immunity',
      firstAttacker: toHostNightPlayer(requireHostPlayer(players, event.attackerPlayerId)),
      secondAttacker: toHostNightPlayer(requireHostPlayer(players, reverse.attackerPlayerId)),
    }),
  )
}

export function selectRevengeResolutionView(
  workflow: RevengeResolutionWorkflow,
): RevengeResolutionView {
  return Object.freeze({
    nightNumber: workflow.game.nightNumber,
    roleDisplayName: 'Jester',
    alignment: 'neutral',
    alignmentDisplayName: 'Neutral',
    victimDisplayLabel: selectPlayerDisplayLabel(
      workflow.participants,
      workflow.selectedRevenge.victimPlayerId,
    ),
  })
}

function selectHostPlayers(
  workflow: Pick<DawnWorkflow, 'game' | 'participants'>,
): readonly HostPlayerRoleView[] {
  const result = selectHostPlayerRoleViews(workflow.game, workflow.participants)
  if (!result.ok) {
    throw new Error('Dawn could not derive exact host player roles.')
  }
  return result.value
}

function requireHostPlayer(
  players: readonly HostPlayerRoleView[],
  selectedPlayerId: PlayerId,
): HostPlayerRoleView {
  const player = players.find((candidate) => candidate.playerId === selectedPlayerId)
  if (player === undefined) {
    throw new Error(`Dawn player ${selectedPlayerId} is unavailable.`)
  }
  return player
}

function toHostNightPlayer(player: HostPlayerRoleView): HostNightPlayerView {
  return Object.freeze({
    playerId: player.playerId,
    playerDisplayLabel: player.playerDisplayLabel,
    activeRoleDisplayName: player.activeRoleDisplayName,
    originallyAssignedRoleDisplayName: player.originallyAssignedRoleDisplayName,
    alignment: player.alignment,
    alignmentDisplayName: player.alignmentDisplayName,
  })
}

function isCurrentDawnCause(cause: DeathCause, nightNumber: number): boolean {
  return (
    (cause.kind === 'night-death' || cause.kind === 'jester-revenge') &&
    cause.nightNumber === nightNumber
  )
}

function selectPlayerDisplayLabel(
  participants: readonly Readonly<{ id: string; name: string }>[],
  selectedPlayerId: string,
): string {
  const index = participants.findIndex((participant) => participant.id === selectedPlayerId)
  const participant = participants[index]
  if (participant === undefined) {
    throw new Error('The selected revenge victim is absent from the participant roster.')
  }
  const duplicate = participants.some(
    (candidate, candidateIndex) => candidateIndex !== index && candidate.name === participant.name,
  )
  return duplicate ? `${participant.name} (Player ${String(index + 1)})` : participant.name
}
