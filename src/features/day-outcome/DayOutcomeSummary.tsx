import { useEffect, useRef } from 'react'

import type { DayOutcomeView } from '@/application/day-outcome/index.ts'

import './DayOutcomeSummary.css'

type DayOutcomeSummaryProps = Readonly<{
  view: DayOutcomeView
  status: 'evaluation-pending' | 'game-continues'
  errorMessage: string | null
  nextNightNumber?: number
  onBeginNextNight?: () => void
}>

export function DayOutcomeSummary({
  view,
  status,
  errorMessage,
  nextNightNumber,
  onBeginNextNight,
}: DayOutcomeSummaryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="day-outcome" aria-labelledby="day-outcome-heading">
      <p className="day-outcome__eyebrow">Host day result</p>
      <h2 id="day-outcome-heading" ref={headingRef} tabIndex={-1}>
        Day complete
      </h2>
      <h3>Announce to players</h3>
      {view.announcement.kind === 'no-execution' ? (
        <p className="day-outcome__result">No player was executed.</p>
      ) : (
        <div className="day-outcome__result">
          <p>{view.announcement.playerDisplayLabel} was executed.</p>
          {view.announcement.revealedRoleDisplayName === null ? null : (
            <p>Their role was {view.announcement.revealedRoleDisplayName}.</p>
          )}
        </div>
      )}
      <h3>Host results</h3>
      {view.hostResult.kind === 'no-execution' ? (
        <p>No execution was recorded.</p>
      ) : (
        <div className="day-outcome__result">
          <p>
            {view.hostResult.playerDisplayLabel} — {view.hostResult.currentRoleDisplayName} (
            {view.hostResult.alignmentDisplayName})
          </p>
          {view.hostResult.originalRoleDisplayName === null ? null : (
            <p>Original role: {view.hostResult.originalRoleDisplayName}</p>
          )}
          <p>Death cause: executed on {view.dayLabel}</p>
        </div>
      )}
      {errorMessage === null ? null : (
        <p className="day-outcome__error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="day-outcome__boundary">
        {status === 'game-continues' ? (
          <p>The game continues.</p>
        ) : (
          <p>The final day outcome is preserved while victory evaluation is checked.</p>
        )}
        {nextNightNumber === undefined || onBeginNextNight === undefined ? null : (
          <>
            <p>Make sure every player closes their eyes before beginning the next night.</p>
            <button type="button" className="button button--prepare" onClick={onBeginNextNight}>
              Begin Night {String(nextNightNumber)}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
