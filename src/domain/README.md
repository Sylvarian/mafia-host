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
