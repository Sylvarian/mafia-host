import { useEffect, useReducer, useRef } from 'react'

import {
  beginFirstNight,
  continueNightActionCollection,
  createNightActionCollectionWorkflow,
  editNightAction,
  finaliseNightActionCollection,
  previousNightActionCollection,
  selectNightActionTarget,
  type ActiveNightActionCollectionWorkflow,
  type NightActionCollectionError,
  type PlayerId as NightPlayerId,
  type RoleInstanceId,
} from '@/application/night-actions/index.ts'
import {
  acknowledgePrivateNightResult,
  beginNightResultPresentation,
  nextPrivateNightResult,
  prepareDawnAnnouncement,
  previousPrivateNightResult,
  selectNightPresentationView,
  type NightPresentationError,
  type NightPresentationWorkflow,
  type PrivateNightResultId,
} from '@/application/night-presentation/index.ts'

import {
  assignRoleDistribution,
  confirmRoleDistribution,
  createRoleDistributionWorkflow,
  reassignRoleDistribution,
  setCardDelivered,
  type ConfirmedRoleDistributionWorkflow,
  type DistributingRolesWorkflow,
  type PlayerId,
  type RoleAssignmentDependencies,
  type RoleDistributionError,
} from '@/application/role-assignment/index.ts'

import {
  createGameSetupWorkflow,
  getParticipatingPlayerCount,
  inspectGameSetupDraft,
  reduceGameSetupWorkflow,
  type GameSettingKey,
  type RoleId,
} from '@/application/game-setup/index.ts'
import { DawnPresentation, getNightPresentationErrorMessage } from '@/features/dawn/index.ts'
import { PlayerRoster } from '@/features/roster/index.ts'
import { getNightActionCollectionErrorMessage, NightRunner } from '@/features/night-runner/index.ts'
import {
  getRoleDistributionErrorMessage,
  RoleDistribution,
} from '@/features/role-distribution/index.ts'

import { GameSettingsForm } from './GameSettingsForm.tsx'
import { PreparedSetupSummary } from './PreparedSetupSummary.tsx'
import { RoleCountSetup } from './RoleCountSetup.tsx'
import { SetupReadiness } from './SetupReadiness.tsx'
import {
  getRoleEditErrorMessage,
  getRosterEditErrorMessage,
  selectRoleCountEditError,
  selectRosterEditError,
} from './setup-edit-error.ts'

import './GameSetup.css'

type ActiveDistributionWorkflow = DistributingRolesWorkflow | ConfirmedRoleDistributionWorkflow

type DistributionFeatureState =
  | Readonly<{
      status: 'not-started'
      error: RoleDistributionError | null
    }>
  | Readonly<{
      status: 'active'
      workflow: ActiveDistributionWorkflow
      error: RoleDistributionError | null
    }>

type DistributionFeatureAction =
  | Readonly<{ type: 'WORKFLOW_UPDATED'; workflow: ActiveDistributionWorkflow }>
  | Readonly<{ type: 'OPERATION_FAILED'; error: RoleDistributionError }>
  | Readonly<{ type: 'RESET' }>

type GameSetupProps = Readonly<{
  roleAssignmentDependencies: RoleAssignmentDependencies
}>

type NightFeatureState = Readonly<{
  workflow: ActiveNightActionCollectionWorkflow | null
  error: NightActionCollectionError | null
}>

type NightFeatureAction =
  | Readonly<{
      type: 'WORKFLOW_UPDATED'
      workflow: ActiveNightActionCollectionWorkflow
    }>
  | Readonly<{ type: 'OPERATION_FAILED'; error: NightActionCollectionError }>
  | Readonly<{ type: 'RESET' }>

type NightPresentationFeatureState = Readonly<{
  workflow: NightPresentationWorkflow | null
  error: NightPresentationError | null
}>

type NightPresentationFeatureAction =
  | Readonly<{
      type: 'WORKFLOW_UPDATED'
      workflow: NightPresentationWorkflow
    }>
  | Readonly<{ type: 'OPERATION_FAILED'; error: NightPresentationError }>
  | Readonly<{ type: 'RESET' }>

const initialDistributionState: DistributionFeatureState = {
  status: 'not-started',
  error: null,
}

const initialNightState: NightFeatureState = { workflow: null, error: null }
const initialNightPresentationState: NightPresentationFeatureState = {
  workflow: null,
  error: null,
}

export function GameSetup({ roleAssignmentDependencies }: GameSetupProps) {
  const [workflow, dispatch] = useReducer(
    reduceGameSetupWorkflow,
    undefined,
    createGameSetupWorkflow,
  )
  const [distributionState, dispatchDistribution] = useReducer(
    reduceDistributionFeatureState,
    initialDistributionState,
  )
  const [nightState, dispatchNight] = useReducer(reduceNightFeatureState, initialNightState)
  const [nightPresentationState, dispatchNightPresentation] = useReducer(
    reduceNightPresentationFeatureState,
    initialNightPresentationState,
  )
  const identityOperationPendingRef = useRef(false)
  const nightOperationPendingRef = useRef(false)
  const presentationOperationPendingRef = useRef(false)

  useEffect(() => {
    identityOperationPendingRef.current = false
  }, [distributionState])

  useEffect(() => {
    nightOperationPendingRef.current = false
  }, [nightState])

  useEffect(() => {
    presentationOperationPendingRef.current = false
  }, [nightPresentationState])

  if (workflow.status === 'ready') {
    if (nightPresentationState.workflow !== null) {
      const activePresentationWorkflow = nightPresentationState.workflow

      return (
        <DawnPresentation
          view={selectNightPresentationView(activePresentationWorkflow)}
          error={nightPresentationState.error}
          onAcknowledgeResult={(resultId: PrivateNightResultId) => {
            applyPresentationOperation(() =>
              acknowledgePrivateNightResult(activePresentationWorkflow, resultId),
            )
          }}
          onPreviousResult={() => {
            applyPresentationOperation(() => previousPrivateNightResult(activePresentationWorkflow))
          }}
          onNextResult={() => {
            applyPresentationOperation(() => nextPrivateNightResult(activePresentationWorkflow))
          }}
          onPrepareDawn={() => {
            applyPresentationOperation(() => prepareDawnAnnouncement(activePresentationWorkflow))
          }}
        />
      )
    }

    if (nightState.workflow !== null) {
      const activeNightWorkflow = nightState.workflow

      return (
        <NightRunner
          workflow={activeNightWorkflow}
          error={nightState.error}
          onSelectTarget={(targetPlayerId: NightPlayerId) => {
            applyNightOperation(() => selectNightActionTarget(activeNightWorkflow, targetPlayerId))
          }}
          onContinue={() => {
            applyNightOperation(() => continueNightActionCollection(activeNightWorkflow))
          }}
          onPrevious={() => {
            applyNightOperation(() => previousNightActionCollection(activeNightWorkflow))
          }}
          onEditAction={(actorRoleInstanceId: RoleInstanceId) => {
            applyNightOperation(() => editNightAction(activeNightWorkflow, actorRoleInstanceId))
          }}
          onFinalise={() => {
            applyNightOperation(() => finaliseNightActionCollection(activeNightWorkflow))
          }}
          resolutionErrorMessage={
            nightPresentationState.error === null
              ? null
              : getNightPresentationErrorMessage(nightPresentationState.error)
          }
          onResolveNight={() => {
            applyPresentationOperation(
              () => beginNightResultPresentation(activeNightWorkflow),
              true,
            )
          }}
        />
      )
    }

    if (distributionState.status === 'active') {
      const activeWorkflow = distributionState.workflow

      return (
        <RoleDistribution
          workflow={activeWorkflow}
          error={distributionState.error}
          beginNightErrorMessage={
            nightState.error === null
              ? null
              : getNightActionCollectionErrorMessage(nightState.error)
          }
          onCardDeliveryChange={(playerId: PlayerId, delivered: boolean) => {
            applyDistributionResult(setCardDelivered(activeWorkflow, playerId, delivered))
          }}
          onConfirmDistribution={() => {
            applyDistributionResult(confirmRoleDistribution(activeWorkflow))
          }}
          onReassignRoles={() => {
            applyIdentityOperation(() =>
              reassignRoleDistribution(activeWorkflow, roleAssignmentDependencies, true),
            )
          }}
          onAbandonGame={() => {
            dispatchNight({ type: 'RESET' })
            dispatchDistribution({ type: 'RESET' })
            dispatch({ type: 'RETURN_TO_SETUP' })
          }}
          onBeginFirstNight={() => {
            applyNightOperation(
              () => beginFirstNight(createNightActionCollectionWorkflow(activeWorkflow)),
              true,
            )
          }}
        />
      )
    }

    return (
      <PreparedSetupSummary
        setup={workflow.validatedSetup}
        assignmentErrorMessage={
          distributionState.error === null
            ? null
            : getRoleDistributionErrorMessage(distributionState.error)
        }
        onAssignRoles={() => {
          applyIdentityOperation(() =>
            assignRoleDistribution(
              createRoleDistributionWorkflow(workflow.validatedSetup),
              roleAssignmentDependencies,
            ),
          )
        }}
        onReturnToSetup={() => {
          dispatchDistribution({ type: 'RESET' })
          dispatch({ type: 'RETURN_TO_SETUP' })
        }}
      />
    )
  }

  const validation = inspectGameSetupDraft(workflow.draft)
  const rosterEditError = selectRosterEditError(workflow.editError)
  const roleCountEditError = selectRoleCountEditError(workflow.editError)

  function setRoleCount(roleId: RoleId, count: number): void {
    dispatch({ type: 'SET_ROLE_COUNT', roleId, count })
  }

  function setGameSetting(setting: GameSettingKey, value: boolean): void {
    dispatch({ type: 'SET_GAME_SETTING', setting, value })
  }

  function applyDistributionResult(
    result:
      | Readonly<{ ok: true; value: ActiveDistributionWorkflow }>
      | Readonly<{ ok: false; error: RoleDistributionError }>,
  ): void {
    dispatchDistribution(
      result.ok
        ? { type: 'WORKFLOW_UPDATED', workflow: result.value }
        : { type: 'OPERATION_FAILED', error: result.error },
    )
  }

  function applyIdentityOperation(
    operation: () =>
      | Readonly<{ ok: true; value: ActiveDistributionWorkflow }>
      | Readonly<{ ok: false; error: RoleDistributionError }>,
  ): void {
    if (identityOperationPendingRef.current) {
      return
    }

    identityOperationPendingRef.current = true

    try {
      applyDistributionResult(operation())
    } catch (error: unknown) {
      identityOperationPendingRef.current = false
      throw error
    }
  }

  function applyNightOperation(
    operation: () =>
      | Readonly<{
          ok: true
          value: ActiveNightActionCollectionWorkflow
        }>
      | Readonly<{ ok: false; error: NightActionCollectionError }>,
    clearDistributionOnSuccess = false,
  ): void {
    if (nightOperationPendingRef.current) {
      return
    }

    nightOperationPendingRef.current = true

    try {
      const result = operation()
      dispatchNight(
        result.ok
          ? { type: 'WORKFLOW_UPDATED', workflow: result.value }
          : { type: 'OPERATION_FAILED', error: result.error },
      )

      if (result.ok && clearDistributionOnSuccess) {
        dispatchDistribution({ type: 'RESET' })
      }
    } catch (error: unknown) {
      nightOperationPendingRef.current = false
      throw error
    }
  }

  function applyPresentationOperation(
    operation: () =>
      | Readonly<{ ok: true; value: NightPresentationWorkflow }>
      | Readonly<{ ok: false; error: NightPresentationError }>,
    clearNightOnSuccess = false,
  ): void {
    if (presentationOperationPendingRef.current) {
      return
    }

    presentationOperationPendingRef.current = true

    try {
      const result = operation()
      dispatchNightPresentation(
        result.ok
          ? { type: 'WORKFLOW_UPDATED', workflow: result.value }
          : { type: 'OPERATION_FAILED', error: result.error },
      )

      if (result.ok && clearNightOnSuccess) {
        dispatchNight({ type: 'RESET' })
      }
    } catch (error: unknown) {
      presentationOperationPendingRef.current = false
      throw error
    }
  }

  return (
    <div className="game-setup">
      <PlayerRoster
        players={workflow.draft.roster}
        participatingPlayerCount={getParticipatingPlayerCount(workflow.draft)}
        editError={rosterEditError}
        errorMessage={getRosterEditErrorMessage(rosterEditError)}
        onAddPlayer={(name) => {
          dispatch({ type: 'ADD_PLAYER', name })
        }}
        onRenamePlayer={(playerId, name) => {
          dispatch({ type: 'RENAME_PLAYER', playerId, name })
        }}
        onRemovePlayer={(playerId) => {
          dispatch({ type: 'REMOVE_PLAYER', playerId })
        }}
        onToggleParticipation={(playerId) => {
          dispatch({ type: 'TOGGLE_PLAYER_PARTICIPATION', playerId })
        }}
      />

      <RoleCountSetup
        roleCounts={workflow.draft.roleCounts}
        editError={roleCountEditError}
        errorMessage={getRoleEditErrorMessage(roleCountEditError)}
        onSetRoleCount={setRoleCount}
        onIncrementRoleCount={(roleId) => {
          dispatch({ type: 'INCREMENT_ROLE_COUNT', roleId })
        }}
        onDecrementRoleCount={(roleId) => {
          dispatch({ type: 'DECREMENT_ROLE_COUNT', roleId })
        }}
      />

      <GameSettingsForm settings={workflow.draft.settings} onSettingChange={setGameSetting} />

      <SetupReadiness
        validation={validation}
        onPrepareGame={() => {
          dispatch({ type: 'PREPARE_GAME' })
        }}
      />
    </div>
  )
}

function reduceDistributionFeatureState(
  state: DistributionFeatureState,
  action: DistributionFeatureAction,
): DistributionFeatureState {
  switch (action.type) {
    case 'WORKFLOW_UPDATED':
      return { status: 'active', workflow: action.workflow, error: null }
    case 'OPERATION_FAILED':
      return { ...state, error: action.error }
    case 'RESET':
      return initialDistributionState
  }
}

function reduceNightFeatureState(
  state: NightFeatureState,
  action: NightFeatureAction,
): NightFeatureState {
  switch (action.type) {
    case 'WORKFLOW_UPDATED':
      return { workflow: action.workflow, error: null }
    case 'OPERATION_FAILED':
      return { ...state, error: action.error }
    case 'RESET':
      return initialNightState
  }
}

function reduceNightPresentationFeatureState(
  state: NightPresentationFeatureState,
  action: NightPresentationFeatureAction,
): NightPresentationFeatureState {
  switch (action.type) {
    case 'WORKFLOW_UPDATED':
      return { workflow: action.workflow, error: null }
    case 'OPERATION_FAILED':
      return { ...state, error: action.error }
    case 'RESET':
      return initialNightPresentationState
  }
}
