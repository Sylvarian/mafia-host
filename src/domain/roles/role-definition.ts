import type { RoleId } from '../identifiers.ts'
import type { Faction } from './faction.ts'

export type RoleDefinition = Readonly<{
  id: RoleId
  name: string
  faction: Faction
}>
