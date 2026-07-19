import type { GameId, PlayerId } from '../identifiers.ts'

export type DayOutcome =
  | Readonly<{
      kind: 'player-executed'
      gameId: GameId
      dayNumber: number
      playerId: PlayerId
    }>
  | Readonly<{
      kind: 'no-execution'
      gameId: GameId
      dayNumber: number
    }>
