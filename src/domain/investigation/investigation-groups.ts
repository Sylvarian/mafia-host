import { fail, succeed, type DomainResult } from '../game/domain-result.ts'
import type { RoleId } from '../identifiers.ts'
import { ROLE_IDS, ROLE_REGISTRY } from '../roles/role-registry.ts'

export const INVESTIGATION_GROUP_IDS = Object.freeze({
  groupA: 'group-a',
  groupB: 'group-b',
  groupC: 'group-c',
  groupD: 'group-d',
} as const)

export type InvestigationGroupId =
  (typeof INVESTIGATION_GROUP_IDS)[keyof typeof INVESTIGATION_GROUP_IDS]

type ThreeRoleGroup = Readonly<{
  roleIds: readonly [RoleId, RoleId, RoleId]
  roleDisplayNames: readonly [string, string, string]
}>

type FourRoleGroup = Readonly<{
  roleIds: readonly [RoleId, RoleId, RoleId, RoleId]
  roleDisplayNames: readonly [string, string, string, string]
}>

export type InvestigationGroup = Readonly<{
  id: InvestigationGroupId
  label: string
}> &
  (ThreeRoleGroup | FourRoleGroup)

export type CanonicalInvestigationGroupMapping = Readonly<{
  roleId: RoleId
  groupId: InvestigationGroupId
}>

export type InvestigationGroupError =
  | Readonly<{
      type: 'INVALID_INVESTIGATION_GROUP_DEFINITION'
      reason:
        | 'duplicate-group-id'
        | 'duplicate-group-role'
        | 'duplicate-role-mapping'
        | 'group-role-name-mismatch'
        | 'mapping-membership-mismatch'
        | 'unknown-mapped-group'
        | 'unmapped-registry-role'
      groupId?: InvestigationGroupId
      roleId?: RoleId
    }>
  | Readonly<{
      type: 'MISSING_CANONICAL_INVESTIGATION_GROUP'
      roleId: RoleId
    }>

const GROUP_A: InvestigationGroup = Object.freeze({
  id: INVESTIGATION_GROUP_IDS.groupA,
  label: 'Group A',
  roleIds: Object.freeze([ROLE_IDS.godfather, ROLE_IDS.doctor, ROLE_IDS.sheriff] as const),
  roleDisplayNames: Object.freeze(['Godfather', 'Doctor', 'Sheriff'] as const),
})

const GROUP_B: InvestigationGroup = Object.freeze({
  id: INVESTIGATION_GROUP_IDS.groupB,
  label: 'Group B',
  roleIds: Object.freeze([ROLE_IDS.framer, ROLE_IDS.detective, ROLE_IDS.mayor] as const),
  roleDisplayNames: Object.freeze(['Framer', 'Detective', 'Mayor'] as const),
})

const GROUP_C: InvestigationGroup = Object.freeze({
  id: INVESTIGATION_GROUP_IDS.groupC,
  label: 'Group C',
  roleIds: Object.freeze([ROLE_IDS.consort, ROLE_IDS.investigator, ROLE_IDS.executioner] as const),
  roleDisplayNames: Object.freeze(['Consort', 'Investigator', 'Executioner'] as const),
})

const GROUP_D: InvestigationGroup = Object.freeze({
  id: INVESTIGATION_GROUP_IDS.groupD,
  label: 'Group D',
  roleIds: Object.freeze([
    ROLE_IDS.consigliere,
    ROLE_IDS.serialKiller,
    ROLE_IDS.jester,
    ROLE_IDS.citizen,
  ] as const),
  roleDisplayNames: Object.freeze(['Consigliere', 'Serial Killer', 'Jester', 'Citizen'] as const),
})

export const INVESTIGATION_GROUPS: readonly InvestigationGroup[] = Object.freeze([
  GROUP_A,
  GROUP_B,
  GROUP_C,
  GROUP_D,
])

export const CANONICAL_INVESTIGATION_GROUP_MAPPINGS: readonly CanonicalInvestigationGroupMapping[] =
  Object.freeze([
    mapping(ROLE_IDS.godfather, INVESTIGATION_GROUP_IDS.groupA),
    mapping(ROLE_IDS.doctor, INVESTIGATION_GROUP_IDS.groupA),
    mapping(ROLE_IDS.sheriff, INVESTIGATION_GROUP_IDS.groupA),
    mapping(ROLE_IDS.framer, INVESTIGATION_GROUP_IDS.groupB),
    mapping(ROLE_IDS.detective, INVESTIGATION_GROUP_IDS.groupB),
    mapping(ROLE_IDS.mayor, INVESTIGATION_GROUP_IDS.groupB),
    mapping(ROLE_IDS.consort, INVESTIGATION_GROUP_IDS.groupC),
    mapping(ROLE_IDS.investigator, INVESTIGATION_GROUP_IDS.groupC),
    mapping(ROLE_IDS.executioner, INVESTIGATION_GROUP_IDS.groupC),
    mapping(ROLE_IDS.consigliere, INVESTIGATION_GROUP_IDS.groupD),
    mapping(ROLE_IDS.serialKiller, INVESTIGATION_GROUP_IDS.groupD),
    mapping(ROLE_IDS.jester, INVESTIGATION_GROUP_IDS.groupD),
    mapping(ROLE_IDS.citizen, INVESTIGATION_GROUP_IDS.groupD),
  ])

export function validateInvestigationGroups(): DomainResult<true, InvestigationGroupError> {
  const groupIds = new Set<InvestigationGroupId>()
  const groupIdByRole = new Map<RoleId, InvestigationGroupId>()

  for (const group of INVESTIGATION_GROUPS) {
    if (groupIds.has(group.id)) {
      return fail({
        type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
        reason: 'duplicate-group-id',
        groupId: group.id,
      })
    }
    groupIds.add(group.id)

    for (const [index, roleId] of group.roleIds.entries()) {
      if (groupIdByRole.has(roleId)) {
        return fail({
          type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
          reason: 'duplicate-group-role',
          groupId: group.id,
          roleId,
        })
      }

      const role = ROLE_REGISTRY.find((entry) => entry.id === roleId)
      if (role === undefined || role.name !== group.roleDisplayNames[index]) {
        return fail({
          type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
          reason: 'group-role-name-mismatch',
          groupId: group.id,
          roleId,
        })
      }

      groupIdByRole.set(roleId, group.id)
    }
  }

  const mappedRoleIds = new Set<RoleId>()
  for (const entry of CANONICAL_INVESTIGATION_GROUP_MAPPINGS) {
    if (mappedRoleIds.has(entry.roleId)) {
      return fail({
        type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
        reason: 'duplicate-role-mapping',
        roleId: entry.roleId,
      })
    }

    if (!groupIds.has(entry.groupId)) {
      return fail({
        type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
        reason: 'unknown-mapped-group',
        groupId: entry.groupId,
        roleId: entry.roleId,
      })
    }

    if (groupIdByRole.get(entry.roleId) !== entry.groupId) {
      return fail({
        type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
        reason: 'mapping-membership-mismatch',
        groupId: entry.groupId,
        roleId: entry.roleId,
      })
    }

    mappedRoleIds.add(entry.roleId)
  }

  for (const role of ROLE_REGISTRY) {
    if (!mappedRoleIds.has(role.id)) {
      return fail({
        type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
        reason: 'unmapped-registry-role',
        roleId: role.id,
      })
    }
  }

  return succeed(true)
}

export function resolveInvestigationGroup(
  actualRoleId: RoleId,
  framed: boolean,
): DomainResult<InvestigationGroup, InvestigationGroupError> {
  const validationResult = validateInvestigationGroups()
  if (!validationResult.ok) {
    return validationResult
  }

  const groupId = framed
    ? INVESTIGATION_GROUP_IDS.groupA
    : CANONICAL_INVESTIGATION_GROUP_MAPPINGS.find((entry) => entry.roleId === actualRoleId)?.groupId

  if (groupId === undefined) {
    return fail({ type: 'MISSING_CANONICAL_INVESTIGATION_GROUP', roleId: actualRoleId })
  }

  const group = INVESTIGATION_GROUPS.find((entry) => entry.id === groupId)
  if (group === undefined) {
    return fail({
      type: 'INVALID_INVESTIGATION_GROUP_DEFINITION',
      reason: 'unknown-mapped-group',
      groupId,
      roleId: actualRoleId,
    })
  }

  return succeed(group)
}

function mapping(
  roleId: RoleId,
  groupId: InvestigationGroupId,
): CanonicalInvestigationGroupMapping {
  return Object.freeze({ roleId, groupId })
}
