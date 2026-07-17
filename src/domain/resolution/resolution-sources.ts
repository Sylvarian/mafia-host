import type { ResolutionSources } from './night-resolution-models.ts'

export function freezeResolutionSources<Source>(
  first: Source,
  additional: readonly Source[],
): ResolutionSources<Source> {
  return Object.freeze([first, ...additional])
}
