import { useEffect, useRef } from 'react'

import type {
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
      <section className="dawn-public" aria-labelledby="dawn-heading">
        <p className="dawn-public__eyebrow">
          Public announcement · Night {announcement.nightNumber}
        </p>
        <h2 id="dawn-heading" ref={headingRef} tabIndex={-1}>
          {announcement.outcome === 'no-deaths' ? 'A quiet Dawn' : 'Dawn deaths'}
        </h2>
        {announcement.outcome === 'no-deaths' ? (
          <p className="dawn-public__headline">No one died during the night.</p>
        ) : (
          <ul className="dawn-public__deaths" aria-label="Players who died during the night">
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
        <div className="dawn-public__boundary">
          <strong>Dawn complete</strong>
          <span>Begin the public daytime stage when the table is ready.</span>
        </div>
        {dayTransitionErrorMessage === null ? null : (
          <p className="dawn-error" role="alert">
            {dayTransitionErrorMessage}
          </p>
        )}
        <button type="button" className="button button--primary" onClick={onBeginDayDiscussion}>
          Begin day discussion
        </button>
      </section>
    )
  }

  return (
    <section className="dawn-ready" aria-labelledby="dawn-ready-heading">
      <div className="dawn-ready__content">
        <p className="dawn-ready__eyebrow">Host-only Dawn boundary</p>
        <h2 id="dawn-ready-heading" ref={headingRef} tabIndex={-1}>
          Night resolution complete
        </h2>
        <p>Ordinary deaths are still hidden.</p>
        <p className="dawn-ready__guidance">
          Make sure every player’s eyes are open before showing Dawn.
        </p>
        {error === null ? null : (
          <p className="dawn-error" role="alert">
            {getNightCompletionErrorMessage(error)}
          </p>
        )}
        <button type="button" className="button button--prepare" onClick={onPrepareDawn}>
          Show Dawn announcement
        </button>
      </div>
    </section>
  )
}
