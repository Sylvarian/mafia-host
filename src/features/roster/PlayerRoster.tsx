import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react'

import type { Player, PlayerId, RosterEditError } from '@/application/game-setup/index.ts'

import './PlayerRoster.css'

type PlayerRosterProps = Readonly<{
  players: readonly Player[]
  participatingPlayerCount: number
  editError: RosterEditError | null
  errorMessage: string | null
  onAddPlayer: (name: string) => void
  onRenamePlayer: (playerId: PlayerId, name: string) => void
  onRemovePlayer: (playerId: PlayerId) => void
  onToggleParticipation: (playerId: PlayerId) => void
}>

export function PlayerRoster({
  players,
  participatingPlayerCount,
  editError,
  errorMessage,
  onAddPlayer,
  onRenamePlayer,
  onRemovePlayer,
  onToggleParticipation,
}: PlayerRosterProps) {
  const [newPlayerName, setNewPlayerName] = useState('')
  const newPlayerNameInputRef = useRef<HTMLInputElement>(null)
  const addNameHasError = editError?.type === 'EMPTY_PLAYER_NAME' && editError.operation === 'add'

  function handleAddPlayer(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    onAddPlayer(newPlayerName)

    if (newPlayerName.trim().length > 0) {
      setNewPlayerName('')
    }

    newPlayerNameInputRef.current?.focus()
  }

  function handleRemovePlayer(playerId: PlayerId): void {
    onRemovePlayer(playerId)
    newPlayerNameInputRef.current?.focus()
  }

  return (
    <section className="roster" aria-labelledby="roster-heading">
      <div className="roster__heading">
        <div>
          <p className="roster__kicker">Step 1</p>
          <h2 id="roster-heading">Player roster</h2>
          <p>Add everyone who may play, then switch this game’s participants on or off.</p>
        </div>
        <div className="roster__counts" aria-label="Roster counts">
          <span>
            <strong>{players.length}</strong> total
          </span>
          <span>
            <strong>{participatingPlayerCount}</strong> participating
          </span>
        </div>
      </div>

      <form className="roster__add-form" onSubmit={handleAddPlayer}>
        <label htmlFor="new-player-name">Player name</label>
        <div className="roster__add-controls">
          <input
            ref={newPlayerNameInputRef}
            id="new-player-name"
            name="new-player-name"
            type="text"
            value={newPlayerName}
            autoComplete="off"
            placeholder="Enter a name"
            aria-invalid={addNameHasError || undefined}
            aria-describedby={addNameHasError ? 'roster-edit-error' : undefined}
            onChange={(event) => {
              setNewPlayerName(event.currentTarget.value)
            }}
          />
          <button type="submit" className="button button--primary">
            Add player
          </button>
        </div>
      </form>

      {errorMessage === null ? null : (
        <p className="roster__error" id="roster-edit-error" role="alert">
          {errorMessage}
        </p>
      )}

      {players.length === 0 ? (
        <div className="roster__empty">
          <p>No players yet.</p>
          <span>Add the first player to begin building this game’s roster.</span>
        </div>
      ) : (
        <ul className="roster__list" aria-label="Players">
          {players.map((player) => (
            <PlayerRosterRow
              key={player.id}
              player={player}
              editError={editError}
              onRenamePlayer={onRenamePlayer}
              onRemovePlayer={handleRemovePlayer}
              onToggleParticipation={onToggleParticipation}
            />
          ))}
        </ul>
      )}

      <p className="roster__participation-summary" aria-live="polite">
        {formatParticipatingPlayerCount(participatingPlayerCount)}
      </p>
    </section>
  )
}

type PlayerRosterRowProps = Readonly<{
  player: Player
  editError: RosterEditError | null
  onRenamePlayer: (playerId: PlayerId, name: string) => void
  onRemovePlayer: (playerId: PlayerId) => void
  onToggleParticipation: (playerId: PlayerId) => void
}>

function PlayerRosterRow({
  player,
  editError,
  onRenamePlayer,
  onRemovePlayer,
  onToggleParticipation,
}: PlayerRosterRowProps) {
  const [renamedValue, setRenamedValue] = useState(player.name)
  const [removalStatus, setRemovalStatus] = useState<'idle' | 'confirming'>('idle')
  const removeButtonRef = useRef<HTMLButtonElement>(null)
  const confirmRemovalButtonRef = useRef<HTMLButtonElement>(null)
  const restoreRemoveButtonFocus = useRef(false)
  const stablePlayerLabel = `${player.name} (${player.id})`
  const renameHasError =
    editError?.type === 'EMPTY_PLAYER_NAME' &&
    editError.operation === 'rename' &&
    editError.playerId === player.id

  useEffect(() => {
    if (removalStatus === 'confirming') {
      confirmRemovalButtonRef.current?.focus()
      return
    }

    if (restoreRemoveButtonFocus.current) {
      restoreRemoveButtonFocus.current = false
      removeButtonRef.current?.focus()
    }
  }, [removalStatus])

  function handleRename(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    const trimmedName = renamedValue.trim()
    onRenamePlayer(player.id, renamedValue)

    if (trimmedName.length > 0) {
      setRenamedValue(trimmedName)
    }
  }

  function cancelRemoval(): void {
    restoreRemoveButtonFocus.current = true
    setRemovalStatus('idle')
  }

  function handleRemovalKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelRemoval()
    }
  }

  return (
    <li
      className={`roster-player${player.playing ? '' : ' roster-player--not-playing'}`}
      aria-label={`Roster entry ${player.name}, ID ${player.id}`}
    >
      <div className="roster-player__topline">
        <label className="participation-toggle">
          <input
            type="checkbox"
            checked={player.playing}
            aria-label={`${stablePlayerLabel} participation`}
            onChange={() => {
              onToggleParticipation(player.id)
            }}
          />
          <span className="participation-toggle__control" aria-hidden="true" />
          <span className="participation-toggle__label">
            {player.playing ? 'Playing' : 'Not playing'}
          </span>
        </label>
        <span className="roster-player__identity">ID {player.id}</span>
      </div>

      <form className="roster-player__rename" onSubmit={handleRename}>
        <label htmlFor={`rename-${player.id}`}>Rename {stablePlayerLabel}</label>
        <div>
          <input
            id={`rename-${player.id}`}
            type="text"
            value={renamedValue}
            aria-invalid={renameHasError || undefined}
            aria-describedby={renameHasError ? 'roster-edit-error' : undefined}
            onChange={(event) => {
              setRenamedValue(event.currentTarget.value)
            }}
          />
          <button type="submit" className="button button--secondary">
            Save name
          </button>
        </div>
      </form>

      {removalStatus === 'idle' ? (
        <button
          ref={removeButtonRef}
          type="button"
          className="button button--danger-quiet roster-player__remove"
          aria-label={`Remove ${stablePlayerLabel}`}
          onClick={() => {
            setRemovalStatus('confirming')
          }}
        >
          Remove {player.name}
        </button>
      ) : (
        <div
          className="removal-confirmation"
          role="alertdialog"
          aria-label={`Remove ${stablePlayerLabel}?`}
          onKeyDown={handleRemovalKeyDown}
        >
          <p>Remove {stablePlayerLabel} from this session’s roster?</p>
          <div>
            <button
              ref={confirmRemovalButtonRef}
              type="button"
              className="button button--danger"
              onClick={() => {
                onRemovePlayer(player.id)
              }}
            >
              Yes, remove
            </button>
            <button type="button" className="button button--secondary" onClick={cancelRemoval}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function formatParticipatingPlayerCount(count: number): string {
  return `${String(count)} participating ${count === 1 ? 'player' : 'players'}`
}
