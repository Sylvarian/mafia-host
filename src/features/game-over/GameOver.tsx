import { useEffect, useRef } from 'react'

import type { GameOverPlayerView, HostGameOverView } from '@/application/game-over/index.ts'

import './GameOver.css'

export function GameOver({
  view,
  onStartNextGame,
}: Readonly<{ view: HostGameOverView; onStartNextGame: () => void }>) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className={`game-over game-over--${view.status}`} aria-labelledby="game-over-heading">
      <p className="game-over__eyebrow">Final host result</p>
      <h2 id="game-over-heading" ref={headingRef} tabIndex={-1}>
        Game over
      </h2>
      <p className="game-over__result">{view.heading}</p>
      {view.explanation === null ? null : (
        <p className="game-over__explanation">{view.explanation}</p>
      )}
      <p className="game-over__status">The game ended {view.endedAtLabel}.</p>

      <section className="game-over__players" aria-labelledby="game-over-players-heading">
        <h3 id="game-over-players-heading">Complete final game state</h3>
        <ul>
          {view.players.map((player) => (
            <li
              className={`game-over__player game-over__player--${player.alignment}`}
              key={player.playerId}
            >
              <strong>{player.playerDisplayLabel}</strong>
              <span>{player.alive ? 'Alive' : 'Dead'}</span>
              <span>
                {player.activeRoleDisplayName} · {player.alignmentDisplayName}
              </span>
              {player.originallyAssignedRoleDisplayName === null ? null : (
                <span>Originally: {player.originallyAssignedRoleDisplayName}</span>
              )}
              {player.deathCause === null ? null : (
                <span>{formatDeathCause(player.deathCause)}</span>
              )}
              {player.executionerTargetDisplayLabel === null ? null : (
                <span>Executioner target: {player.executionerTargetDisplayLabel}</span>
              )}
              {player.promotionNightNumber === null ? null : (
                <span>Promoted to Godfather for Night {player.promotionNightNumber}</span>
              )}
              {player.conversionTargetDisplayLabel === null ? null : (
                <span>Converted to Jester after {player.conversionTargetDisplayLabel} died</span>
              )}
              {player.personalWins.map((win) => (
                <span key={`${win.kind}-${String(win.dayNumber)}`}>{formatPersonalWin(win)}</span>
              ))}
              {player.revengeResults.map((revenge) => (
                <span key={`${revenge.kind}-${String(revenge.nightNumber)}`}>
                  {formatRevenge(revenge)}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </section>

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

function formatDeathCause(cause: NonNullable<GameOverPlayerView['deathCause']>): string {
  switch (cause.kind) {
    case 'night-death':
      return `Died during Night ${String(cause.nightNumber)}`
    case 'day-execution':
      return `Executed on Day ${String(cause.dayNumber)}`
    case 'jester-revenge':
      return `Killed by ${cause.jesterPlayerDisplayLabel}’s Jester revenge during Night ${String(cause.nightNumber)}`
    case 'final-killing-role-showdown':
      return `Killed in the final showdown with ${cause.opponentPlayerDisplayLabel}`
  }
}

function formatPersonalWin(win: GameOverPlayerView['personalWins'][number]): string {
  switch (win.kind) {
    case 'jester-executed':
      return `Personal win: executed as Jester on Day ${String(win.dayNumber)}`
    case 'executioner-target-executed':
      return `Personal win: target ${win.targetPlayerDisplayLabel} was executed on Day ${String(win.dayNumber)}`
  }
}

function formatRevenge(revenge: GameOverPlayerView['revengeResults'][number]): string {
  switch (revenge.kind) {
    case 'victim-killed':
      return `Jester revenge killed ${revenge.victimPlayerDisplayLabel} during Night ${String(revenge.nightNumber)}`
    case 'no-survivor':
      return `Jester revenge had no eligible survivor during Night ${String(revenge.nightNumber)}`
  }
}
