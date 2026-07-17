import { fail, type DomainResult } from '@/domain/game/domain-result.ts'
import { resolveNight } from '@/domain/resolution/night-resolution.ts'
import type { NightResolutionError } from '@/domain/resolution/night-resolution-errors.ts'
import type { NightResolution } from '@/domain/resolution/night-resolution-models.ts'

import type { NightActionCollectionWorkflow } from '../night-actions/night-action-workflow.ts'

export type IncompleteNightActionWorkflowError = Readonly<{
  type: 'NIGHT_ACTION_WORKFLOW_NOT_COMPLETE'
  status: Exclude<NightActionCollectionWorkflow['status'], 'complete'>
}>

export type ResolveCompletedNightWorkflowError =
  NightResolutionError | IncompleteNightActionWorkflowError

export function resolveCompletedNightWorkflow(
  workflow: NightActionCollectionWorkflow,
): DomainResult<NightResolution, ResolveCompletedNightWorkflowError> {
  if (workflow.status !== 'complete') {
    return fail({
      type: 'NIGHT_ACTION_WORKFLOW_NOT_COMPLETE',
      status: workflow.status,
    })
  }

  return resolveNight({
    game: workflow.game,
    collectedActions: workflow.collectedActions,
    previousTargets: workflow.previousTargets,
  })
}
