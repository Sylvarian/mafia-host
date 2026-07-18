import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'
import { validateGameState } from '@/domain/game/game-invariants.ts'
import type { GameInvariantError } from '@/domain/game/game-errors.ts'
import type { GameState } from '@/domain/game/game-state.ts'
import { gameId, type GameId, type PlayerId, type RoleInstanceId } from '@/domain/identifiers.ts'
import { ROLE_IDS } from '@/domain/roles/role-registry.ts'

declare const executionerBriefingIdBrand: unique symbol

export type ExecutionerBriefingId = string & {
  readonly [executionerBriefingIdBrand]: 'ExecutionerBriefingId'
}

export type ExecutionerBriefingRecord = Readonly<{
  id: ExecutionerBriefingId
  executionerPlayerId: PlayerId
  executionerRoleInstanceId: RoleInstanceId
  executionerOrdinal: number | null
  targetPlayerId: PlayerId
}>

type ExecutionerBriefingWorkflowFields = Readonly<{
  gameId: GameId
  briefings: readonly ExecutionerBriefingRecord[]
  currentBriefingIndex: number
  acknowledgedBriefingIds: readonly ExecutionerBriefingId[]
}>

export type ExecutionerBriefingWorkflow = ExecutionerBriefingWorkflowFields &
  Readonly<{ status: 'briefing' | 'ready' }>

export type ActiveExecutionerBriefingWorkflow = ExecutionerBriefingWorkflow

export type ExecutionerBriefingOperation = 'acknowledge' | 'previous' | 'next' | 'complete'

export type ExecutionerBriefingError =
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_GAME_REJECTED'
      error: GameInvariantError
    }>
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_GAME_MISMATCH'
      expectedGameId: GameId
      actualGameId: GameId
    }>
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_PHASE_MISMATCH'
      currentPhase: GameState['phase']
    }>
  | Readonly<{ type: 'NO_EXECUTIONERS_FOR_BRIEFING' }>
  | Readonly<{
      type: 'MISSING_EXECUTIONER_TARGET_RELATIONSHIP'
      executionerRoleInstanceId: RoleInstanceId
    }>
  | Readonly<{
      type: 'INVALID_EXECUTIONER_BRIEFING_RECORD'
      briefingId: string
    }>
  | Readonly<{
      type: 'UNKNOWN_EXECUTIONER_BRIEFING_ID'
      briefingId: string
    }>
  | Readonly<{
      type: 'DUPLICATE_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT'
      briefingId: ExecutionerBriefingId
    }>
  | Readonly<{
      type: 'UNKNOWN_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT'
      briefingId: string
    }>
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_NOT_CURRENT'
      briefingId: ExecutionerBriefingId
      currentBriefingId: ExecutionerBriefingId
    }>
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_NOT_ACKNOWLEDGED'
      briefingId: ExecutionerBriefingId
    }>
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_INDEX_OUT_OF_RANGE'
      currentBriefingIndex: number
      briefingCount: number
    }>
  | Readonly<{
      type: 'EXECUTIONER_BRIEFING_NAVIGATION_BOUNDARY'
      direction: 'previous' | 'next'
    }>
  | Readonly<{ type: 'INCOMPLETE_EXECUTIONER_BRIEFINGS' }>
  | Readonly<{
      type: 'INVALID_EXECUTIONER_BRIEFING_WORKFLOW'
      operation: ExecutionerBriefingOperation
    }>

export function createExecutionerBriefingWorkflow(
  game: GameState,
): DomainResult<ActiveExecutionerBriefingWorkflow, ExecutionerBriefingError> {
  const gameResult = validateBriefingGame(game)
  if (!gameResult.ok) {
    return gameResult
  }

  const executioners = gameResult.value.players
    .filter((player) => player.role.roleId === ROLE_IDS.executioner)
    .sort((left, right) => {
      const ordinalDifference = (left.role.ordinal ?? 1) - (right.role.ordinal ?? 1)
      return ordinalDifference !== 0
        ? ordinalDifference
        : gameResult.value.players.indexOf(left) - gameResult.value.players.indexOf(right)
    })

  if (executioners.length === 0) {
    return fail({ type: 'NO_EXECUTIONERS_FOR_BRIEFING' })
  }

  const briefings: ExecutionerBriefingRecord[] = []
  for (const executioner of executioners) {
    const target = gameResult.value.executionerTargets.find(
      (candidate) =>
        candidate.executionerRoleInstanceId === executioner.role.instanceId &&
        candidate.executionerPlayerId === executioner.playerId,
    )
    if (target === undefined) {
      return fail({
        type: 'MISSING_EXECUTIONER_TARGET_RELATIONSHIP',
        executionerRoleInstanceId: executioner.role.instanceId,
      })
    }

    briefings.push(
      Object.freeze({
        id: createExecutionerBriefingId(gameResult.value.id, executioner.role.instanceId),
        executionerPlayerId: executioner.playerId,
        executionerRoleInstanceId: executioner.role.instanceId,
        executionerOrdinal: executioner.role.ordinal,
        targetPlayerId: target.targetPlayerId,
      }),
    )
  }

  return succeed(
    deepFreeze({
      status: 'briefing',
      gameId: gameResult.value.id,
      briefings: Object.freeze(briefings),
      currentBriefingIndex: 0,
      acknowledgedBriefingIds: Object.freeze([]),
    }),
  )
}

export function validateExecutionerBriefingWorkflow(
  game: GameState,
  workflow: unknown,
  operation: ExecutionerBriefingOperation,
): DomainResult<ExecutionerBriefingWorkflow, ExecutionerBriefingError> {
  const canonicalResult = createExecutionerBriefingWorkflow(game)
  if (!canonicalResult.ok) {
    return canonicalResult
  }

  const candidate: unknown = workflow
  if (
    !isUnknownRecord(candidate) ||
    (candidate.status !== 'briefing' && candidate.status !== 'ready') ||
    typeof candidate.gameId !== 'string' ||
    !isUnknownArray(candidate.briefings) ||
    !isUnknownArray(candidate.acknowledgedBriefingIds) ||
    typeof candidate.currentBriefingIndex !== 'number' ||
    !Number.isSafeInteger(candidate.currentBriefingIndex)
  ) {
    return fail({ type: 'INVALID_EXECUTIONER_BRIEFING_WORKFLOW', operation })
  }

  if (candidate.gameId !== game.id) {
    return fail({
      type: 'EXECUTIONER_BRIEFING_GAME_MISMATCH',
      expectedGameId: game.id,
      actualGameId: gameId(candidate.gameId),
    })
  }

  if (!hasSameCanonicalContent(canonicalResult.value.briefings, candidate.briefings)) {
    const firstCandidate = candidate.briefings[0]
    return fail({
      type: 'INVALID_EXECUTIONER_BRIEFING_RECORD',
      briefingId:
        isUnknownRecord(firstCandidate) && typeof firstCandidate.id === 'string'
          ? firstCandidate.id
          : 'unknown',
    })
  }

  if (
    candidate.currentBriefingIndex < 0 ||
    candidate.currentBriefingIndex >= canonicalResult.value.briefings.length
  ) {
    return fail({
      type: 'EXECUTIONER_BRIEFING_INDEX_OUT_OF_RANGE',
      currentBriefingIndex: candidate.currentBriefingIndex,
      briefingCount: canonicalResult.value.briefings.length,
    })
  }

  const canonicalIds = canonicalResult.value.briefings.map((briefing) => briefing.id)
  const acknowledgedIds: ExecutionerBriefingId[] = []
  for (const acknowledgementCandidate of candidate.acknowledgedBriefingIds) {
    if (typeof acknowledgementCandidate !== 'string') {
      return fail({
        type: 'UNKNOWN_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT',
        briefingId: String(acknowledgementCandidate),
      })
    }
    const id = canonicalIds.find((briefingId) => briefingId === acknowledgementCandidate)
    if (id === undefined) {
      return fail({
        type: 'UNKNOWN_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT',
        briefingId: acknowledgementCandidate,
      })
    }
    if (acknowledgedIds.some((briefingId) => briefingId === id)) {
      return fail({
        type: 'DUPLICATE_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT',
        briefingId: id,
      })
    }
    acknowledgedIds.push(id)
  }

  const expectedAcknowledgements = canonicalIds.slice(0, acknowledgedIds.length)
  if (!hasSameCanonicalContent(expectedAcknowledgements, acknowledgedIds)) {
    return fail({ type: 'INVALID_EXECUTIONER_BRIEFING_WORKFLOW', operation })
  }

  const allAcknowledged = acknowledgedIds.length === canonicalIds.length
  if (
    (candidate.status === 'briefing' && allAcknowledged) ||
    (candidate.status === 'ready' && !allAcknowledged)
  ) {
    return fail({ type: 'INVALID_EXECUTIONER_BRIEFING_WORKFLOW', operation })
  }

  return succeed(
    deepFreeze({
      status: candidate.status,
      gameId: canonicalResult.value.gameId,
      briefings: canonicalResult.value.briefings,
      currentBriefingIndex: candidate.currentBriefingIndex,
      acknowledgedBriefingIds: Object.freeze(acknowledgedIds),
    }),
  )
}

export function acknowledgeExecutionerBriefing(
  game: GameState,
  workflow: ExecutionerBriefingWorkflow,
  briefingId: ExecutionerBriefingId,
): DomainResult<ActiveExecutionerBriefingWorkflow, ExecutionerBriefingError> {
  const validationResult = validateExecutionerBriefingWorkflow(game, workflow, 'acknowledge')
  if (!validationResult.ok) {
    return validationResult
  }

  const knownBriefing = validationResult.value.briefings.find(
    (briefing) => briefing.id === briefingId,
  )
  if (knownBriefing === undefined) {
    return fail({ type: 'UNKNOWN_EXECUTIONER_BRIEFING_ID', briefingId })
  }
  if (
    validationResult.value.acknowledgedBriefingIds.some(
      (acknowledgedId) => acknowledgedId === briefingId,
    )
  ) {
    return fail({
      type: 'DUPLICATE_EXECUTIONER_BRIEFING_ACKNOWLEDGEMENT',
      briefingId,
    })
  }

  const currentBriefing =
    validationResult.value.briefings[validationResult.value.currentBriefingIndex]
  if (currentBriefing === undefined) {
    return fail({
      type: 'EXECUTIONER_BRIEFING_INDEX_OUT_OF_RANGE',
      currentBriefingIndex: validationResult.value.currentBriefingIndex,
      briefingCount: validationResult.value.briefings.length,
    })
  }
  if (currentBriefing.id !== briefingId) {
    return fail({
      type: 'EXECUTIONER_BRIEFING_NOT_CURRENT',
      briefingId,
      currentBriefingId: currentBriefing.id,
    })
  }

  const acknowledgedBriefingIds = Object.freeze([
    ...validationResult.value.acknowledgedBriefingIds,
    briefingId,
  ])

  return succeed(
    deepFreeze({
      ...validationResult.value,
      status:
        acknowledgedBriefingIds.length === validationResult.value.briefings.length
          ? 'ready'
          : 'briefing',
      acknowledgedBriefingIds,
    }),
  )
}

export function previousExecutionerBriefing(
  game: GameState,
  workflow: ExecutionerBriefingWorkflow,
): DomainResult<ActiveExecutionerBriefingWorkflow, ExecutionerBriefingError> {
  const validationResult = validateExecutionerBriefingWorkflow(game, workflow, 'previous')
  if (!validationResult.ok) {
    return validationResult
  }
  const validatedWorkflow = validationResult.value
  const activeWorkflow = validatedWorkflow
  if (activeWorkflow.currentBriefingIndex === 0) {
    return fail({ type: 'EXECUTIONER_BRIEFING_NAVIGATION_BOUNDARY', direction: 'previous' })
  }

  return succeed(
    deepFreeze({
      ...activeWorkflow,
      currentBriefingIndex: activeWorkflow.currentBriefingIndex - 1,
    }),
  )
}

export function nextExecutionerBriefing(
  game: GameState,
  workflow: ExecutionerBriefingWorkflow,
): DomainResult<ActiveExecutionerBriefingWorkflow, ExecutionerBriefingError> {
  const validationResult = validateExecutionerBriefingWorkflow(game, workflow, 'next')
  if (!validationResult.ok) {
    return validationResult
  }
  const validatedWorkflow = validationResult.value
  const activeWorkflow = validatedWorkflow

  const currentBriefing = activeWorkflow.briefings[activeWorkflow.currentBriefingIndex]
  if (currentBriefing === undefined) {
    return fail({
      type: 'EXECUTIONER_BRIEFING_INDEX_OUT_OF_RANGE',
      currentBriefingIndex: activeWorkflow.currentBriefingIndex,
      briefingCount: activeWorkflow.briefings.length,
    })
  }
  if (
    !activeWorkflow.acknowledgedBriefingIds.some(
      (acknowledgedId) => acknowledgedId === currentBriefing.id,
    )
  ) {
    return fail({
      type: 'EXECUTIONER_BRIEFING_NOT_ACKNOWLEDGED',
      briefingId: currentBriefing.id,
    })
  }
  if (activeWorkflow.currentBriefingIndex === activeWorkflow.briefings.length - 1) {
    return fail({ type: 'EXECUTIONER_BRIEFING_NAVIGATION_BOUNDARY', direction: 'next' })
  }

  return succeed(
    deepFreeze({
      ...activeWorkflow,
      currentBriefingIndex: activeWorkflow.currentBriefingIndex + 1,
    }),
  )
}

export function validateExecutionerBriefingsReadyForCompletion(
  game: GameState,
  workflow: ExecutionerBriefingWorkflow,
): DomainResult<true, ExecutionerBriefingError> {
  const validationResult = validateExecutionerBriefingWorkflow(game, workflow, 'complete')
  if (!validationResult.ok) {
    return validationResult
  }
  if (validationResult.value.status !== 'ready') {
    return fail({ type: 'INCOMPLETE_EXECUTIONER_BRIEFINGS' })
  }

  return succeed(true)
}

export function createExecutionerBriefingId(
  gameId: GameId,
  executionerRoleInstanceId: RoleInstanceId,
): ExecutionerBriefingId {
  return JSON.stringify([
    'mafia-host-executioner-briefing',
    1,
    gameId,
    executionerRoleInstanceId,
  ]) as ExecutionerBriefingId
}

function validateBriefingGame(game: GameState): DomainResult<GameState, ExecutionerBriefingError> {
  if (game.phase !== 'executioner-briefing') {
    return fail({
      type: 'EXECUTIONER_BRIEFING_PHASE_MISMATCH',
      currentPhase: game.phase,
    })
  }
  if (!game.players.some((player) => player.role.roleId === ROLE_IDS.executioner)) {
    return fail({ type: 'NO_EXECUTIONERS_FOR_BRIEFING' })
  }

  const gameResult = validateGameState(game)
  if (!gameResult.ok) {
    return fail({ type: 'EXECUTIONER_BRIEFING_GAME_REJECTED', error: gameResult.error })
  }
  return gameResult
}

function hasSameCanonicalContent(canonical: unknown, candidate: unknown): boolean {
  if (Object.is(canonical, candidate)) {
    return true
  }
  if (Array.isArray(canonical)) {
    return (
      Array.isArray(candidate) &&
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

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
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
