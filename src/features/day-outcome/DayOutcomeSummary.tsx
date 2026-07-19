import { useEffect, useRef } from 'react'

import type { PublicDayOutcomeView } from '@/application/day-outcome/index.ts'

import './DayOutcomeSummary.css'

export function DayOutcomeSummary({ view }: Readonly<{ view: PublicDayOutcomeView }>) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="day-outcome" aria-labelledby="day-outcome-heading">
      <p className="day-outcome__eyebrow">Public-safe display</p>
      <h2 id="day-outcome-heading" ref={headingRef} tabIndex={-1}>
        {view.dayLabel} complete
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
      <p className="day-outcome__boundary">
        The day outcome is saved. Winner calculation, revenge resolution, and another night are not
        implemented yet.
      </p>
    </section>
  )
}
