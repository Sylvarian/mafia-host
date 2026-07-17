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
effect logic. Doctor self/repeat rules are validated centrally. Attack intent is accepted without
interpreting first-night-kill or Godfather/Serial mutual-kill settings. Resolution, visits, results,
deaths, conversion, voting, and win evaluation remain later-phase work.
