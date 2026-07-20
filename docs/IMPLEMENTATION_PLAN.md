# Mafia Host — Phased Implementation Plan

**Companion authority:** `GAME_RULES_AND_PRODUCT_SPEC.md`  
**Target stack:** Vite, React, TypeScript, Vitest, Playwright, GitHub Actions, GitHub Pages  
**Persistence:** One versioned local active-session save; Phase 7F.2 retains schema V2 with
neutral-state sub-version 4, plus a separate complete next-game setup template<br>
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
record nominations, voters, abstentions, individual verdict votes, totals, thresholds, or trial
history. Phase 7F derives public trial guidance without adding command or game state.

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
- Leave Executioner targets absent during initial assignment and reassignment; Phase 7A assigns
  them only after final physical distribution confirmation.
- Build host-only assignment screen.
- This original per-player delivery design is superseded by Phase 7F.1's single
  **Confirm all role cards delivered** boundary.
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

**Status: Original collect-all/review coordination superseded by Phase 7A.1. Domain action
contracts and target validation remain authoritative.**

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

- Defensively reject a later-phase game whose Executioner target is missing. Phase 7A supplies a
  target-complete game only after the dedicated briefing, so valid Executioner games are no longer
  blocked.
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
- Temporary target selection before confirmation
- One confirmed action per actor

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
- Host can revise the current target before confirmation.

### Required rule decisions

- R-002 is decided: omit Godfather and Serial Killer action steps entirely on a disabled first night.
- Initial physical role order

### Acceptance criteria

- A complete night's actions can be represented by one validated canonical batch with no mechanics
  resolved in React.

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
- Detective final visit from the non-Detective visit ledger

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
- Detective sees the confirmed non-Detective visit; Detective actions are not trackable visits.
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

**Status: Dawn application and public boundary remain implemented. The end-of-night private-result
queue was superseded and removed by Phase 7A.1.**

### Goal

Help the host communicate night outcomes using physical cards/paper.

### Work

Build `features/dawn`:

- One deliberate direct public-Dawn control with an inline eyes-open reminder
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
- Deaths are not applied before the sequential actor workflow is complete.
- Doctor history records unblocked submitted selections even if the Doctor or target dies.
- A blocked Doctor records no new target.
- Quiet-night announcement appears when no deaths.
- No hidden attack, block, frame, or protection data reaches Dawn.

### Acceptance criteria

- Host can cross a deliberate public-Dawn boundary after all immediate outcomes are sealed.
- The active game finishes in `dawn-announcement`.
- Day controls, neutral outcomes beyond target assignment/briefing, and victory evaluation remain
  outside Phase 6 and are still not implemented.

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

Phase 7A extended this V1 contract for Executioner state:

- New game saves require `neutralStateVersion: 1`, canonical Executioner targets, and briefing
  status together.
- Exact deployed Phase 6.5 game-player shapes remain accepted as legacy V1.
- A stage-specific Executioner briefing save retains current index and canonical acknowledgement
  IDs, then rebuilds briefing records during restoration.
- Partially upgraded payloads, forged targets, forged acknowledgements, and unbriefed later-phase
  Executioners are rejected.

Phase 7A.1 replaces current-night authority with schema V2:

- Persist setup, distribution, Executioner briefing, sequential night, current immediate outcome,
  final `night-resolution`, and public Dawn.
- Rebuild canonical sequence, actions, blocks, frames, visits, and immediate outcomes during
  restoration without randomness.
- Reject old V1 in-progress night-action and private-result stages rather than guessing which
  information was communicated.
- Migrate only safe V1 setup, distribution, Executioner briefing, and first-Dawn saves.
- Write V2 before removing a migrated V1 key; preserve V1 when migration or V2 writing fails.

Phase 7C.1 simplifies current V2 night semantics without changing the schema version:

- New non-informational action records contain no fabricated private outcome and advance directly.
- New informational and blocked records retain one visible current outcome until one atomic
  continue-and-advance operation; no acknowledged-screen state is emitted.
- Earlier V2 `Action recorded` and acknowledged states are canonicalized only from exact persisted
  evidence; ambiguous advancement fails closed with a compatibility error.
- Day host-role visibility and derived host-role objects are never emitted and are rejected if
  injected into a save.

### Current V2 boundary

V2 recovery is implemented through repeated nights, private Dawn resolution, public Dawn, later
days, waiting, and game over. Neutral-state sub-version `3` persists explicit death records,
permanent personal wins, Executioner conversions, pending/resolved Jester revenge, and canonical
day-outcome history. Prior
neutral-state V2 saves receive empty defaults only when unambiguous: an exact first-Dawn
announcement can prove night-death causes and conversion evidence, while a prior Day save with a
dead player and no cause evidence fails closed. The current Dawn representation distinguishes:

- Deaths newly announced at the current Dawn.
- Players who died on earlier nights or days.
- Current versus historical public announcements.

Only current-night deaths are announced. No generic migration framework exists.

### Tests

- Envelope version, timestamp, shape, extra-field, immutability, and canonical ownership tests.
- Browser adapter success and unavailable/read/write/quota/clear failure tests.
- Round trips for every current authoritative workflow status.
- Forged/ambiguous legacy acknowledgement, cross-game, stage/phase, and private-Dawn rejection tests.
- React refresh/remount coverage at setup, partial distribution, immediate outcomes,
  blocked outcomes, final night resolution, and Dawn.
- Strict Mode deduplication, save failure/retry, delete/cancel, invalid/incompatible recovery, and
  privacy regressions.

### Acceptance criteria

- A valid saved session resumes the exact authoritative stage only after host acknowledgement.
- Invalid and unsupported saves never become authoritative or disappear automatically.
- First-Dawn persistence contains only its active game, participants, and structured current public
  announcement.
- The app remains a static Vite/GitHub Pages application with no backend or post-7A behavior.

---

## Phase 7 — Daytime, neutral outcomes, victory, and multi-day loop

**Status: Phase 7F.2 implemented; Phase 8 and later are planned. R-006 through R-012 and the Mayor
rules are finalized.**

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

**Status: Implemented for target eligibility, assignment, private briefing, and compatible V1
recovery only.**

#### Work

- Assign each Executioner one participating Town target using the injected random source before
  the first-night briefing.
- Permit multiple Executioners to share a target while storing each assignment independently.
- Add the private per-Executioner briefing and deliberate host acknowledgement.
- Replace a missing target with explicit validation failure; do not retain a permanent block once
  assignment exists.
- Add the explicit Executioner-briefing application session stage and atomically construct Night 1
  only after all briefings are acknowledged.
- Extend V1 persistence with explicit current/legacy shape discrimination, canonical target
  restoration, acknowledgement evidence, and a public-safe resume summary.
- Preserve duplicate role-instance identity and ordinals through independent target relationships.
- Do not introduce a generic effect engine.
- Do not add personal wins, role conversion, Jester revenge, victory, day controls, or later-night
  behavior.

#### Tests

- Every Executioner target is a participating Town player.
- Non-Town and non-participating players are ineligible.
- Injected randomness makes assignment deterministic in tests.
- Multiple Executioners may share one target and retain independent assignments.
- Briefing follows assignment and covers every Executioner instance.
- Target assignment runs once after final distribution and never during render or restoration.
- Briefing navigation, acknowledgement, completion, privacy, persistence, and malformed-state
  rejection are covered directly.
- Phase 7A never creates a personal win, conversion, or revenge obligation.

#### Acceptance criteria

- Games containing an Executioner can pass a complete, private target briefing.
- Games without an Executioner skip the empty briefing and enter Night 1.
- Exact targets and briefing progress survive refresh behind the public-safe recovery gate.
- The domain retains only the narrow target state needed by this phase.

### Phase 7A.1 — Sequential night resolution and host UX corrections

**Status: Implemented.**

#### Work

- Add the then-current bulk card-marking helper without automatic distribution confirmation.
  Phase 7F.1 supersedes that historical two-step behavior with one authoritative bulk
  confirmation and immediate transition.
- Show target display label, role, faction text, alive/availability state, and subtle faction
  treatment through a narrow application view model.
- Replace collect-all/review/private-replay coordination with the canonical sequence: Mafia
  overview, Consorts, Framers, Godfathers, Serial Killers, Doctors, Sheriffs, Investigators,
  Consiglieres, Detectives, final completion.
- Establish Consort block state before later actors; blocked actors still wake and receive an
  explicit BLOCKED outcome but create no action, visit, result, or Doctor history.
- Keep unconfirmed target selection in React only. Confirmation atomically records an action and
  its narrow immediate outcome; Phase 7C.1 below streamlines the later host controls.
- Reuse shared domain frame, Sheriff, investigation-group, visit, block, and Detective mechanics for
  immediate and final results.
- Exclude every Detective action from the trackable visit ledger.
- Resolve ordinary attacks, protections, and provisional deaths only after the final actor, enter
  `night-resolution`, and apply deaths only at the deliberate Dawn boundary.
- Remove the old end-of-night private-result workflow and production code.
- Introduce persistence V2 and narrow explicit V1 migration as described in Phase 6.5.
- Do not add Phase 7B behavior.

#### Tests

- Historical partial, complete, idempotent, frozen-input, undo, Strict Mode, and rapid-click
  delivery coverage. Phase 7F.1 replaces the partial/undo authority with atomic bulk-transition
  coverage.
- Faction-labelled target rows, duplicate-name labels, unavailable states, local selection, and
  public-safe recovery.
- Canonical order, duplicate ordinals, first-night skipping, every blocked actionable role,
  Consort immunity/mutual targeting, immediate results, acknowledgement, and sealing.
- Detective tracking for every visit-producing role, blocked/skipped actors, and multiple
  Detectives; no Detective visit appears in final visits.
- V2 round trips, forged order/outcome/extra-field rejection, safe V1 migrations, incompatible V1
  rejection, migration write ordering, save failure/retry, and public-only Dawn.

#### Acceptance criteria

- No investigative role wakes twice.
- Immediate results agree with final canonical resolution.
- Previous outcomes disappear after the actor is sealed and cannot be edited.
- Ordinary deaths remain hidden and unapplied until Dawn.
- Recovery reveals no current actor, role, target, result, blocked state, or role composition before
  host continuation.
- Phase 7B, personal wins, conversions, revenge, victory, later nights, and backend behavior remain
  unimplemented.

### Phase 7B — Day discussion and Mayor reveal

**Status: Implemented.**

#### Work

- Enter day discussion from the first Dawn.
- Build a public-safe day feature with alive/dead state, permitted public roles, and explicit
  current-phase guidance.
- Add deliberate host confirmation of a Mayor's verbal reveal.
- Keep confirmed Mayor reveal public and permanent, including after death.
- Display that a living revealed Mayor counts as three in every player vote.
- Keep nominations, trial count/history, voters, abstentions, individual guilty/innocent votes,
  totals, and stored thresholds outside the app.
- Add no final-outcome controls, execution, end-day transition, personal effects, victory, or
  next-night loop; stop safely in `day-discussion`.
- Compatibly extend persistence V2 with the exact first-day game and participants while deriving
  public rows and Mayor reminders.

#### Tests

- Mayor reveal requires deliberate host confirmation and does not end discussion or the day.
- A confirmed reveal is the authoritative public role and existing death application preserves it.
- The dashboard shows the three-vote reminder.
- The app exposes no per-voter entry or app-calculated trial result.
- Only living, unrevealed Mayor players appear inside the private reveal boundary.
- Dawn-to-day and successful reveals autosave once under Strict Mode and rapid repeated input.
- Day persistence rejects stale night authority, malformed reveals, phase mismatches, and
  incompatible counters.

#### Acceptance criteria

- The host can manage any number of verbal trials while the app remains safely in day discussion.
- Final daytime-outcome recording remains Phase 7C work.

### Phase 7C — Day execution and personal effects

**Status: Implemented.**

#### Work

- Provide **Execute a player** and **End day without execution** as the only final-outcome controls.
- Record only the host-confirmed final daytime outcome; never record nominations or vote totals.
- Apply one confirmed day execution and immediately end the day.
- Apply `revealRoleOnDeath` to the public execution result.
- Award every relevant Executioner a permanent personal win for a valid target execution without
  converting them or removing them from play.
- Award an executed Jester a permanent personal win and create pending revenge without selecting a
  victim.
- Never award a Jester win for a night, revenge, or other non-execution death.
- Record explicit causes for first-Dawn night deaths and Day 1 execution deaths.
- Resolve every Executioner conversion caused by a proven first-Dawn non-execution death exactly
  once, while retaining original assignment and historical target identity.
- Derive active Jester behavior from explicit conversion records.
- Stop safely in `execution-resolution` without choosing a revenge victim, applying revenge,
  calculating faction victory, presenting game over, or creating another night.
- Extend V2 with the exact neutral outcome state and explicit fail-closed compatibility behavior.

#### Tests

- Multiple Executioners sharing an executed target all win independently.
- A valid target execution wins rather than converts the Executioner.
- Living and dead Executioner owners follow the same finalized win/conversion rules.
- Original and converted Jesters receive one permanent win and one pending obligation when
  executed.
- Night death creates no Jester win.
- Forged, duplicate, contradictory, out-of-order, or partially persisted records fail closed.
- Recovery and the public summary expose no private neutral identities or effects.
- Strict Mode, rapid confirmation, save failure, and retry do not duplicate outcomes or writes.

#### Acceptance criteria

- Execution and proven first-Dawn conversion consequences are atomic, canonically ordered, and
  persistable without exposing private effects. Pending revenge remains unresolved and no faction
  victory is declared.

### Phase 7C.1 — Night-flow click reduction, direct Dawn, and host-only day roles

**Status: Implemented.**

#### Work

- Make Consort, Framer, Godfather, Serial Killer, and Doctor confirmation seal the action and
  advance directly with **Confirm target and continue**.
- Retain exactly one immediate result screen for Sheriff, Investigator, Consigliere, and Detective,
  and one **BLOCKED** screen for blocked actors; one **Continue to next actor** seals and advances.
- Remove fabricated `Action recorded` outcomes, the `Outcome acknowledged` screen, its production
  workflow state, persistence fields, selectors, errors, and translations.
- Replace the Dawn confirmation dialog with one direct **Finalize Dawn** operation and an inline
  eyes-closed reminder because private revenge resolution may precede the public announcement.
- Add a React-only, hidden-by-default day control backed by a separate sanitized host-role selector.
  Converted Executioners show active Jester plus original Executioner, while targets, wins, and
  pending revenge remain excluded.
- Keep all Phase 7C day outcomes and neutral effects unchanged. Do not resolve revenge, evaluate
  victory, present game over, or create a later-night loop.

#### Tests

- Direct advancement and action sealing for all five non-informational roles.
- One result for all four informational roles; one blocked screen for every blockable role.
- Refresh/recovery, failed-save retry, Strict Mode, and rapid repeated operation coverage for the
  night and direct-Dawn boundaries.
- Hidden/shown/hidden host-role UI, warning, active/original Executioner roles, dead players,
  duplicate labels, persistence absence/rejection, public DOM privacy, and responsive ownership.
- Current and legacy V2 canonicalization, ambiguity rejection, fabricated-result rejection, and
  unchanged V1/Phase 7C compatibility.

#### Acceptance criteria

- New saves contain no non-informational private outcome or acknowledged-screen state.
- Host-role data is built only while requested; visibility never enters `GameState`,
  `ActiveAppSession`, recovery metadata, or persistence.
- Dawn remains the same authoritative one-time application boundary, reached in one deliberate
  host action.
- This subphase did not implement Phase 7D; corrected Phase 7D is implemented separately below.

### Phase 7D — Victory evaluation and game over

**Status: Corrected Phase 7D implemented. Pending Jester revenge remains deferred to the next Dawn.**

#### Work

Implement faction evaluation as a pure module:

```ts
evaluateGameOutcome(gameState): GameOutcome
```

- Check once after the complete daytime execution consequence sequence only when no pending Jester
  revenge exists.
- Gate every faction predicate behind complete post-day authority, valid invariants, the exact
  post-day boundary, no prior result, and an empty pending-revenge list.
- When revenge is pending, preserve it unchanged and enter private-safe waiting without selecting a
  victim, applying a death, clearing an obligation, or evaluating a faction.
- At Dawn, check once against the final state after simultaneous ordinary deaths, conversions,
  revenge, further conversions, and clearing the obligation. Phase 7E implements this flow.
- Implement R-009 Serial Killer victory exactly.
- Implement R-011 Town victory exactly.
- Implement R-012 Mafia victory and parity counting exactly.
- Preserve all permanent personal wins alongside faction outcomes.
- End with no faction winner when nobody remains alive.
- Add public-safe game-over presentation for the faction/draw result and existing public reveals.
- Keep personal wins authoritative but private because the specification does not authorize their
  public disclosure.
- Stop in safe non-terminal waiting and expose one deliberate begin-next-night operation.

#### Tests

- Use table-driven coverage for Town, Mafia, Serial Killer, living Jester, living Executioner,
  pending revenge, parity, multiple Serial Killers, and no-survivor combinations.
- Verify `2 Mafia + 2 Town + 1 Executioner` is a Mafia win when no independent blocker exists.
- Verify `2 Mafia + 2 Town + 1 Jester` is not a Mafia win.
- Verify living Jesters and Executioners do not block Town.
- Verify a living Jester and pending revenge independently block Mafia.
- Verify pending revenge blocks every faction, including Serial Killer.
- Verify simultaneous deaths cannot produce an order-dependent intermediate victory.
- Verify personal wins remain recorded after faction victory or no-faction game over and do not
  enter unauthorized public views.
- Verify pending revenge blocks evaluation without victim selection, death, conversion, clearing,
  counter advancement, or a next-night workflow.

#### Acceptance criteria

- Every evaluated final state produces one authoritative faction result, the documented
  no-survivors draw, or safe waiting without an order-dependent intermediate result.
- Pending revenge stops safely at the Phase 7D post-day boundary, and R-006 remains unchanged.

### Phase 7E — Subsequent-night loop and persistence upgrade

**Status: Implemented.**

#### Work

- Transition from day completion to the next night when no final outcome exists.
- Reuse the ordinary action collection and resolution rules with incremented night/day counters.
- Define current-Dawn deaths separately from deaths on earlier nights or days.
- Keep current public announcements separate from historical announcements.
- Extend persistence for pending revenge, permanent personal wins, Executioner targets and
  conversions, later-night workflow state, and announcement boundaries.
- Deliberately choose a new schema version or an explicit compatible V2 extension only when
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
- Ordinary deaths and their conversions are applied before a due Jester revenge; the selected
  victim is persisted before application and is never rerolled on refresh/retry.
- Faction victory is evaluated only after the due revenge is cleared. Non-terminal games enter the
  current numbered public Dawn/day; terminal games skip day discussion.
- Multiple simultaneous pending revenge obligations remain rejected because the one-execution-per-
  day product rules do not define an inter-obligation ordering.

---

### Phase 7F — Day guidance, alignment views, remembered names, and Godfather succession

**Status: Implemented.**

#### Work

- Derive and publicly display the trial threshold as
  `floor(living participating players / 2) + 1`.
- Keep execution verdict authority separate: guilty votes must exceed innocent votes, and a tie is
  innocent. Keep Mayor weighting manual and do not store votes, voters, abstentions, nominations,
  thresholds, or trial history.
- Group the temporary host-only role view under Mafia, Town, and Neutral using active roles,
  textual alignments, and red/green/grey treatments. Show current role/alignment inside the private
  execution boundary without exposing neutral targets, wins, revenge, or night data.
- Phase 7F originally stored a browser-local names-only preference. Phase 7F.1 below supersedes it
  with the complete next-game setup template while retaining narrow migration compatibility.
- At the atomic transition into Night 2 or later, promote one canonical living active Mafia member
  when no living active Godfather exists. Use exactly one injected random sample, persist the
  promotion, preserve original assignment/role instance, rebuild wake order, and remove the old
  active ability.
- Restore an unacknowledged promotion as a generic recovery stage, then show one private briefing.
  Acknowledgement must save before ordinary night actions begin; failure preserves the exact
  briefing and promotion without rerolling.
- Keep schema V2 and advance the nested neutral-state version from 3 to 4. Accept exact Phase 7E
  version-3 saves with empty promotion history and begin succession enforcement on their next
  future night, avoiding any invented historical random selection. Require version-4 promotion
  history to be complete from its recorded cutover.

#### Tests

- Strict-majority boundaries from zero through ten living players, dead-player exclusion, and
  Mayor independence.
- Canonical alignment grouping, active/original role display, hidden-DOM privacy, accessible color
  treatments, and execution details.
- Names-only validation, separate storage key, fresh prefill, clear behavior, active-save
  precedence, and non-blocking preference failures.
- Succession eligibility, duplicate living Godfathers, no-candidate behavior, canonical
  randomness, invalid output, later replacement, wake-order replacement, investigation behavior,
  persistence round-trip, current-history completeness, Phase 7E cutover compatibility, recovery
  privacy, acknowledgement save failure, and replay prevention.

#### Acceptance criteria

- Public day guidance never claims execution uses the trial threshold and no vote-entry state is
  introduced.
- Host-only role visibility and execution selection remain temporary React state.
- The Phase 7F names-only payload contains no role or game authority and never pollutes the
  active-session schema; Phase 7F.1 migrates it deterministically.
- Promotion is authoritative before night actions, never rerolls on restore/retry, and the promoted
  player acts only as Godfather while their immutable original assignment remains available to
  private host views.

---

### Phase 7F.1 — Persisted next-game setup, one-click role cards, and full host-card colours

**Status: Implemented.**

#### Work

- Replace the names-only preference with one exact setup template containing the full ordered
  roster, every participation choice, canonical role counts, and all reusable game settings.
- Save it separately only after successful role assignment begins. Template failure never
  invalidates or rewinds the active match.
- Prefill direct fresh launch, confirmed abandon, and game-over **Start next game** while active
  recovery always takes precedence.
- Replace **Clear remembered names** with **Clear saved setup**; keep the visible setup and active
  save unchanged.
- Read the old names-only key only for deterministic migration using canonical zero-role/default
  setup values.
- Replace per-player delivery flags and controls with one guarded
  **Confirm all role cards delivered** operation that immediately enters Executioner briefing or
  Night 1.
- Keep schema V2 and use exact stage-local `pending`/`complete` bulk delivery status. Restore exact
  old all-delivered evidence as complete and zero/partial evidence as pending; reject duplicate,
  unknown, or mixed delivery authority.
- Apply full light red, green, and grey card backgrounds from the host selector's current active
  Mafia, Town, and Neutral alignment. Keep textual alignment and all privacy boundaries.

#### Tests

- Template exact-shape validation, full prefill/editability, names-only migration, storage
  failures, separate keys, clear behavior, active-recovery precedence, game-over/abandon reuse, and
  absence of match authority.
- One bulk action, no individual controls, direct Executioner/Night transition, rapid/Strict Mode
  guards, save retry without reroll, wrong-stage/already-complete rejection, and new exact
  persistence shape.
- Legacy all/partial/zero, missing, duplicate, unknown, and mixed delivery evidence.
- Full-card Mafia/Town/Neutral classes, promoted Godfather, converted Jester, dead Town,
  alive/dead/original-role retention, hidden-DOM privacy, and responsive CSS ownership.

#### Acceptance criteria

- The last successfully started setup is ready to edit for the next game and contains no match
  progress, IDs, assignments, or delivery state.
- New games always create fresh game, match-player, role-instance, and assignment authority.
- One host confirmation completes role-card delivery without reducing private-delivery
  responsibility.
- Host alignment colors remain private, derived, and non-persistent; public and recovery views
  remain role-safe.

---

### Phase 7F.2 — Opposing killing-role final-two draw

**Status: Implemented.**

#### Work

- At every valid post-day or post-Dawn faction-evaluation boundary, after pending revenge is
  cleared, check for exactly two living active ordinary killing roles before ordinary faction
  predicates.
- Support the canonical active Godfather plus Serial Killer pairing, including a promoted
  Godfather. Preserve same-role and same-faction pairings as non-applicable; reject any future
  unsupported opposing ordinary-killer pairing with a structured domain error instead of
  guessing its outcome.
- Reuse the ordinary Godfather/Serial Killer attack-outcome authority. Disabled mutual killing
  produces `opposing-killers-stalemate` with both players alive and no deaths; enabled mutual
  killing atomically applies two linked `final-killing-role-showdown` deaths and produces
  `opposing-killers-mutual-elimination`.
- Preserve personal wins, original assignments, reveal policy, conversions, counters, and all
  prior history. Do not create another night or collect final targets.
- If succession creates the eligible pair while Night 2 or later is being started, retain the
  private promotion briefing, then settle the draw on acknowledgement before exposing the wake
  sequence. Retry must reuse the exact in-memory terminal payload.
- Keep schema V2 and neutral-state sub-version 4. Extend only the exact draw-reason and death-cause
  unions; restoration validates the selected branch and never simulates or reapplies it.
- Narrowly upgrade pre-7F.2 neutral-state sub-version 2/3/4 saves stopped at an exact eligible
  post-day or post-Dawn final two, and write the canonical terminal envelope before recovery.
- Add public-safe draw explanations without exposing roles, settings, targets, promotion history,
  conversions, personal wins, or raw identities.

#### Tests

- Original and promoted Godfather pairings, both roster orders, both setting branches, linked
  simultaneous death evidence, reveal policy, and no-input mutation.
- Same-faction killers, duplicate Godfathers, multiple Serial Killers, killer/non-killer pairs,
  dead owners, more than two survivors, pending revenge, and all ordinary victory regressions.
- Prior Jester, Executioner, and multiple personal wins remain recorded alongside the draw.
- Post-day and post-Dawn integration, no next-night authority, Strict Mode/rapid actions,
  save-failure retry, exact restore round trips, and no duplicated deaths.
- Post-promotion final-two integration for both settings, including briefing recovery, no exposed
  Night actions, exact terminal persistence, and save-failure retry without reevaluation.
- Forged reason/branch mismatches, partial or malformed links, same-faction showdown evidence,
  public/recovery privacy, responsive game-over presentation, and architecture/randomness gates.
- Pre-rule sub-version 2/3/4 post-day and post-Dawn upgrades under both setting branches, including
  one-time browser write-back and write-failure preservation.

#### Acceptance criteria

- The special draw precedes Mafia parity and Serial Killer victory only for the exact eligible
  final two.
- Mutual immunity ends immediately with both players alive; mutual lethality kills both
  atomically. Both branches end in Draw without another playable night.
- Same-faction killers never trigger this rule, existing saves remain compatible, and restoration
  proves rather than replays the terminal evidence.
- Existing permanent personal wins survive unchanged under the established private disclosure
  policy.
- No generic combat, showdown, scripting, backend, or networking abstraction is introduced.

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

Phases 0 through 7F are implemented. R-001 through R-012, the permanent investigation groups, and
the Mayor/daytime rules are authoritative and no longer block planning.

Do not start Phase 8 automatically. App-managed voting, undo/history, backend/cloud sync, online
multiplayer, and multi-tab coordination remain outside the implemented boundary.
