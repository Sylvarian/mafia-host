# Domain layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory owns the
framework-independent game model and rules.

Phase 1 introduces identifiers, players, roles, game settings and state, the explicit phase
machine, invariant validation, a small command/event reducer, and injected randomness. Phase 2
adds the authoritative registry of named roles with setup metadata only.

Phase 3 adds immutable player-role assignment values, the participating-roster ordinal rule, the
central role-instance display name, and active-game validation for single and duplicate ordinals.
Single-copy roles use `ordinal: null`; duplicate copies use sequential ordinals in game-player
roster order.

Phase 4 adds immutable night-action kinds, submitted action identity, per-role-instance structural
target validation, complete-batch validation, and frozen collected batches. The role registry now
contains immutable collection metadata and explicit physical order, but no executable callbacks or
effect logic. Doctor self/repeat rules are validated centrally. Disabled first-night Godfather and
Serial Killer actors are excluded from collection requirements. Mutual Godfather/Serial targets and
Consort-on-Consort targets remain structurally valid on nights when those actors act.

Phase 5 adds immutable, setup-independent investigation Groups A through D plus an explicit
canonical role-to-group mapping. It also adds pure stages for canonical action ordering, Consort
block attempts and immunity, effective actions, visits, frames, Doctor protections, attacks,
provisional deaths, Sheriff suspicion, shared Investigator/Consigliere results, and Detective
tracking. The orchestration function revalidates Phase 4 input and returns a deeply frozen
`NightResolution`. It never mutates `GameState`, applies a provisional death, advances the phase,
uses randomness, generates Dawn output, converts a role, triggers a Jester effect, or evaluates a
winner.

Phase 6 adds one canonical `DoctorPreviousTarget` array to `GameState`, with runtime validation,
per-role-instance uniqueness, participating-player ordering, and immutable canonical copies. The
night-application boundary explicitly enters `night-resolution`, revalidates the resolution against
the completed action batch, applies provisional deaths and configured public role reveals once,
records every Doctor's submitted target even if the Doctor or target is killed, builds a public-safe Dawn
model, and enters `dawn-announcement`. It preserves assignments, counters, Mayor state, and
Executioner targets. Phase 7C extends this same final-death boundary with explicit night-death
records and qualifying Executioner conversions, but still performs no personal-win or faction
outcome calculation.

Phase 7A adds an explicit immutable `ExecutionerTarget` relationship keyed by game, Executioner
player, Executioner role instance, and target player. Final distribution uses the injected
`RandomSource` once per Executioner against the full participating Town list in canonical roster
order. Runtime invariants reject pre-finalization targets, missing or duplicate owners, mismatched
role instances, cross-game records, unknown identities, non-Town targets, non-canonical ordering,
and later phases whose briefing status is incomplete. Target selection and briefing completion
preserve role assignments, settings, counters, and target identities. No personal win, role
conversion, Jester revenge, victory, or later-night behavior exists in this phase.

Phase 7A.1 makes sequential blocking explicit without moving workflow state into the domain.
Canonical Consort actions determine blocked role-instance identities before later actors act, and
complete action batches accept no action for a blocked non-Consort while rejecting a fabricated
one. Shared frame, Sheriff, investigation-group, visit, and Detective functions serve both
immediate application outcomes and final resolution. Detective actions are deliberately excluded
from the trackable visit ledger; blocked actors and first-night-skipped killers likewise have no
visit. Dawn history records an unblocked Doctor's confirmed target even if the Doctor or target
dies, but records nothing for a blocked Doctor.

Phase 7B adds two narrow pure operations under `day/`. The Dawn-to-day boundary validates the
active game, public Dawn announcement, and established Night 1/Day 1 counter relationship before
atomically entering `day-discussion`. It changes no death, assignment, reveal, Executioner target,
Doctor-history, neutral, or winner state.

Voluntary Mayor reveal is valid only for a living participating Mayor during day discussion. It
sets `publiclyRevealedRoleId` to the canonical Mayor role and changes nothing else. An already
revealed Mayor returns a structured error. `GamePlayer` has no second Mayor-reveal authority, so
ordinary death reveal can expose a dead Mayor without being confused with a voluntary living
action, and a prior public reveal remains intact when death reveal is disabled.

Phase 7C adds narrow explicit authority rather than a generic event or effect engine:
`DeathRecord` distinguishes night death, day execution, and the future Jester-revenge cause;
`DayOutcome` records exactly one executed player or no execution; personal-win records cover only
executed Jesters and Executioners whose target was executed; pending revenge identifies only the
executed Jester and remains victim-free; and an `ExecutionerToJesterConversion` retains stable
owner, role-instance, and historical target identity.

The day-execution and no-execution operations validate the complete game, apply every consequence
immutably, revalidate the result, and enter `execution-resolution` atomically. Execution preserves
prior Mayor reveal, applies `revealRoleOnDeath`, awards all shared-target Executioners regardless
of owner alive/dead state, and creates one Jester win/revenge where applicable. Proven
non-execution deaths convert all affected Executioners exactly once. Selectors derive active
Jester behavior without changing the immutable original Executioner assignment. Revenge
resolution, faction victory, game over, and the next night remain outside the domain boundary.

Phase 7C.1 changes host workflow only and adds no domain state or game rule. Non-informational
night actions remain ordinary authoritative submitted actions, blocked actors still produce no
action or visit, and Dawn still uses the same one-time night-application boundary. The application
host-role selector reuses the canonical active-role derivation, so a converted Executioner is
displayed as active Jester while the original Executioner assignment remains immutable. Host-role
visibility is not represented in `GameState`.
