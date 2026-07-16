import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App.tsx'

// Replace this Phase 0 smoke test when real host-workflow behaviour owns the shell.
describe('Phase 0 application shell', () => {
  it('clearly reports that the foundation is ready without exposing game behavior', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Repository foundation ready' })).toBeVisible()
    expect(
      screen.getByText('Phase 1 has not started. No game behavior is available yet.'),
    ).toBeVisible()
  })
})
