import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@/App.tsx'
import type { RoleAssignmentDependencies } from '@/application/role-assignment/index.ts'
import {
  migratePersistedSessionEnvelopeV1,
  restorePersistedSessionEnvelopeV2,
} from '@/application/session-persistence/index.ts'
import { BrowserRoleAssignmentIdentitySource } from '@/infrastructure/identifiers/browser-role-assignment-identity-source.ts'
import { createBrowserGameSessionStore } from '@/infrastructure/persistence/browser-game-session-store.ts'
import { BrowserSessionClock } from '@/infrastructure/persistence/browser-session-clock.ts'
import { BrowserRandomSource } from '@/infrastructure/randomness/browser-random-source.ts'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('The application root element was not found.')
}

const roleAssignmentDependencies: RoleAssignmentDependencies = Object.freeze({
  randomSource: new BrowserRandomSource(),
  identitySource: new BrowserRoleAssignmentIdentitySource(),
})
const sessionStore = createBrowserGameSessionStore(
  restorePersistedSessionEnvelopeV2,
  migratePersistedSessionEnvelopeV1,
)
const sessionClock = new BrowserSessionClock()
const initialLoadResult = sessionStore.load()

createRoot(rootElement).render(
  <StrictMode>
    <App
      roleAssignmentDependencies={roleAssignmentDependencies}
      sessionStore={sessionStore}
      sessionClock={sessionClock}
      initialLoadResult={initialLoadResult}
    />
  </StrictMode>,
)
