import { fail, succeed, type DomainResult } from '@/domain/game/domain-result.ts'

import {
  createPersistedSessionEnvelopeV2,
  type PersistedSessionEnvelopeV2,
} from './persisted-session-v2.ts'
import {
  restoreSafeLegacySessionAsV2,
  type RestorePersistedSessionV2Error,
} from './restore-persisted-session-v2.ts'

export type MigratePersistedSessionV1Error =
  | Readonly<{ type: 'LEGACY_IN_PROGRESS_NIGHT_INCOMPATIBLE' }>
  | Readonly<{ type: 'STALE_OLD_PRIVATE_RESULT_WORKFLOW' }>
  | Readonly<{
      type: 'MIGRATION_FAILURE'
      error: RestorePersistedSessionV2Error
    }>

export function migratePersistedSessionEnvelopeV1(
  candidate: unknown,
): DomainResult<PersistedSessionEnvelopeV2, MigratePersistedSessionV1Error> {
  if (isUnknownRecord(candidate) && isUnknownRecord(candidate.session)) {
    if (candidate.session.stage === 'night-action') {
      return fail({ type: 'LEGACY_IN_PROGRESS_NIGHT_INCOMPATIBLE' })
    }
    if (candidate.session.stage === 'night-presentation') {
      return fail({ type: 'STALE_OLD_PRIVATE_RESULT_WORKFLOW' })
    }
  }

  const restoreResult = restoreSafeLegacySessionAsV2(candidate)
  return restoreResult.ok
    ? succeed(
        createPersistedSessionEnvelopeV2(restoreResult.value.session, restoreResult.value.savedAt),
      )
    : fail({ type: 'MIGRATION_FAILURE', error: restoreResult.error })
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
