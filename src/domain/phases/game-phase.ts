export const GAME_PHASES = [
  'roster',
  'setup',
  'role-distribution',
  'executioner-briefing',
  'night-action-collection',
  'night-resolution',
  'dawn-announcement',
  'day-discussion',
  'trial',
  'trial-voting',
  'execution-resolution',
  'game-over',
] as const

export type GamePhase = (typeof GAME_PHASES)[number]

export function isGamePhase(value: string): value is GamePhase {
  return GAME_PHASES.some((phase) => phase === value)
}
