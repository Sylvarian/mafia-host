import type { PersistedSessionEnvelopeV1, RestoredSessionEnvelopeV1 } from './persisted-session-v1.ts'
import type { RestorePersistedSessionError } from './restore-persisted-session.ts'

export type NoSavedSessionError = Readonly<{ type: 'NO_SAVED_SESSION' }>

export type StorageUnavailableError = Readonly<{
  type: 'STORAGE_UNAVAILABLE'
  operation: 'load' | 'save' | 'clear'
}>

export type StorageReadFailureError = Readonly<{
  type: 'STORAGE_READ_FAILURE'
  errorName: string
}>

export type InvalidJsonError = Readonly<{
  type: 'INVALID_JSON'
}>

export type SaveFailureError =
  | Readonly<{
      type: 'SAVE_FAILURE'
      errorName: string
    }>
  | Readonly<{
      type: 'QUOTA_EXCEEDED'
      errorName: string
    }>
  | StorageUnavailableError

export type ClearFailureError =
  | Readonly<{
      type: 'CLEAR_FAILURE'
      errorName: string
    }>
  | StorageUnavailableError

export type LoadPersistedSessionError =
  | NoSavedSessionError
  | StorageUnavailableError
  | StorageReadFailureError
  | InvalidJsonError
  | RestorePersistedSessionError

export type LoadPersistedSessionResult =
  | Readonly<{ ok: true; value: RestoredSessionEnvelopeV1 }>
  | Readonly<{ ok: false; error: LoadPersistedSessionError }>

export type SavePersistedSessionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; error: SaveFailureError }>

export type ClearPersistedSessionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; error: ClearFailureError }>

export interface GameSessionStore {
  load(): LoadPersistedSessionResult
  save(envelope: PersistedSessionEnvelopeV1): SavePersistedSessionResult
  clear(): ClearPersistedSessionResult
}

export interface SessionClock {
  now(): string
}
