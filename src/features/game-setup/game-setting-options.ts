import type { GameSettingKey } from '@/application/game-setup/index.ts'

export type GameSettingOption = Readonly<{
  key: GameSettingKey
  label: string
  description: string
}>

export const GAME_SETTING_OPTIONS: readonly GameSettingOption[] = [
  {
    key: 'godfatherAndSerialCanKillEachOther',
    label: 'Godfather and Serial Killer can kill each other',
    description:
      'When enabled, a final Godfather and Serial Killer eliminate each other; otherwise their final two is a stalemate.',
  },
  {
    key: 'godfatherAppearsSuspiciousToSheriff',
    label: 'Godfather appears suspicious to Sheriff',
    description:
      'When enabled, the Sheriff sees the Godfather as suspicious. A framed Godfather appears suspicious regardless of this setting.',
  },
  {
    key: 'doctorCanSelfProtect',
    label: 'Doctor can self-protect',
    description: 'Allow each Doctor to choose themselves as a protection target.',
  },
  {
    key: 'doctorCannotRepeatPreviousTarget',
    label: 'Doctor cannot repeat the previous target',
    description: 'Prevent each Doctor from protecting the same player on two consecutive nights.',
  },
  {
    key: 'revealRoleOnDeath',
    label: 'Reveal role on death',
    description: 'Include a dead player’s role in the later public announcement.',
  },
  {
    key: 'allowFirstNightKills',
    label: 'Allow first-night kills',
    description: 'Store whether first-night attacks may cause deaths when night play is built.',
  },
]
