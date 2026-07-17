import type { GameSessionStore } from '../application/session-persistence/game-session-store.ts'

export const browserSessionStore: GameSessionStore = {
  load: () => null,
}
