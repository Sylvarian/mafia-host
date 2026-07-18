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
  | { type: "CONFIRM_MAYOR_REVEAL"; mayorId: PlayerId }
  | { type: "EXECUTE_PLAYER"; playerId: PlayerId }
  | { type: "END_DAY_WITHOUT_EXECUTION" }
  | { type: "ADVANCE_TO_NEXT_NIGHT" };
```

Day commands record only deliberate host-confirmed outcomes. The domain and application do not
record nominations, voters, individual verdict votes, totals, or majority calculations.

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
- Leave Executioner target assignment for its finalized prerequisite phase; do not hide an
  incomplete assignment path behind a feature flag.
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

- Keep first-night entry explicitly blocked for a living Executioner with no assigned target; do
  not add a fake or skipped briefing.
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
- R-006 through R-012 are finalized but outside Phase 5. Do not infer or implement those later
  effects inside the ordinary-night result.

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

### Current V1 boundary

V1 recovery is implemented through the first Dawn only. The current Dawn representation requires
the public announcement to cover every dead player and must not be reused unchanged for later
Dawns, where that assumption could reannounce deaths from earlier nights or days.

Before later-day or later-night persistence is implemented, the session contract must distinguish:

- Deaths newly announced at the current Dawn.
- Players who died on earlier nights or days.
- Pending Jester revenge obligations.
- Permanent Jester and Executioner personal wins.
- Executioner targets and conversions.
- Current versus historical public announcements.

The Phase 7 delivery sequence must update the persisted contract deliberately. It may introduce a
new schema version, or an explicit compatible V1 extension only if validation remains unambiguous.
No migration system currently exists.

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
- First-Dawn persistence contains only its active game, participants, and structured current public
  announcement.
- The app remains a static Vite/GitHub Pages application with no backend or Phase 7 behavior.

---

## Phase 7 — Daytime, neutral outcomes, victory, and multi-day loop

**Status: Planned; not started. R-006 through R-012 and the Mayor rules are finalized.**

### Goal

Extend the implemented first-Dawn boundary into a correct multi-day game without combining every
new rule, UI workflow, and persistence change into one review unit.

### Required delivery order

The Phase 7 program must implement or deliberately sequence:

1. Executioner target assignment and briefing.
2. Durable personal-win records.
3. Executioner conversion to Jester.
4. Pending Jester revenge state.
5. Mayor public reveal.
6. Host-managed day controls.
7. Day execution.
8. End day without execution.
9. Victory evaluation.
10. Transition to subsequent nights.
11. Later-Dawn death-announcement boundaries.
12. Persistence changes for multi-day state.

Deliver this program as the focused subphases below. Do not expose a partial workflow that can enter
a state the next subphase cannot resolve safely.

### Phase 7A — Neutral foundations and Executioner briefing

#### Work

- Assign each Executioner one participating Town target using the injected random source before
  the first-night briefing.
- Permit multiple Executioners to share a target while storing each assignment independently.
- Add the private per-Executioner briefing and deliberate host acknowledgement.
- Replace a missing target with explicit validation failure; do not retain a permanent block once
  assignment exists.
- Model durable personal-win records per player and stable role instance, not one global
  neutral-win flag.
- Model Executioner-to-Jester conversion after any non-execution target death without reviving the
  Executioner or retaining the old target.
- Model pending Jester revenge as an explicit obligation without selecting its future victim.
- Preserve duplicate role-instance identity and ordinals through independent wins and conversions.
- Do not introduce a generic effect engine.

#### Tests

- Every Executioner target is a participating Town player.
- Non-Town and non-participating players are ineligible.
- Injected randomness makes assignment deterministic in tests.
- Multiple Executioners may share one target and retain independent assignments.
- Briefing follows assignment and covers every Executioner instance.
- Multiple affected Executioners convert independently after one non-execution target death.
- Conversion preserves the player's alive/dead state, clears the target, and grants no retroactive
  Jester win.

#### Acceptance criteria

- Games containing an Executioner can pass a complete, private target briefing.
- The domain can represent independent permanent wins, conversions, and pending revenge before day
  controls are exposed.

### Phase 7B — Day controls and Mayor reveal

#### Work

- Enter day discussion from the first Dawn.
- Build `features/day-dashboard` with alive/dead state, permitted public roles, host-only role
  context, and explicit current-phase guidance.
- Add deliberate host confirmation of a Mayor's verbal reveal.
- Keep confirmed Mayor reveal public and permanent, including after death.
- Display that a living revealed Mayor counts as three in every player vote.
- Provide only **Execute a player** and **End day without execution** as final-outcome controls.
- Keep nominations, trial count, voters, individual guilty/innocent votes, totals, and majority
  calculations outside the app.

#### Tests

- Mayor reveal requires deliberate host confirmation and does not end discussion or the day.
- A confirmed reveal remains public after later transitions and after death.
- The dashboard shows the three-vote reminder.
- The app exposes no per-voter entry or app-calculated trial result.
- Only living players can be selected for execution.

#### Acceptance criteria

- The host can manage any number of verbal trials and record only the final daytime outcome.

### Phase 7C — Day execution and personal effects

#### Work

- Apply one confirmed day execution and immediately end the day.
- Apply `revealRoleOnDeath` to the public execution result.
- Award every relevant Executioner a permanent personal win for a valid target execution without
  converting them or removing them from play.
- Award an executed Jester a permanent personal win and create pending revenge without selecting a
  victim.
- Never award a Jester win for a night, revenge, or other non-execution death.
- Resolve ordinary Dawn deaths simultaneously, then conversions caused by those deaths.
- Select a pending revenge victim only from the post-ordinary-death survivor list using the injected
  random source.
- Apply revenge as an unavoidable death, resolve conversions caused by it, and clear the obligation.
- Preserve the zero- and one-survivor outcomes with no faction winner.

#### Tests

- Multiple Executioners sharing an executed target all win independently.
- A valid target execution wins rather than converts the Executioner.
- Duplicate Jesters retain independent personal-win records.
- A Jester killed by another Jester's revenge does not win.
- A revenge victim acts normally before Dawn and is selected only after ordinary deaths.
- Doctor protection, role-blocking, mutual-kill immunity, and ordinary attack immunity do not stop
  revenge.
- Revenge public reveal follows `revealRoleOnDeath`.
- No-survivor and one-survivor boundaries clear revenge and preserve existing personal wins.

#### Acceptance criteria

- Execution and Dawn consequences follow one explicit order and cannot declare faction victory
  while revenge remains pending.

### Phase 7D — Victory evaluation and game over

#### Work

Implement faction evaluation as a pure module:

```ts
evaluateGameOutcome(gameState): GameOutcome
```

- Check once after the complete daytime execution consequence sequence.
- At Dawn, check once against the final state after simultaneous ordinary deaths, conversions,
  revenge, further conversions, and clearing the obligation.
- Implement R-009 Serial Killer victory exactly.
- Implement R-011 Town victory exactly.
- Implement R-012 Mafia victory and parity counting exactly.
- Preserve all permanent personal wins alongside faction outcomes.
- End with no faction winner when nobody remains alive.
- Add game-over presentation that distinguishes faction outcomes, permanent personal wins, and no
  faction winner.

#### Tests

- Use table-driven coverage for Town, Mafia, Serial Killer, living Jester, living Executioner,
  pending revenge, parity, multiple Serial Killers, and no-survivor combinations.
- Verify `2 Mafia + 2 Town + 1 Executioner` is a Mafia win when no independent blocker exists.
- Verify `2 Mafia + 2 Town + 1 Jester` is not a Mafia win.
- Verify living Jesters and Executioners do not block Town.
- Verify a living Jester and pending revenge independently block Mafia.
- Verify pending revenge blocks every faction, including Serial Killer.
- Verify simultaneous deaths cannot produce an order-dependent intermediate victory.
- Verify personal wins remain recorded after faction victory or no-faction game over.

#### Acceptance criteria

- Every reachable final state produces one authoritative faction result, no faction winner, or
  “game continues,” without an order-dependent intermediate result.

### Phase 7E — Subsequent-night loop and persistence upgrade

#### Work

- Transition from day completion to the next night when no final outcome exists.
- Reuse the ordinary action collection and resolution rules with incremented night/day counters.
- Define current-Dawn deaths separately from deaths on earlier nights or days.
- Keep current public announcements separate from historical announcements.
- Extend persistence for pending revenge, permanent personal wins, Executioner targets and
  conversions, later-night workflow state, and announcement boundaries.
- Deliberately choose a new schema version or an explicit compatible V1 extension only when
  validation remains unambiguous.
- Do not claim or invent a migration system.
- Retain browser-local, device/profile-specific, unencrypted, single-tab-oriented recovery with no
  backup or cloud synchronization.

#### Tests

- Earlier deaths are not reannounced at a later Dawn.
- Current and historical announcements cannot be confused during restoration.
- Targets, conversions, permanent wins, and pending revenge survive a valid refresh.
- Invalid cross-stage and cross-night combinations are rejected.
- Existing first-Dawn saves remain accepted only under the deliberately chosen version contract.
- Later-night killing actors follow `allowFirstNightKills` only on night one.

#### Acceptance criteria

- A game can complete repeated day/night cycles and recover the exact current state without
  reannouncing historical deaths.

---

## Phase 8 — Undo, correction safety, and game history

### Goal

Protect live games from host misclicks.

### Work

- Represent committed changes as domain events or reversible command records.
- Add:
  - Edit submitted night actions before resolution
  - Cancel or change a selected execution before confirmation
  - Confirmation screens
  - Undo last committed transition
  - Host-only chronological history
- Prevent undo from creating invalid assignments or duplicated effects.
- Make irreversible boundaries explicit in UI.

### Tests

- Undo night resolution restores alive status, roles, effects, and previous targets.
- Undo execution removes every personal win and pending revenge obligation generated by it.
- Redo is optional and not required initially.
- History records host correction events.

### Acceptance criteria

- One accidental click does not require restarting the entire game.

---

## Phase 9 — UX hardening and accessibility

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

## Phase 10 — End-to-end tests, GitHub Pages, and release

### Goal

Make the project safely usable from any PC.

### Work

Add Playwright scenarios:

1. Create roster and valid setup.
2. Assign and confirm role cards.
3. Run a night with Godfather, Framer, Doctor, Sheriff, Investigator, and Detective.
4. Resolve dawn.
5. Confirm Mayor reveal, manually count the verbal vote, and record only the final day outcome.
6. Execute Jester and resolve pending revenge.
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

## Phase 11 — Optional crash recovery, not saved games

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
feature/neutral-foundations
feature/day-controls-mayor
feature/execution-personal-effects
feature/victory-game-over
feature/multiday-persistence
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

Phases 0 through 6.5 are implemented. R-001 through R-012, the permanent investigation groups, and
the Mayor/daytime rules are authoritative and no longer block planning.

When Phase 7 is explicitly requested, begin with Phase 7A. Do not start later subphases
automatically, do not add app-managed voting, and do not reuse the current first-Dawn persistence
representation for a multi-day loop.
