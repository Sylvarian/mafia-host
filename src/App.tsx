import './App.css'

import { GameSetup } from '@/features/game-setup/index.ts'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand" aria-label="Mafia Host">
          <span aria-hidden="true">MH</span>
          <strong>Mafia Host</strong>
        </div>
        <p>Phase 2 · Pre-game setup</p>
      </header>

      <main className="app-main">
        <section className="app-intro" aria-labelledby="page-heading">
          <p className="app-intro__eyebrow">Build tonight’s table</p>
          <h1 id="page-heading">Prepare your Mafia game</h1>
          <p>
            Maintain the roster, match every participating player to a role slot, and record the
            settings for this pre-game draft.
          </p>
          <div className="app-intro__boundary">
            <strong>Setup only</strong>
            <span>Phase 2 ends after validation; gameplay is outside this screen.</span>
          </div>
        </section>

        <GameSetup />
      </main>

      <footer className="app-footer">
        This session is held in memory only. Refreshing may clear the roster and setup.
      </footer>
    </div>
  )
}

export default App
