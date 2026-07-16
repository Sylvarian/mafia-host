export interface RandomSource {
  /** Returns a finite value from 0 inclusive to 1 exclusive. */
  next(): number
}
