import { useEffect, useRef } from 'react'

import type { RevengeResolutionView } from '@/application/night-completion/index.ts'

import './RevengeResolution.css'

type RevengeResolutionProps = Readonly<{
  view: RevengeResolutionView
  errorMessage: string | null
  onContinue: () => void
}>

export function RevengeResolution({ view, errorMessage, onContinue }: RevengeResolutionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section
      className={`revenge-resolution turn-surface turn-surface--${view.alignment}`}
      aria-labelledby="revenge-resolution-heading"
    >
      <p className="revenge-resolution__eyebrow">
        Night {view.nightNumber} · {view.alignmentDisplayName}
      </p>
      <h2 id="revenge-resolution-heading" ref={headingRef} tabIndex={-1}>
        {view.roleDisplayName}
      </h2>
      <p className="revenge-resolution__prompt">Revenge falls on:</p>
      <div className="revenge-resolution__selection">
        <strong>{view.victimDisplayLabel}</strong>
      </div>
      <p>This revenge death cannot be prevented.</p>
      {errorMessage === null ? null : (
        <p className="revenge-resolution__error" role="alert">
          {errorMessage}
        </p>
      )}
      <button type="button" className="button button--danger" onClick={onContinue}>
        Apply revenge death and continue
      </button>
    </section>
  )
}
