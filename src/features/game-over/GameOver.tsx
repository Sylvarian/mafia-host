import { useEffect, useRef } from 'react'

import type { PublicGameOverView } from '@/application/game-over/index.ts'

import './GameOver.css'

export function GameOver({
  view,
  onStartNextGame,
}: Readonly<{ view: PublicGameOverView; onStartNextGame: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className={`game-over game-over--${view.status}`} aria-labelledby="game-over-heading">
      <p className="game-over__eyebrow">Final public result</p>
      <h2 id="game-over-heading" ref={headingRef} tabIndex={-1}>
        Game over
      </h2>
      <p className="game-over__result">{view.heading}</p>
      {view.explanation === null ? null : (
        <p className="game-over__explanation">{view.explanation}</p>
      )}
      <p className="game-over__status">The game ended {view.endedAtLabel}.</p>

      <section className="game-over__players" aria-labelledby="game-over-players-heading">
        <h3 id="game-over-players-heading">Final public player status</h3>
        <ul>
          {view.players.map((player) => (
            <li key={player.playerDisplayLabel}>
              <strong>{player.playerDisplayLabel}</strong>
              <span>{player.alive ? 'Alive' : 'Dead'}</span>
              {player.revealedRoleDisplayName === null ? null : (
                <span>Public role: {player.revealedRoleDisplayName}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="game-over__privacy">
        Hidden roles and private neutral information remain hidden.
      </p>
      <button
        type="button"
        className="button button--prepare game-over__next-game"
        onClick={onStartNextGame}
      >
        Start next game
      </button>
    </section>
  )
}
