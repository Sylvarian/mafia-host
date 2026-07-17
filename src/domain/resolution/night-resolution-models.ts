import type { NightNumber } from '../game/game-records.ts'
import type { GameId, PlayerId, RoleId, RoleInstanceId } from '../identifiers.ts'
import type { InvestigationGroup } from '../investigation/investigation-groups.ts'

export type ResolutionSources<Source> = readonly [Source, ...Source[]]

export type RoleBlockAttemptOutcome = 'blocked-target' | 'target-immune'

export type RoleBlockSource = Readonly<{
  consortPlayerId: PlayerId
  consortRoleInstanceId: RoleInstanceId
}>

export type RoleBlockAttempt = Readonly<{
  actorPlayerId: PlayerId
  actorRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
  targetRoleInstanceId: RoleInstanceId
  outcome: RoleBlockAttemptOutcome
}>

export type BlockedActorRecord = Readonly<{
  blockedPlayerId: PlayerId
  blockedRoleInstanceId: RoleInstanceId
  sources: ResolutionSources<RoleBlockSource>
}>

export type VisitRecord = Readonly<{
  actorPlayerId: PlayerId
  actorRoleId: RoleId
  actorRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
}>

export type FrameSource = Readonly<{
  framerPlayerId: PlayerId
  framerRoleInstanceId: RoleInstanceId
}>

export type FrameRecord = Readonly<{
  framedPlayerId: PlayerId
  sources: ResolutionSources<FrameSource>
}>

export type ProtectionSource = Readonly<{
  doctorPlayerId: PlayerId
  doctorRoleInstanceId: RoleInstanceId
}>

export type ProtectionRecord = Readonly<{
  protectedPlayerId: PlayerId
  sources: ResolutionSources<ProtectionSource>
}>

export type AttackOutcome = 'mutual-kill-disabled' | 'protected' | 'lethal'

export type AttackSource = Readonly<{
  attackerPlayerId: PlayerId
  attackerRoleId: RoleId
  attackerRoleInstanceId: RoleInstanceId
}>

export type AttackAttempt = Readonly<
  AttackSource & {
    targetPlayerId: PlayerId
    outcome: AttackOutcome
  }
>

export type ProvisionalDeath = Readonly<{
  deadPlayerId: PlayerId
  actualRoleId: RoleId
  nightNumber: NightNumber
  sources: ResolutionSources<AttackSource>
}>

type SheriffResultBase = Readonly<{
  actorPlayerId: PlayerId
  actorRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
}>

export type SheriffResult = SheriffResultBase &
  (Readonly<{ status: 'suspicious' }> | Readonly<{ status: 'not-suspicious' }>)

export type InvestigationResult = Readonly<{
  actorPlayerId: PlayerId
  actorRoleId: RoleId
  actorRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
  group: InvestigationGroup
}>

type DetectiveResultBase = Readonly<{
  actorPlayerId: PlayerId
  actorRoleInstanceId: RoleInstanceId
  targetPlayerId: PlayerId
}>

export type DetectiveResult = DetectiveResultBase &
  (
    | Readonly<{
        status: 'visited-player'
        visitedPlayerId: PlayerId
      }>
    | Readonly<{
        status: 'visited-nobody'
      }>
  )

export type NightResolution = Readonly<{
  gameId: GameId
  nightNumber: NightNumber
  roleBlockAttempts: readonly RoleBlockAttempt[]
  blockedActors: readonly BlockedActorRecord[]
  finalVisits: readonly VisitRecord[]
  frames: readonly FrameRecord[]
  protections: readonly ProtectionRecord[]
  attackAttempts: readonly AttackAttempt[]
  provisionalDeaths: readonly ProvisionalDeath[]
  sheriffResults: readonly SheriffResult[]
  investigationResults: readonly InvestigationResult[]
  detectiveResults: readonly DetectiveResult[]
}>
