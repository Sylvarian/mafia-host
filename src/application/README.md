# Application layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory coordinates domain
operations through focused use cases and external-adapter contracts.

`game-setup` owns the single Phase 2 pre-game draft, immutable roster and role-count operations,
derived counts, structured validation, and the editing/ready workflow. A validated setup contains
participating players, role counts, and settings only.

`role-assignment` consumes that exact validated value. It expands and shuffles role instances,
assigns them in participating-player order, invokes the domain ordinal rule and active-game
invariants, and owns the unassigned/distributing/confirmed card workflow. Reassignment creates
fresh identities and clears delivery marks without mutating the previous game. Expected failures
remain structured until the feature boundary.

The setup owns all six settings. `godfatherAppearsSuspiciousToSheriff` has the authoritative default
`true`; the other five current form defaults are `false`. Validation copies every selected boolean
without treating missing values as disabled.

R-008 now finalizes Executioner target eligibility, but target assignment and briefing are not
implemented. Executioner targets therefore remain `null`, and confirming physical distribution
does not invoke a phase transition or enter night-action collection. A future prerequisite phase
must assign eligible Town targets with the injected random source before the first-night briefing.

`night-actions` owns the explicit `beginFirstNight` use case, deterministic living-role wake
sequence, per-role-instance previous-target context, one authoritative submitted-action list,
bounded navigation, correction, review, and finalisation. It uses the generic Phase 1 reducer only
inside the begin-night use case; features never dispatch `ADVANCE_PHASE`. Participant names are an
immutable presentation snapshot from confirmed setup, while `GameState` remains authoritative for
phase, assignments, alive state, settings, and counters. Finalisation produces a domain-validated
batch and deliberately leaves the game in `night-action-collection`. The sequence and batch share
the domain collection-eligibility rule that omits Godfather and Serial Killer actors from a disabled
first night while retaining all living Mafia in the private overview.

`night-resolution` owns one narrow Phase 5 operation over a completed Phase 4 workflow. It passes
the authoritative game, canonical batch, and Doctor previous-target context through domain
revalidation, then returns structured success or failure. It keeps no global resolution cache and
does not dispatch a command, apply deaths, advance the phase, or introduce presentation state, so
identical calls are deterministic and idempotent.

`night-presentation` owns Phase 6 coordination. Its explicit resolve operation consumes only a
completed Phase 4 workflow, derives the Phase 5 resolution, revalidates it against the same completed
batch before entering `night-resolution`, constructs the deterministic player-facing investigative
result queue, and owns immutable acknowledgement and bounded navigation state. Private results are
ordered by canonical physical role order and stable role-instance identity, never by source-array
insertion order or player name. The prepare-Dawn operation is unavailable until every result is
acknowledged, revalidates and applies the retained batch and resolution once through the domain, then
drops all private resolution/action data from the completed Dawn workflow. It never advances to day
discussion or evaluates a winner.

`session-persistence` owns the Phase 6.5 cross-phase `ActiveAppSession` discriminated union. Exactly
one setup, distribution, night-action, night-presentation, or Dawn workflow is authoritative at a
time, so a started session contains one `GameState` and no stale game from an earlier stage. Pure
application operations wrap the existing focused workflows and make every stage transition
explicit.

The same slice defines the schema-version-1 serialisable model, timestamp/envelope validation,
stage-specific runtime restoration, canonical reconstruction, deep freezing, and public-safe
session summaries. Derived sequence steps, progress, role descriptions, result-card text, and Dawn
prose are rebuilt rather than trusted. Private-presentation saves retain the structured resolution
only until Dawn; Dawn persistence has no field for the completed action batch, full resolution,
private queue, or acknowledgements. The `GameSessionStore` and `SessionClock` contracts contain no
browser implementation.

The V1 Dawn restorer is intentionally limited to recovery through the current first-Dawn product
boundary: it requires the structured announcement to cover every dead player. Before later-day or
later-night recovery exists, the persisted session contract must distinguish newly announced Dawn
deaths from earlier deaths, pending Jester revenge, permanent Jester and Executioner personal wins,
Executioner targets and conversions, and current from historical public announcements.

The first-Dawn representation cannot be reused unchanged because it could announce earlier deaths
again. Phase 7 must deliberately update the contract, either with a new schema version or an
explicit compatible V1 extension whose validation remains unambiguous. No migration system
currently exists.
