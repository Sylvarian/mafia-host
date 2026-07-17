import './App.css'

import type { RoleAssignmentDependencies } from '@/application/role-assignment/index.ts'
import { GameSetup } from '@/features/game-setup/index.ts'
import { BrowserRoleAssignmentIdentitySource } from '@/infrastructure/identifiers/browser-role-assignment-identity-source.ts'
import { BrowserRandomSource } from '@/infrastructure/randomness/browser-random-source.ts'

const roleAssignmentDependencies: RoleAssignmentDependencies = Object.freeze({
  randomSource: new BrowserRandomSource(),
  identitySource: new BrowserRoleAssignmentIdentitySource(),
})

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand" aria-label="Mafia Host">
          <span aria-hidden="true">MH</span>
          <strong>Mafia Host</strong>
        </div>
        <p>Phase 4 · Night action collection</p>
      </header>

      <main className="app-main">
        <section className="app-intro" aria-labelledby="page-heading">
          <p className="app-intro__eyebrow">Prepare tonight’s table</p>
          <h1 id="page-heading">Set up, deal, and collect the night</h1>
          <p>
            Validate the roster and role composition, privately assign roles, and track every
            physical card handed to players, then collect private night-action intent.
          </p>
          <div className="app-intro__boundary">
            <strong>Host-only workflow</strong>
            <span>Assignments and night targets stay private to the host.</span>
          </div>
        </section>

        <GameSetup roleAssignmentDependencies={roleAssignmentDependencies} />
      </main>

      <footer className="app-footer">
        This session is held in memory only. Refreshing may clear the roster and setup.
      </footer>
    </div>
  )
}

export default App
