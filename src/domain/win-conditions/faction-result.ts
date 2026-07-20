import type { GameId, PlayerId } from '../identifiers.ts'

export type DrawReason =
  'no-survivors' | 'opposing-killers-stalemate' | 'opposing-killers-mutual-elimination'

export type FactionResult =
  | Readonly<{
      kind: 'town-victory'
      gameId: GameId
    }>
  | Readonly<{
      kind: 'mafia-victory'
      gameId: GameId
      winnerPlayerIds: readonly PlayerId[]
    }>
  | Readonly<{
      kind: 'serial-killer-victory'
      gameId: GameId
      winnerPlayerIds: readonly PlayerId[]
    }>
  | Readonly<{
      kind: 'draw'
      gameId: GameId
      reason: DrawReason
    }>
  | Readonly<{
      kind: 'none'
      gameId: GameId
    }>

export type TerminalFactionResult = Exclude<FactionResult, Readonly<{ kind: 'none' }>>
