# Domain layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory owns the
framework-independent game model and rules.

Phase 1 introduces identifiers, players, roles, game settings and state, the explicit phase
machine, invariant validation, a small command/event reducer, and injected randomness. Phase 2
adds the authoritative registry of named roles with setup metadata only. The registry contains no
resolution callbacks or ability logic. Role assignment, action collection, resolution, voting,
and win evaluation remain owned by later phases.
