import { useEffect, useRef } from 'react'

import type { PublicDayOutcomeView } from '@/application/day-outcome/index.ts'

import './DayOutcomeSummary.css'

type DayOutcomeSummaryProps = Readonly<{
  view: PublicDayOutcomeView
  status: 'evaluation-pending' | 'pending-revenge' | 'no-faction-victory'
  errorMessage: string | null
}>

export function DayOutcomeSummary({ view, status, errorMessage }: DayOutcomeSummaryProps) {
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
        {status === 'pending-revenge' ? (
          <p>Final victory evaluation is deferred until the next Dawn.</p>
        ) : status === 'no-faction-victory' ? (
          <p>No faction has won yet.</p>
        ) : (
          <p>The final day outcome is preserved while victory evaluation is checked.</p>
        )}
        <p>The next-night flow will be added in Phase 7E.</p>
      </div>
    </section>
  )
}
