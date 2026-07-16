import type { PlayerId } from '../identifiers.ts'
import type { Faction } from '../roles/faction.ts'

export type NightNumber = number
export type DayNumber = number

export type TrialVoteChoice = 'guilty' | 'innocent' | 'abstain'

export type TrialVote = Readonly<{
  voterId: PlayerId
  choice: TrialVoteChoice
}>

export type DeathRecord = Readonly<{
  playerId: PlayerId
  resolvedDuring: 'night-resolution' | 'execution-resolution'
}>

export type PersonalWinKind = 'jester' | 'executioner'

export type PersonalWinRecord = Readonly<{
  playerId: PlayerId
  kind: PersonalWinKind
}>

export type FactionWinRecord = Readonly<{
  faction: Faction
  resolvedDuring: 'night-resolution' | 'execution-resolution'
}>
