import type { IdentitySource } from '../application/identity-source.ts'

export const browserIdentitySource: IdentitySource = {
  next: () => 'browser-id',
}
