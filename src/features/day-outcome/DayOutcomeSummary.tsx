import { useEffect, useRef } from 'react'

import type { PublicDayOutcomeView } from '@/application/day-outcome/index.ts'

import './DayOutcomeSummary.css'

type DayOutcomeSummaryProps = Readonly<{
  view: PublicDayOutcomeView
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
      <p className="day-outcome__eyebrow">Public-safe display</p>
      <h2 id="day-outcome-heading" ref={headingRef} tabIndex={-1}>
        Day complete
      </h2>
      {view.outcome.kind === 'no-execution' ? (
        <p className="day-outcome__result">No player was executed.</p>
      ) : (
        <div className="day-outcome__result">
          <p>{view.outcome.playerDisplayLabel} was executed.</p>
          {view.outcome.revealedRoleDisplayName === null ? null : (
            <p>Their role was {view.outcome.revealedRoleDisplayName}.</p>
          )}
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
