import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { DoctorPreviousTarget } from '../game/doctor-previous-target.ts'
import { validateGameState } from '../game/game-invariants.ts'
import type { GameState } from '../game/game-state.ts'
import { gameId, playerId, roleId, type PlayerId, type RoleInstanceId } from '../identifiers.ts'
import {
  validateCollectedNightActions,
  type CollectedNightActions,
  type PreviousNightTarget,
} from '../night-actions/night-action.ts'
import { transitionPhase } from '../phases/phase-machine.ts'
import { ROLE_IDS } from '../roles/role-registry.ts'
import type { DawnAnnouncement, DawnDeath } from './dawn-announcement.ts'
import type { NightApplicationError } from './night-application-errors.ts'
import { resolveNight } from './night-resolution.ts'
import type { NightResolution, ProvisionalDeath } from './night-resolution-models.ts'

export type AppliedNight = Readonly<{
  game: GameState
  dawnAnnouncement: DawnAnnouncement
}>

export function beginNightResolution(
  game: GameState,
  resolution: NightResolution,
  collectedActions: CollectedNightActions,
): DomainResult<GameState, NightApplicationError> {
  if (game.phase !== 'night-action-collection') {
    return fail({
      type: 'INVALID_NIGHT_APPLICATION_PHASE',
      operation: 'begin-night-resolution',
      currentPhase: game.phase,
    })
  }

  const validationResult = validateNightApplicationInputs(game, resolution, collectedActions)
  if (!validationResult.ok) {
    return validationResult
  }

  const phaseResult = transitionPhase(game.phase, 'night-resolution')
  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected the defined night-resolution transition.')
  }

  return succeed(
    Object.freeze({
      ...validationResult.value.game,
      phase: phaseResult.value,
    }),
  )
}

export function applyResolvedNight(
  game: GameState,
  resolution: NightResolution,
  collectedActions: CollectedNightActions,
): DomainResult<AppliedNight, NightApplicationError> {
  if (game.phase !== 'night-resolution') {
    return fail({
      type: 'INVALID_NIGHT_APPLICATION_PHASE',
      operation: 'apply-resolved-night',
      currentPhase: game.phase,
    })
  }

  const validationResult = validateNightApplicationInputs(game, resolution, collectedActions)
  if (!validationResult.ok) {
    return validationResult
  }

  const validatedGame = validationResult.value.game
  const validatedActions = validationResult.value.collectedActions

  const deadPlayerIds = new Set(
    validationResult.value.provisionalDeaths.map((death) => death.deadPlayerId),
  )
  const updatedPlayers = Object.freeze(
    validatedGame.players.map((player) =>
      Object.freeze({
        ...player,
        alive: deadPlayerIds.has(player.playerId) ? false : player.alive,
        publiclyRevealedRoleId:
          deadPlayerIds.has(player.playerId) && validatedGame.settings.revealRoleOnDeath
            ? player.role.roleId
            : player.publiclyRevealedRoleId,
      }),
    ),
  )
  const doctorPreviousTargets = buildDoctorPreviousTargets(validatedGame, validatedActions)
  const phaseResult = transitionPhase(validatedGame.phase, 'dawn-announcement')

  if (!phaseResult.ok) {
    throw new Error('The phase machine rejected the defined Dawn transition.')
  }

  const updatedGameResult = validateGameState({
    ...validatedGame,
    phase: phaseResult.value,
    players: updatedPlayers,
    doctorPreviousTargets,
  })

  if (!updatedGameResult.ok) {
    return fail({
      type: 'INVALID_GAME_STATE_FOR_NIGHT_APPLICATION',
      error: updatedGameResult.error,
    })
  }

  const dawnAnnouncement = buildDawnAnnouncement(updatedGameResult.value, deadPlayerIds)

  if (
    dawnAnnouncement.outcome === 'deaths' &&
    dawnAnnouncement.deaths.length !== deadPlayerIds.size
  ) {
    return fail({ type: 'INVALID_DAWN_ANNOUNCEMENT' })
  }

  return succeed(
    Object.freeze({
      game: Object.freeze(updatedGameResult.value),
      dawnAnnouncement,
    }),
  )
}

function validateNightApplicationInputs(
  game: GameState,
  resolution: NightResolution,
  collectedActions: CollectedNightActions,
): DomainResult<
  Readonly<{
    game: GameState
    provisionalDeaths: readonly ProvisionalDeath[]
    collectedActions: CollectedNightActions
  }>,
  NightApplicationError
> {
  const resolutionCandidate: unknown = resolution
  const resolutionNightNumber = isUnknownRecord(resolutionCandidate)
    ? resolutionCandidate.nightNumber
    : undefined
  if (
    !isUnknownRecord(resolutionCandidate) ||
    typeof resolutionCandidate.gameId !== 'string' ||
    typeof resolutionNightNumber !== 'number' ||
    !Number.isSafeInteger(resolutionNightNumber)
  ) {
    return fail({ type: 'INVALID_NIGHT_RESOLUTION', reason: 'missing-array' })
  }

  if (resolutionCandidate.gameId !== game.id) {
    return fail({
      type: 'NIGHT_APPLICATION_GAME_ID_MISMATCH',
      expectedGameId: game.id,
      resolutionGameId: gameId(resolutionCandidate.gameId),
    })
  }

  if (resolutionNightNumber !== game.nightNumber) {
    return fail({
      type: 'NIGHT_APPLICATION_NIGHT_NUMBER_MISMATCH',
      expectedNightNumber: game.nightNumber,
      resolutionNightNumber,
    })
  }

  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({
      type: 'INVALID_GAME_STATE_FOR_NIGHT_APPLICATION',
      error: gameResult.error,
    })
  }

  const resolutionArrays: readonly unknown[] = [
    resolutionCandidate.roleBlockAttempts,
    resolutionCandidate.blockedActors,
    resolutionCandidate.finalVisits,
    resolutionCandidate.frames,
    resolutionCandidate.protections,
    resolutionCandidate.attackAttempts,
    resolutionCandidate.provisionalDeaths,
    resolutionCandidate.sheriffResults,
    resolutionCandidate.investigationResults,
    resolutionCandidate.detectiveResults,
  ]
  if (!resolutionArrays.every(isUnknownArray)) {
    return fail({ type: 'INVALID_NIGHT_RESOLUTION', reason: 'missing-array' })
  }

  const deathPlayerIds = new Set<PlayerId>()
  const provisionalDeathCandidates: unknown = resolutionCandidate.provisionalDeaths
  if (!isUnknownArray(provisionalDeathCandidates)) {
    return fail({ type: 'INVALID_NIGHT_RESOLUTION', reason: 'missing-array' })
  }

  for (const death of provisionalDeathCandidates) {
    if (
      !isUnknownRecord(death) ||
      typeof death.deadPlayerId !== 'string' ||
      typeof death.actualRoleId !== 'string' ||
      death.nightNumber !== resolutionCandidate.nightNumber ||
      !isUnknownArray(death.sources) ||
      death.sources.length === 0
    ) {
      return fail({
        type: 'INVALID_NIGHT_RESOLUTION',
        reason: 'invalid-provisional-death',
      })
    }

    const deadPlayerId = playerId(death.deadPlayerId)
    const actualRoleId = roleId(death.actualRoleId)
    const player = gameResult.value.players.find((candidate) => candidate.playerId === deadPlayerId)

    if (player === undefined) {
      return fail({
        type: 'UNKNOWN_PROVISIONAL_DEATH_PLAYER',
        playerId: deadPlayerId,
      })
    }

    if (deathPlayerIds.has(player.playerId)) {
      return fail({
        type: 'DUPLICATE_PROVISIONAL_DEATH',
        playerId: player.playerId,
      })
    }

    if (!player.alive) {
      return fail({
        type: 'PROVISIONAL_DEATH_PLAYER_ALREADY_DEAD',
        playerId: player.playerId,
      })
    }

    if (actualRoleId !== player.role.roleId) {
      return fail({
        type: 'INVALID_PROVISIONAL_DEATH_ROLE',
        playerId: player.playerId,
        expectedRoleId: player.role.roleId,
        actualRoleId,
      })
    }

    deathPlayerIds.add(player.playerId)
  }

  const actionCollectionGame = Object.freeze({
    ...gameResult.value,
    phase: 'night-action-collection' as const,
  })
  const previousTargets = selectPreviousNightTargets(gameResult.value)
  const batchResult = validateCollectedNightActions(
    actionCollectionGame,
    collectedActions,
    previousTargets,
  )

  if (!batchResult.ok) {
    return fail({
      type: 'INVALID_COLLECTED_ACTIONS_FOR_NIGHT_APPLICATION',
      error: batchResult.error,
    })
  }

  const canonicalResolutionResult = resolveNight({
    game: actionCollectionGame,
    collectedActions: batchResult.value,
    previousTargets,
  })

  if (!canonicalResolutionResult.ok) {
    return fail({
      type: 'NIGHT_RESOLUTION_REVALIDATION_FAILED',
      error: canonicalResolutionResult.error,
    })
  }

  if (!hasSameCanonicalContent(canonicalResolutionResult.value, resolutionCandidate)) {
    return fail({ type: 'NIGHT_RESOLUTION_CONTENT_MISMATCH' })
  }

  return succeed({
    game: gameResult.value,
    provisionalDeaths: canonicalResolutionResult.value.provisionalDeaths,
    collectedActions: batchResult.value,
  })
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function hasSameCanonicalContent(canonical: unknown, candidate: unknown): boolean {
  if (Object.is(canonical, candidate)) {
    return true
  }

  if (isUnknownArray(canonical)) {
    return (
      isUnknownArray(candidate) &&
      canonical.length === candidate.length &&
      canonical.every((entry, index) => hasSameCanonicalContent(entry, candidate[index]))
    )
  }

  if (!isUnknownRecord(canonical) || !isUnknownRecord(candidate)) {
    return false
  }

  const canonicalKeys = Object.keys(canonical)
  const candidateKeys = Object.keys(candidate)
  return (
    canonicalKeys.length === candidateKeys.length &&
    canonicalKeys.every(
      (key) =>
        Object.hasOwn(candidate, key) && hasSameCanonicalContent(canonical[key], candidate[key]),
    )
  )
}

function selectPreviousNightTargets(game: GameState): readonly PreviousNightTarget[] {
  return Object.freeze(
    game.doctorPreviousTargets.map((entry) =>
      Object.freeze({
        actorRoleInstanceId: entry.doctorRoleInstanceId,
        targetPlayerId: entry.targetPlayerId,
      }),
    ),
  )
}

function buildDoctorPreviousTargets(
  game: GameState,
  collectedActions: CollectedNightActions,
): readonly DoctorPreviousTarget[] {
  const latestByRoleInstance = new Map<RoleInstanceId, DoctorPreviousTarget>(
    game.doctorPreviousTargets.map((entry) => [entry.doctorRoleInstanceId, entry]),
  )

  for (const action of collectedActions.actions) {
    if (action.actorRoleId !== ROLE_IDS.doctor) {
      continue
    }

    latestByRoleInstance.set(
      action.actorRoleInstanceId,
      Object.freeze({
        doctorRoleInstanceId: action.actorRoleInstanceId,
        targetPlayerId: action.targetPlayerId,
        nightNumber: game.nightNumber,
      }),
    )
  }

  const orderedHistory: DoctorPreviousTarget[] = []
  for (const player of game.players) {
    const entry = latestByRoleInstance.get(player.role.instanceId)
    if (player.role.roleId === ROLE_IDS.doctor && entry !== undefined) {
      orderedHistory.push(entry)
    }
  }

  return Object.freeze(orderedHistory)
}

function buildDawnAnnouncement(
  game: GameState,
  deadPlayerIds: ReadonlySet<PlayerId>,
): DawnAnnouncement {
  if (deadPlayerIds.size === 0) {
    return Object.freeze({
      outcome: 'no-deaths',
      nightNumber: game.nightNumber,
    })
  }

  const deaths: DawnDeath[] = []
  for (const player of game.players) {
    if (!deadPlayerIds.has(player.playerId)) {
      continue
    }

    deaths.push(
      Object.freeze({
        playerId: player.playerId,
        revealedRoleId: player.publiclyRevealedRoleId,
      }),
    )
  }

  return Object.freeze({
    outcome: 'deaths',
    nightNumber: game.nightNumber,
    deaths: Object.freeze(deaths),
  })
}
