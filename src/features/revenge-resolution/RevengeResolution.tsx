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
    <section className="revenge-resolution" aria-labelledby="revenge-resolution-heading">
      <p className="revenge-resolution__eyebrow">Private host-only Dawn boundary</p>
      <h2 id="revenge-resolution-heading" ref={headingRef} tabIndex={-1}>
        Resolve Jester revenge
      </h2>
      <p className="revenge-resolution__warning">
        Keep this screen hidden from players until the public Dawn announcement is ready.
      </p>
      <div className="revenge-resolution__selection">
        <span>Randomly selected victim</span>
        <strong>{view.victimDisplayLabel}</strong>
      </div>
      <p>
        Ordinary Night {String(view.nightNumber)} deaths have already been applied. This unavoidable
        revenge death cannot be prevented by protection, blocking, or immunity.
      </p>
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
