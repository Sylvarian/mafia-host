import { validateGameSettings, type GameSettings } from '@/domain/game/game-settings.ts'
import { playerId, roleId } from '@/domain/identifiers.ts'
import { ROLE_REGISTRY } from '@/domain/roles/role-registry.ts'

import {
  createInitialGameSetupDraft,
  type GameSetupDraft,
  type RoleCount,
} from './game-setup-draft.ts'
import { validateGameSetupDraft } from './game-setup-validation.ts'

export type NextGameSetupRosterEntry = Readonly<{
  name: string
  playing: boolean
}>

export type NextGameSetupTemplate = Readonly<{
  roster: readonly NextGameSetupRosterEntry[]
  roleCounts: readonly RoleCount[]
  settings: GameSettings
}>

export type NextGameSetupTemplateRepositoryError = Readonly<{
  type:
    | 'NEXT_GAME_SETUP_TEMPLATE_LOAD_FAILURE'
    | 'NEXT_GAME_SETUP_TEMPLATE_SAVE_FAILURE'
    | 'NEXT_GAME_SETUP_TEMPLATE_CLEAR_FAILURE'
    | 'NEXT_GAME_SETUP_TEMPLATE_MIGRATION_FAILURE'
  errorName: string
}>

export type NextGameSetupTemplateRepositoryLoadResult =
  | Readonly<{
      ok: true
      value:
        | Readonly<{ source: 'template'; payload: unknown }>
        | Readonly<{ source: 'legacy-player-names'; payload: unknown }>
        | null
    }>
  | Readonly<{ ok: false; error: NextGameSetupTemplateRepositoryError }>

export type NextGameSetupTemplateRepositoryWriteResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; error: NextGameSetupTemplateRepositoryError }>

export interface NextGameSetupTemplateRepository {
  load(): NextGameSetupTemplateRepositoryLoadResult
  save(template: NextGameSetupTemplate): NextGameSetupTemplateRepositoryWriteResult
  clear(): NextGameSetupTemplateRepositoryWriteResult
}

export type InvalidNextGameSetupTemplateError =
  | Readonly<{ type: 'INVALID_SETUP_TEMPLATE_PAYLOAD' }>
  | Readonly<{ type: 'INVALID_SAVED_ROSTER' }>
  | Readonly<{ type: 'INVALID_SAVED_ROLE_DISTRIBUTION' }>
  | Readonly<{ type: 'INVALID_SAVED_SETTINGS' }>

export type LoadedNextGameSetupTemplate = Readonly<{
  template: NextGameSetupTemplate | null
  error: NextGameSetupTemplateRepositoryError | InvalidNextGameSetupTemplateError | null
  migratedLegacyPlayerNames: boolean
}>

export function createNextGameSetupTemplate(draft: GameSetupDraft): NextGameSetupTemplate {
  const setupResult = validateGameSetupDraft(draft)
  if (!setupResult.ok) {
    throw new Error('A next-game setup template requires a valid ready-to-start draft.')
  }
  const candidate = {
    roster: draft.roster.map((player) => ({
      name: player.name,
      playing: player.playing,
    })),
    roleCounts: draft.roleCounts.map((roleCount) => ({ ...roleCount })),
    settings: { ...draft.settings },
  }
  const result = validateNextGameSetupTemplate(candidate)
  if (!result.ok) {
    throw new Error(`A validated setup produced ${result.error.type}.`)
  }
  return result.value
}

export function createDefaultNextGameSetupTemplate(
  playerNames: readonly string[],
): NextGameSetupTemplate {
  const draft = createInitialGameSetupDraft(playerNames)
  return deepFreeze({
    roster: draft.roster.map((player) => ({
      name: player.name,
      playing: player.playing,
    })),
    roleCounts: draft.roleCounts.map((roleCount) => ({ ...roleCount })),
    settings: { ...draft.settings },
  })
}

export function createGameSetupDraftFromTemplate(
  template: NextGameSetupTemplate | null,
): GameSetupDraft {
  if (template === null) {
    return createInitialGameSetupDraft()
  }
  const initialDraft = createInitialGameSetupDraft(template.roster.map((player) => player.name))
  return deepFreeze({
    ...initialDraft,
    roster: initialDraft.roster.map((player, index) => ({
      ...player,
      playing: template.roster[index]?.playing ?? player.playing,
    })),
    roleCounts: template.roleCounts.map((roleCount) => ({ ...roleCount })),
    settings: { ...template.settings },
  })
}

export function loadNextGameSetupTemplate(
  repository: NextGameSetupTemplateRepository,
): LoadedNextGameSetupTemplate {
  const loadResult = repository.load()
  if (!loadResult.ok) {
    return deepFreeze({
      template: null,
      error: loadResult.error,
      migratedLegacyPlayerNames: false,
    })
  }
  if (loadResult.value === null) {
    return deepFreeze({
      template: null,
      error: null,
      migratedLegacyPlayerNames: false,
    })
  }

  if (loadResult.value.source === 'template') {
    const validation = validateNextGameSetupTemplate(loadResult.value.payload)
    return validation.ok
      ? deepFreeze({
          template: validation.value,
          error: null,
          migratedLegacyPlayerNames: false,
        })
      : deepFreeze({
          template: null,
          error: validation.error,
          migratedLegacyPlayerNames: false,
        })
  }

  const names = canonicalizePlayerNames(loadResult.value.payload)
  if (names === null) {
    return deepFreeze({
      template: null,
      error: { type: 'INVALID_SAVED_ROSTER' },
      migratedLegacyPlayerNames: false,
    })
  }
  const template = createDefaultNextGameSetupTemplate(names)
  const saveResult = repository.save(template)
  return saveResult.ok
    ? deepFreeze({
        template,
        error: null,
        migratedLegacyPlayerNames: true,
      })
    : deepFreeze({
        template,
        error:
          saveResult.error.type === 'NEXT_GAME_SETUP_TEMPLATE_MIGRATION_FAILURE'
            ? saveResult.error
            : {
                type: 'NEXT_GAME_SETUP_TEMPLATE_MIGRATION_FAILURE',
                errorName: saveResult.error.errorName,
              },
        migratedLegacyPlayerNames: false,
      })
}

export function saveNextGameSetupTemplate(
  repository: NextGameSetupTemplateRepository,
  template: NextGameSetupTemplate,
):
  | NextGameSetupTemplateRepositoryWriteResult
  | Readonly<{ ok: false; error: InvalidNextGameSetupTemplateError }> {
  const validation = validateNextGameSetupTemplate(template)
  return validation.ok ? repository.save(validation.value) : validation
}

export function clearNextGameSetupTemplate(
  repository: NextGameSetupTemplateRepository,
): NextGameSetupTemplateRepositoryWriteResult {
  return repository.clear()
}

export function validateNextGameSetupTemplate(
  candidate: unknown,
):
  | Readonly<{ ok: true; value: NextGameSetupTemplate }>
  | Readonly<{ ok: false; error: InvalidNextGameSetupTemplateError }> {
  if (
    !isUnknownRecord(candidate) ||
    !hasExactKeys(candidate, ['roster', 'roleCounts', 'settings'])
  ) {
    return { ok: false, error: { type: 'INVALID_SETUP_TEMPLATE_PAYLOAD' } }
  }

  const roster = canonicalizeRoster(candidate.roster)
  if (roster === null) {
    return { ok: false, error: { type: 'INVALID_SAVED_ROSTER' } }
  }

  const roleCounts = canonicalizeRoleCounts(candidate.roleCounts)
  if (roleCounts === null) {
    return { ok: false, error: { type: 'INVALID_SAVED_ROLE_DISTRIBUTION' } }
  }

  if (
    !isUnknownRecord(candidate.settings) ||
    !hasExactKeys(candidate.settings, [
      'godfatherAndSerialCanKillEachOther',
      'godfatherAppearsSuspiciousToSheriff',
      'doctorCanSelfProtect',
      'doctorCannotRepeatPreviousTarget',
      'revealRoleOnDeath',
      'allowFirstNightKills',
    ])
  ) {
    return { ok: false, error: { type: 'INVALID_SAVED_SETTINGS' } }
  }
  const settingsResult = validateGameSettings(candidate.settings)
  if (!settingsResult.ok) {
    return { ok: false, error: { type: 'INVALID_SAVED_SETTINGS' } }
  }

  const template = deepFreeze({
    roster,
    roleCounts,
    settings: settingsResult.value,
  })
  if (roleCounts.every((entry) => entry.count === 0)) {
    return { ok: true, value: template }
  }

  const setupResult = validateGameSetupDraft({
    roster: roster.map((player, index) => ({
      id: playerId(`template-player-${String(index + 1)}`),
      name: player.name,
      playing: player.playing,
    })),
    roleCounts,
    settings: settingsResult.value,
    nextPlayerNumber: roster.length + 1,
  })
  return setupResult.ok
    ? { ok: true, value: template }
    : { ok: false, error: { type: 'INVALID_SAVED_ROLE_DISTRIBUTION' } }
}

function canonicalizeRoster(candidate: unknown): readonly NextGameSetupRosterEntry[] | null {
  if (!Array.isArray(candidate)) {
    return null
  }
  const roster: NextGameSetupRosterEntry[] = []
  for (const value of candidate) {
    if (
      !isUnknownRecord(value) ||
      !hasExactKeys(value, ['name', 'playing']) ||
      typeof value.name !== 'string' ||
      typeof value.playing !== 'boolean'
    ) {
      return null
    }
    const name = value.name.trim()
    if (name.length === 0) {
      return null
    }
    roster.push(Object.freeze({ name, playing: value.playing }))
  }
  return Object.freeze(roster)
}

function canonicalizePlayerNames(candidate: unknown): readonly string[] | null {
  if (!Array.isArray(candidate)) {
    return null
  }
  const names: string[] = []
  for (const value of candidate) {
    if (typeof value !== 'string') {
      return null
    }
    const name = value.trim()
    if (name.length === 0) {
      return null
    }
    names.push(name)
  }
  return Object.freeze(names)
}

function canonicalizeRoleCounts(candidate: unknown): readonly RoleCount[] | null {
  if (!Array.isArray(candidate) || candidate.length !== ROLE_REGISTRY.length) {
    return null
  }
  const byRole = new Map<string, number>()
  for (const entry of candidate) {
    if (
      !isUnknownRecord(entry) ||
      !hasExactKeys(entry, ['roleId', 'count']) ||
      typeof entry.roleId !== 'string' ||
      typeof entry.count !== 'number' ||
      !Number.isSafeInteger(entry.count) ||
      entry.count < 0 ||
      byRole.has(entry.roleId)
    ) {
      return null
    }
    byRole.set(entry.roleId, entry.count)
  }
  const roleCounts: RoleCount[] = []
  for (const role of ROLE_REGISTRY) {
    const count = byRole.get(role.id)
    if (count === undefined) {
      return null
    }
    roleCounts.push(Object.freeze({ roleId: roleId(role.id), count }))
  }
  return Object.freeze(roleCounts)
}

function hasExactKeys(
  candidate: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(candidate)
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key))
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
