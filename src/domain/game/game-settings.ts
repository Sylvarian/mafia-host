import { fail, succeed, type DomainResult } from './domain-result.ts'

export type GameSettings = Readonly<{
  godfatherAndSerialCanKillEachOther: boolean
  godfatherAppearsSuspiciousToSheriff: boolean
  doctorCanSelfProtect: boolean
  doctorCannotRepeatPreviousTarget: boolean
  doctorCannotProtectRevealedMayor: boolean
  revealRoleOnDeath: boolean
  allowFirstNightKills: boolean
}>

export type GameSettingKey = keyof GameSettings

export type InvalidGameSettingError = Readonly<{
  type: 'INVALID_GAME_SETTING'
  setting: GameSettingKey
  value: unknown
}>

const GAME_SETTING_KEYS = Object.freeze([
  'godfatherAndSerialCanKillEachOther',
  'godfatherAppearsSuspiciousToSheriff',
  'doctorCanSelfProtect',
  'doctorCannotRepeatPreviousTarget',
  'doctorCannotProtectRevealedMayor',
  'revealRoleOnDeath',
  'allowFirstNightKills',
] as const satisfies readonly GameSettingKey[])

export function validateGameSettings(
  candidate: unknown,
): DomainResult<GameSettings, InvalidGameSettingError> {
  if (!isGameSettings(candidate)) {
    const candidateObject = typeof candidate === 'object' && candidate !== null ? candidate : null

    for (const setting of GAME_SETTING_KEYS) {
      const value = candidateObject === null ? undefined : getSettingValue(candidateObject, setting)

      if (typeof value === 'boolean') {
        continue
      }

      return fail({
        type: 'INVALID_GAME_SETTING',
        setting,
        value,
      })
    }

    throw new Error('Game settings validation did not identify an invalid setting.')
  }

  return succeed(
    Object.freeze({
      godfatherAndSerialCanKillEachOther: candidate.godfatherAndSerialCanKillEachOther,
      godfatherAppearsSuspiciousToSheriff: candidate.godfatherAppearsSuspiciousToSheriff,
      doctorCanSelfProtect: candidate.doctorCanSelfProtect,
      doctorCannotRepeatPreviousTarget: candidate.doctorCannotRepeatPreviousTarget,
      doctorCannotProtectRevealedMayor: candidate.doctorCannotProtectRevealedMayor,
      revealRoleOnDeath: candidate.revealRoleOnDeath,
      allowFirstNightKills: candidate.allowFirstNightKills,
    }),
  )
}

function isGameSettings(candidate: unknown): candidate is GameSettings {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'godfatherAndSerialCanKillEachOther' in candidate &&
    typeof candidate.godfatherAndSerialCanKillEachOther === 'boolean' &&
    'godfatherAppearsSuspiciousToSheriff' in candidate &&
    typeof candidate.godfatherAppearsSuspiciousToSheriff === 'boolean' &&
    'doctorCanSelfProtect' in candidate &&
    typeof candidate.doctorCanSelfProtect === 'boolean' &&
    'doctorCannotRepeatPreviousTarget' in candidate &&
    typeof candidate.doctorCannotRepeatPreviousTarget === 'boolean' &&
    'doctorCannotProtectRevealedMayor' in candidate &&
    typeof candidate.doctorCannotProtectRevealedMayor === 'boolean' &&
    'revealRoleOnDeath' in candidate &&
    typeof candidate.revealRoleOnDeath === 'boolean' &&
    'allowFirstNightKills' in candidate &&
    typeof candidate.allowFirstNightKills === 'boolean'
  )
}

function getSettingValue(candidate: object, setting: GameSettingKey): unknown {
  switch (setting) {
    case 'godfatherAndSerialCanKillEachOther':
      return setting in candidate ? candidate.godfatherAndSerialCanKillEachOther : undefined
    case 'godfatherAppearsSuspiciousToSheriff':
      return setting in candidate ? candidate.godfatherAppearsSuspiciousToSheriff : undefined
    case 'doctorCanSelfProtect':
      return setting in candidate ? candidate.doctorCanSelfProtect : undefined
    case 'doctorCannotRepeatPreviousTarget':
      return setting in candidate ? candidate.doctorCannotRepeatPreviousTarget : undefined
    case 'doctorCannotProtectRevealedMayor':
      return setting in candidate ? candidate.doctorCannotProtectRevealedMayor : undefined
    case 'revealRoleOnDeath':
      return setting in candidate ? candidate.revealRoleOnDeath : undefined
    case 'allowFirstNightKills':
      return setting in candidate ? candidate.allowFirstNightKills : undefined
  }
}
