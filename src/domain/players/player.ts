import type { PlayerId } from '../identifiers.ts'

export type Player = Readonly<{
  id: PlayerId
  name: string
  playing: boolean
}>
