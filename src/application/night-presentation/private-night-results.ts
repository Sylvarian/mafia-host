import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import {
  playerId,
  roleId,
  roleInstanceId,
  type PlayerId,
  type RoleInstanceId,
} from '@/domain/identifiers.ts'
import { resolveInvestigationGroup } from '@/domain/investigation/investigation-groups.ts'
import type { Player } from '@/domain/players/player.ts'
import { getRoleInstanceDisplayName } from '@/domain/roles/role-display-name.ts'
import { ROLE_IDS, findRoleDefinition } from '@/domain/roles/role-registry.ts'
import type { NightResolution } from '@/domain/resolution/night-resolution-models.ts'

declare const privateNightResultIdBrand: unique symbol

export type PrivateNightResultId = string & {
  readonly [privateNightResultIdBrand]: 'PrivateNightResultId'
}

type PrivateNightResultBase = Readonly<{
  id: PrivateNightResultId
  nightNumber: number
  actorPlayerId: PlayerId
  actorPlayerName: string
  showActorStableId: boolean
  actorRoleInstanceId: RoleInstanceId
  roleDisplayName: string
  targetPlayerId: PlayerId
  targetPlayerName: string
  showTargetStableId: boolean
}>

export type SheriffPrivateResult = PrivateNightResultBase &
  Readonly<{
    kind: 'sheriff'
    status: 'suspicious' | 'not-suspicious'
  }>

export type InvestigationPrivateResult = PrivateNightResultBase &
  Readonly<{
    kind: 'investigation'
    investigationRole: 'investigator' | 'consigliere'
    groupLabel: string
    groupRoleDisplayNames: readonly string[]
  }>

export type DetectivePrivateResult = PrivateNightResultBase &
  (
    | Readonly<{
        kind: 'detective'
        status: 'visited-player'
        visitedPlayerId: PlayerId
        visitedPlayerName: string
        showVisitedPlayerStableId: boolean
      }>
    | Readonly<{
        kind: 'detective'
        status: 'visited-nobody'
      }>
  )

export type PrivateNightResult =
  SheriffPrivateResult | InvestigationPrivateResult | DetectivePrivateResult

export type PrivateNightResultConstructionError = Readonly<{
  type: 'INVALID_PRIVATE_RESULT_QUEUE'
  reason:
    | 'duplicate-result'
    | 'missing-actor'
    | 'missing-participant'
    | 'missing-target'
    | 'missing-visited-player'
    | 'role-mismatch'
    | 'invalid-current-index'
    | 'invalid-acknowledgements'
    | 'invalid-game'
    | 'invalid-game-phase'
    | 'invalid-participants'
    | 'invalid-resolution-shape'
    | 'invalid-result'
    | 'invalid-investigation-group'
    | 'inactive-actor'
    | 'workflow-source-mismatch'
    | 'resolution-game-mismatch'
    | 'resolution-night-mismatch'
}>

export function buildPrivateNightResults(
  game: GameState,
  participants: readonly Player[],
  resolution: NightResolution,
): DomainResult<readonly PrivateNightResult[], PrivateNightResultConstructionError> {
  const gameCandidate: unknown = game
  if (
    !isUnknownRecord(gameCandidate) ||
    !isUnknownArray(gameCandidate.players) ||
    !isUnknownArray(gameCandidate.roleDefinitions) ||
    !isUnknownArray(gameCandidate.doctorPreviousTargets)
  ) {
    return invalidPrivateResultQueue('invalid-game')
  }

  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return invalidPrivateResultQueue('invalid-game')
  }
  const validatedGame = gameResult.value
  if (validatedGame.phase !== 'night-resolution') {
    return invalidPrivateResultQueue('invalid-game-phase')
  }

  const participantsResult = validateParticipants(validatedGame, participants)
  if (!participantsResult.ok) {
    return participantsResult
  }
  const validatedParticipants = participantsResult.value

  const resolutionCandidate: unknown = resolution
  if (
    !isUnknownRecord(resolutionCandidate) ||
    typeof resolutionCandidate.gameId !== 'string' ||
    !Number.isSafeInteger(resolutionCandidate.nightNumber) ||
    !isUnknownArray(resolutionCandidate.frames) ||
    !isUnknownArray(resolutionCandidate.sheriffResults) ||
    !isUnknownArray(resolutionCandidate.investigationResults) ||
    !isUnknownArray(resolutionCandidate.detectiveResults)
  ) {
    return invalidPrivateResultQueue('invalid-resolution-shape')
  }

  if (resolutionCandidate.gameId !== validatedGame.id) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'resolution-game-mismatch',
    })
  }
  if (resolutionCandidate.nightNumber !== validatedGame.nightNumber) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'resolution-night-mismatch',
    })
  }

  const framedPlayerIdsResult = collectFramedPlayerIds(validatedGame, resolutionCandidate.frames)
  if (!framedPlayerIdsResult.ok) {
    return framedPlayerIdsResult
  }

  const duplicateNames = findDuplicateNames(validatedParticipants)
  const results: PrivateNightResult[] = []

  for (const result of resolutionCandidate.sheriffResults) {
    if (
      !isUnknownRecord(result) ||
      typeof result.actorPlayerId !== 'string' ||
      typeof result.actorRoleInstanceId !== 'string' ||
      typeof result.targetPlayerId !== 'string' ||
      (result.status !== 'suspicious' && result.status !== 'not-suspicious')
    ) {
      return invalidPrivateResultQueue('invalid-result')
    }

    const baseResult = buildBaseResult(
      'sheriff',
      validatedGame,
      validatedParticipants,
      duplicateNames,
      resolutionCandidate.nightNumber,
      playerId(result.actorPlayerId),
      roleInstanceId(result.actorRoleInstanceId),
      playerId(result.targetPlayerId),
      ROLE_IDS.sheriff,
    )
    if (!baseResult.ok) {
      return baseResult
    }

    results.push(
      Object.freeze({
        ...baseResult.value,
        kind: 'sheriff',
        status: result.status,
      }),
    )
  }

  for (const result of resolutionCandidate.investigationResults) {
    if (
      !isUnknownRecord(result) ||
      typeof result.actorPlayerId !== 'string' ||
      typeof result.actorRoleId !== 'string' ||
      typeof result.actorRoleInstanceId !== 'string' ||
      typeof result.targetPlayerId !== 'string' ||
      !isUnknownRecord(result.group) ||
      typeof result.group.id !== 'string'
    ) {
      return invalidPrivateResultQueue('invalid-result')
    }

    const actorRoleId = roleId(result.actorRoleId)
    const investigationRole =
      actorRoleId === ROLE_IDS.investigator
        ? 'investigator'
        : actorRoleId === ROLE_IDS.consigliere
          ? 'consigliere'
          : null

    if (investigationRole === null) {
      return fail({ type: 'INVALID_PRIVATE_RESULT_QUEUE', reason: 'role-mismatch' })
    }

    const baseResult = buildBaseResult(
      investigationRole,
      validatedGame,
      validatedParticipants,
      duplicateNames,
      resolutionCandidate.nightNumber,
      playerId(result.actorPlayerId),
      roleInstanceId(result.actorRoleInstanceId),
      playerId(result.targetPlayerId),
      actorRoleId,
    )
    if (!baseResult.ok) {
      return baseResult
    }

    const target = validatedGame.players.find(
      (player) => player.playerId === baseResult.value.targetPlayerId,
    )
    if (target === undefined) {
      return invalidPrivateResultQueue('missing-target')
    }
    const canonicalGroupResult = resolveInvestigationGroup(
      target.role.roleId,
      framedPlayerIdsResult.value.has(target.playerId),
    )
    if (!canonicalGroupResult.ok || canonicalGroupResult.value.id !== result.group.id) {
      return invalidPrivateResultQueue('invalid-investigation-group')
    }
    const canonicalGroup = canonicalGroupResult.value

    results.push(
      Object.freeze({
        ...baseResult.value,
        kind: 'investigation',
        investigationRole,
        groupLabel: canonicalGroup.label,
        groupRoleDisplayNames: Object.freeze([...canonicalGroup.roleDisplayNames]),
      }),
    )
  }

  for (const result of resolutionCandidate.detectiveResults) {
    if (
      !isUnknownRecord(result) ||
      typeof result.actorPlayerId !== 'string' ||
      typeof result.actorRoleInstanceId !== 'string' ||
      typeof result.targetPlayerId !== 'string' ||
      (result.status !== 'visited-player' && result.status !== 'visited-nobody') ||
      (result.status === 'visited-player' && typeof result.visitedPlayerId !== 'string')
    ) {
      return invalidPrivateResultQueue('invalid-result')
    }

    const baseResult = buildBaseResult(
      'detective',
      validatedGame,
      validatedParticipants,
      duplicateNames,
      resolutionCandidate.nightNumber,
      playerId(result.actorPlayerId),
      roleInstanceId(result.actorRoleInstanceId),
      playerId(result.targetPlayerId),
      ROLE_IDS.detective,
    )
    if (!baseResult.ok) {
      return baseResult
    }

    if (result.status === 'visited-nobody') {
      results.push(
        Object.freeze({
          ...baseResult.value,
          kind: 'detective',
          status: result.status,
        }),
      )
      continue
    }

    const visitedPlayerIdValue = result.visitedPlayerId
    if (typeof visitedPlayerIdValue !== 'string') {
      return invalidPrivateResultQueue('invalid-result')
    }
    const visitedPlayerId = playerId(visitedPlayerIdValue)
    const visitedParticipant = validatedParticipants.find(
      (participant) => participant.id === visitedPlayerId,
    )
    if (visitedParticipant === undefined) {
      return fail({
        type: 'INVALID_PRIVATE_RESULT_QUEUE',
        reason: 'missing-visited-player',
      })
    }

    results.push(
      Object.freeze({
        ...baseResult.value,
        kind: 'detective',
        status: result.status,
        visitedPlayerId,
        visitedPlayerName: visitedParticipant.name,
        showVisitedPlayerStableId: duplicateNames.has(visitedParticipant.name),
      }),
    )
  }

  const orderedResults = results.toSorted((left, right) => {
    const leftActorIndex = validatedGame.players.findIndex(
      (player) => player.playerId === left.actorPlayerId,
    )
    const rightActorIndex = validatedGame.players.findIndex(
      (player) => player.playerId === right.actorPlayerId,
    )
    const leftActor = validatedGame.players[leftActorIndex]
    const rightActor = validatedGame.players[rightActorIndex]
    const leftRole = leftActor === undefined ? undefined : findRoleDefinition(leftActor.role.roleId)
    const rightRole =
      rightActor === undefined ? undefined : findRoleDefinition(rightActor.role.roleId)

    if (
      leftActor === undefined ||
      rightActor === undefined ||
      leftRole?.nightAction.hasNightAction !== true ||
      rightRole?.nightAction.hasNightAction !== true
    ) {
      throw new Error('Validated private result actor metadata is unavailable.')
    }

    return (
      leftRole.nightAction.collectionOrder - rightRole.nightAction.collectionOrder ||
      (leftActor.role.ordinal ?? 0) - (rightActor.role.ordinal ?? 0) ||
      leftActorIndex - rightActorIndex
    )
  })
  const resultIds = new Set<PrivateNightResultId>()

  for (const result of orderedResults) {
    if (resultIds.has(result.id)) {
      return fail({ type: 'INVALID_PRIVATE_RESULT_QUEUE', reason: 'duplicate-result' })
    }
    resultIds.add(result.id)
  }

  return succeed(Object.freeze(orderedResults))
}

function buildBaseResult(
  kind: 'sheriff' | 'investigator' | 'consigliere' | 'detective',
  game: GameState,
  participants: readonly Player[],
  duplicateNames: ReadonlySet<string>,
  nightNumber: number,
  actorPlayerId: PlayerId,
  actorRoleInstanceId: RoleInstanceId,
  targetPlayerId: PlayerId,
  expectedRoleId: GameState['players'][number]['role']['roleId'],
): DomainResult<PrivateNightResultBase, PrivateNightResultConstructionError> {
  const actor = game.players.find((player) => player.playerId === actorPlayerId)
  const target = game.players.find((player) => player.playerId === targetPlayerId)
  if (actor === undefined) {
    return fail({ type: 'INVALID_PRIVATE_RESULT_QUEUE', reason: 'missing-actor' })
  }
  if (!actor.alive) {
    return invalidPrivateResultQueue('inactive-actor')
  }
  if (actor.role.instanceId !== actorRoleInstanceId || actor.role.roleId !== expectedRoleId) {
    return fail({ type: 'INVALID_PRIVATE_RESULT_QUEUE', reason: 'role-mismatch' })
  }
  if (target === undefined) {
    return fail({ type: 'INVALID_PRIVATE_RESULT_QUEUE', reason: 'missing-target' })
  }

  const actorParticipant = participants.find((participant) => participant.id === actor.playerId)
  const targetParticipant = participants.find((participant) => participant.id === target.playerId)
  const role = findRoleDefinition(actor.role.roleId)
  if (actorParticipant === undefined || targetParticipant === undefined || role === undefined) {
    return fail({
      type: 'INVALID_PRIVATE_RESULT_QUEUE',
      reason: 'missing-participant',
    })
  }

  return succeed(
    Object.freeze({
      id: createPrivateNightResultId(kind, nightNumber, actor.playerId, actor.role.instanceId),
      nightNumber,
      actorPlayerId: actor.playerId,
      actorPlayerName: actorParticipant.name,
      showActorStableId: duplicateNames.has(actorParticipant.name),
      actorRoleInstanceId: actor.role.instanceId,
      roleDisplayName: getRoleInstanceDisplayName(actor.role, role),
      targetPlayerId: target.playerId,
      targetPlayerName: targetParticipant.name,
      showTargetStableId: duplicateNames.has(targetParticipant.name),
    }),
  )
}

function findDuplicateNames(participants: readonly Player[]): ReadonlySet<string> {
  const names = new Set<string>()
  const duplicates = new Set<string>()

  for (const participant of participants) {
    if (names.has(participant.name)) {
      duplicates.add(participant.name)
    }
    names.add(participant.name)
  }

  return duplicates
}

function validateParticipants(
  game: GameState,
  participants: readonly Player[],
): DomainResult<readonly Player[], PrivateNightResultConstructionError> {
  const participantsCandidate: unknown = participants
  if (
    !isUnknownArray(participantsCandidate) ||
    participantsCandidate.length !== game.players.length
  ) {
    return invalidPrivateResultQueue('invalid-participants')
  }

  const copiedParticipants: Player[] = []
  for (const [index, participant] of participantsCandidate.entries()) {
    const expectedGamePlayer = game.players[index]
    if (
      expectedGamePlayer === undefined ||
      !isUnknownRecord(participant) ||
      typeof participant.id !== 'string' ||
      participant.id !== expectedGamePlayer.playerId ||
      typeof participant.name !== 'string' ||
      typeof participant.playing !== 'boolean' ||
      !participant.playing
    ) {
      return invalidPrivateResultQueue('invalid-participants')
    }

    copiedParticipants.push(
      Object.freeze({
        id: playerId(participant.id),
        name: participant.name,
        playing: true,
      }),
    )
  }

  return succeed(Object.freeze(copiedParticipants))
}

function collectFramedPlayerIds(
  game: GameState,
  frames: readonly unknown[],
): DomainResult<ReadonlySet<PlayerId>, PrivateNightResultConstructionError> {
  const framedPlayerIds = new Set<PlayerId>()
  for (const frame of frames) {
    if (!isUnknownRecord(frame) || typeof frame.framedPlayerId !== 'string') {
      return invalidPrivateResultQueue('invalid-resolution-shape')
    }

    const framedPlayerId = playerId(frame.framedPlayerId)
    if (
      framedPlayerIds.has(framedPlayerId) ||
      !game.players.some((player) => player.playerId === framedPlayerId)
    ) {
      return invalidPrivateResultQueue('invalid-resolution-shape')
    }
    framedPlayerIds.add(framedPlayerId)
  }

  return succeed(framedPlayerIds)
}

export function createPrivateNightResultId(
  kind: 'sheriff' | 'investigator' | 'consigliere' | 'detective',
  nightNumber: number,
  actorPlayerId: PlayerId,
  actorRoleInstanceId: RoleInstanceId,
): PrivateNightResultId {
  return `private-night-result:${JSON.stringify([
    nightNumber,
    kind,
    actorPlayerId,
    actorRoleInstanceId,
  ])}` as PrivateNightResultId
}

function invalidPrivateResultQueue(
  reason: PrivateNightResultConstructionError['reason'],
): DomainResult<never, PrivateNightResultConstructionError> {
  return fail({ type: 'INVALID_PRIVATE_RESULT_QUEUE', reason })
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
