import type { GameState } from '@/domain/game/game-state.ts'
import type { Player } from '@/domain/players/player.ts'

import type {
  ActiveExecutionerBriefingWorkflow,
  ExecutionerBriefingId,
} from './executioner-briefing-workflow.ts'

export type ExecutionerBriefingView = Readonly<{
  status: 'briefing' | 'ready'
  currentBriefingIndex: number
  briefingCount: number
  acknowledgedCount: number
  acknowledged: boolean
  currentBriefing: Readonly<{
    id: ExecutionerBriefingId
    executionerDisplayLabel: string
    executionerRoleDisplayName: string
    targetDisplayLabel: string
  }>
}>

export function selectExecutionerBriefingView(
  game: GameState,
  participants: readonly Player[],
  workflow: ActiveExecutionerBriefingWorkflow,
): ExecutionerBriefingView {
  const briefing = workflow.briefings[workflow.currentBriefingIndex]
  if (briefing === undefined) {
    throw new Error('The current Executioner briefing index is outside the canonical queue.')
  }

  const executioner = participants.find(
    (participant) => participant.id === briefing.executionerPlayerId,
  )
  const target = participants.find((participant) => participant.id === briefing.targetPlayerId)
  if (executioner === undefined || target === undefined) {
    throw new Error('An Executioner briefing participant is absent from the active game roster.')
  }
  if (
    !game.players.some(
      (player) =>
        player.playerId === briefing.executionerPlayerId &&
        player.role.instanceId === briefing.executionerRoleInstanceId,
    )
  ) {
    throw new Error('An Executioner briefing owner does not match the active game assignment.')
  }

  const duplicateNames = getDuplicateNames(participants.map((participant) => participant.name))
  return Object.freeze({
    status: workflow.status,
    currentBriefingIndex: workflow.currentBriefingIndex,
    briefingCount: workflow.briefings.length,
    acknowledgedCount: workflow.acknowledgedBriefingIds.length,
    acknowledged: workflow.acknowledgedBriefingIds.some((briefingId) => briefingId === briefing.id),
    currentBriefing: Object.freeze({
      id: briefing.id,
      executionerDisplayLabel: getParticipantDisplayLabel(
        executioner,
        participants,
        duplicateNames,
      ),
      executionerRoleDisplayName:
        briefing.executionerOrdinal === null
          ? 'Executioner'
          : `Executioner ${String(briefing.executionerOrdinal)}`,
      targetDisplayLabel: getParticipantDisplayLabel(target, participants, duplicateNames),
    }),
  })
}

function getParticipantDisplayLabel(
  participant: Player,
  participants: readonly Player[],
  duplicateNames: ReadonlySet<string>,
): string {
  if (!duplicateNames.has(participant.name)) {
    return participant.name
  }

  const rosterIndex = participants.findIndex((candidate) => candidate.id === participant.id)
  if (rosterIndex < 0) {
    throw new Error('An Executioner briefing participant has no stable roster position.')
  }
  return `${participant.name} (Player ${String(rosterIndex + 1)})`
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
