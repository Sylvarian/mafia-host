import { describe, expect, it } from 'vitest'

import { ROLE_IDS } from '@/domain/roles/role-registry.ts'

import { validateGameSetupDraft } from './game-setup-validation.ts'
import {
  createGameSetupWorkflow,
  reduceGameSetupWorkflow,
  type GameSetupWorkflowState,
} from './game-setup-workflow.ts'

describe('game setup workflow', () => {
  it('refuses to prepare an invalid draft', () => {
    const initial = createGameSetupWorkflow()
    const result = reduceGameSetupWorkflow(initial, { type: 'PREPARE_GAME' })

    expect(result).toBe(initial)
    expect(result.status).toBe('editing')
  })

  it('holds a validated setup in memory and returns to the same editable draft', () => {
    const withPlayer = reduceGameSetupWorkflow(createGameSetupWorkflow(), {
      type: 'ADD_PLAYER',
      name: 'Alice',
    })
    const withRole = reduceGameSetupWorkflow(withPlayer, {
      type: 'INCREMENT_ROLE_COUNT',
      roleId: ROLE_IDS.godfather,
    })
    const ready = reduceGameSetupWorkflow(withRole, { type: 'PREPARE_GAME' })

    expect(ready.status).toBe('ready')
    if (ready.status !== 'ready') {
      throw new Error('Expected a ready setup workflow.')
    }

    expect(ready.validatedSetup.participatingPlayers).toHaveLength(1)
    expect(ready.validatedSetup).not.toHaveProperty('phase')
    const validationResult = validateGameSetupDraft(ready.draft)
    expect(validationResult).toEqual({ ok: true, value: ready.validatedSetup })

    const editing = reduceGameSetupWorkflow(ready, { type: 'RETURN_TO_SETUP' })

    expect(editing.status).toBe('editing')
    expect(editing.draft).toBe(ready.draft)
  })

  it('ignores editing commands while the validated summary is open', () => {
    const ready = createReadyWorkflow()
    const result = reduceGameSetupWorkflow(ready, { type: 'ADD_PLAYER', name: 'Bob' })

    expect(result).toBe(ready)
  })

  it('preparing an already-ready workflow cannot replace or diverge from its snapshot', () => {
    const ready = createReadyWorkflow()
    const preparedAgain = reduceGameSetupWorkflow(ready, { type: 'PREPARE_GAME' })

    expect(preparedAgain).toBe(ready)
    expect(preparedAgain.status).toBe('ready')
    if (preparedAgain.status !== 'ready') {
      throw new Error('Expected the workflow to remain ready.')
    }

    expect(preparedAgain.validatedSetup.participatingPlayers).toEqual(
      preparedAgain.draft.roster.filter((player) => player.playing),
    )
  })
})

function createReadyWorkflow(): GameSetupWorkflowState {
  const withPlayer = reduceGameSetupWorkflow(createGameSetupWorkflow(), {
    type: 'ADD_PLAYER',
    name: 'Alice',
  })
  const withRole = reduceGameSetupWorkflow(withPlayer, {
    type: 'INCREMENT_ROLE_COUNT',
    roleId: ROLE_IDS.godfather,
  })
  return reduceGameSetupWorkflow(withRole, { type: 'PREPARE_GAME' })
}
