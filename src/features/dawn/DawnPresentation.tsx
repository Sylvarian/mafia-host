import { useEffect, useRef } from 'react'

import type {
  HostNightPlayerView,
  ImportantNightEventView,
  NightCompletionError,
  NightCompletionView,
} from '@/application/night-completion/index.ts'

import { getNightCompletionErrorMessage } from './dawn-error.ts'

import './DawnPresentation.css'

type DawnPresentationProps = Readonly<{
  view: NightCompletionView
  error: NightCompletionError | null
  dayTransitionErrorMessage: string | null
  onPrepareDawn: () => void
  onBeginDayDiscussion: () => void
}>

export function DawnPresentation({
  view,
  error,
  dayTransitionErrorMessage,
  onPrepareDawn,
  onBeginDayDiscussion,
}: DawnPresentationProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [view.status])

  if (view.status === 'dawn') {
    const announcement = view.announcement
    return (
      <section className="dawn" aria-labelledby="dawn-heading">
        <p className="dawn__eyebrow">Night {announcement.nightNumber}</p>
        <h2 id="dawn-heading" ref={headingRef} tabIndex={-1}>
          Dawn
        </h2>

        <section className="dawn__section dawn__announcement" aria-labelledby="announce-heading">
          <h3 id="announce-heading">Announce to players</h3>
          {announcement.outcome === 'no-deaths' ? (
            <p className="dawn__headline">No one died during the night.</p>
          ) : (
            <ul aria-label="Announcements for players">
              {announcement.deaths.map((death) => (
                <li key={death.playerId}>
                  <strong>{death.playerDisplayLabel}</strong> died during the night.
                  {death.revealedRoleDisplayName === null
                    ? null
                    : ` Their role was ${death.revealedRoleDisplayName}.`}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="dawn__section dawn__host-results"
          aria-labelledby="host-results-heading"
        >
          <h3 id="host-results-heading">Host results</h3>
          {view.hostResults.deaths.length === 0 ? (
            <p>No deaths were recorded during this Dawn.</p>
          ) : (
            <ul aria-label="Exact host death results">
              {view.hostResults.deaths.map((death) => (
                <li key={death.playerId}>
                  <strong>{formatPlayer(death)}</strong> died.
                  {death.cause.kind === 'ordinary-night-attack'
                    ? formatAttackers(death.cause.attackers)
                    : ` Killed by Jester revenge from ${formatPlayer(death.cause.jester)}.`}
                </li>
              ))}
            </ul>
          )}
          {view.hostResults.conversions.length === 0 ? null : (
            <ul aria-label="Role transformations at Dawn">
              {view.hostResults.conversions.map((conversion) => (
                <li key={conversion.convertedPlayer.playerId}>
                  <strong>{formatPlayer(conversion.convertedPlayer)}</strong> converted because{' '}
                  {formatPlayer(conversion.targetPlayer)} died.
                </li>
              ))}
            </ul>
          )}
        </section>

        {view.importantEvents.length === 0 ? null : (
          <section
            className="dawn__section dawn__events"
            aria-labelledby="important-events-heading"
          >
            <h3 id="important-events-heading">Important night events</h3>
            <ul>
              {view.importantEvents.map((event, index) => (
                <li key={`${event.kind}-${String(index)}`}>{formatImportantEvent(event)}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="dawn__boundary">
          <strong>Announcement ready</strong>
          <span>Ask every player to open their eyes, then begin the daytime stage.</span>
        </div>
        {dayTransitionErrorMessage === null ? null : (
          <p className="dawn-error" role="alert">
            {dayTransitionErrorMessage}
          </p>
        )}
        <button type="button" className="button button--primary" onClick={onBeginDayDiscussion}>
          Continue to Day {String(announcement.nightNumber)}
        </button>
      </section>
    )
  }

  return (
    <section className="dawn-ready" aria-labelledby="dawn-ready-heading">
      <div className="dawn-ready__content">
        <p className="dawn-ready__eyebrow">Dawn</p>
        <h2 id="dawn-ready-heading" ref={headingRef} tabIndex={-1}>
          Night resolution complete
        </h2>
        <p className="dawn-ready__guidance">Keep every player’s eyes closed, then finalize Dawn.</p>
        {error === null ? null : (
          <p className="dawn-error" role="alert">
            {getNightCompletionErrorMessage(error)}
          </p>
        )}
        <button type="button" className="button button--prepare" onClick={onPrepareDawn}>
          Finalize Dawn
        </button>
      </div>
    </section>
  )
}

function formatPlayer(player: HostNightPlayerView): string {
  return `${player.playerDisplayLabel} (${player.activeRoleDisplayName}${
    player.originallyAssignedRoleDisplayName === null
      ? ''
      : `, originally ${player.originallyAssignedRoleDisplayName}`
  })`
}

function formatAttackers(attackers: readonly HostNightPlayerView[]): string {
  if (attackers.length === 0) {
    return ' The saved game predates exact night-event reporting, so attacker details are unavailable.'
  }
  return ` Killed by ${joinPlayers(attackers)}.`
}

function joinPlayers(players: readonly HostNightPlayerView[]): string {
  return players.map(formatPlayer).join(players.length === 2 ? ' and ' : ', ')
}

function formatImportantEvent(event: ImportantNightEventView): string {
  switch (event.kind) {
    case 'role-blocked':
      return `${formatPlayer(event.consort)} roleblocked ${formatPlayer(event.target)}.`
    case 'role-block-immune':
      return `${formatPlayer(event.consort)} tried to roleblock ${formatPlayer(event.target)}, but the target was immune.`
    case 'framed':
      return `${formatPlayer(event.framer)} framed ${formatPlayer(event.target)}.`
    case 'doctor-save':
      return `${joinPlayers(event.doctors)} prevented ${formatPlayer(event.attacker)} from killing ${formatPlayer(event.target)}.`
    case 'attack-immunity':
      return `${formatPlayer(event.attacker)} attacked ${formatPlayer(event.target)}, but the attack had no effect under the current Godfather and Serial Killer setting.`
    case 'mutual-attack-immunity':
      return `${formatPlayer(event.firstAttacker)} and ${formatPlayer(event.secondAttacker)} attacked each other, but neither attack had any effect under the current Godfather and Serial Killer setting.`
  }
}
