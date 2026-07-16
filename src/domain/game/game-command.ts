import type { GamePhase } from '../phases/game-phase.ts'

export type GameCommand = Readonly<{
  type: 'ADVANCE_PHASE'
  targetPhase: GamePhase
}>
