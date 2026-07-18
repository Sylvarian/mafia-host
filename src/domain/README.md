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
Executioner targets and performs no neutral or faction outcome calculation.

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
