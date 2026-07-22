import { roleId, type RoleId } from '../identifiers.ts'
import type { NightActionMetadata, RoleDefinition } from './role-definition.ts'

export type GameplayImplementationStatus = 'setup-only'

export type RoleRegistryEntry = Readonly<
  RoleDefinition & {
    description: string
    gameplayImplementationStatus: GameplayImplementationStatus
    nightAction: NightActionMetadata
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
    nightAction('attack', 'mafia', 30, 30, 'Who do you want to kill?'),
  ),
  roleEntry(
    ROLE_IDS.framer,
    'Framer',
    'mafia',
    'Frames a player for the current night so investigations see misleading information.',
    nightAction('frame', 'mafia', 20, 20, 'Who do you want to frame?'),
  ),
  roleEntry(
    ROLE_IDS.consort,
    'Consort',
    'mafia',
    'Selects a player to role-block before later actors wake.',
    nightAction('role-block', 'mafia', 10, 10, 'Who do you want to roleblock?'),
  ),
  roleEntry(
    ROLE_IDS.consigliere,
    'Consigliere',
    'mafia',
    'Investigates a player using the permanent investigation groups.',
    nightAction('investigate', 'mafia', 80, 40, 'Who do you want to investigate?'),
  ),
  roleEntry(
    ROLE_IDS.sheriff,
    'Sheriff',
    'town',
    'Checks whether a player appears suspicious during the night.',
    nightAction('investigate', 'individual', 60, 70, 'Who do you want to investigate?'),
  ),
  roleEntry(
    ROLE_IDS.detective,
    'Detective',
    'town',
    'Tracks whom a selected player successfully visited that night.',
    nightAction('track', 'individual', 90, 90, 'Who do you want to track?'),
  ),
  roleEntry(
    ROLE_IDS.investigator,
    'Investigator',
    'town',
    'Investigates a player using a permanent three-or-four-role result group.',
    nightAction('investigate', 'individual', 70, 80, 'Who do you want to investigate?'),
  ),
  roleEntry(
    ROLE_IDS.doctor,
    'Doctor',
    'town',
    'Protects one player from applicable night attacks.',
    nightAction('protect', 'individual', 50, 60, 'Who do you want to protect?'),
  ),
  roleEntry(
    ROLE_IDS.mayor,
    'Mayor',
    'town',
    'May reveal during the day so their living vote counts as three.',
    noNightAction(),
  ),
  roleEntry(
    ROLE_IDS.citizen,
    'Citizen',
    'town',
    'Has no night ability and votes with the Town.',
    noNightAction(),
  ),
  roleEntry(
    ROLE_IDS.jester,
    'Jester',
    'neutral',
    'Wins personally by being executed; the main game then continues.',
    noNightAction(),
  ),
  roleEntry(
    ROLE_IDS.executioner,
    'Executioner',
    'neutral',
    'Receives a private Town target after distribution and aims to have that player executed.',
    noNightAction(),
  ),
  roleEntry(
    ROLE_IDS.serialKiller,
    'Serial Killer',
    'neutral',
    'A Neutral killing role that attacks one living player at night.',
    nightAction('attack', 'individual', 40, 50, 'Who do you want to kill?'),
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
  nightActionMetadata: NightActionMetadata,
): RoleRegistryEntry {
  return Object.freeze({
    id,
    name,
    faction,
    description,
    gameplayImplementationStatus: 'setup-only',
    nightAction: nightActionMetadata,
  })
}

function noNightAction(): NightActionMetadata {
  return Object.freeze({ hasNightAction: false })
}

function nightAction(
  actionKind: Extract<NightActionMetadata, Readonly<{ hasNightAction: true }>>['actionKind'],
  collectionGroup: Extract<
    NightActionMetadata,
    Readonly<{ hasNightAction: true }>
  >['collectionGroup'],
  collectionOrder: number,
  wakeOrder: number,
  hostPrompt: string,
): NightActionMetadata {
  return Object.freeze({
    hasNightAction: true,
    actionKind,
    collectionGroup,
    collectionOrder,
    wakeOrder,
    hostPrompt,
  })
}
