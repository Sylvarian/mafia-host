import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App.tsx'

// Replace this foundation smoke test when real host-workflow behaviour owns the shell.
describe('application shell', () => {
  it('reports the Phase 1 foundation without exposing playable behavior', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Core domain foundation ready' })).toBeVisible()
    expect(
      screen.getByText('Host workflows and playable game behavior are not available yet.'),
    ).toBeVisible()
  })
})
