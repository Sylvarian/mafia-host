# Mafia Host — Phased Implementation Plan

**Companion authority:** `GAME_RULES_AND_PRODUCT_SPEC.md`  
**Target stack:** Vite, React, TypeScript, Vitest, Playwright, GitHub Actions, GitHub Pages  
**Persistence:** One versioned local active-session save implemented in Phase 6.5<br>
**Backend:** None

---

## 1. Delivery strategy

Build the application as a host-only static web app with a framework-independent game engine.

Dependency direction:

```text
features/UI
    ↓
application commands and selectors
    ↓
domain rules engine

infrastructure adapters
    ↓
application/domain interfaces
```

Hard rules:

- React components do not resolve game mechanics.
- Feature slices do not import internals from other feature slices.
- Domain code does not import React, browser APIs, or infrastructure.
- Randomness is injected.
- Every implemented role interaction has a Vitest scenario.
- No database, backend, Redux, authentication, or player networking in the initial scope.
- Do not implement unresolved rules by guessing.

---

## Phase 0 — Repository and authority foundation

### Goal

Create a stable repository Codex can modify safely.

### Work

- Create Vite React TypeScript project.
- Initialise Git repository.
- Add:
  - `GAME_RULES_AND_PRODUCT_SPEC.md`
  - `IMPLEMENTATION_PLAN.md`
  - `AGENTS.md`
  - `README.md`
- Configure:
  - TypeScript strict mode
  - ESLint
  - Prettier or a single agreed formatter
  - Vitest
  - React Testing Library
- Add path aliases.
- Establish folders:
  - `src/domain`
  - `src/application`
  - `src/features`
  - `src/shared`
  - `tests/e2e`
- Add an architecture-boundary test or dependency checker.
- Add CI workflow for:
  - install
  - typecheck
  - lint
  - unit tests
  - production build

### Required rule decisions

None for scaffolding.

### Acceptance criteria

- `npm ci` succeeds.
- `npm run typecheck` succeeds.
- `npm test` succeeds.
- `npm run build` succeeds.
- CI runs on pull requests and pushes to `main`.
- A deliberate forbidden import causes the architecture check to fail.

---

## Phase 1 — Core domain model and phase machine

### Goal

Represent a game without building role behaviour yet.

### Work

Implement domain types for:

- Player
- Game player
- Role definition
- Role instance
- Faction
- Game settings
- Game phase
- Night number/day number
- Trial vote
- Death record
- Personal and faction win records

Implement:

- Explicit game phase machine
- Allowed phase transitions
- Command/result pattern
- Immutable reducer or event-application mechanism
- Injected random source interface
- Deterministic test random source
- Domain invariants

Suggested commands:

```ts
type GameCommand =
  | { type: "CREATE_GAME"; payload: CreateGameInput }
  | { type: "CONFIRM_ROLE_DISTRIBUTION" }
  | { type: "ENTER_NIGHT" }
  | { type: "SUBMIT_NIGHT_ACTION"; payload: NightActionInput }
  | { type: "RESOLVE_NIGHT" }
  | { type: "ENTER_DAY" }
  | { type: "START_TRIAL"; accusedId: PlayerId }
  | { type: "SUBMIT_TRIAL_VOTE"; payload: TrialVoteInput }
  | { type: "RESOLVE_TRIAL" }
  | { type: "ADVANCE_TO_NEXT_NIGHT" };
```

### Tests

- Invalid phase transitions fail.
- Game state cannot contain duplicate player assignments.
- Dead players cannot act.
- Commands reject invalid actors and targets.
- Domain has no React/browser imports.

### Acceptance criteria

- A test can create a game state and move through an empty phase cycle.
- All transitions are explicit and exhaustively typed.

---

## Phase 2 — Player roster and game setup UI

### Goal

Let the host prepare participants and role counts.

### Work

Build `features/roster`:

- Add player
- Rename player
- Remove player
- Toggle playing on/off
- Participating count

Build `features/game-setup`:

- Role count controls
- Game-setting toggles
- Selected-role total
- Setup validation
- Start Game button
- Validation error summary

Initial role registry should contain all named roles, but roles not yet implemented must be marked unavailable.

### UI requirements

- Large touch-friendly controls
- Clear count mismatch warning
- Disable Start Game until valid
- Do not hide non-participating players
- Confirm destructive roster removal

### Tests

- Toggling a player updates participant count.
- Role count must equal participants.
- Unique-role maximums are enforced.
- Settings map correctly into `GameSettings`.

### Acceptance criteria

- Host can create a valid fixed-role setup.
- No actual game can start with mismatched counts.

---

## Phase 3 — Role assignment and physical card distribution

### Goal

Randomly assign selected fixed roles to participating players.

### Work

- Expand selected role counts into role instances.
- Shuffle using injected random source.
- Assign one role instance per participating player.
- Assign duplicate ordinals.
- Assign Executioner targets provisionally behind a feature flag.
- Build host-only assignment screen.
- Add “Card given” confirmation per player.
- Require all cards confirmed before Enter Night is enabled.
- Add restart assignment before the game begins.

### Tests

- Every player receives exactly one selected role.
- No role instance is assigned twice.
- Same seeded random source yields same assignment.
- Duplicate role ordinals remain stable.
- Non-participating players receive no role.

### Acceptance criteria

- Host can distribute physical role cards from a clear assignment list.
- Game cannot begin before distribution is confirmed.

---

## Phase 4 — Night action collection framework

### Goal

Guide the host through each living role's action without resolving outcomes yet.

### Work

Create generic role-action metadata:

- Has night action
- Target rules
- Can target self
- Can target dead players
- Can skip
- Physical collection order
- Duplicate role label
- Host prompt

Build `features/night-runner`:

- Executioner briefing step placeholder
- Mafia group overview
- Godfather action
- Framer action
- Consort action
- Consigliere action
- Serial Killer action
- Doctor action
- Sheriff action
- Investigator action
- Detective action
- Previous/next navigation before final resolution
- Summary of all submitted actions
- Confirm Resolve Night

Implement target validation:

- Living targets only unless role says otherwise
- Doctor self-target setting
- Per-Doctor previous-target restriction
- Actor cannot act when dead
- No duplicate submission for one role instance/night

### Tests

- Correct living actors appear in sequence.
- Dead roles are omitted.
- Duplicate roles appear as separate numbered steps.
- Invalid targets are disabled/rejected.
- Host can revise an earlier target before resolving.

### Required rule decisions

- R-002 is decided: omit Godfather and Serial Killer action steps entirely on a disabled first night.
- Initial physical role order

### Acceptance criteria

- A complete night's actions can be collected and reviewed with no mechanics resolved in React.

---

## Phase 5 — Core night resolution engine

### Goal

Convert a canonical completed Phase 4 action batch into a deterministic, immutable resolution
result without applying it to the active game.

### Work

Implement pure domain modules:

- `role-blocks`
- `frames`
- `visits`
- `protections`
- `attacks`
- `investigation-results`
- `night-resolution`

Implement first set of interactions:

- Consort role-block attempts and immunity
- Successful blocked-actor records
- Final visits
- Godfather attack
- Serial Killer attack
- Framer frame
- Doctor protection
- Sheriff result
- Investigator result group
- Consigliere result group
- Detective final visit

Implement permanent investigation-group data.

Resolution returns one canonical structured result:

```ts
type NightResolution = {
  gameId: GameId;
  nightNumber: number;
  roleBlockAttempts: RoleBlockAttempt[];
  blockedActors: BlockedActorRecord[];
  finalVisits: VisitRecord[];
  frames: FrameRecord[];
  protections: ProtectionRecord[];
  attackAttempts: AttackAttempt[];
  provisionalDeaths: ProvisionalDeath[];
  sheriffResults: SheriffResult[];
  investigationResults: InvestigationResult[];
  detectiveResults: DetectiveResult[];
};
```

The result does not contain an updated `GameState`, Dawn prose, public role-reveal decisions,
Executioner conversion, Jester effects, personal or faction wins, or a next phase. Provisional
deaths are not applied, every active-game `alive` value remains unchanged, and the game remains in
`night-action-collection` for Phase 6.

### Required rule decisions

- Implement decided R-001 through R-005 exactly as recorded in the rules specification.
- Use the decided permanent Groups A through D; Group D contains four roles.
- R-006 through R-012 are outside Phase 5 and must remain unresolved.

### Tests

At minimum:

- Framed Town appears suspicious.
- Framed target receives Group A.
- Blocked role produces no ability effect.
- Blocked player visits nobody.
- Doctor stops applicable attack.
- Doctor repeat restriction is per Doctor.
- Investigator and Consigliere share group logic.
- Detective sees final successful target.
- Disabled first-night Godfather and Serial Killer roles produce no action, visit, or attack attempt.
- Multiple simultaneous actions resolve independently of collection order.

### Acceptance criteria

- Domain tests can resolve a full night without rendering UI.
- Resolution is deterministic and independent of caller action-array order.
- The input game and action batch remain unchanged.
- The active game remains in `night-action-collection` with deaths unapplied.
- Phase 6 presentation and state application are not started.

---

## Phase 6 — Dawn and private-result communication

**Status: Implemented for the scoped private-result, resolution-application, and Dawn boundary.**

### Goal

Help the host communicate night outcomes using physical cards/paper.

### Work

Build `features/dawn`:

- Private result queue before public wake-up
- Sheriff result
- Investigator card/group
- Consigliere card/group
- Detective tracked visit
- Explicit acknowledgement of every private result
- Deliberate host-only privacy confirmation before Dawn
- Immutable provisional-death application
- Minimal per-Doctor submitted-target history
- Public-safe death summary
- Role reveal on/off handling
- Stop in `dawn-announcement`

For Investigator/Consigliere:

- Display the exact reusable three-or-four-role card to hold up.
- Do not generate setup-specific groups.
- Keep result groups stable.

### Tests

- Public output excludes hidden roles when setting is off.
- Private output contains only actual player-facing investigative results.
- Deaths are not applied before private results are complete.
- Doctor history records submitted selections even when blocked or killed.
- Quiet-night announcement appears when no deaths.
- Result queue contains only living actors whose actions produced results.
- No hidden attack, block, frame, or protection data reaches Dawn.

### Acceptance criteria

- Host can conduct all private result reveals without consulting handwritten notes.
- The active game finishes in `dawn-announcement`.
- Phase 7 controls, neutral effects, and victory evaluation are not started.

---

## Phase 6.5 — Versioned local session persistence and refresh recovery

**Status: Implemented.**

### Goal

Allow one host-operated active session to resume on the same browser profile and device after a
refresh, tab/browser restart, or return to the deployed GitHub Pages site.

### Work

- Move cross-phase authority into one application-owned discriminated session union.
- Persist successful authoritative transitions under `mafia-host:active-session:v1`.
- Define a schema-version-1 envelope with a canonical timestamp and exhaustive stage union.
- Treat JSON as untrusted and explicitly validate/canonicalise setup, distribution, night-action,
  night-presentation, and Dawn stages.
- Rebuild derived workflow sequence, progress, registry metadata, result cards, and public views.
- Show a public-safe resume screen and require host acknowledgement before private information.
- Provide confirmed delete/start-new/abandon controls with safe storage-failure handling.
- Keep save failures visible and non-blocking while the in-memory game continues.
- Discard action, resolution, private-result, and acknowledgement material from Dawn saves.
- Document unencrypted local privacy, one-tab operation, and the lack of backend/cloud sync.

### Tests

- Envelope version, timestamp, shape, extra-field, immutability, and canonical ownership tests.
- Browser adapter success and unavailable/read/write/quota/clear failure tests.
- Round trips for every Phase 2–6 authoritative workflow status.
- Forged acknowledgement, cross-game, stage/phase, and private-Dawn rejection tests.
- React refresh/remount coverage at setup, partial distribution, mid-night collection, private
  presentation, and Dawn.
- Strict Mode deduplication, save failure/retry, delete/cancel, invalid/incompatible recovery, and
  privacy regressions.

### Acceptance criteria

- A valid saved session resumes the exact authoritative stage only after host acknowledgement.
- Invalid and unsupported saves never become authoritative or disappear automatically.
- Dawn persistence contains only its active game, participants, and structured public announcement.
- The app remains a static Vite/GitHub Pages application with no backend or Phase 7 behavior.

---

## Phase 7 — Day dashboard, Mayor, trial, and voting

### Goal

Run the public daytime process.

### Work

Build `features/day-dashboard`:

- Player list
- Alive/dead status
- Public role reveal where applicable
- Trial buttons
- Confirm Mayor reveal
- Advance to Night

Build `features/trial`:

- Accused-player modal
- Guilty/Innocent/Abstain vote entry per eligible living voter
- Vote weights
- Mayor weight of 3 after confirmation
- Weighted totals
- Tie handling
- Execute/Acquit result
- Host confirmation

On execution:

- Mark player dead
- Reveal role according to setting
- Produce execution announcement
- Trigger neutral personal-win checks
- Continue to next night or game-over review

### Required rule decisions

- R-010
- Whether accused votes
- Tie rule confirmation

### Tests

- Unrevealed Mayor counts as 1.
- Revealed Mayor counts as 3.
- Dead Mayor cannot vote.
- Guilty > Innocent executes.
- Tie acquits.
- Role reveal setting affects public result.
- Acquittal returns to day.
- Execution moves to next night unless a final win is confirmed.

### Acceptance criteria

- Host can run a complete trial with app-calculated vote totals.

---

## Phase 8 — Jester and Executioner

### Goal

Implement personal neutral victories and conversions.

### Work

Executioner:

- Assign valid target at game creation.
- First-night private briefing.
- Detect target execution.
- Record Executioner personal win.
- Convert to Jester when target is killed by specified sources.
- Update future role label/action state.

Jester:

- Detect execution.
- Record personal win without ending main game.
- Choose pending random suicide target using injected random source.
- Resolve suicide at approved point.
- Delay final Mafia victory while suicide is pending.

### Required rule decisions

- R-006
- R-007
- R-008

### Tests

- Executioner never targets self.
- Target follows approved eligibility.
- Executioner wins on target execution.
- Godfather target death converts Executioner.
- Serial target death converts Executioner.
- Converted Executioner behaves as Jester.
- Jester wins only by execution.
- Suicide target is deterministic under seeded random source.
- Pending suicide delays Mafia win.
- Suicide follows approved protection/eligibility rules.

### Acceptance criteria

- Personal wins coexist with continuing faction play.
- No final faction win is announced too early.

---

## Phase 9 — Serial Killer and complete faction win engine

### Goal

Finish neutral killing and authoritative game-over evaluation.

### Work

Implement Serial Killer:

- Night target
- Attack result
- Sheriff result
- Doctor interaction
- Godfather interaction
- Approved personal victory

Implement faction evaluation as a pure module:

```ts
evaluateGameOutcome(gameState, pendingEffects): GameOutcome
```

Evaluation must account for:

- Living Mafia
- Living Town
- Living Serial Killer
- Jester/Executioner personal wins
- Pending Jester suicide
- Role conversions
- Simultaneous deaths

### Required rule decisions

- Implement the already-decided R-001 interaction.
- R-009
- R-011
- R-012

### Tests

Create table-driven tests for all approved count combinations.

Include:

- Town eliminates Mafia and Serial.
- Mafia majority/parity according to final rule.
- Living Serial prevents or permits Mafia victory according to final rule.
- Pending suicide prevents premature game over.
- Simultaneous Godfather/Serial deaths.
- Jester and Executioner wins remain recorded after faction game over.

### Acceptance criteria

- Every reachable end state produces one clear authoritative faction result or “game continues.”

---

## Phase 10 — Undo, correction safety, and game history

### Goal

Protect live games from host misclicks.

### Work

- Represent committed changes as domain events or reversible command records.
- Add:
  - Edit submitted night actions before resolution
  - Edit votes before trial resolution
  - Confirmation screens
  - Undo last committed transition
  - Host-only chronological history
- Prevent undo from creating invalid assignments or duplicated effects.
- Make irreversible boundaries explicit in UI.

### Tests

- Undo night resolution restores alive status, roles, effects, and previous targets.
- Undo execution removes personal win and pending suicide generated by it.
- Redo is optional and not required initially.
- History records host correction events.

### Acceptance criteria

- One accidental click does not require restarting the entire game.

---

## Phase 11 — UX hardening and accessibility

### Goal

Make the app usable in a noisy social setting.

### Work

- Large text and controls
- High contrast
- Dark host-friendly theme
- Fullscreen layout
- Clear current-phase header
- Strong visual distinction between alive and dead
- Disable unavailable controls
- Confirmation for lethal actions
- Keyboard shortcuts:
  - next
  - previous
  - confirm
  - cancel
- Prevent browser back navigation from silently destroying active state.
- Add a “Keep screen awake” enhancement where supported.
- Add responsive laptop layouts.

### Acceptance criteria

- Core hosting flow is usable without precise mouse control.
- Host always knows current role step, actor, target, phase, and whether an action is confirmed.

---

## Phase 12 — End-to-end tests, GitHub Pages, and release

### Goal

Make the project safely usable from any PC.

### Work

Add Playwright scenarios:

1. Create roster and valid setup.
2. Assign and confirm role cards.
3. Run a night with Godfather, Framer, Doctor, Sheriff, Investigator, and Detective.
4. Resolve dawn.
5. Run Mayor-weighted trial.
6. Execute Jester and resolve pending suicide.
7. Reach Town victory.
8. Reach Mafia victory after approved count rules.

GitHub:

- Protect `main` through passing CI where available.
- Add GitHub Pages workflow.
- Configure Vite base path.
- Publish static build.
- Document local usage and deployment.
- Add release checklist.

### Acceptance criteria

- Fresh clone:
  - `npm ci`
  - `npm run dev`
  - `npm test`
  - `npm run build`
- GitHub Pages deployment succeeds.
- Published app runs without a backend.

---

## Phase 13 — Optional crash recovery, not saved games

**Status: Superseded by the implemented Phase 6.5 local active-session recovery.**

### Goal

Reduce accidental loss from a refresh without adding a game database.

### Work

The original optional outline was:

- Store one active-game snapshot in `sessionStorage` or `localStorage`.
- Restore only after schema validation.
- Show:
  - Resume interrupted game
  - Discard interrupted game
- Clear snapshot on confirmed game reset.
- Do not create a saved-game browser/library.

### Acceptance criteria

- Refresh can restore one current game.
- The feature remains removable and separate from domain rules.
- No IndexedDB or backend is introduced.

---

## Recommended PR/branch sequence

```text
feature/project-foundation
feature/domain-phase-machine
feature/player-roster
feature/game-setup
feature/role-assignment
feature/night-action-collection
feature/night-resolution-core
feature/dawn-results
feature/day-trial-mayor
feature/jester-executioner
feature/serial-win-engine
feature/undo-history
feature/ux-hardening
feature/pages-deployment
```

Keep each branch narrow enough that tests and rule changes are reviewable.

---

## Definition of done for each role

A role is not complete until all are true:

- Documented in `GAME_RULES_AND_PRODUCT_SPEC.md`
- Has typed role metadata
- Has action validation
- Has resolution logic
- Has night-runner UI
- Has private/public result handling
- Has interaction tests
- Has duplicate-copy behaviour where allowed
- Has death/blocked behaviour
- Has win-condition effect where applicable
- Has no unresolved rule that changes its behaviour

---

## Codex execution guidance

For each phase, instruct Codex to:

1. Read `AGENTS.md`.
2. Read `GAME_RULES_AND_PRODUCT_SPEC.md`.
3. Read this plan.
4. Implement only the current phase.
5. List assumptions before coding.
6. Refuse to guess unresolved rules; add a failing/pending test or explicit TODO tied to the rule ID.
7. Add tests before or alongside implementation.
8. Run typecheck, lint, unit tests, and build.
9. Report:
   - files changed
   - rules implemented
   - tests added
   - unresolved decisions
   - commands run
10. Do not begin the next phase automatically.

---

## Immediate next actions

Before a later phase implements behaviour governed by these decisions, decide:

- R-006 through R-012 in the rules document; they do not block the result-only Phase 5 scope.
- No permanent-group decision remains: Groups A through D are authoritative and setup-independent.
- Whether Serial Killer is definitely included in the first release.
- Whether vote entry is per player as specified or host-decided manually.

Phases 0–4 can begin while most later rule decisions remain open, provided unresolved roles are not marked complete.
