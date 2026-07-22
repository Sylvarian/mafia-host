import type { RoleId } from '../identifiers.ts'
import type { NightActionKind } from '../night-actions/night-action-kind.ts'
import type { Faction } from './faction.ts'

export type NightActionMetadata =
  | Readonly<{ hasNightAction: false }>
  | Readonly<{
      hasNightAction: true
      actionKind: NightActionKind
      collectionGroup: 'mafia' | 'individual'
      collectionOrder: number
      wakeOrder: number
      hostPrompt: string
    }>

export type RoleDefinition = Readonly<{
  id: RoleId
  name: string
  faction: Faction
}>
