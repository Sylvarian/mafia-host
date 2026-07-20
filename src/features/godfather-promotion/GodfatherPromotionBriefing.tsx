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
    <section className="godfather-promotion" aria-labelledby="godfather-promotion-heading">
      <p className="godfather-promotion__eyebrow">
        Night {view.nightNumber} · Private host-only screen
      </p>
      <h2 id="godfather-promotion-heading" ref={headingRef} tabIndex={-1}>
        New Godfather
      </h2>
      <p className="godfather-promotion__warning">
        <strong>HOST-ONLY — keep this screen hidden from players.</strong>
      </p>
      <p className="godfather-promotion__message">
        <strong>{view.promotedPlayerDisplayLabel}</strong> has been promoted to Godfather.
      </p>
      <p>Privately tell {view.promotedPlayerDisplayLabel} before continuing.</p>
      {errorMessage === null ? null : (
        <p className="godfather-promotion__error" role="alert">
          {errorMessage}
        </p>
      )}
      <button type="button" className="button button--primary" onClick={onContinue}>
        Continue after briefing
      </button>
    </section>
  )
}
