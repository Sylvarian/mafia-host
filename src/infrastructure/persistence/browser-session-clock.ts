import type { SessionClock } from '@/application/session-persistence/game-session-store.ts'

export class BrowserSessionClock implements SessionClock {
  now(): string {
    return new Date().toISOString()
  }
}
