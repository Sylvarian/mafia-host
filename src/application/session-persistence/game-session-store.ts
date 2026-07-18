import type {
  PersistedSessionEnvelopeV2,
  RestoredSessionEnvelopeV2,
} from './persisted-session-v2.ts'
import type { MigratePersistedSessionV1Error } from './migrate-persisted-session-v1.ts'
import type { RestorePersistedSessionV2Error } from './restore-persisted-session-v2.ts'

export type NoSavedSessionError = Readonly<{ type: 'NO_SAVED_SESSION' }>

export type StorageUnavailableError = Readonly<{
  type: 'STORAGE_UNAVAILABLE'
  operation: 'load' | 'save' | 'clear'
}>

export type StorageReadFailureError = Readonly<{
  type: 'STORAGE_READ_FAILURE'
  errorName: string
}>

export type InvalidJsonError = Readonly<{ type: 'INVALID_JSON' }>

export type V2WriteFailureAfterMigrationError = Readonly<{
  type: 'V2_WRITE_FAILURE_AFTER_MIGRATION'
  errorName: string
}>

export type LegacyRemovalFailureAfterMigrationError = Readonly<{
  type: 'LEGACY_REMOVAL_FAILURE_AFTER_MIGRATION'
  errorName: string
}>

export type SaveFailureError =
  | Readonly<{ type: 'SAVE_FAILURE'; errorName: string }>
  | Readonly<{ type: 'QUOTA_EXCEEDED'; errorName: string }>
  | StorageUnavailableError

export type ClearFailureError =
  Readonly<{ type: 'CLEAR_FAILURE'; errorName: string }> | StorageUnavailableError

export type LoadPersistedSessionError =
  | NoSavedSessionError
  | StorageUnavailableError
  | StorageReadFailureError
  | InvalidJsonError
  | RestorePersistedSessionV2Error
  | MigratePersistedSessionV1Error
  | V2WriteFailureAfterMigrationError
  | LegacyRemovalFailureAfterMigrationError

export type LoadPersistedSessionResult =
  | Readonly<{ ok: true; value: RestoredSessionEnvelopeV2 }>
  | Readonly<{ ok: false; error: LoadPersistedSessionError }>

export type PersistedSessionRestorerV2 = (
  candidate: unknown,
) =>
  | Readonly<{ ok: true; value: RestoredSessionEnvelopeV2 }>
  | Readonly<{ ok: false; error: RestorePersistedSessionV2Error }>

export type PersistedSessionMigratorV1 = (
  candidate: unknown,
) =>
  | Readonly<{ ok: true; value: PersistedSessionEnvelopeV2 }>
  | Readonly<{ ok: false; error: MigratePersistedSessionV1Error }>

export type SavePersistedSessionResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; error: SaveFailureError }>

export type ClearPersistedSessionResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; error: ClearFailureError }>

export interface GameSessionStore {
  load(): LoadPersistedSessionResult
  save(envelope: PersistedSessionEnvelopeV2): SavePersistedSessionResult
  clear(): ClearPersistedSessionResult
}

export interface SessionClock {
  now(): string
}
