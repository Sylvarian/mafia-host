import { roleId, type RoleId } from '../identifiers.ts'
import type { RoleDefinition } from './role-definition.ts'

export type GameplayImplementationStatus = 'setup-only'

export type RoleRegistryEntry = Readonly<
  RoleDefinition & {
    description: string
    gameplayImplementationStatus: GameplayImplementationStatus
  }
>

export const ROLE_IDS = Object.freeze({
  godfather: roleId('godfather'),
  framer: roleId('framer'),
  consort: roleId('consort'),
  consigliere: roleId('consigliere'),
  sheriff: roleId('sheriff'),
  detective: roleId('detective'),
  investigator: roleId('investigator'),
  doctor: roleId('doctor'),
  mayor: roleId('mayor'),
  citizen: roleId('citizen'),
  jester: roleId('jester'),
  executioner: roleId('executioner'),
  serialKiller: roleId('serial-killer'),
})

export const ROLE_REGISTRY: readonly RoleRegistryEntry[] = Object.freeze([
  roleEntry(
    ROLE_IDS.godfather,
    'Godfather',
    'mafia',
    'Leads the Mafia and selects a player to attack at night.',
  ),
  roleEntry(
    ROLE_IDS.framer,
    'Framer',
    'mafia',
    'Frames a player for the current night so investigations see misleading information.',
  ),
  roleEntry(
    ROLE_IDS.consort,
    'Consort',
    'mafia',
    'Selects a player whose night ability will be role-blocked.',
  ),
  roleEntry(
    ROLE_IDS.consigliere,
    'Consigliere',
    'mafia',
    'Investigates a player using the permanent three-role investigation groups.',
  ),
  roleEntry(
    ROLE_IDS.sheriff,
    'Sheriff',
    'town',
    'Checks whether a player appears suspicious during the night.',
  ),
  roleEntry(
    ROLE_IDS.detective,
    'Detective',
    'town',
    'Tracks whom a selected player successfully visited that night.',
  ),
  roleEntry(
    ROLE_IDS.investigator,
    'Investigator',
    'town',
    'Investigates a player using a permanent three-role result group.',
  ),
  roleEntry(
    ROLE_IDS.doctor,
    'Doctor',
    'town',
    'Protects one player from applicable night attacks.',
  ),
  roleEntry(
    ROLE_IDS.mayor,
    'Mayor',
    'town',
    'May reveal during the day so their living vote counts as three.',
  ),
  roleEntry(ROLE_IDS.citizen, 'Citizen', 'town', 'Has no night ability and votes with the Town.'),
  roleEntry(
    ROLE_IDS.jester,
    'Jester',
    'neutral',
    'Wins personally by being executed; the main game then continues.',
  ),
  roleEntry(
    ROLE_IDS.executioner,
    'Executioner',
    'neutral',
    'Receives a target in a later phase and wins personally if that target is executed.',
  ),
  roleEntry(
    ROLE_IDS.serialKiller,
    'Serial Killer',
    'neutral',
    'A provisional killing role whose exact victory condition remains unresolved.',
  ),
])

export function findRoleDefinition(id: RoleId): RoleRegistryEntry | undefined {
  return ROLE_REGISTRY.find((role) => role.id === id)
}

function roleEntry(
  id: RoleId,
  name: string,
  faction: RoleDefinition['faction'],
  description: string,
): RoleRegistryEntry {
  return Object.freeze({
    id,
    name,
    faction,
    description,
    gameplayImplementationStatus: 'setup-only',
  })
}
