import type { GameId } from '../identifiers.ts'
import type { ExecutionerTarget } from '../executioner/executioner-target-model.ts'
import type { DayOutcome } from '../day/day-outcome-model.ts'
import type { GamePhase } from '../phases/game-phase.ts'
import type { GamePlayer } from '../players/game-player.ts'
import type { Player } from '../players/player.ts'
import type { RoleDefinition } from '../roles/role-definition.ts'
import type { RoleInstance } from '../roles/role-instance.ts'
import type {
  ExecutionerToJesterConversion,
  JesterRevengeResolution,
  PendingJesterRevenge,
  PersonalWinRecord,
} from '../neutral/neutral-outcome-model.ts'
import type { DeathRecord } from './death-record.ts'
import type { DoctorPreviousTarget } from './doctor-previous-target.ts'
import type { DayNumber, NightNumber } from './game-records.ts'
import type { GameSettings } from './game-settings.ts'

export type GameState = Readonly<{
  id: GameId
  phase: GamePhase
  players: readonly GamePlayer[]
  roleDefinitions: readonly RoleDefinition[]
  settings: GameSettings
  nightNumber: NightNumber
  dayNumber: DayNumber
  doctorPreviousTargets: readonly DoctorPreviousTarget[]
  executionerTargets: readonly ExecutionerTarget[]
  executionerBriefingStatus: 'not-started' | 'not-required' | 'pending' | 'completed'
  deathRecords: readonly DeathRecord[]
  personalWins: readonly PersonalWinRecord[]
  executionerConversions: readonly ExecutionerToJesterConversion[]
  pendingJesterRevenges: readonly PendingJesterRevenge[]
  jesterRevengeResolutions: readonly JesterRevengeResolution[]
  dayOutcomes: readonly DayOutcome[]
}>

export type GamePlayerCandidate = Readonly<
  Omit<GamePlayer, 'role'> & {
    role: RoleInstance | null
  }
>

export type GameStateCandidate = Readonly<
  Omit<
    GameState,
    | 'phase'
    | 'players'
    | 'settings'
    | 'nightNumber'
    | 'dayNumber'
    | 'doctorPreviousTargets'
    | 'executionerTargets'
    | 'executionerBriefingStatus'
    | 'deathRecords'
    | 'personalWins'
    | 'executionerConversions'
    | 'pendingJesterRevenges'
    | 'jesterRevengeResolutions'
    | 'dayOutcomes'
  > & {
    phase: string
    players: readonly GamePlayerCandidate[]
    settings: unknown
    nightNumber: number
    dayNumber: number
    doctorPreviousTargets: unknown
    executionerTargets: unknown
    executionerBriefingStatus: unknown
    deathRecords: unknown
    personalWins: unknown
    executionerConversions: unknown
    pendingJesterRevenges: unknown
    jesterRevengeResolutions: unknown
    dayOutcomes: unknown
  }
>

export type CreateGameInput = Readonly<{
  id: GameId
  roster: readonly Player[]
  players: readonly GamePlayerCandidate[]
  roleDefinitions: readonly RoleDefinition[]
  settings: GameSettings
}>
