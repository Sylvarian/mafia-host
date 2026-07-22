import { useEffect, useRef } from 'react'

import type { GodfatherPromotionBriefingView } from '@/application/godfather-promotion/index.ts'

import './GodfatherPromotionBriefing.css'

type GodfatherPromotionBriefingProps = Readonly<{
  view: GodfatherPromotionBriefingView
  errorMessage: string | null
  onContinue: () => void
}>

export function GodfatherPromotionBriefing({
  view,
  errorMessage,
  onContinue,
}: GodfatherPromotionBriefingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section
      className={`godfather-promotion turn-surface turn-surface--${view.alignment}`}
      aria-labelledby="godfather-promotion-heading"
    >
      <p className="godfather-promotion__eyebrow">
        Night {view.nightNumber} · {view.alignmentDisplayName}
      </p>
      <h2 id="godfather-promotion-heading" ref={headingRef} tabIndex={-1}>
        {view.roleDisplayName}
      </h2>
      <p className="godfather-promotion__actor">{view.promotedPlayerDisplayLabel}</p>
      <p className="godfather-promotion__message">
        Tell {view.promotedPlayerDisplayLabel} they are the new Godfather.
      </p>
      {errorMessage === null ? null : (
        <p className="godfather-promotion__error" role="alert">
          {errorMessage}
        </p>
      )}
      <button type="button" className="button button--primary" onClick={onContinue}>
        Continue
      </button>
    </section>
  )
}
