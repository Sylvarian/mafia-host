import type { GamePhase } from '../phases/game-phase.ts'

export type GameEvent = Readonly<{
  type: 'PHASE_ADVANCED'
  fromPhase: GamePhase
  toPhase: GamePhase
}>
