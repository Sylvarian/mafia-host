import { useEffect, useRef } from 'react'

import type {
  ExecutionerBriefingId,
  ExecutionerBriefingView,
} from '@/application/executioner-briefing/index.ts'

import './ExecutionerBriefing.css'

type ExecutionerBriefingProps = Readonly<{
  view: ExecutionerBriefingView
  errorMessage: string | null
  onAcknowledge: (briefingId: ExecutionerBriefingId) => void
  onPrevious: () => void
  onNext: () => void
}>

export function ExecutionerBriefing({
  view,
  errorMessage,
  onAcknowledge,
  onPrevious,
  onNext,
}: ExecutionerBriefingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [view.currentBriefing.id])

  const briefing = view.currentBriefing
  const executionerName = briefing.executionerDisplayLabel
  const targetName = briefing.targetDisplayLabel

  return (
    <section
      className={`executioner-briefing turn-surface turn-surface--${view.alignment}`}
      aria-labelledby="executioner-briefing-heading"
    >
      <div className="executioner-briefing__content">
        <header className="executioner-briefing__header">
          <div>
            <p className="executioner-briefing__eyebrow">
              {view.alignmentDisplayName} · {view.currentBriefingIndex + 1} of {view.briefingCount}
            </p>
            <h2 id="executioner-briefing-heading" ref={headingRef} tabIndex={-1}>
              {briefing.executionerRoleDisplayName}
            </h2>
            <p className="executioner-briefing__actor">{executionerName}</p>
          </div>
          <p className="executioner-briefing__progress" aria-live="polite">
            {view.acknowledgedCount} of {view.briefingCount} delivered
          </p>
        </header>

        <p className="executioner-briefing__prompt">Tell {executionerName} their target.</p>

        <article className="executioner-briefing__card">
          <span>Target</span>
          <p className="executioner-briefing__target">{targetName}</p>
          <p>Win by having this player executed during the day.</p>
        </article>

        {errorMessage === null ? null : (
          <p className="executioner-briefing__error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="executioner-briefing__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={view.currentBriefingIndex === 0}
            onClick={onPrevious}
          >
            Previous
          </button>
          {view.acknowledged ? (
            <button
              type="button"
              className="button button--prepare"
              disabled={view.currentBriefingIndex === view.briefingCount - 1}
              onClick={onNext}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="button button--prepare"
              onClick={() => {
                onAcknowledge(briefing.id)
              }}
            >
              {view.currentBriefingIndex === view.briefingCount - 1
                ? 'Target delivered — begin Night 1'
                : 'Target delivered'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
